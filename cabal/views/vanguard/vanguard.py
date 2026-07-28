# cabal/views/vanguard/vanguard.py

import io
import re

from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import render
from django.views import View

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .flowables import PrintableCheckbox
from .helpers import VanguardParser


class LookupPacksApiView(APIView):
    """API endpoint to look up IPNs by date and recommend available cover packs."""

    permission_classes = [
        IsAuthenticated
    ]  # Ensures 401 response instead of 302 redirect

    def post(self, request, *args, **kwargs):
        # request.data works for BOTH JSON bodies and standard POST form data
        lookup_date = request.data.get("lookup_date", "")
        ipn_raw = request.data.get("ipn_list", "")

        if not lookup_date:
            return Response(
                {"status": "error", "message": "Please select a date first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Fetch date IPNs
        date_ipns = VanguardParser.get_ipns_by_param_date(lookup_date)
        if not date_ipns:
            return Response(
                {
                    "status": "warning",
                    "message": f"No IPNs found matching '{lookup_date}'.",
                },
                status=status.HTTP_200_OK,
            )

        # 2. Combine IPNs
        existing_lines = VanguardParser.parse_textarea_input(ipn_raw)
        combined_ipns = list(dict.fromkeys(existing_lines + date_ipns))
        updated_ipn_text = "\n".join(combined_ipns)

        # 3. Generate pack recommendations strictly from input IPNs
        recommended_packs = VanguardParser.recommend_packs_from_ipns(
            ipn_list=combined_ipns, min_stock=1
        )

        return Response(
            {
                "status": "success",
                "message": f"Found {len(recommended_packs)} pack recommendation(s).",
                "ipn_list": updated_ipn_text,
                "recommended_packs": recommended_packs,
            },
            status=status.HTTP_200_OK,
        )


class Vanguard(View):
    template_name = "vanguard/vanguard.html"

    def get(self, request, *args, **kwargs):
        # Retrieve context state
        context = {
            "ipn_list": request.session.get("active_ipn_list", ""),
            "packs": request.session.get("active_packs", ""),
            "sub_box_pulls": request.session.get("active_sub_box_pulls", ""),
            "selected_date": request.session.get("active_lookup_date", ""),
            "recommended_packs": request.session.get("active_recommended_packs", []),
        }
        return render(request, self.template_name, context)

    def post(self, request, *args, **kwargs):
        action = request.POST.get("action", "generate_pdf")

        # --- Handle Clear All Action ---
        if action == "clear_all":
            for key in [
                "active_ipn_list",
                "active_packs",
                "active_sub_box_pulls",
                "active_lookup_date",
                "active_recommended_packs",
            ]:
                request.session.pop(key, None)

            messages.info(request, "All fields cleared.")
            return render(
                request,
                self.template_name,
                {
                    "ipn_list": "",
                    "packs": "",
                    "sub_box_pulls": "",
                    "selected_date": "",
                    "recommended_packs": [],
                },
            )

        # Retrieve form data
        ipn_raw = request.POST.get("ipn_list", "")
        packs_raw = request.POST.get("packs", "")
        sub_pulls_raw = request.POST.get("sub_box_pulls", "")
        lookup_date = request.POST.get("lookup_date", "")

        recommended_packs = []

        # --- Handle Date Lookup Action ---
        if action == "lookup_by_date":
            if not lookup_date:
                messages.warning(request, "Please select a date first.")
            else:
                date_ipns = VanguardParser.get_ipns_by_param_date(lookup_date)
                if date_ipns:
                    existing_lines = VanguardParser.parse_textarea_input(ipn_raw)
                    combined_ipns = list(dict.fromkeys(existing_lines + date_ipns))
                    ipn_raw = "\n".join(combined_ipns)

                    # FIX: Pass combined_ipns into the recommendation engine!
                    recommended_packs = VanguardParser.recommend_packs_from_ipns(
                        ipn_list=combined_ipns, min_stock=1
                    )

                    # Automatically append newly recommended pack SKUs to the packs textarea
                    if recommended_packs:
                        existing_packs = VanguardParser.parse_textarea_input(packs_raw)
                        new_pack_skus = [
                            rec["recommended_pack_sku"] for rec in recommended_packs
                        ]
                        combined_packs = list(
                            dict.fromkeys(existing_packs + new_pack_skus)
                        )
                        packs_raw = "\n".join(combined_packs)

                    messages.success(
                        request,
                        f"Added {len(date_ipns)} IPN(s) and {len(recommended_packs)} recommended pack(s) for {lookup_date}.",
                    )
                else:
                    messages.warning(
                        request,
                        f"No IPNs found with a date parameter matching '{lookup_date}'.",
                    )

        # Save session state
        request.session["active_ipn_list"] = ipn_raw
        request.session["active_packs"] = packs_raw
        request.session["active_sub_box_pulls"] = sub_pulls_raw
        request.session["active_lookup_date"] = lookup_date
        request.session["active_recommended_packs"] = recommended_packs

        if action in ["save_session", "lookup_by_date"]:
            return render(
                request,
                self.template_name,
                {
                    "ipn_list": ipn_raw,
                    "packs": packs_raw,
                    "sub_box_pulls": sub_pulls_raw,
                    "selected_date": lookup_date,
                    "recommended_packs": recommended_packs,
                },
            )

        parsed_ipns = VanguardParser.parse_textarea_input(ipn_raw)
        parsed_packs = VanguardParser.parse_textarea_input(packs_raw)
        grouped_sub_pulls = VanguardParser.parse_sub_pulls_by_customer(sub_pulls_raw)

        items = []
        for ipn in parsed_ipns:
            formatted_title = VanguardParser.get_inventree_part_name(ipn)
            items.append({"IPN": ipn, "Title": formatted_title, "Description": ""})

        for pack_line in parsed_packs:
            pack_item = VanguardParser.parse_pack_entry(pack_line)
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
            fontName="Helvetica-Bold",
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
        story.append(Paragraph("SYNCROTH GAME DAY STRATEGY REPORT", h1_style))
        story.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=colors.HexColor("#2C3E50"),
                spaceAfter=12,
            )
        )

        # Section 1: Incentive Ratio Books
        ratio_table_data = [
            [
                Paragraph("<b>Pull</b>", body_style),
                Paragraph("<b>Ratio</b>", body_style),
                Paragraph("<b>Title / SKU</b>", body_style),
            ]
        ]
        ratio_regex = re.compile(r"(\b1[:/]\d+\b|INCENTIVE|RATIO)", re.IGNORECASE)
        ratio_count = 0

        story.append(Paragraph("1. Incentive Ratio Books to Pull", h2_style))

        for item in items:
            title, sku, _ = VanguardParser.get_item_data(item)
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
                    ("ALIGN", (0, 0), (0, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ])
            )
            story.append(ratio_output_table)
        else:
            story.append(
                Paragraph("No incentive ratio variants detected in input.", body_style)
            )

        # Section 2: Packs to Assemble
        pack_count = 0
        story.append(Spacer(1, 10))
        story.append(Paragraph("2. Packs to Assemble", h2_style))

        for item in items:
            title, sku, is_pack = VanguardParser.get_item_data(item)

            if is_pack:
                pack_count += 1
                pack_block = [Paragraph(f"PACK #{pack_count}: {title}", h3_style)]
                components = VanguardParser.get_pack_components(item)

                if components:
                    comp_table_data = [
                        [
                            Paragraph("<b>Pull</b>", body_style),
                            Paragraph("<b>Required Issue</b>", body_style),
                        ]
                    ]

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

        # Section 3: Sub Box Pull Requests
        if grouped_sub_pulls:
            story.append(Spacer(1, 10))
            story.append(Paragraph("3. Sub Box Pull Requests", h2_style))

            for customer_name, book_list in grouped_sub_pulls.items():
                sub_block = [
                    Paragraph(
                        f"Subscriber: {customer_name} ({len(book_list)} items)",
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
                        ("ALIGN", (0, 0), (0, -1), "CENTER"),
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
