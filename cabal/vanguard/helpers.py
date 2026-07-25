# cabal/vanguard/helpers.py

import re

# Attempt to import InvenTree's Part model directly
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
