# cabal/apps/syncroth/pdf.py

import io
import re
import socket
import urllib.request

from django.http import HttpResponse
from django.views.generic import View

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class PrintableCheckbox(Flowable):
    def __init__(self, size=12, border_color="#2C3E50"):
        super().__init__()
        self.size = size
        self.border_color = colors.HexColor(border_color)

    def wrap(self, availWidth, availHeight):
        return self.size, self.size

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(1)
        self.canv.rect(0, 0, self.size, self.size)
        self.canv.restoreState()


class WeeklyReportPDFView(View):
    def get_item_data(self, item):
        """Helper to extract Title, SKU, and Pack status."""
        if isinstance(item, dict):
            title = (
                item.get("Title") or item.get("name") or item.get("Description") or ""
            )
            sku = item.get("SKU") or item.get("IPN") or item.get("part_ipn") or ""
            is_pack = (
                "PACK" in sku.upper()
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
        """
        Extracts individual comic issues required for the pack checklist,
        properly multiplied by the total batch quantity of packs ordered.
        """
        components = []

        # 1. Safely extract quantity & part object
        if isinstance(item, dict):
            raw_qty = item.get("Quantity") or item.get("quantity") or 1
            desc = item.get("Description", "")
            sku = item.get("SKU") or item.get("IPN") or ""
            part = item.get("part")
        else:
            raw_qty = getattr(item, "quantity", 1)
            part = getattr(item, "part", item)
            desc = getattr(part, "description", "")
            sku = getattr(part, "IPN", "") or getattr(part, "SKU", "")

        try:
            batch_qty = int(raw_qty)
        except (ValueError, TypeError):
            batch_qty = 1

        pack_qty = getattr(part, "_pack_qty", 1) if part else 1

        # 2. Extract components from 'Pack includes: ...' description string
        if "Pack includes:" in desc:
            raw_parts = desc.split("Pack includes:")[-1].strip()
            items_list = [p.strip() for p in re.split(r"[;,]", raw_parts) if p.strip()]

            for comp_str in items_list:
                clean_item = re.sub(
                    r"^\d+\s*x\s*", "", comp_str, flags=re.IGNORECASE
                ).strip()

                base_multiplier = 1
                match_base = re.search(r"^(\d+)\s*x\s*", comp_str, flags=re.IGNORECASE)
                if match_base:
                    base_multiplier = int(match_base.group(1))

                total_needed = base_multiplier * batch_qty
                components.append(f"{total_needed}x {clean_item}")

            return components

        # 3. Direct inspection of part._pack_components (In-memory lookup)
        if part and hasattr(part, "_pack_components") and part._pack_components:
            for component in part._pack_components:
                last_char = component.IPN[-1].upper()
                cover_letter = last_char if last_char.isalpha() else "A"
                comp_name = getattr(component, "name", "") or ""

                cover_match = re.search(r"(Cover\s+[A-Z].*)", comp_name, re.IGNORECASE)
                if cover_match:
                    variant_detail = cover_match.group(1).strip()
                elif " - " in comp_name:
                    variant_detail = (
                        f"Cover {cover_letter} " + comp_name.split(" - ", 1)[1].strip()
                    )
                else:
                    variant_detail = f"Cover {cover_letter}"

                total_needed = pack_qty * batch_qty
                components.append(f"{total_needed}x {variant_detail}")

            return components

        # 4. Fallback: Parse cover letters AND xMultiplier directly from SKU (e.g. PACKABCDE)
        upper_sku = sku.upper()

        sku_mult_match = re.search(r"X(\d+)$", upper_sku)
        if sku_mult_match:
            pack_qty = int(sku_mult_match.group(1))

        pack_match = re.search(r"PACK([A-Z]+)", upper_sku)
        if pack_match:
            cover_letters = list(pack_match.group(1))  # e.g., ['A', 'B', 'C', 'D', 'E']
            total_per_cover = pack_qty * batch_qty
            for letter in cover_letters:
                components.append(f"{total_per_cover}x Cover {letter}")

        return components

    def get_reportlab_image(self, img_source, width=45, height=65):
        """
        Downloads or loads an image and returns a ReportLab Image flowable.
        Returns empty string if loading fails or times out.
        """
        if not img_source:
            return ""

        try:
            if str(img_source).startswith("http"):
                req = urllib.request.Request(
                    img_source, headers={"User-Agent": "Mozilla/5.0"}
                )
                with urllib.request.urlopen(req, timeout=1.5) as response:
                    img_data = io.BytesIO(response.read())
                return RLImage(img_data, width=width, height=height)
            else:
                return RLImage(img_source, width=width, height=height)
        except (
            urllib.error.URLError,
            urllib.error.HTTPError,
            socket.timeout,
            Exception,
        ):
            return ""

    def get(self, request, *args, **kwargs):
        from .apps import DataTool

        tool = DataTool()

        # Pull parameters from GET or fallback to session parameters
        params = request.GET.copy()
        if "ipn_list" not in params and request.session.get("active_ipn_list"):
            params["ipn_list"] = request.session.get("active_ipn_list")

        tool.process_request(request, params)
        items = getattr(request, "export_items", [])

        # Setup Document Layout
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

        # Document Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "ReportTitle",
            parent=styles["Title"],
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#1A252C"),
            alignment=0,
        )
        h2_style = ParagraphStyle(
            "SectionHeader",
            parent=styles["Heading2"],
            fontSize=13,
            leading=17,
            textColor=colors.HexColor("#2C3E50"),
            spaceBefore=14,
            spaceAfter=8,
        )
        body_style = ParagraphStyle(
            "ReportBody",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#333333"),
        )
        pack_header_style = ParagraphStyle(
            "PackHeaderStyle",
            parent=body_style,
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1A252C"),
            spaceBefore=6,
            spaceAfter=4,
        )

        # Main Title Header
        story.append(Paragraph("<b>SYNCROTH GAME DAY STRATEGY REPORT</b>", title_style))
        story.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=colors.HexColor("#2C3E50"),
                spaceAfter=12,
            )
        )

        # -------------------------------------------------------------------
        # SECTION 1: RATIO BOOKS PULL CHECKLIST
        # -------------------------------------------------------------------
        story.append(Paragraph("<b>1. Incentive Ratio Books to Pull</b>", h2_style))

        ratio_table_data = [
            [
                Paragraph("<b>Pull</b>", body_style),
                Paragraph("<b>Cover</b>", body_style),
                Paragraph("<b>Ratio</b>", body_style),
                # Paragraph("<b>SKU / IPN</b>", body_style),
                Paragraph("<b>Title</b>", body_style),
            ]
        ]

        ratio_regex = re.compile(r"(\b1[:/]\d+\b|INCENTIVE|RATIO)", re.IGNORECASE)
        ratio_count = 0

        for item in items:
            title, sku, _ = self.get_item_data(item)
            part = getattr(item, "part", item) if not isinstance(item, dict) else {}
            desc = (
                item.get("Description", "")
                if isinstance(item, dict)
                else getattr(part, "description", "")
            )

            match = (
                ratio_regex.search(title)
                or ratio_regex.search(desc)
                or ratio_regex.search(sku)
            )
            if match:
                ratio_str = match.group(0).replace("/", ":").upper()
                ratio_count += 1

                img_url = None
                if hasattr(tool, "get_part_images") and not isinstance(item, dict):
                    imgs = tool.get_part_images(part, max_images=1)
                    img_url = imgs[0] if imgs else None
                elif isinstance(item, dict):
                    img_url = item.get("Image URL") or item.get("image")

                img_flowable = self.get_reportlab_image(img_url, width=40, height=58)

                ratio_table_data.append([
                    PrintableCheckbox(size=14),
                    img_flowable,
                    Paragraph(f"<b>{ratio_str}</b>", body_style),
                    # Paragraph(f"<code>{sku}</code>", body_style),
                    Paragraph(title, body_style),
                ])

        if ratio_count > 0:
            ratio_table = Table(
                ratio_table_data,
                colWidths=[30, 48, 55, 160, 247],
                repeatRows=1,
            )
            ratio_table.setStyle(
                TableStyle([
                    (
                        "BACKGROUND",
                        (0, 0),
                        (-1, 0),
                        colors.HexColor("#ECF0F1"),
                    ),
                    (
                        "GRID",
                        (0, 0),
                        (-1, -1),
                        0.5,
                        colors.HexColor("#BDC3C7"),
                    ),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 1), (0, -1), "CENTER"),
                    ("ALIGN", (1, 1), (1, -1), "CENTER"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ])
            )
            story.append(ratio_table)
        else:
            story.append(
                Paragraph(
                    "<i>No incentive ratio variants detected in this batch.</i>",
                    body_style,
                )
            )

        story.append(Spacer(1, 10))

        # -------------------------------------------------------------------
        # SECTION 2: PACK ASSEMBLY CHECKLIST (IN-DEPTH)
        # -------------------------------------------------------------------
        story.append(Paragraph("<b>2. Packs to Assemble</b>", h2_style))

        pack_count = 0
        for item in items:
            title, sku, is_pack = self.get_item_data(item)

            if is_pack:
                pack_count += 1
                pack_block = []  # Group pack header + components table

                # Pack Header Line
                pack_block.append(
                    Paragraph(
                        f"<b>PACK #{pack_count}: {title}</b>",  #  &nbsp;&nbsp;|&nbsp;&nbsp; <code>{sku}</code>
                        pack_header_style,
                    )
                )

                components = self.get_pack_components(item)

                if components:
                    comp_table_data = [
                        [
                            Paragraph("<b>Pull</b>", body_style),
                            Paragraph("<b>Cover</b>", body_style),
                            Paragraph("<b>Required Component Issue</b>", body_style),
                        ]
                    ]

                    part = (
                        getattr(item, "part", item)
                        if not isinstance(item, dict)
                        else None
                    )
                    pack_comps = getattr(part, "_pack_components", []) if part else []

                    for idx, comp in enumerate(components):
                        img_url = None
                        if idx < len(pack_comps) and hasattr(tool, "get_part_images"):
                            comp_imgs = tool.get_part_images(
                                pack_comps[idx], max_images=1
                            )
                            img_url = comp_imgs[0] if comp_imgs else None

                        img_flowable = self.get_reportlab_image(
                            img_url, width=35, height=50
                        )

                        comp_table_data.append([
                            PrintableCheckbox(size=14),
                            img_flowable,
                            Paragraph(f"<b>{comp}</b>", body_style),
                        ])

                    comp_table = Table(comp_table_data, colWidths=[30, 45, 465])
                    comp_table.setStyle(
                        TableStyle([
                            (
                                "BACKGROUND",
                                (0, 0),
                                (-1, 0),
                                colors.HexColor("#ECF0F1"),
                            ),
                            (
                                "GRID",
                                (0, 0),
                                (-1, -1),
                                0.5,
                                colors.HexColor("#BDC3C7"),
                            ),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("ALIGN", (0, 1), (0, -1), "CENTER"),
                            ("ALIGN", (1, 1), (1, -1), "CENTER"),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ])
                    )
                    pack_block.append(comp_table)
                else:
                    pack_block.append(
                        Paragraph(
                            "<i>&nbsp;&nbsp;&nbsp;&nbsp;No sub-issue breakdown available for this pack.</i>",
                            body_style,
                        )
                    )

                pack_block.append(Spacer(1, 10))

                # Keep the pack title and its component table together on the same page
                story.append(KeepTogether(pack_block))

        if pack_count == 0:
            story.append(
                Paragraph(
                    "<i>No pack assemblies detected in this batch.</i>",
                    body_style,
                )
            )

        # Build PDF Document
        doc.build(story)

        buffer.seek(0)
        response = HttpResponse(buffer, content_type="application/pdf")
        response["Content-Disposition"] = (
            'inline; filename="game_day_strategy_report.pdf"'
        )
        return response
