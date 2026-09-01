# /plugins/Cabal/cabal/apps/nexus/csv.py

import logging
import re
from io import StringIO

import numpy as np
import pandas as pd

from cabal.utils import clean_text

logger = logging.getLogger("inventree")


def extract_date_suffix(df, date_col, is_penguin=False):
    """Helper to extract and format auto date suffix from the specified date column."""
    if date_col not in df.columns:
        return ""

    valid_dates = df[date_col].dropna().astype(str).str.strip()
    valid_dates = valid_dates[valid_dates != ""]
    if valid_dates.empty:
        return ""

    most_frequent_date = valid_dates.mode().iloc[0]

    if is_penguin:
        date_match = re.match(r"(\d{4})-(\d{2})-(\d{2})", most_frequent_date)
        if date_match:
            return date_match.group(2) + date_match.group(3)
    else:
        try:
            parsed_date = pd.to_datetime(most_frequent_date, errors="coerce")
            if not pd.isna(parsed_date):
                return parsed_date.strftime("%m%d")
        except Exception:
            pass
    return ""


def clean_numeric_columns(df, columns):
    """Helper to clean currency symbols and cast columns to numeric types safely."""
    for num_col in columns:
        if num_col in df.columns:
            if df[num_col].dtype == object:
                df[num_col] = (
                    df[num_col].astype(str).str.replace(r"[$,]", "", regex=True)
                )
            df[num_col] = pd.to_numeric(df[num_col], errors="coerce").fillna(
                0.0 if num_col != "Qty" else 0
            )
    return df


def process_csv_file(csv_file):
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

    for line in enumerate(lines, 1):
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

        logger.debug(
            f"[Nexus CSV Parser] Normalized columns using mapping DUE TO Penguin: {df}"
        )

    # Clean currency symbols and force numeric conversions BEFORE grouping
    df = clean_numeric_columns(df, ["Qty", "Retail", "Discounted Price"])

    # -----------------------------------------------------------------
    # GLOBAL SANITIZER INJECTION
    # -----------------------------------------------------------------
    text_cols = ["Title", "Description", "Name", "Category", "Publisher"]

    for col in text_cols:
        if col in df.columns:
            df[col] = df[col].astype(str).apply(clean_text)

    logger.debug(f"[Nexus CSV Parser] col in text_cols = {df}")

    auto_suffix = ""
    if is_penguin:
        auto_suffix = extract_date_suffix(df, "On Sale", is_penguin=True)

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

        # Force both retail and discounted_price to be strictly blank strings for Penguin
        # grouped["Retail"] = ""
        # grouped["Discounted Price"] = ""

        logger.debug(f"[Nexus CSV Parser] Penguin Grouped Cols: {grouped}")

    else:
        # Traditional Lunar / Re-uploaded Report Management Branch
        auto_suffix = extract_date_suffix(df, "In-Store Date", is_penguin=False)

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
                if col in ["Retail", "Discounted Price"]:
                    agg_dict[col] = "max"
                else:
                    agg_dict[col] = "first"

        grouped = df.groupby(group_key, as_index=False).agg(agg_dict)

        # Bundle & Ratio evaluations post-grouping
        if "Title" in grouped.columns and "Qty" in grouped.columns:
            bundle_regex = re.compile(r"UNLOCK\s+BUNDLE\s+OF\s+(\d+)", re.IGNORECASE)
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
                        int(np.ceil(float(current_retail))) if current_retail else ""
                    )

            grouped["Retail"] = updated_retail

        lunar_columns = ["Title", "UPC", "Retail", "Discounted Price", "Qty"]

        for col in lunar_columns:
            if col not in grouped.columns:
                grouped[col] = ""

        grouped = grouped.reindex(columns=lunar_columns)

    logger.debug(
        f"[Nexus CSV Parser] Completed initial parse [grouped.columns]: {grouped.columns}"
    )
    logger.debug(
        f"[Nexus CSV Parser] Completed initial parse [auto_suffix]: {auto_suffix}"
    )

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
