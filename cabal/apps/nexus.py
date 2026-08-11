# /plugins/Cabal/cabal/apps/nexus.py

import logging
import re
import urllib.parse
from io import BytesIO, StringIO

import pandas as pd
import numpy as np
import requests
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.http import HttpResponse, JsonResponse
from django.core.files.base import ContentFile
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from part.models import Part
from cabal.utils import clean_text

logger = logging.getLogger("inventree")


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Nexus(View):
    """Lunar & Penguin Distributor CSV Parser & UPC Validator"""

    template_name = "nexus/nexus.html"

    def get(self, request):
        if request.GET.get("download") == "excel":
            return self.download_excel(request)
        return self.render_page(request)

    def post(self, request):
        return self.render_page(request)

    def render_page(self, request):
        context = self._get_default_context()
        csv_file = request.FILES.get("csv_file") if request.method == "POST" else None

        if csv_file:
            try:
                logger.info(
                    f"[Nexus] Received file upload: {getattr(csv_file, 'name', 'unknown')} (Size: {csv_file.size} bytes)"
                )

                # 1. Process base metrics & perform distributor column scrubbing
                df, auto_suffix, is_penguin = self.process_distributor_csv(csv_file)
                context["total_rows"] = len(df)
                logger.debug(
                    f"[Nexus] Post-processing complete. Final DataFrame rows: {len(df)}, Vendor Type: {'Penguin' if is_penguin else 'Lunar'}"
                )

                # --- Filename Date Suffix Selector ---
                raw_suffix = request.POST.get("file_suffix", "").strip()
                if not raw_suffix and auto_suffix:
                    clean_suffix = auto_suffix
                else:
                    clean_suffix = raw_suffix.replace("/", "").replace("\\", "")

                request.session["file_suffix"] = clean_suffix
                logger.debug(f"[Nexus] File suffix configured as: '{clean_suffix}'")

                # --- Dynamic League of Comic Geeks Search URL Generator ---
                issue_regex = re.compile(r"(?:#\s*|(?<=\s))(\d+)\b", re.IGNORECASE)
                variant_anchor = re.compile(r"\b(CVR|COVER|VARIANT)\b", re.IGNORECASE)

                link_prefix = "https://leagueofcomicgeeks.com/search?keyword="
                generated_links = []

                for idx, row in df.iterrows():
                    title_text = str(row.get("Title", "")).strip()
                    search_term = title_text

                    issue_match = issue_regex.search(title_text)
                    variant_match = variant_anchor.search(title_text)

                    if variant_match:
                        base_title = title_text[: variant_match.start()].strip()
                        if issue_match and issue_match.start() < variant_match.start():
                            issue_num = issue_match.group(1)
                            if not base_title.endswith(issue_num):
                                base_title = re.sub(r"#\s*$", "", base_title).strip()
                                search_term = f"{base_title} {issue_num}"
                            else:
                                search_term = base_title
                        else:
                            search_term = base_title
                    elif issue_match:
                        base_title = title_text[: issue_match.start()].strip()
                        issue_num = issue_match.group(1)
                        search_term = f"{base_title} {issue_num}".strip()

                    safe_query = urllib.parse.quote_plus(search_term)
                    full_url = f"{link_prefix}{safe_query}"
                    excel_formula = f'=HYPERLINK("{full_url}", "View on LoCG")'
                    generated_links.append(excel_formula)

                # Store complete structured data frame into session for multi-sheet download & batch creation matching
                request.session["lunar_df"] = df.to_json(orient="split")
                request.session.modified = True

                # --- Build Full Data Block for Client-Side UI ---
                ui_display_df = df.copy()
                if "Discounted Price" in ui_display_df.columns:
                    ui_display_df = ui_display_df.drop(columns=["Discounted Price"])

                # --- ALWAYS LOOK FOR UPC BECAUSE PENGUIN DATA WAS NORMALIZED TO UPC ---
                upc_col_index = -1
                if "UPC" in ui_display_df.columns:
                    upc_col_index = list(ui_display_df.columns).index("UPC")

                context["upc_column_index"] = upc_col_index
                context["preview_headers"] = list(ui_display_df.columns)
                context["preview_rows"] = ui_display_df.values.tolist()

                # --- Pass full matrix data and headers to fix client-side fullRows hydration ---
                context["full_headers"] = list(df.columns)
                context["full_rows"] = df.values.tolist()

                # UPC/ISBN Validation loop
                missing = []
                for i, row in df.iterrows():
                    upc = str(row.get("UPC", "")).strip()

                    if not upc or upc.lower() in ("", "null", "none", "n/a"):
                        missing.append({
                            "row": i + 2,
                            "code": row.get("IPN", "") or "Blank Code Reference",
                            "title": str(row.get("Title", ""))[:100]
                            + ("..." if len(str(row.get("Title", ""))) > 100 else ""),
                            "upc": "MISSING",
                        })

                context["missing_upc"] = missing
                context["success"] = True
                context["download_ready"] = True

                import_message = (
                    f"✅ Processed {len(df)} unique items (duplicates merged)."
                )
                if missing:
                    import_message += f" Found {len(missing)} missing identifiers."
                context["import_message"] = import_message
                logger.info(
                    f"[Nexus] Successfully rendered page context. {import_message}"
                )

            except Exception as e:
                logger.exception(
                    "[Nexus] Critical processing error encountered during file handling."
                )
                context["errors"].append(f"Error: {str(e)}")

        return render(request, self.template_name, context)

    def process_distributor_csv(self, csv_file):
        """Sniffs file structure to process, merge, and clean layout matrices matching vendor specifications."""
        file_content = csv_file.read().decode("utf-8-sig")
        lines = file_content.splitlines()

        logger.debug(
            f"[Nexus CSV Parser] File read complete. Total raw lines: {len(lines)}"
        )

        # Schema Sniffer Setup
        first_line = lines[0].lower() if lines else ""
        is_penguin = (
            "isbn" in first_line or "carton #" in first_line or "on sale" in first_line
        )
        logger.debug(
            f"[Nexus CSV Parser] Sniffed layout -> is_penguin: {is_penguin}. First line sample: {first_line[:120]}"
        )

        data_lines = []
        header_found = False

        for line_num, line in enumerate(lines, 1):
            stripped = line.strip()
            if not header_found:
                if is_penguin and (
                    "carton #," in stripped.lower() or "isbn," in stripped.lower()
                ):
                    header_found = True
                    data_lines.append(line)
                    logger.debug(
                        f"[Nexus CSV Parser] Penguin header matched at line {line_num}: {stripped[:100]}"
                    )
                    continue
                elif not is_penguin and (
                    stripped.startswith("Code,") or "Code,Title" in stripped
                ):
                    header_found = True
                    data_lines.append(line)
                    logger.debug(
                        f"[Nexus CSV Parser] Lunar header matched at line {line_num}: {stripped[:100]}"
                    )
                    continue
                continue
            if header_found:
                data_lines.append(line)

        if not data_lines:
            logger.warning(
                "[Nexus CSV Parser] Header sniff failed to locate expected column markers. Falling back to raw lines."
            )
            data_lines = lines
        else:
            logger.debug(
                f"[Nexus CSV Parser] Extracted {len(data_lines)} lines following header identification."
            )

        df = pd.read_csv(StringIO("\n".join(data_lines)), dtype=str)
        logger.debug(
            f"[Nexus CSV Parser] Initial DataFrame loaded. Shape: {df.shape}, Columns: {list(df.columns)}"
        )

        # -----------------------------------------------------------------
        # GLOBAL SANITIZER INJECTION (BEFORE PART CREATION / MERGING)
        # -----------------------------------------------------------------
        text_cols = ["Title", "Description", "Name", "Category", "Publisher"]
        for col in text_cols:
            if col in df.columns:
                # before_sample = df[col].head(2).tolist()
                df[col] = df[col].astype(str).apply(clean_text)
                logger.debug(
                    f"[Nexus CSV Parser] Sanitized text column '{col}'. Sample before/after check completed."
                )

        # -----------------------------------------------------------------
        # NEW HEADERS NORMALIZATION BLOCK
        # -----------------------------------------------------------------
        if is_penguin:
            df = df.rename(columns={"ISBN": "UPC", "Quantity": "Qty"})
            logger.debug(
                "[Nexus CSV Parser] Applied Penguin header renames: ISBN -> UPC, Quantity -> Qty"
            )

        auto_suffix = ""
        if is_penguin:
            df["Qty"] = pd.to_numeric(df["Qty"], errors="coerce").fillna(0)

            if "On Sale" in df.columns:
                valid_dates = df["On Sale"].dropna().astype(str).str.strip()
                valid_dates = valid_dates[valid_dates != ""]
                if not valid_dates.empty:
                    most_frequent_date = valid_dates.mode().iloc[0]
                    date_match = re.match(
                        r"(\d{4})-(\d{2})-(\d{2})", most_frequent_date
                    )
                    if date_match:
                        auto_suffix = date_match.group(2) + date_match.group(3)
                        logger.debug(
                            f"[Nexus CSV Parser] Penguin auto_suffix resolved: {auto_suffix} from date {most_frequent_date}"
                        )

            agg_dict = {"Qty": "sum"}
            for col in df.columns:
                if col not in ["Qty", "UPC"]:
                    agg_dict[col] = "first"

            pre_group_len = len(df)
            grouped = df.groupby("UPC", as_index=False).agg(agg_dict)
            logger.debug(
                f"[Nexus CSV Parser] Penguin grouping by UPC complete. Rows reduced from {pre_group_len} to {len(grouped)}"
            )

            penguin_columns = ["Title", "UPC", "Qty"]

            for col in penguin_columns:
                if col not in grouped.columns:
                    grouped[col] = ""

            grouped = grouped.reindex(columns=penguin_columns)

        else:
            # Traditional Lunar Management Branch
            if "In-Store Date" in df.columns:
                valid_dates = df["In-Store Date"].dropna().astype(str).str.strip()
                valid_dates = valid_dates[valid_dates != ""]
                if not valid_dates.empty:
                    most_frequent_date = valid_dates.mode().iloc[0]
                    try:
                        parsed_date = pd.to_datetime(
                            most_frequent_date, errors="coerce"
                        )
                        if not pd.isna(parsed_date):
                            auto_suffix = parsed_date.strftime("%m%d")
                            logger.debug(
                                f"[Nexus CSV Parser] Lunar auto_suffix resolved: {auto_suffix} from date {most_frequent_date}"
                            )
                    except Exception as exc:
                        logger.debug(
                            f"[Nexus CSV Parser] Failed to parse Lunar date string '{most_frequent_date}': {exc}"
                        )

            df["Qty"] = pd.to_numeric(df["Qty"], errors="coerce").fillna(0)

            agg_dict = {"Qty": "sum"}
            for col in df.columns:
                if col not in ["Qty", "Code"]:
                    agg_dict[col] = "first"

            pre_group_len = len(df)
            grouped = df.groupby("Code", as_index=False).agg(agg_dict)

            logger.debug(
                f"[Nexus CSV Parser] Lunar grouping by Code complete. Rows reduced from {pre_group_len} to {len(grouped)}"
            )
            logger.debug(f"[Nexus CSV Parser] Grouped columns: {grouped}")

            if "Retail" in grouped.columns:
                grouped["Retail"] = pd.to_numeric(
                    grouped["Retail"], errors="coerce"
                ).fillna(0.0)

            if "Discounted Price" in grouped.columns:
                grouped["Discounted Price"] = pd.to_numeric(
                    grouped["Discounted Price"], errors="coerce"
                ).fillna(0.0)

            logger.debug(
                f"[Nexus CSV Parser] Grouped Discount Price: {grouped.get('Discounted Price', 'N/A')}"
            )

            if "Title" in grouped.columns and "Qty" in grouped.columns:
                bundle_regex = re.compile(
                    r"UNLOCK\s+BUNDLE\s+OF\s+(\d+)", re.IGNORECASE
                )
                ratio_regex = re.compile(r"\b1:(\d+)\b")

                updated_retail = []
                for idx, row in grouped.iterrows():
                    title_str = str(row["Title"])
                    bundle_match = bundle_regex.search(title_str)
                    ratio_match = ratio_regex.search(title_str)

                    if bundle_match:
                        bundle_size = int(bundle_match.group(1))
                        grouped.at[idx, "Qty"] = int(row["Qty"] * bundle_size)
                        updated_retail.append("")
                    elif ratio_match:
                        ratio_value = int(ratio_match.group(1))
                        if ratio_value > 5:
                            updated_retail.append(ratio_value)
                        else:
                            if "Retail" in grouped.columns:
                                current_retail = grouped.at[idx, "Retail"]
                                updated_retail.append(int(np.ceil(current_retail)))
                            else:
                                updated_retail.append("")
                    else:
                        if "Retail" in grouped.columns:
                            current_retail = grouped.at[idx, "Retail"]
                            updated_retail.append(int(np.ceil(current_retail)))
                        else:
                            updated_retail.append("")

                grouped["Retail"] = updated_retail
                logger.debug(
                    "[Nexus CSV Parser] Applied bundle/ratio adjustments to Lunar retail values."
                )

            lunar_columns = ["Title", "UPC", "IPN", "Retail", "Discounted Price", "Qty"]

            for col in lunar_columns:
                if col not in grouped.columns:
                    grouped[col] = ""

            grouped = grouped.reindex(columns=lunar_columns)

        if "Title" in grouped.columns:
            grouped["Title"] = grouped["Title"].astype(str).apply(clean_text)

        # -----------------------------------------------------------------
        # ADVANCED VARIANT MATRIX SORTING ENGINE (Python/Pandas)
        # -----------------------------------------------------------------
        if "Title" in grouped.columns:

            def build_sort_tuple(row):
                title_str = str(row.get("Title", "")).strip()

                issue_match = re.search(
                    r"^(.*?(?:#\s*|\b\d+\s+Vol\b|\bNo\b)\d+)",
                    title_str,
                    flags=re.IGNORECASE,
                )
                if issue_match:
                    primary_key = issue_match.group(1).strip().lower()
                else:
                    primary_key = title_str.lower()

                upc_str = str(row.get("UPC", "")).strip()
                variant_index = 1

                if len(upc_str) == 17:
                    try:
                        variant_index = int(upc_str[15])
                    except (ValueError, IndexError):
                        pass

                return (primary_key, variant_index)

            sort_keys = grouped.apply(build_sort_tuple, axis=1)
            grouped["_sort_key_title"] = [k[0] for k in sort_keys]
            grouped["_sort_key_variant"] = [k[1] for k in sort_keys]

            grouped = grouped.sort_values(
                by=["_sort_key_title", "_sort_key_variant"], ascending=[True, True]
            ).drop(columns=["_sort_key_title", "_sort_key_variant"])
            logger.debug(
                f"[Nexus CSV Parser] Variant sorting completed. Final sorted dataframe row count: {len(grouped)}"
            )

        return grouped, auto_suffix, is_penguin

    def download_excel(self, request):
        """Download Excel file optionally splitting Cover A Items and moving empty Retail values to 'With Errors'"""
        df_json = request.session.get("lunar_df")
        if not df_json:
            logger.warning(
                "[Nexus Excel Download] Attempted Excel download with missing or expired session data."
            )
            return HttpResponse(
                "No processed file found or session expired.", status=400
            )

        file_suffix = request.session.get("file_suffix", "")
        df = pd.read_json(StringIO(df_json), orient="split")

        upc_key = "UPC"
        if upc_key in df.columns:
            df[upc_key] = df[upc_key].fillna("").astype(str).str.strip()

        if "Retail" in df.columns:
            is_empty_retail = df["Retail"].isna() | (
                df["Retail"].astype(str).str.strip() == ""
            )
            errors_df = df[is_empty_retail].copy()
            working_df = df[~is_empty_retail].copy()
            logger.debug(
                f"[Nexus Excel Download] Split rows into 'To Add' ({len(working_df)}) and 'With Errors' ({len(errors_df)}) due to empty retail values."
            )
        else:
            errors_df = pd.DataFrame(columns=df.columns)
            working_df = df.copy()

        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            working_df.to_excel(writer, sheet_name="To Add", index=False)
            writer.sheets["To Add"].sheet_view.showGridLines = True
            writer.sheets["To Add"].freeze_panes = "A2"

            if not errors_df.empty:
                errors_df.to_excel(writer, sheet_name="With Errors", index=False)
            else:
                pd.DataFrame(columns=df.columns).to_excel(
                    writer, sheet_name="With Errors", index=False
                )
            writer.sheets["With Errors"].sheet_view.showGridLines = True
            writer.sheets["With Errors"].freeze_panes = "A2"

            pd.DataFrame(columns=df.columns).to_excel(
                writer, sheet_name="To Import", index=False
            )
            writer.sheets["To Import"].sheet_view.showGridLines = True
            writer.sheets["To Import"].freeze_panes = "A2"

            pd.DataFrame(columns=df.columns).to_excel(
                writer, sheet_name="Done", index=False
            )
            writer.sheets["Done"].sheet_view.showGridLines = True
            writer.sheets["Done"].freeze_panes = "A2"

            for sheet_name in writer.sheets:
                ws = writer.sheets[sheet_name]
                for col in ws.columns:
                    max_len = 0
                    col_letter = col[0].column_letter
                    for cell in col:
                        if cell.value is not None:
                            val_str = str(cell.value)
                            if val_str.startswith("=HYPERLINK"):
                                match = re.search(
                                    r',[^"\']*["\']([^"\']+)["\']\s*\)$', val_str
                                )
                                if match:
                                    val_str = match.group(1)
                            if len(val_str) > max_len:
                                max_len = len(val_str)
                    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        filename = (
            f"Distributor_Shipment_Cleaned-{file_suffix}.xlsx"
            if file_suffix
            else "Distributor_Shipment_Cleaned.xlsx"
        )

        output.seek(0)
        response = HttpResponse(
            output.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        logger.info(
            f"[Nexus Excel Download] Successfully generated and served Excel file: {filename}"
        )
        return response

    def _get_default_context(self):
        return {
            "title": "Manifest Parser - UPC Validator",
            "errors": [],
            "success": False,
            "download_ready": False,
            "total_rows": 0,
            "missing_upc": [],
            "import_message": "",
            "preview_headers": [],
            "preview_rows": [],
            "upc_column_index": -1,
        }


class AttachPartImageView(APIView):
    """Server-side endpoint to fetch external image bytes via requests and save to Part model directly."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        part_id = request.data.get("part_id")
        image_url = request.data.get("image_url")

        logger.debug(f"[Nexus:AttachPartImageView] part_id: '{part_id}'")
        logger.debug(f"[Nexus:AttachPartImageView] image_url: '{image_url}'")

        if not part_id or not image_url:
            return JsonResponse(
                {"success": False, "error": "Missing part_id or image_url"}, status=400
            )

        try:
            # 1. Fetch image server-side to bypass CORS
            img_res = requests.get(image_url, timeout=10)
            if img_res.status_code != 200:
                return JsonResponse(
                    {
                        "success": False,
                        "error": f"Failed to fetch image: HTTP {img_res.status_code}",
                    },
                    status=400,
                )

            # 2. Extract or generate filename
            filename = image_url.split("/")[-1].split("?")[0] or f"part_{part_id}.jpg"

            # 3. Retrieve Part using InvenTree ORM model
            part = Part.objects.get(pk=part_id)

            # 4. Save file directly to image field using ContentFile
            part.image.save(filename, ContentFile(img_res.content), save=True)

        except Part.DoesNotExist:
            return JsonResponse(
                {"success": False, "error": f"Part PK #{part_id} not found"}, status=404
            )
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)}, status=500)

        return JsonResponse({
            "success": True,
            "message": f"Successfully attached {filename} to part {part_id}",
        })
