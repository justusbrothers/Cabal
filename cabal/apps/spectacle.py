# /plugins/Cabal/cabal/apps/spectacle.py

import logging
import math
import os
import re
import textwrap
import time
import traceback
import unicodedata

import requests
from django.core.cache import cache
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import constants

logger = logging.getLogger("inventree")


def strip_html(text: str) -> str:
    """Convert HTML to clean text while preserving <p> and <br> formatting."""
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<.*?>", "", text, flags=re.DOTALL)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#39;", "'", text)
    text = re.sub(r"&[a-zA-Z0-9#]+;", " ", text)
    text = re.sub(r"\n\s*\n", "\n\n", text)
    text = re.sub(r" +", " ", text)
    return text.strip()


try:
    import mokkari

    MOKKARI_AVAILABLE = True
    logger.info("Spectacle: Mokkari integrated successfully")
except ImportError:
    MOKKARI_AVAILABLE = False
    logger.info("Spectacle: Mokkari library absent, applying direct fallback calls")


class Spectacle(APIView):
    permission_classes = [IsAuthenticated]

    def clean_text_encoding(self, text: str) -> str:
        """Fixes character encoding corruptions (Mojibake) and normalizes character casing."""
        if not text:
            return ""

        try:
            text = text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass

        text = unicodedata.normalize("NFC", text)

        words = text.split()
        cleaned_words = [
            w.capitalize() if w.isupper() or any(c.isupper() for c in w[1:]) else w
            for w in words
        ]

        return " ".join(cleaned_words)

    def shorten_series_name(self, name, max_len=14):
        return "".join(c for c in name.upper() if c.isalnum())[:max_len]

    def normalize_publisher_name(self, name: str) -> str:
        if not name:
            return ""
        name = name.strip().lower()
        for suffix in [
            "entertainment",
            "publishing",
            "comics",
            "group",
            "inc",
            "llc",
        ]:
            name = name.replace(suffix, "").strip()
        return " ".join(name.split())

    def clean_price_string(self, raw_price) -> str:
        """Converts raw price inputs (Decimal, float, symbols) to a standard string."""
        if raw_price is None:
            return ""
        price_str = str(raw_price).strip()
        price_str = re.sub(r"[^\d\.]", "", price_str)
        return price_str

    def extract_variant_char(
        self, raw_variant: str, upc: str = "", fallback_idx: int = 0
    ) -> str:
        """
        Extracts single letter character for variant IPNs.
        Priority:
        1. String matching ('Cover B', 'Variant C', etc.)
        2. Barcode 16th digit (1=A/Standard, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G)
        3. Fallback index mapping
        """
        if raw_variant:
            clean_lower = raw_variant.lower().strip()
            if clean_lower in [
                "a",
                "cover a",
                "standard",
                "none",
                "",
            ] or clean_lower.endswith(" cover a"):
                return ""

            # Explicit 'Cover B' / 'Variant C' matches in text
            cover_match = re.search(
                r"(?:cover|variant)\s*([a-zA-Z])(?![a-zA-WY-Z])",
                raw_variant,
                re.IGNORECASE,
            )
            if cover_match:
                char = cover_match.group(1).upper()
                return char if char != "A" else ""

            # Standalone starting letter (e.g. "B - J. Scott Campbell")
            start_match = re.search(r"^([a-zA-Z])\b", raw_variant.strip())
            if start_match:
                char = start_match.group(1).upper()
                return char if char != "A" else ""

        # Parse 16th digit from 17-digit barcode (1=A, 2=B, 3=C, 4=D, 5=E, 6=F, 7=G)
        clean_upc = "".join(c for c in str(upc) if c.isdigit())
        if len(clean_upc) >= 16:
            cover_digit = int(clean_upc[15])
            if cover_digit > 1:
                return chr(64 + cover_digit)  # 2->B, 3->C, 4->D, 5->E, 6->F, 7->G
            elif cover_digit == 1:
                return ""

        # Fallback index mapping
        if fallback_idx > 0:
            return chr(66 + (fallback_idx - 1)) if fallback_idx <= 25 else "VAR"

        return ""

    def build_ipn(
        self,
        pub_code: str,
        base_ipn_slug: str,
        issue_number,
        volume,
        variant_char: str = "",
    ) -> str:
        """Generates standard IPN string."""
        issue_slug = str(issue_number).zfill(3)
        suffix = variant_char.upper() if variant_char else ""

        if volume and str(volume) != "1":
            return f"CB_{pub_code}_{base_ipn_slug}_V{volume}-{issue_slug}{suffix}"
        return f"CB_{pub_code}_{base_ipn_slug}-{issue_slug}{suffix}"

    def post(self, request, *args, **kwargs):
        try:
            barcode = request.data.get("barcode", "")
            metron_id = request.data.get("metron_id", "")

            if not barcode and not metron_id:
                return Response(
                    {
                        "success": False,
                        "message": "Provide a valid barcode or Metron ID.",
                    },
                    status=400,
                )

            barcode = "".join(c for c in str(barcode) if c.isdigit())

            if barcode and len(barcode) < 12 and not metron_id:
                return Response(
                    {"success": False, "message": "Invalid barcode length"}, status=400
                )

            original_barcode = barcode
            standard_barcode = original_barcode

            if len(original_barcode) >= 17:
                standard_barcode = original_barcode[:-2] + "11"

            target_upc = standard_barcode if standard_barcode else original_barcode

            cache_key = f"base_issue_data_{standard_barcode}"
            cached_data = cache.get(cache_key)

            full_anchor = None
            all_issue_variants = []
            issue_id = None

            if cached_data:
                logger.info("Spectacle: Cache HIT for base UPC %s", standard_barcode)
                full_anchor = cached_data.get("full_anchor")
                all_issue_variants = cached_data.get("variants", [])
                issue_id = full_anchor.get("id") if full_anchor else None
            else:
                logger.info(
                    "Spectacle: Cache MISS for base UPC %s, fetching from API",
                    standard_barcode,
                )

                metron_user = os.environ.get("METRON_USER")
                metron_pass = os.environ.get("METRON_PASS")

                if not metron_user or not metron_pass:
                    return Response(
                        {"success": False, "message": "Metron credentials missing"},
                        status=500,
                    )

                headers = {
                    "Accept": "application/json",
                    "User-Agent": "InvenTree-Spectacle/1.0 (info@justusbrothers.shop; custom plugin)",
                }
                auth = requests.auth.HTTPBasicAuth(metron_user, metron_pass)

                if MOKKARI_AVAILABLE:
                    try:
                        api = mokkari.api(metron_user, metron_pass)
                        issues = api.issues_list({"upc": target_upc})

                        if not issues and target_upc != original_barcode:
                            issues = api.issues_list({"upc": original_barcode})

                        if issues:
                            issue_id = issues[0].id
                            time.sleep(0.5)

                            issue = api.issue(issue_id)

                            raw_mokkari_price = getattr(issue, "price", None)
                            cleaned_mokkari_price = self.clean_price_string(
                                raw_mokkari_price
                            )

                            store_date = getattr(issue, "store_date", None)
                            issue_img = getattr(issue, "image", None)

                            full_anchor = {
                                "id": issue.id,
                                "series": {
                                    "id": getattr(issue.series, "id", None)
                                    if issue.series
                                    else None,
                                    "name": getattr(issue.series, "name", "Unknown")
                                    if issue.series
                                    else "Unknown",
                                    "volume": getattr(issue.series, "volume", None)
                                    if issue.series
                                    else None,
                                    "publisher": {
                                        "name": getattr(
                                            getattr(issue.series, "publisher", None),
                                            "name",
                                            "Unknown",
                                        )
                                    }
                                    if issue.series
                                    and getattr(issue.series, "publisher", None)
                                    else {},
                                },
                                "number": issue.number,
                                "price": cleaned_mokkari_price,
                                "store_date": store_date,
                                "variant": getattr(issue, "variant", "")
                                or getattr(issue, "cover", ""),
                                "image": str(issue_img) if issue_img else "",
                                "desc": getattr(issue, "desc", "")
                                or getattr(issue, "description", ""),
                            }

                            raw_variants = getattr(issue, "variants", []) or []
                            all_issue_variants = []

                            for variant in raw_variants:
                                variant_upc = str(
                                    getattr(variant, "upc", "")
                                    or getattr(variant, "sku", "")
                                )
                                clean_variant_upc = "".join(
                                    c for c in variant_upc if c.isdigit()
                                )
                                variant_img = getattr(variant, "image", None)
                                variant_price = self.clean_price_string(
                                    getattr(variant, "price", None)
                                )

                                all_issue_variants.append({
                                    "id": getattr(variant, "id", None),
                                    "name": getattr(variant, "name", "")
                                    or getattr(variant, "variant", ""),
                                    "upc": clean_variant_upc,
                                    "price": variant_price,
                                    "image": str(variant_img) if variant_img else "",
                                })

                    except Exception as mk_err:
                        logger.warning(
                            "Mokkari lookup failed, falling back: %s", mk_err
                        )

                if not issue_id:
                    logger.info(
                        "Spectacle: Direct API fallback for UPC: %s", target_upc
                    )
                    resp = requests.get(
                        "https://metron.cloud/api/issue/",
                        params={"upc": target_upc},
                        auth=auth,
                        headers=headers,
                        timeout=15,
                    )

                    if resp.status_code == 200:
                        results = resp.json().get("results", [])

                        if results:
                            issue_id = results[0].get("id")
                            time.sleep(0.5)

                            detail_resp = requests.get(
                                f"https://metron.cloud/api/issue/{issue_id}/",
                                auth=auth,
                                headers=headers,
                                timeout=15,
                            )

                            if detail_resp.status_code == 200:
                                full_anchor = detail_resp.json()
                                raw_variants = full_anchor.get("variants", []) or []
                                all_issue_variants = []

                                for variant in raw_variants:
                                    if isinstance(variant, dict):
                                        variant_upc = str(
                                            variant.get("upc")
                                            or variant.get("sku")
                                            or ""
                                        )
                                        clean_variant_upc = "".join(
                                            c for c in variant_upc if c.isdigit()
                                        )

                                        all_issue_variants.append({
                                            "id": variant.get("id"),
                                            "image": str(variant.get("image") or ""),
                                            "name": variant.get("name")
                                            or variant.get("variant")
                                            or "",
                                            "price": self.clean_price_string(
                                                variant.get("price")
                                            ),
                                            "upc": clean_variant_upc,
                                        })

                if full_anchor:
                    cache.set(
                        cache_key,
                        {"full_anchor": full_anchor, "variants": all_issue_variants},
                        timeout=120,
                    )

            if not issue_id or not full_anchor:
                return Response(
                    {
                        "success": False,
                        "message": "No issue records found for targeted barcode",
                    },
                    status=404,
                )

            matched_variant = None
            for var in all_issue_variants:
                if var.get("upc") == original_barcode:
                    matched_variant = var
                    break

            series_dict = full_anchor.get("series", {})
            series_name = self.clean_text_encoding(series_dict.get("name", "").strip())
            volume = series_dict.get("volume")
            issue_number = full_anchor.get("number", "?")

            raw_store_date = full_anchor.get("store_date")
            store_date_str = str(raw_store_date) if raw_store_date else ""

            publisher_dict = series_dict.get("publisher", {})
            raw_publisher_name = self.clean_text_encoding(
                publisher_dict.get("name", "Unknown Publisher")
            )
            normalized_name = self.normalize_publisher_name(raw_publisher_name)

            pub_code = constants.PUBLISHER_CODES.get(raw_publisher_name, "UNK")
            if pub_code == "UNK":
                for known_name, code in constants.PUBLISHER_CODES.items():
                    if normalized_name in self.normalize_publisher_name(known_name):
                        pub_code = code
                        break

            if pub_code == "UNK" and len(original_barcode) >= 6:
                for prefix in sorted(
                    constants.PUBLISHER_UPC_PREFIXES.keys(), key=len, reverse=True
                ):
                    if original_barcode.startswith(prefix):
                        pub_code = constants.PUBLISHER_UPC_PREFIXES[prefix]
                        break

            category = constants.PUBLISHER_PART_CATEGORIES.get(pub_code, 1)
            base_ipn_slug = self.shorten_series_name(series_name)

            raw_desc = strip_html(
                full_anchor.get("desc") or full_anchor.get("description", "")
            )
            clean_description = textwrap.shorten(raw_desc, width=250, placeholder="...")

            if matched_variant:
                raw_variant_name = self.clean_text_encoding(
                    matched_variant.get("name", "")
                )
                scanned_image = matched_variant.get("image") or str(
                    full_anchor.get("image", "")
                )
                scanned_metron_id = matched_variant.get("id") or full_anchor.get("id")
                scanned_price = self.clean_price_string(
                    matched_variant.get("price") or full_anchor.get("price")
                )
            else:
                raw_variant_name = self.clean_text_encoding(
                    full_anchor.get("variant") or full_anchor.get("cover") or ""
                ).strip()
                scanned_image = str(full_anchor.get("image", ""))
                scanned_metron_id = full_anchor.get("id")
                scanned_price = self.clean_price_string(full_anchor.get("price"))

            scanned_v_char = self.extract_variant_char(
                raw_variant_name, upc=original_barcode
            )
            is_cover_a = not scanned_v_char

            if is_cover_a:
                variant_label = "Standard"
                display_title = f"{series_name} #{issue_number}"
            else:
                variant_label = raw_variant_name
                cover_prefix = (
                    f"Cover {scanned_v_char} "
                    if not re.search(r"\bcover\b", raw_variant_name, re.I)
                    else ""
                )
                display_title = (
                    f"{series_name} #{issue_number} - {cover_prefix}{raw_variant_name}"
                )

            scanned_ipn = self.build_ipn(
                pub_code, base_ipn_slug, issue_number, volume, scanned_v_char
            )

            whatnot_price = ""
            if scanned_price:
                try:
                    whatnot_price = str(math.ceil(float(scanned_price)))
                except Exception:
                    whatnot_price = ""

            comic_data = {
                "title": display_title,
                "ipn_proposed": scanned_ipn,
                "series": series_name,
                "issue": str(issue_number),
                "volume": str(volume) if volume else None,
                "publisher": raw_publisher_name,
                "category": category,
                "pub_code": pub_code,
                "variant": variant_label,
                "description": clean_description,
                "metron_url": f"https://metron.cloud/issue/{scanned_metron_id}/",
                "metron_id": int(scanned_metron_id),
                "image_url": str(scanned_image),
                "part_link": f"https://metron.cloud/issue/{scanned_metron_id}/",
                "listed_on_whatnot": True,
                "price": scanned_price,
                "whatnot_price": whatnot_price,
                "store_date": store_date_str,
                "upc": original_barcode,
            }

            cover_a_price = self.clean_price_string(full_anchor.get("price"))
            cover_a_wn_price = ""
            if cover_a_price:
                try:
                    cover_a_wn_price = str(math.ceil(float(cover_a_price)))
                except Exception:
                    cover_a_wn_price = ""

            cover_a_raw_var = self.clean_text_encoding(
                full_anchor.get("variant") or full_anchor.get("cover") or ""
            ).strip()
            cover_a_label = (
                cover_a_raw_var
                if cover_a_raw_var
                and cover_a_raw_var.lower() not in ["none", "a", "cover a"]
                else "Standard"
            )
            cover_a_display = f"{series_name} #{issue_number}"
            cover_a_ipn = self.build_ipn(
                pub_code, base_ipn_slug, issue_number, volume, ""
            )
            cover_a_metron_id = int(full_anchor.get("id"))

            cover_a_is_match = (original_barcode == standard_barcode) or (
                not matched_variant
            )

            variants_list = [
                {
                    "metron_id": cover_a_metron_id,
                    "variant": cover_a_label,
                    "display_name": cover_a_display,
                    "ipn_proposed": cover_a_ipn,
                    "image_url": str(full_anchor.get("image", "")),
                    "description": clean_description,
                    "upc": standard_barcode,
                    "price": cover_a_price,
                    "whatnot_price": cover_a_wn_price,
                    "is_scanned_match": cover_a_is_match,
                }
            ]

            for idx, variant in enumerate(all_issue_variants, start=1):
                variant_upc = variant.get("upc", "")

                if (
                    variant_upc == standard_barcode
                    or variant.get("id") == cover_a_metron_id
                ):
                    continue

                # v_name = self.clean_text_encoding(variant.get("name", "Variant"))
                # v_price = self.clean_price_string(variant.get("price") or cover_a_price)

                # v_char = self.extract_variant_char(
                #     v_name, upc=variant_upc, fallback_idx=idx
                # )

                # v_ipn = self.build_ipn(
                #     pub_code, base_ipn_slug, issue_number, volume, v_char
                # )

                # v_cover_prefix = (
                #     f"Cover {v_char} "
                #     if (v_char and not re.search(r"\bcover\b", v_name, re.I))
                #     else ""
                # )

                # Loop continuation (omitted rest of original loop for brevity, keep yours intact)

            return Response(
                {"success": True, "comic_data": comic_data, "variants": variants_list},
                status=200,
            )

        except Exception as e:
            logger.exception(
                "Spectacle: Unhandled exception during POST request processing"
            )
            return Response(
                {
                    "success": False,
                    "message": f"Internal Server Error: {str(e)}",
                    "trace": traceback.format_exc(),
                },
                status=500,
            )
