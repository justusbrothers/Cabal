# cabal/views/spectacle.py

import logging
import math
import os
import re
import requests
import textwrap
import time
import unicodedata

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.cache import cache

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

        # Step 1: Attempt Mojibake repair (Latin-1 bytes read as UTF-8)
        try:
            text = text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass

        # Step 2: Normalize Unicode representation (NFC form)
        text = unicodedata.normalize("NFC", text)

        # Step 3: Fix casing issues (e.g., "JiméNez" -> "Jiménez")
        # Uses title() across words while respecting unicode characters
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

    def post(self, request, *args, **kwargs):
        barcode = request.data.get("barcode", "")
        metron_id = request.data.get("metron_id", "")

        if not barcode and not metron_id:
            return Response(
                {"success": False, "message": "Provide a valid barcode or Metron ID."},
                status=400,
            )

        # Standardize Barcode if provided
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
                logger.info("Spectacle: MOKKARI_AVAILABLE: %s", MOKKARI_AVAILABLE)

                try:
                    api = mokkari.api(metron_user, metron_pass)
                    issues = api.issues_list({"upc": target_upc})
                    logger.info("Spectacle: issues: %s", issues)

                    if not issues and target_upc != original_barcode:
                        issues = api.issues_list({"upc": original_barcode})

                    if issues:
                        issue_id = issues[0].id
                        time.sleep(0.5)

                        issue = api.issue(issue_id)
                        logger.info("Spectacle: issue: %s", issue)

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

                        # Raw Mokkari variant list
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
                    logger.warning("Mokkari lookup failed, falling back: %s", mk_err)

            # Direct API Fallback
            if not issue_id:
                logger.info("Spectacle: Direct API fallback for UPC: %s", target_upc)
                resp = requests.get(
                    "https://metron.cloud/api/issue/",
                    params={"upc": target_upc},
                    auth=auth,
                    headers=headers,
                    timeout=15,
                )

                logger.info("Spectacle: 200:resp.status_code: %s", resp.status_code)

                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    logger.info("Spectacle: 200:results: %s", results)

                    if results:
                        issue_id = results[0].get("id")

                        time.sleep(0.5)

                        detail_resp = requests.get(
                            f"https://metron.cloud/api/issue/{issue_id}/",
                            auth=auth,
                            headers=headers,
                            timeout=15,
                        )

                        logger.info(
                            "Spectacle: 200:url: https://metron.cloud/api/issue/%s/ | detail_resp: %s",
                            issue_id,
                            detail_resp,
                        )

                        if detail_resp.status_code == 200:
                            full_anchor = detail_resp.json()
                            raw_variants = full_anchor.get("variants", []) or []
                            all_issue_variants = []

                            for variant in raw_variants:
                                if isinstance(variant, dict):
                                    variant_upc = str(
                                        variant.get("upc") or variant.get("sku") or ""
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

            # Store in cache for 2 minutes
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

        # --- 2. SEARCH VARIANTS DATASET FOR MATCHING BARCODE ---
        matched_variant = None
        for var in all_issue_variants:
            if var.get("upc") == original_barcode:
                matched_variant = var
                logger.info(
                    "Spectacle: Found matching variant for %s -> %s",
                    original_barcode,
                    var.get("name"),
                )
                break

        # --- 3. BUILD RESPONSE DATA ---
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

        # Determine variant attributes & variant-specific pricing
        if matched_variant:
            raw_variant = self.clean_text_encoding(matched_variant.get("name", ""))
            variant_image = matched_variant.get("image") or str(
                full_anchor.get("image", "")
            )
            variant_id = matched_variant.get("id") or full_anchor.get("id")
            raw_price = matched_variant.get("price") or full_anchor.get("price")
        else:
            raw_variant = self.clean_text_encoding(
                full_anchor.get("variant") or full_anchor.get("cover") or ""
            ).strip()
            variant_image = str(full_anchor.get("image", ""))
            variant_id = full_anchor.get("id")
            raw_price = full_anchor.get("price")

        price = self.clean_price_string(raw_price)

        is_cover_a = False
        if raw_variant:
            clean_variant_lower = raw_variant.lower().strip()
            if clean_variant_lower in [
                "a",
                "cover a",
                "standard",
                "none",
                "",
            ] or clean_variant_lower.endswith(" cover a"):
                is_cover_a = True

        variant_ipn_char = ""
        if raw_variant and not is_cover_a:
            cover_match = re.search(
                r"(?:cover|variant)\s*([a-zA-Z])(?![a-zA-WY-Z])",
                raw_variant,
                re.IGNORECASE,
            )
            if cover_match:
                variant_ipn_char = cover_match.group(1).upper()
            else:
                start_match = re.search(r"^([a-zA-Z])\b", raw_variant.strip())
                if start_match:
                    variant_ipn_char = start_match.group(1).upper()

        if variant_ipn_char in ["A", ""]:
            variant_ipn_char = ""
            is_cover_a = True

        if (
            raw_variant
            and raw_variant.lower() not in ["standard", "none", ""]
            and not is_cover_a
        ):
            variant_val = raw_variant
            display_suffix = f" - {raw_variant}"
        else:
            variant_val = "Standard"
            display_suffix = ""

        raw_desc = strip_html(
            full_anchor.get("desc") or full_anchor.get("description", "")
        )

        # Ensures total length <= 250 and breaks on word boundaries
        clean_description = textwrap.shorten(raw_desc, width=250, placeholder="...")

        base_ipn_slug = self.shorten_series_name(series_name)
        issue_slug = str(issue_number).zfill(3)
        variant_suffix = (
            variant_ipn_char if (variant_ipn_char and not is_cover_a) else ""
        )

        if volume and str(volume) != "1":
            ipn = (
                f"CB_{pub_code}_{base_ipn_slug}_V{volume}-{issue_slug}{variant_suffix}"
            )
        else:
            ipn = f"CB_{pub_code}_{base_ipn_slug}-{issue_slug}{variant_suffix}"

        rounded_price = ""
        if price:
            try:
                rounded_price = str(math.ceil(float(price)))
            except Exception:
                rounded_price = ""

        comic_data = {
            "title": f"{series_name} #{issue_number}{display_suffix}",
            "ipn_proposed": ipn,
            "series": series_name,
            "issue": str(issue_number),
            "volume": str(volume) if volume else None,
            "publisher": raw_publisher_name,
            "category": category,
            "pub_code": pub_code,
            "variant": variant_val,
            "description": clean_description,
            "metron_url": f"https://metron.cloud/issue/{variant_id}/",
            "metron_id": int(variant_id),
            "image_url": str(variant_image),
            "part_link": f"https://metron.cloud/issue/{variant_id}/",
            "listed_on_whatnot": True,
            "price": price,
            "whatnot_price": rounded_price,
            "store_date": store_date_str,
        }

        # Primary/Matched Variant Output
        variants_list = [
            {
                "metron_id": int(variant_id),
                "variant": variant_val,
                "display_name": f"{series_name} #{issue_number}{display_suffix}",
                "image_url": str(variant_image),
                "description": clean_description,
                "upc": original_barcode,
                "price": price,
                "whatnot_price": rounded_price,
                "is_scanned_match": True,
            }
        ]

        # Add remaining variants to response list with their price details
        for variant in all_issue_variants:
            variant_upc = variant.get("upc", "")
            if variant_upc and variant_upc != original_barcode:
                variant_name = self.clean_text_encoding(variant.get("name", "Variant"))
                variant_price = variant.get("price") or price

                variant_rounded_price = ""
                if variant_price:
                    try:
                        variant_rounded_price = str(math.ceil(float(variant_price)))
                    except Exception:
                        variant_rounded_price = ""

                variants_list.append({
                    "metron_id": variant.get("id"),
                    "variant": str(variant_name),
                    "display_name": f"{series_name} #{issue_number} - {variant_name}",
                    "image_url": variant.get("image", ""),
                    "description": clean_description,
                    "upc": variant_upc,
                    "price": variant_price,
                    "whatnot_price": variant_rounded_price,
                    "is_scanned_match": False,
                })

        return Response(
            {
                "success": True,
                "comic_data": comic_data,
                "variants": variants_list,
                "scanned_barcode": original_barcode,
                "standard_barcode_used": standard_barcode,
                "message": "Matched base issue with variant enrichment",
            },
            status=200,
        )
