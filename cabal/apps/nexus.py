# /plugins/Cabal/cabal/apps/nexus.py

import logging
import re
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

                df, auto_suffix, is_penguin = self.process_csv_file(csv_file)
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

                # Store complete structured data frame into session for multi-sheet download & batch creation matching
                request.session["lunar_df"] = df.to_json(orient="split")
                request.session.modified = True

                # --- Build Full Data Block for Client-Side UI ---
                ui_display_df = df.copy()
                # if "Discounted Price" in ui_display_df.columns:
                #     ui_display_df = ui_display_df.drop(columns=["Discounted Price"])

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

    def process_csv_file(self, csv_file):
        """Sniffs file structure to process, merge, and clean layout matrices matching vendor specifications.
        Also gracefully handles re-uploaded exported Errored CSV reports.
        """
        file_content = csv_file.read().decode("utf-8-sig")
        lines = file_content.splitlines()

        logger.debug(
            f"[Nexus CSV Parser] File read complete. Total raw lines: {len(lines)}"
        )

        # Pre-read temporary DataFrame to check if this is a re-uploaded Errored/Report CSV
        try:
            temp_df = pd.read_csv(StringIO("\n".join(lines[:10])), dtype=str)
            report_meta_cols = [
                c
                for c in [
                    "Batch Row ID",
                    "Failure Reason",
                    "InvenTree Part PK",
                    "Status",
                ]
                if c in temp_df.columns
            ]
            if report_meta_cols:
                logger.info(
                    f"[Nexus CSV Parser] Detected re-uploaded report/errored CSV containing columns: {report_meta_cols}. Stripping metadata for re-processing."
                )
                # Drop metadata columns from the raw lines if possible, or reload via pandas after initial read
        except Exception:
            pass

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
                    continue
                elif not is_penguin and (
                    stripped.startswith("Code,") or "Code,Title" in stripped
                ):
                    header_found = True
                    data_lines.append(line)
                    continue
                # Fallback support for re-uploaded CSVs where headers might include Code or original distributor column names
                elif "Code," in stripped or "ISBN," in stripped or "Title," in stripped:
                    header_found = True
                    data_lines.append(line)
                    continue
                continue
            if header_found:
                data_lines.append(line)

        if not data_lines:
            logger.warning(
                "[Nexus CSV Parser] Header sniff failed to locate expected column markers. Falling back to raw lines."
            )
            data_lines = lines

        df = pd.read_csv(StringIO("\n".join(data_lines)), dtype=str)

        # --- STRIP EXPORT REPORT METADATA IF RE-UPLOADING AN ERRORED CSV ---
        drop_report_cols = [
            c
            for c in ["Batch Row ID", "Failure Reason", "InvenTree Part PK", "Status"]
            if c in df.columns or c.lower() in [x.lower() for x in df.columns]
        ]
        if drop_report_cols:
            # Drop matching columns case-insensitively
            actual_drops = [
                col
                for col in df.columns
                if col.lower() in [d.lower() for d in drop_report_cols]
            ]
            df = df.drop(columns=actual_drops)
            logger.debug(
                f"[Nexus CSV Parser] Dropped report metadata columns: {actual_drops}"
            )

        # -----------------------------------------------------------------
        # NORMALIZE COLUMN NAMES & CLEAN CURRENCY/NUMERICS FIRST
        # -----------------------------------------------------------------
        df.columns = [col.strip() for col in df.columns]
        col_mapping = {}
        for col in df.columns:
            lower_col = col.lower()
            if lower_col in ["code", "item code", "sku"]:
                col_mapping[col] = "Code"
            elif lower_col in ["title", "description", "name"]:
                col_mapping[col] = "Title"
            elif lower_col in ["upc", "isbn", "barcode"]:
                col_mapping[col] = "UPC"
            elif lower_col in ["qty", "quantity", "qoh"]:
                col_mapping[col] = "Qty"
            elif lower_col in ["retail", "price", "srp"]:
                col_mapping[col] = "Retail"
            elif lower_col in [
                "discounted_price",
                "discounted price",
                "cost",
                "wholesale",
            ]:
                col_mapping[col] = "Discounted Price"

        if col_mapping:
            df = df.rename(columns=col_mapping)
            logger.debug(
                f"[Nexus CSV Parser] Normalized columns using mapping: {col_mapping}"
            )

        if is_penguin:
            df = df.rename(columns={"ISBN": "UPC", "Quantity": "Qty"})

        # Clean currency symbols and force numeric conversions BEFORE grouping
        for num_col in ["Qty", "Retail", "Discounted Price"]:
            if num_col in df.columns:
                if df[num_col].dtype == object:
                    df[num_col] = (
                        df[num_col].astype(str).str.replace(r"[$,]", "", regex=True)
                    )
                df[num_col] = pd.to_numeric(df[num_col], errors="coerce").fillna(
                    0.0 if num_col != "Qty" else 0
                )

        # -----------------------------------------------------------------
        # GLOBAL SANITIZER INJECTION
        # -----------------------------------------------------------------
        text_cols = ["Title", "Description", "Name", "Category", "Publisher"]
        for col in text_cols:
            if col in df.columns:
                df[col] = df[col].astype(str).apply(clean_text)

        auto_suffix = ""
        if is_penguin:
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

            agg_dict = {"Qty": "sum"}
            for col in df.columns:
                if col not in ["Qty", "UPC"]:
                    agg_dict[col] = "first"

            grouped = df.groupby("UPC", as_index=False).agg(agg_dict)
            penguin_columns = ["Title", "UPC", "Qty"]

            for col in penguin_columns:
                if col not in grouped.columns:
                    grouped[col] = ""

            grouped = grouped.reindex(columns=penguin_columns)

        else:
            # Traditional Lunar / Re-uploaded Report Management Branch
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
                    except Exception:
                        pass

            # Determine dynamic grouping key
            group_key = (
                "Code"
                if "Code" in df.columns
                else ("UPC" if "UPC" in df.columns else "Title")
            )
            logger.debug(f"[Nexus CSV Parser] Using grouping key: {group_key}")

            agg_dict = {"Qty": "sum"}
            for col in df.columns:
                if col not in ["Qty", group_key]:
                    # Use max for prices/numeric if multi-row conflict occurs, otherwise first
                    if col in ["Retail", "Discounted Price"]:
                        agg_dict[col] = "max"
                    else:
                        agg_dict[col] = "first"

            grouped = df.groupby(group_key, as_index=False).agg(agg_dict)

            # Bundle & Ratio evaluations post-grouping
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
                        updated_retail.append(row.get("Retail", ""))
                    elif ratio_match:
                        ratio_value = int(ratio_match.group(1))
                        if ratio_value > 5:
                            updated_retail.append(ratio_value)
                        else:
                            current_retail = row.get("Retail", 0.0)
                            updated_retail.append(
                                int(np.ceil(float(current_retail)))
                                if current_retail
                                else ""
                            )
                    else:
                        current_retail = row.get("Retail", 0.0)
                        updated_retail.append(
                            int(np.ceil(float(current_retail)))
                            if current_retail
                            else ""
                        )

                grouped["Retail"] = updated_retail

            lunar_columns = ["Title", "UPC", "Retail", "Discounted Price", "Qty"]

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
