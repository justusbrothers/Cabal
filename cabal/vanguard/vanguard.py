############ cabal/vanguard.py ############

import io
import re

from django.http import HttpResponse
from django.shortcuts import render
from django.views import View

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Attempt to import InvenTree's Part model directly
try:
    from part.models import Part
except ImportError:
    try:
        from InvenTree.models import Part
    except ImportError:
        Part = None


class PrintableCheckbox(Flowable):
    def __init__(self, size=12, border_color="#BDC3C7"):
        super().__init__()
        self.size = size
        self.border_color = colors.HexColor(border_color)

    def wrap(self, availWidth, availHeight):
        self.width = self.size
        self.height = self.size
        return self.size, self.size

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(1)
        self.canv.rect(0, 0, self.size, self.size)
        self.canv.restoreState()


class CabalView(View):
    template_name = "cabal/vanguard.html"

    def get_inventree_part_name(self, ipn):
        """
        Queries the InvenTree Part database model using IPN or Name.
        Returns the actual part name/description if found, otherwise falls back to formatted titles.
        """
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

    def get_cover_a_ipn(self, pack_ipn):
        """
        Derives the main issue's IPN (Cover A) from a pack IPN.
        Since main issues don't have an 'A' suffix, we just strip the PACK suffix.
        Example: 'Thepatron-001-Packab' -> 'Thepatron-001'
        """
        clean_ipn = pack_ipn.strip()

        # Strip '-PACK...' or '_PACK...' suffix to get the base cover A IPN
        base_ipn = re.sub(r"[-_]PACK[A-Z]*$", "", clean_ipn, flags=re.IGNORECASE)
        base_ipn = re.sub(r"_(?:PACK|SET|BOX)-\d+$", "", base_ipn, flags=re.IGNORECASE)

        return base_ipn

    def parse_sub_pulls_by_customer(self, raw_text):
        """Parses subscriber input formatted like: Subscriber:IPN"""
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

            formatted_title = self.get_inventree_part_name(ipn)

            if customer not in grouped_pulls:
                grouped_pulls[customer] = []
            grouped_pulls[customer].append(formatted_title)

        return grouped_pulls

    def extract_covers_from_text(self, text, multiplier=1):
        """Parses raw text to extract cover letters/suffixes."""
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

    def parse_pack_entry(self, raw_line):
        """
        Parses a pack entry, using the base issue's title for the pack name
        and fetching full InvenTree names for each book.
        """
        line = raw_line.strip()
        if not line:
            return None

        qty = 1
        qty_match = re.match(r"^(\d+)\s*x\s*(.+)$", line, re.IGNORECASE)
        if qty_match:
            qty = int(qty_match.group(1))
            line = qty_match.group(2).strip()

        # 1. Fetch the main/base issue's full InvenTree title
        base_ipn = self.get_cover_a_ipn(line)
        base_title = self.get_inventree_part_name(base_ipn)

        # Format the header title cleanly
        if "Variant Pack" not in base_title and "Pack" not in base_title:
            pack_title = f"{base_title} Variant Pack"
        else:
            pack_title = base_title

        # 2. Extract cover letters/components
        raw_components = self.extract_covers_from_text(line, multiplier=qty)

        # 3. Resolve each book component to its full InvenTree title
        formatted_components = []

        if raw_components:
            for mult, cover_val in raw_components:
                cover_letter = cover_val.upper()

                # If the cover letter is 'A', it uses the base IPN (no suffix)
                if cover_letter == "A":
                    component_ipn = base_ipn
                elif len(cover_letter) <= 2:  # B, C, D, etc.
                    component_ipn = f"{base_ipn}{cover_letter}"
                else:
                    component_ipn = cover_val

                full_comp_title = self.get_inventree_part_name(component_ipn)
                formatted_components.append(f"{mult}x {full_comp_title}")
        else:
            formatted_components = [f"{qty}x {self.get_inventree_part_name(line)}"]

        return {
            "SKU": line,
            "Title": pack_title,
            "Description": line,
            "quantity": qty,
            "components": formatted_components,
        }

    def get_item_data(self, item):
        """Extracts title, SKU, and Pack status from dicts or ORM model instances."""
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

    def get_pack_components(self, item):
        """Parses sub-components from pack descriptions or SKU codes."""
        if isinstance(item, dict) and "components" in item:
            return item["components"]

        return []

    def parse_textarea_input(self, text):
        """Splits newline text into clean list items."""
        if not text:
            return []
        return [line.strip() for line in re.split(r"[\r\n]+", text) if line.strip()]

    def get(self, request, *args, **kwargs):
        """Render the input form with pre-populated session data."""
        context = {
            "ipn_list": request.session.get("active_ipn_list", ""),
            "packs": request.session.get("active_packs", ""),
            "sub_box_pulls": request.session.get("active_sub_box_pulls", ""),
        }
        return render(request, self.template_name, context)

    def post(self, request, *args, **kwargs):
        """Handle form submissions: update session and generate PDF report."""
        ipn_raw = request.POST.get("ipn_list", "")
        packs_raw = request.POST.get("packs", "")
        sub_pulls_raw = request.POST.get("sub_box_pulls", "")
        action = request.POST.get("action", "generate_pdf")

        # Save active field state in user session
        request.session["active_ipn_list"] = ipn_raw
        request.session["active_packs"] = packs_raw
        request.session["active_sub_box_pulls"] = sub_pulls_raw

        if action == "save_session":
            return render(
                request,
                self.template_name,
                {
                    "ipn_list": ipn_raw,
                    "packs": packs_raw,
                    "sub_box_pulls": sub_pulls_raw,
                },
            )

        parsed_ipns = self.parse_textarea_input(ipn_raw)
        parsed_packs = self.parse_textarea_input(packs_raw)
        grouped_sub_pulls = self.parse_sub_pulls_by_customer(sub_pulls_raw)

        items = []
        for ipn in parsed_ipns:
            formatted_title = self.get_inventree_part_name(ipn)
            items.append({"IPN": ipn, "Title": formatted_title, "Description": ""})

        for pack_line in parsed_packs:
            pack_item = self.parse_pack_entry(pack_line)
            if pack_item:
                items.append(pack_item)

        # --- PDF Generation Pipeline ---
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )
        story = []

        styles = getSampleStyleSheet()

        # title_style = ParagraphStyle(
        #    "ReportTitle",
        #    parent=styles["Title"],
        #    fontSize=20,
        #    leading=24,
        #    textColor=colors.HexColor("#1A252C"),
        #    alignment=0,
        # )

        h1_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=21,
            textColor=colors.HexColor("#2C3E50"),
            spaceBefore=14,
            spaceAfter=8,
        )

        h2_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=colors.HexColor("#2C3E50"),
            spaceBefore=14,
            spaceAfter=8,
        )

        h3_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#2C3E50"),
            spaceBefore=14,
            spaceAfter=8,
        )

        sub_hdr_style = ParagraphStyle(
            "SubHeader",
            parent=styles["Heading3"],
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#34495E"),
            spaceBefore=6,
            spaceAfter=4,
        )

        body_style = ParagraphStyle(
            "ReportBody",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#333333"),
        )

        # Header Title
        story.append(Paragraph("<h1>SYNCROTH GAME DAY STRATEGY REPORT</h1>", h1_style))
        story.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=colors.HexColor("#2C3E50"),
                spaceAfter=12,
            )
        )

        ########################
        #### Section 1: Incentive Ratio Books
        ########################
        ratio_table_data = [
            [
                Paragraph("<b>Pull</b>", body_style),
                Paragraph("<b>Ratio</b>", body_style),
                Paragraph("<b>Title / SKU</b>", body_style),
            ]
        ]
        ratio_regex = re.compile(r"(\b1[:/]\d+\b|INCENTIVE|RATIO)", re.IGNORECASE)
        ratio_count = 0

        story.append(Paragraph("<h2>1. Incentive Ratio Books to Pull</h2>", h2_style))

        for item in items:
            title, sku, _ = self.get_item_data(item)  # Do we need sku here?
            match = ratio_regex.search(title) or ratio_regex.search(sku)

            if match:
                ratio_count += 1
                ratio_str = match.group(0).replace("/", ":").upper()
                ratio_table_data.append([
                    PrintableCheckbox(size=14),
                    Paragraph(ratio_str, body_style),
                    Paragraph(title, body_style),
                ])

        if ratio_count > 0:
            ratio_output_table = Table(ratio_table_data, colWidths=[30, 60, 450])

            ratio_output_table.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECF0F1")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ])
            )

            story.append(ratio_output_table)
        else:
            story.append(
                Paragraph(
                    "<i>No incentive ratio variants detected in input.</i>", body_style
                )
            )

        ########################
        #### Section 2: Packs to Assemble
        ########################
        pack_count = 0

        story.append(Spacer(1, 10))
        story.append(Paragraph("<h2>2. Packs to Assemble</h2>", h2_style))

        for item in items:
            title, sku, is_pack = self.get_item_data(item)

            if is_pack:
                pack_count += 1
                pack_block = [
                    Paragraph(f"<h3>PACK #{pack_count}: {title}</h3>", h3_style)
                ]
                components = self.get_pack_components(item)

                if components:
                    # Table Headers
                    comp_table_data = [
                        [
                            Paragraph("<b>Pull</b>", body_style),
                            Paragraph("<b>Required Issue</b>", body_style),
                        ]
                    ]

                    # Table Data
                    for comp in components:
                        comp_table_data.append([
                            PrintableCheckbox(size=14),
                            Paragraph(comp, body_style),
                        ])

                    ct = Table(comp_table_data, colWidths=[30, 510])

                    ct.setStyle(
                        TableStyle([
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECF0F1")),
                            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                            ("ALIGN", (0, 0), (0, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ])
                    )

                    pack_block.append(ct)
                story.append(KeepTogether(pack_block))

        if pack_count == 0:
            story.append(Paragraph("No pack assemblies detected.", body_style))

        if pack_count == 0:
            story.append(Paragraph("<i>No pack assemblies detected.</i>", body_style))

        ########################
        #### Section 3: Sub Box Pull Requests
        ########################
        if grouped_sub_pulls:
            story.append(Spacer(1, 10))
            story.append(Paragraph("<b>3. Sub Box Pull Requests</b>", h2_style))

            for customer_name, book_list in grouped_sub_pulls.items():
                sub_block = [
                    Paragraph(
                        f"<b>Subscriber: {customer_name}</b> ({len(book_list)} items)",
                        sub_hdr_style,
                    )
                ]

                sub_table_data = [
                    [
                        Paragraph("<b>Pull</b>", body_style),
                        Paragraph("<b>Item Title</b>", body_style),
                    ]
                ]

                for book_title in book_list:
                    sub_table_data.append([
                        PrintableCheckbox(size=14),
                        Paragraph(book_title, body_style),
                    ])

                st = Table(sub_table_data, colWidths=[30, 510])
                st.setStyle(
                    TableStyle([
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECF0F1")),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ])
                )
                sub_block.append(st)
                sub_block.append(Spacer(1, 6))

                story.append(KeepTogether(sub_block))

        doc.build(story)
        buffer.seek(0)

        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = (
            'inline; filename="game_day_strategy_report.pdf"'
        )
        return response
