# /plugins/Cabal/cabal/apps/vanguard/helpers.py

import json
import logging
import re
from collections import Counter
from datetime import date, datetime

from django.db.models import Q, Sum
from part.models import Part

logger = logging.getLogger("inventree")


try:
    from common.models import Parameter, ParameterTemplate
except ImportError:
    try:
        from part.models import Parameter, ParameterTemplate
    except ImportError:
        Parameter = None
        ParameterTemplate = None

try:
    from part.models import Part
except ImportError:
    try:
        from InvenTree.models import Part
    except ImportError:
        Part = None


class VanguardParser:
    """Utility class for handling InvenTree lookups and parsing text inputs."""

    @staticmethod
    def get_inventree_part_name(ipn):
        clean_ipn = ipn.strip()

        # 1. Try InvenTree ORM Query
        if Part is not None:
            part = (
                Part.objects.filter(IPN__iexact=clean_ipn).first()
                or Part.objects.filter(name__iexact=clean_ipn).first()
                or Part.objects.filter(name__icontains=clean_ipn).first()
            )
            if part:
                return part.name or part.description or clean_ipn

        # 2. Match patterns like 'Thepatron-001-Packab' or 'Doomquest-003-Packabcd'
        pack_end_pattern = re.compile(
            r"^(?:CB_[A-Z0-9]+_)?([A-Z0-9_]+)-(\d+)-PACK([A-Z]*)$", re.IGNORECASE
        )
        match_end = pack_end_pattern.match(clean_ipn)
        if match_end:
            series_name = match_end.group(1).replace("_", " ").title()
            issue_num = match_end.group(2).lstrip("0") or "0"
            covers = match_end.group(3).upper()
            if covers:
                cover_str = ", ".join(list(covers))
                return f"{series_name} #{issue_num} Variant Pack (Covers {cover_str})"
            return f"{series_name} #{issue_num} Variant Pack"

        # 3. Match patterns like 'CB_IMG_GEIGER_V2_PACK-024'
        pack_mid_pattern = re.compile(
            r"^(?:CB_[A-Z0-9]+_)?([A-Z0-9_]+)_(?:PACK|SET|BOX)-(\d+)([A-Z0-9]*)$",
            re.IGNORECASE,
        )
        match_mid = pack_mid_pattern.match(clean_ipn)
        if match_mid:
            series_name = match_mid.group(1).replace("_", " ").title()
            issue_num = match_mid.group(2).lstrip("0") or "0"
            return f"{series_name} #{issue_num} Variant Pack"

        # 4. Standard issue pattern (e.g. 'CB_IMG_GEIGER_V2-024B' or 'Thepatron-001A')
        pattern = re.compile(
            r"^(?:CB_[A-Z0-9]+_)?([A-Z0-9_]+)-(\d+)([A-Z0-9]*)$", re.IGNORECASE
        )
        match = pattern.match(clean_ipn)
        if match:
            series_name = match.group(1).replace("_", " ").title()
            issue_num = match.group(2).lstrip("0") or "0"
            variant = match.group(3)
            variant_str = f" Cover {variant}" if variant else ""
            return f"{series_name} #{issue_num}{variant_str}"

        # 5. Final Fallback
        clean_text = (
            re.sub(r"^CB_[A-Z0-9]+_", "", clean_ipn).replace("_", " ").replace("-", " ")
        )
        clean_text = re.sub(
            r"\bPACK([A-Z]*)\b", r"Variant Pack \1", clean_text, flags=re.IGNORECASE
        )
        return clean_text.title().strip()

    @staticmethod
    def get_cover_a_ipn(pack_ipn):
        clean_ipn = pack_ipn.strip()
        base_ipn = re.sub(r"[-_]PACK[A-Z]*$", "", clean_ipn, flags=re.IGNORECASE)
        base_ipn = re.sub(r"_(?:PACK|SET|BOX)-\d+$", "", base_ipn, flags=re.IGNORECASE)
        return base_ipn

    @classmethod
    def parse_sub_pulls_by_customer(cls, raw_text):
        grouped_pulls = {}

        lines = [
            line.strip() for line in re.split(r"[\r\n]+", raw_text) if line.strip()
        ]

        for line in lines:
            if ":" in line:
                customer, ipn = line.split(":", 1)
                customer = customer.strip().title()
                ipn = ipn.strip()
            else:
                customer = "General Pulls"
                ipn = line.strip()

            formatted_title = cls.get_inventree_part_name(ipn)

            if customer not in grouped_pulls:
                grouped_pulls[customer] = []
            grouped_pulls[customer].append(formatted_title)

        return grouped_pulls

    @staticmethod
    def extract_covers_from_text(text, multiplier=1):
        components = []
        text_upper = text.upper()

        bracket_match = re.search(r"\[([A-Z\s,]+)\]", text_upper)
        if bracket_match:
            covers = [c.strip() for c in bracket_match.group(1).split(",") if c.strip()]
            for c in covers:
                components.append((multiplier, c))
            return components

        sku_pack_match = re.search(
            r"(?:PACK|SET|COVERS?)(?:-|\s+)?([A-Z]{2,10})\b", text_upper
        )
        if sku_pack_match:
            letters = list(sku_pack_match.group(1))
            for letter in letters:
                components.append((multiplier, letter))
            return components

        if "COVER" in text_upper:
            matches = re.findall(r"(?:COVER|VARIANT)\s*([A-Z0-9]+)", text_upper)
            if matches:
                unique_covers = list(dict.fromkeys(matches))
                for c in unique_covers:
                    components.append((multiplier, c))
                return components

        raw_items = [i.strip() for i in re.split(r"[;,]", text) if i.strip()]
        if len(raw_items) > 1:
            for item in raw_items:
                clean_item = re.sub(
                    r"^\d+\s*x\s*", "", item, flags=re.IGNORECASE
                ).strip()
                components.append((multiplier, clean_item))
            return components

        return []

    @classmethod
    def parse_pack_entry(cls, raw_line):
        line = raw_line.strip()
        if not line:
            return None

        qty = 1
        qty_match = re.match(r"^(\d+)\s*x\s*(.+)$", line, re.IGNORECASE)
        if qty_match:
            qty = int(qty_match.group(1))
            line = qty_match.group(2).strip()

        base_ipn = cls.get_cover_a_ipn(line)
        base_title = cls.get_inventree_part_name(base_ipn)

        if "Variant Pack" not in base_title and "Pack" not in base_title:
            pack_title = f"{base_title} Variant Pack"
        else:
            pack_title = base_title

        raw_components = cls.extract_covers_from_text(line, multiplier=qty)
        formatted_components = []

        if raw_components:
            for mult, cover_val in raw_components:
                cover_letter = cover_val.upper()
                if cover_letter == "A":
                    component_ipn = base_ipn
                elif len(cover_letter) <= 2:
                    component_ipn = f"{base_ipn}{cover_letter}"
                else:
                    component_ipn = cover_val

                full_comp_title = cls.get_inventree_part_name(component_ipn)
                formatted_components.append(f"{mult}x {full_comp_title}")
        else:
            formatted_components = [f"{qty}x {cls.get_inventree_part_name(line)}"]

        return {
            "SKU": line,
            "Title": pack_title,
            "Description": line,
            "quantity": qty,
            "components": formatted_components,
        }

    @staticmethod
    def parse_textarea_input(text):
        if not text:
            return []
        return [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]

    @staticmethod
    def get_item_data(item):
        if isinstance(item, dict):
            title = (
                item.get("Title") or item.get("name") or item.get("Description") or ""
            )
            sku = item.get("SKU") or item.get("IPN") or item.get("part_ipn") or ""
            is_pack = (
                "components" in item
                or "PACK" in sku.upper()
                or "PACK" in title.upper()
                or "SET" in title.upper()
            )
        else:
            part = getattr(item, "part", item)
            title = (
                getattr(part, "name", "")
                or getattr(part, "title", "")
                or getattr(part, "description", "")
            )
            sku = getattr(part, "IPN", "") or getattr(part, "SKU", "")
            is_pack = (
                getattr(part, "_is_pack_inheritance", False)
                or "PACK" in sku.upper()
                or "PACK" in title.upper()
                or "SET" in title.upper()
            )

        return title, sku, is_pack

    @staticmethod
    def get_pack_components(item):
        if isinstance(item, dict) and "components" in item:
            return item["components"]
        return []

    @staticmethod
    def get_ipns_by_param_date(target_date_str):
        """
        Queries InvenTree using Syncroth's exact Parameter model_id strategy.
        """
        clean_date = target_date_str.strip() if target_date_str else ""
        if not clean_date or Parameter is None or Part is None:
            return []

        # Find matching parameters for template_id 68
        date_params = Parameter.objects.filter(
            template_id=68, data__icontains=clean_date
        )

        # Extract the related Part Primary Keys via model_id
        matching_part_ids = list(date_params.values_list("model_id", flat=True))

        # Query Part table by extracted PKs
        parts = Part.objects.filter(pk__in=matching_part_ids)

        ipns = []
        for part in parts:
            part_ipn = getattr(part, "IPN", None) or getattr(part, "name", None)
            if part_ipn:
                ipns.append(part_ipn.strip())

        return list(dict.fromkeys(ipns))

    @classmethod
    def recommend_packs_from_ipns(cls, ipn_list=None, min_stock=2, sub_ipns=None):
        """
        Recommends multi-issue packs. Correctly normalizes base parts and variant letters
        (treating numbers without trailing letters as cover 'A') and subtracts sub_ipns.
        """
        MIN_REQUIRED_STOCK = max(1, int(min_stock or 1))

        if Part is None or not ipn_list:
            return []

        # 1. Clean, normalize, and count input tokens/IPNs
        raw_tokens = []
        if isinstance(ipn_list, str):
            raw_tokens = ipn_list.split()
        elif isinstance(ipn_list, list):
            for item in ipn_list:
                raw_tokens.extend(str(item).split())

        target_tokens = [t.strip().upper() for t in raw_tokens if t.strip()]
        if not target_tokens:
            return []

        # Regex to split base issue (e.g. 'CB_IMG_ROOKEXODUS-011') and optional variant letter ('B', 'C', etc.)
        # Group 1: Base prefix/number (e.g. 'CB_IMG_ROOKEXODUS-011')
        # Group 2: Optional variant letter (e.g. 'B')
        variant_pattern = re.compile(r"^(.*-\d+)([A-Z])?$", re.IGNORECASE)

        # Parse and count sub_ipns into a normalized map: (base_ipn, variant_letter) -> count
        sub_counts = Counter()
        if sub_ipns:
            raw_sub_lines = []
            if isinstance(sub_ipns, str):
                raw_sub_lines = sub_ipns.splitlines()
            elif isinstance(sub_ipns, list):
                raw_sub_lines = sub_ipns

            for line in raw_sub_lines:
                line_str = str(line).strip()
                if not line_str:
                    continue

                # Strip customer prefix if present (e.g. "Arik:CB_...")
                if ":" in line_str:
                    remainder = line_str.split(":")[-1].strip()
                else:
                    remainder = line_str

                for token in remainder.split():
                    clean_token = token.strip().upper()
                    if not clean_token:
                        continue

                    match = variant_pattern.match(clean_token)
                    if match:
                        base = match.group(1).upper()
                        # If no letter after digits, default to 'A'
                        letter = (match.group(2) or "A").upper()
                        sub_counts[(base, letter)] += 1

        print("--- [VANGUARD DEBUG] ---")
        print(f"Normalized sub_counts: {dict(sub_counts)}")

        # Track appearance order of base prefixes
        base_prefix_order = []
        seen_prefixes = set()

        for token in target_tokens:
            match = variant_pattern.match(token)
            if match:
                prefix = match.group(1).upper()
                if prefix not in seen_prefixes:
                    seen_prefixes.add(prefix)
                    base_prefix_order.append(prefix)

        if not base_prefix_order:
            return []

        # 2. Query all database parts under matching base prefixes
        prefix_query = Q()
        for prefix in base_prefix_order:
            prefix_query |= Q(IPN__istartswith=prefix)

        query = Part.objects.filter(prefix_query)

        grouped_issues = {}
        variant_stock_map = {}

        for part in query:
            clean_ipn = part.IPN.strip().upper() if part.IPN else ""
            if not clean_ipn or "PACK" in clean_ipn:
                continue

            match = variant_pattern.match(clean_ipn)
            if not match:
                continue

            base_ipn = match.group(1).upper()
            if base_ipn not in seen_prefixes:
                continue

            # Default to 'A' if there is no letter following the issue number digits
            variant_letter = (match.group(2) or "A").upper()

            # Calculate actual stock from DB
            actual_qty = 0
            if hasattr(part, "stock_items"):
                stock_sum = part.stock_items.filter(quantity__gt=0).aggregate(
                    total=Sum("quantity")
                )["total"]
                actual_qty = int(stock_sum) if stock_sum else 0
            elif hasattr(part, "in_stock"):
                actual_qty = int(part.in_stock)

            # Subtract matched sub_ipns quantity using (base_ipn, variant_letter)
            subtraction_amt = sub_counts.get((base_ipn, variant_letter), 0)
            adjusted_qty = max(0, actual_qty - subtraction_amt)

            print(
                f"Part: {clean_ipn} (Base: {base_ipn}, Cover: {variant_letter}) | DB Qty: {actual_qty} | Subtracted: {subtraction_amt} | Adjusted Qty: {adjusted_qty}"
            )

            variant_stock_map[clean_ipn] = adjusted_qty

            if base_ipn not in grouped_issues:
                grouped_issues[base_ipn] = {}

            grouped_issues[base_ipn][variant_letter] = {
                "qty": adjusted_qty,
                "ipn": clean_ipn,
                "has_stock": adjusted_qty >= MIN_REQUIRED_STOCK,
            }

        recommendations = []

        for base_ipn, covers_map in grouped_issues.items():
            # 1. STRICT FILTER: Only include covers that meet or exceed min_stock AFTER sub subtraction
            available_covers = sorted([
                letter for letter, data in covers_map.items() if data["has_stock"]
            ])

            # 2. Require AT LEAST 2 qualifying covers with sufficient stock to form a pack set
            if len(available_covers) < 2:
                continue

            # Build cover details list for all variants found
            all_covers_sorted = sorted(covers_map.keys())
            cover_details = []
            for letter in all_covers_sorted:
                is_eligible = covers_map[letter]["has_stock"]
                cover_details.append({
                    "letter": str(letter),
                    "qty": int(covers_map[letter]["qty"]),
                    "has_stock": bool(is_eligible),
                })

            # Ensure minimum stock threshold holds across all selected available covers
            min_cover_qty = min(covers_map[c]["qty"] for c in available_covers)
            if min_cover_qty < MIN_REQUIRED_STOCK:
                continue

            # Deduct stock allocated for this recommendation from variant_stock_map
            for c in available_covers:
                comp_ipn = covers_map[c]["ipn"]
                if comp_ipn in variant_stock_map:
                    variant_stock_map[comp_ipn] = max(
                        0, variant_stock_map[comp_ipn] - min_cover_qty
                    )

            cover_letters_str = "".join(available_covers)
            pack_sku = f"{base_ipn}-PACK{cover_letters_str}"
            base_title = cls.get_inventree_part_name(base_ipn)
            has_missing_cover = any(not cover["has_stock"] for cover in cover_details)

            recommendations.append({
                "recommended_pack_sku": pack_sku,
                "title": f"{base_title} Set ({', '.join(available_covers)})",
                "base_ipn": base_ipn,
                "available_covers": available_covers,
                "cover_details": cover_details,
                "has_missing_cover": has_missing_cover,
                "cover_count": len(available_covers),
                "max_buildable_packs": min_cover_qty,
            })

        order_map = {prefix: idx for idx, prefix in enumerate(base_prefix_order)}
        recommendations.sort(key=lambda x: order_map.get(x["base_ipn"], 999999))

        return recommendations

    @staticmethod
    def get_inventree_part_obj(ipn):
        """Retrieve the InvenTree Part object by its IPN (SKU/part number) or pk."""
        if not ipn:
            return None
        try:
            return Part.objects.filter(IPN=ipn).first()
        except Exception:
            try:
                return Part.objects.filter(pk=ipn).first()
            except Exception:
                return None

    @staticmethod
    def filter_ipns_by_creation_date(ipn_list, added_since):
        """Filters a list of IPNs based on whether their associated part/item creation date matches or exceeds the added_since date."""
        if not added_since:
            return ipn_list

        try:
            min_date = datetime.strptime(added_since, "%Y-%m-%d").date()
        except Exception:
            return ipn_list

        filtered = []

        for ipn in ipn_list:
            part = VanguardParser.get_inventree_part_obj(ipn)
            creation_dt = getattr(part, "creation_date", None) or getattr(
                part, "updated", None
            )

            if creation_dt:
                # Handle both datetime and date objects safely
                if isinstance(creation_dt, datetime):
                    item_date = creation_dt.date()
                elif isinstance(creation_dt, date):
                    item_date = creation_dt
                else:
                    item_date = None

                if item_date:
                    try:
                        if item_date >= min_date:
                            filtered.append(ipn)
                    except Exception:
                        filtered.append(ipn)
                else:
                    filtered.append(ipn)
            else:
                filtered.append(ipn)

        return filtered

    @staticmethod
    def get_book_price(ipn):
        """
        Retrieves the price of a book/part based on its IPN.
        Checks InvenTree part attributes, pricing fields, or related parameters.
        Returns a float representing the price.
        """
        clean_ipn = ipn.strip() if ipn else ""
        if not clean_ipn or Part is None:
            return 0.00

        part = VanguardParser.get_inventree_part_obj(clean_ipn)
        if not part:
            return 0.00

        # 1. Check direct attributes on Part if available
        for attr in ["selling_price", "price", "default_price", "cost"]:
            if hasattr(part, attr):
                val = getattr(part, attr)
                if val is not None:
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        pass

        # 2. Check Part Parameters if Parameter model is available
        if Parameter is not None:
            try:
                params = Parameter.objects.filter(model_id=part.pk)
                for param in params:
                    template_name = ""
                    if hasattr(param, "template") and param.template:
                        template_name = str(getattr(param.template, "name", "")).lower()

                    data_str = str(getattr(param, "data", "")).lower()
                    if any(
                        term in template_name
                        for term in ["price", "retail", "cost", "msrp"]
                    ):
                        match = re.search(r"(\d+(?:\.\d+)?)", data_str)
                        if match:
                            return float(match.group(1))
            except Exception:
                pass

        # Default fallback comic price if none found
        return 0.00

    @staticmethod
    def calculate_sub_totals(sub_pulls_raw):
        breakdown = {}
        customer_totals = {}
        grand_total = 0.0

        logger.info(
            f"🔍 [VanguardParser] calculate_sub_totals received type: {type(sub_pulls_raw)}, value: {str(sub_pulls_raw)[:200]}"
        )

        if not sub_pulls_raw:
            return {"breakdown": {}, "customer_totals": {}, "grand_total": 0.0}

        if isinstance(sub_pulls_raw, str):
            stripped = sub_pulls_raw.strip()
            if stripped.startswith("[") or stripped.startswith("{"):
                try:
                    sub_pulls_raw = json.loads(sub_pulls_raw)
                except (json.JSONDecodeError, TypeError):
                    sub_pulls_raw = stripped.splitlines()
            else:
                sub_pulls_raw = stripped.splitlines()

        if isinstance(sub_pulls_raw, dict):
            sub_pulls_raw = (
                sub_pulls_raw.get("pulls")
                or sub_pulls_raw.get("data")
                or [sub_pulls_raw]
            )

        if not isinstance(sub_pulls_raw, (list, tuple)):
            sub_pulls_raw = []

        # Import Part model locally to avoid circular dependencies
        try:
            from part.models import Part
        except ImportError:
            Part = None

        for item in enumerate(sub_pulls_raw):
            if isinstance(item, str):
                item = item.strip()
                if not item:
                    continue

                if ":" in item:
                    parts = item.split(":", 1)
                    customer_name = parts[0].strip()
                    ipn_val = parts[1].strip()
                else:
                    customer_name = "Unknown"
                    ipn_val = item

                title_val = ipn_val
                retail_val = 0.0

                if Part:
                    try:
                        part_obj = (
                            Part.objects.filter(IPN=ipn_val).first()
                            or Part.objects.filter(name=ipn_val).first()
                        )
                        if part_obj:
                            title_val = getattr(part_obj, "name", ipn_val)

                            # 🔎 DEBUG: Inspect available attributes and pricing methods on part_obj
                            logger.info(
                                f"🔎 [VanguardParser DEBUG] Found Part object for IPN '{ipn_val}': ID={part_obj.pk}, Name={part_obj.name}"
                            )
                            logger.info(
                                f"🔎 [VanguardParser DEBUG] Part attributes/methods: {[m for m in dir(part_obj) if 'price' in m or 'sale' in m or 'pricing' in m]}"
                            )

                            # Try multiple potential pricing pathways common in InvenTree or custom plugins
                            if hasattr(part_obj, "get_price"):
                                try:
                                    sale_price_obj = part_obj.get_price(1)
                                    logger.info(
                                        f"🔎 [VanguardParser DEBUG] get_price() returned: {sale_price_obj} (type: {type(sale_price_obj)})"
                                    )

                                    if sale_price_obj:
                                        retail_val = float(
                                            getattr(
                                                sale_price_obj,
                                                "quantity",
                                                sale_price_obj,
                                            )
                                            or 0.0
                                        )
                                except Exception as sp_err:
                                    logger.warning(
                                        f"⚠️ [VanguardParser DEBUG] Error calling get_price(): {sp_err}"
                                    )

                            # Fallback checks if attributes exist directly
                            if retail_val == 0.0:
                                for attr in [
                                    "sale_price",
                                    "retail_price",
                                    "default_price",
                                ]:
                                    if hasattr(part_obj, attr):
                                        val = getattr(part_obj, attr)
                                        logger.info(
                                            f"🔎 [VanguardParser DEBUG] Found direct attribute '{attr}': {val}"
                                        )
                                        if val:
                                            retail_val = float(val)
                                            break
                        else:
                            logger.warning(
                                f"⚠️ [VanguardParser DEBUG] No Part object matched IPN or Name: '{ipn_val}'"
                            )
                    except Exception as e:
                        logger.error(
                            f"❌ [VanguardParser] Error resolving part for IPN {ipn_val}: {e}",
                            exc_info=True,
                        )

                book_item = {
                    "customer": customer_name,
                    "title": title_val,
                    "ipn": ipn_val,
                    "price": float(retail_val),
                }
            elif isinstance(item, dict):
                customer_name = item.get("customer", "Unknown")
                ipn_val = item.get("ipn") or item.get("title", "")
                title_val = item.get("title") or ipn_val

                pricing_obj = item.get("pricing", {})
                if isinstance(pricing_obj, dict):
                    retail_val = pricing_obj.get("retail_price") or pricing_obj.get(
                        "price"
                    )
                else:
                    retail_val = None

                price = float(retail_val or item.get("price") or 0.0)

                book_item = {
                    "customer": customer_name,
                    "title": title_val,
                    "ipn": ipn_val,
                    "price": price,
                }
            else:
                continue

            if customer_name not in breakdown:
                breakdown[customer_name] = []
                customer_totals[customer_name] = 0.0

            breakdown[customer_name].append(book_item)
            item_price = book_item.get("price", 0.0)
            customer_totals[customer_name] += item_price
            grand_total += item_price

        return {
            "breakdown": breakdown,
            "customer_totals": customer_totals,
            "grand_total": grand_total,
        }
