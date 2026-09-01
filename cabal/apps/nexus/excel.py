# /plugins/Cabal/cabal/apps/nexus/excel.py

import logging
import re
from io import BytesIO, StringIO

import pandas as pd
from django.http import HttpResponse

logger = logging.getLogger("inventree")


def download_excel(request):
    """Download Excel file optionally splitting Cover A Items and moving empty Retail values to 'With Errors'"""
    df_json = request.session.get("lunar_df")
    if not df_json:
        logger.warning(
            "[Nexus Excel Download] Attempted Excel download with missing or expired session data."
        )
        return HttpResponse("No processed file found or session expired.", status=400)

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
