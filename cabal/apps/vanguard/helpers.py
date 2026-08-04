# cabal/apps/vanguard/helpers.py

import re

from django.db.models import Sum

# Import InvenTree models matching Syncroth's strategy
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
    def recommend_packs_from_ipns(cls, ipn_list=None, min_stock=2):
        """
        Recommends multi-issue packs. Strictly requires stock >= 2 for a cover variant
        to be included in the generated pack SKU and title.
        """
        # HARD GUARANTEE: Force min_stock to at least 2
        MIN_REQUIRED_STOCK = max(2, int(min_stock or 2))

        if Part is None or not ipn_list:
            return []

        # 1. Clean and normalize input tokens
        raw_tokens = []
        if isinstance(ipn_list, str):
            raw_tokens = ipn_list.split()
        elif isinstance(ipn_list, list):
            for item in ipn_list:
                raw_tokens.extend(str(item).split())

        target_tokens = [t.strip().upper() for t in raw_tokens if t.strip()]
        if not target_tokens:
            return []

        # Regex matches base issue prefix (e.g. 'CB_MAR_BISHOP_V2-002') and optional variant ('C')
        variant_pattern = re.compile(r"^(.*-\d+)([A-Z])?$", re.IGNORECASE)
        base_prefixes = set()

        for token in target_tokens:
            match = variant_pattern.match(token)
            if match:
                base_prefixes.add(match.group(1).upper())

        if not base_prefixes:
            return []

        # 2. Query all database parts under matching base prefixes
        from django.db.models import Q

        prefix_query = Q()
        for prefix in base_prefixes:
            prefix_query |= Q(IPN__istartswith=prefix)

        query = Part.objects.filter(prefix_query)

        grouped_issues = {}

        for part in query:
            clean_ipn = part.IPN.strip().upper() if part.IPN else ""
            if not clean_ipn or "PACK" in clean_ipn:
                continue

            match = variant_pattern.match(clean_ipn)
            if not match:
                continue

            base_ipn = match.group(1).upper()
            if base_ipn not in base_prefixes:
                continue

            variant_letter = (match.group(2) or "A").upper()

            # Calculate actual stock
            actual_qty = 0
            if hasattr(part, "stock_items"):
                stock_sum = part.stock_items.filter(quantity__gt=0).aggregate(
                    total=Sum("quantity")
                )["total"]
                actual_qty = int(stock_sum) if stock_sum else 0
            elif hasattr(part, "in_stock"):
                actual_qty = int(part.in_stock)

            if base_ipn not in grouped_issues:
                grouped_issues[base_ipn] = {}

            # Save variant stock & check against hard threshold (>= 2)
            grouped_issues[base_ipn][variant_letter] = {
                "qty": actual_qty,
                "has_stock": actual_qty >= MIN_REQUIRED_STOCK,
            }

        recommendations = []

        for base_ipn, covers_map in grouped_issues.items():
            # STRICT FILTER: Only letters where has_stock is TRUE (qty >= 2)
            available_covers = sorted([
                letter for letter, data in covers_map.items() if data["has_stock"]
            ])

            # Require AT LEAST 2 qualifying covers (e.g., A and B) to form a pack
            if len(available_covers) < 2:
                continue

            # Build cover details list for ALL variants found in InvenTree
            all_covers_sorted = sorted(covers_map.keys())
            cover_details = []
            for letter in all_covers_sorted:
                is_eligible = covers_map[letter]["has_stock"]
                cover_details.append({
                    "letter": str(letter),
                    "qty": int(covers_map[letter]["qty"]),
                    "has_stock": bool(is_eligible),  # False for Cover C (qty: 1)
                })

            # Build pack string strictly using available_covers ONLY -> "AB"
            cover_letters_str = "".join(available_covers)

            # Max packs is constrained by the minimum stock among ONLY the qualifying covers
            max_packs_possible = min(covers_map[c]["qty"] for c in available_covers)

            pack_sku = f"{base_ipn}-PACK{cover_letters_str}"
            base_title = cls.get_inventree_part_name(base_ipn)

            has_missing_cover = any(not cover["has_stock"] for cover in cover_details)

            recommendations.append({
                "recommended_pack_sku": pack_sku,  # CB_MAR_BISHOP_V2-002-PACKAB
                "title": f"{base_title} Set ({', '.join(available_covers)})",  # Bishop #2 Set (A, B)
                "base_ipn": base_ipn,
                "available_covers": available_covers,  # ['A', 'B']
                "cover_details": cover_details,  # Includes A, B, and C (C has has_stock=False)
                "has_missing_cover": has_missing_cover,  # True if any cover has insufficient stock
                "cover_count": len(available_covers),  # 2
                "max_buildable_packs": max_packs_possible,
            })

        return recommendations
