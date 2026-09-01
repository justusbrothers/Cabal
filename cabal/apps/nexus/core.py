# /plugins/Cabal/cabal/apps/nexus/core.py

import logging

from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin

from .csv import process_csv_file

logger = logging.getLogger("inventree")


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Nexus(View):
    """Lunar & Penguin Distributor CSV Parser & UPC Validator"""

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
                # logger.info(
                #     f"[Nexus] Received file upload: {getattr(csv_file, 'name', 'unknown')} (Size: {csv_file.size} bytes)"
                # )

                df, auto_suffix, is_penguin = process_csv_file(csv_file)
                context["total_rows"] = len(df)
                context["is_penguin"] = is_penguin

                # logger.debug(
                #     f"[Nexus] Post-processing complete. Final DataFrame rows: {len(df)}, Vendor Type: {'Penguin' if is_penguin else 'Lunar'}"
                # )

                # --- Filename Date Suffix Selector ---
                raw_suffix = request.POST.get("file_suffix", "").strip()
                if not raw_suffix and auto_suffix:
                    clean_suffix = auto_suffix
                else:
                    clean_suffix = raw_suffix.replace("/", "").replace("\\", "")

                request.session["file_suffix"] = clean_suffix
                # logger.debug(f"[Nexus] File suffix configured as: '{clean_suffix}'")

                # Store complete structured data frame into session for multi-sheet download & batch creation matching
                request.session["lunar_df"] = df.to_json(orient="split")
                request.session.modified = True

                # --- Build Full Data Block for Client-Side UI ---
                ui_display_df = df.copy()

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
                # logger.info(
                #     f"[Nexus] Successfully rendered page context. {import_message}"
                # )

            except Exception as e:
                logger.exception(
                    "[Nexus] Critical processing error encountered during file handling."
                )
                context["errors"].append(f"Error: {str(e)}")

        return render(request, "nexus/nexus.html", context)

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
