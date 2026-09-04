# /plugins/Cabal/cabal/apps/vanguard/pdf.py

import io
import logging
import re

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from cabal.utils import clean_text

from .flowables import PrintableCheckbox
from .helpers import VanguardParser
from .styles import body_style, h1_style, h2_style, h3_style, sub_hdr_style

logger = logging.getLogger("Vanguard")
logger.propagate = False


def generate_pdf_response(items, sub_pulls_raw):
    """Builds the PDF document using ReportLab and returns an HttpResponse."""
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
            Paragraph("<b>Title / IPN</b>", body_style),
        ]
    ]
    ratio_regex = re.compile(r"(\b1[:/]\d+\b|INCENTIVE|RATIO)", re.IGNORECASE)
    ratio_count = 0

    story.append(Paragraph("1. Incentive Ratio Books to Pull", h2_style))

    for item in items:
        title, ipn, _ = VanguardParser.get_item_data(item)
        match = ratio_regex.search(title) or ratio_regex.search(ipn)

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
        title, ipn, is_pack = VanguardParser.get_item_data(item)

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

    # Section 3: Sub Box Pull Requests with Retail Pricing & Totals
    sub_totals_data = VanguardParser.calculate_sub_totals(sub_pulls_raw)
    logger.info(f"🔍 [Vanguard] sub_totals_data: {sub_totals_data}")

    grouped_sub_pulls = sub_totals_data["breakdown"]
    logger.info(f"🔍 [Vanguard] grouped_sub_pulls: {grouped_sub_pulls}")

    customer_totals = sub_totals_data["customer_totals"]
    logger.info(f"🔍 [Vanguard] customer_totals: {customer_totals}")

    grand_total = sub_totals_data["grand_total"]
    logger.info(f"🔍 [Vanguard] grand_total: {grand_total}")

    discounted_grand_total = grand_total * 0.90
    logger.info(f"🔍 [Vanguard] discounted_grand_total: {discounted_grand_total}")

    if grouped_sub_pulls:
        story.append(Spacer(1, 10))
        story.append(
            Paragraph(
                f"3. Sub Box Pull Requests - Grand Total: ${grand_total:.2f} <i>(10% Off: ${discounted_grand_total:.2f})</i>",
                h2_style,
            )
        )

        for customer_name, book_items in grouped_sub_pulls.items():
            cust_total = customer_totals.get(customer_name, 0.0)
            discounted_total = cust_total * 0.90

            sub_block = [
                Paragraph(
                    f"Subscriber: <b>{customer_name}</b> ({len(book_items)} items) — Total: <b>${cust_total:.2f}</b> <i>(10% Off: ${discounted_total:.2f})</i>",
                    sub_hdr_style,
                )
            ]

            sub_table_data = [
                [
                    Paragraph("<b>Pull</b>", body_style),
                    Paragraph("<b>Item Title</b>", body_style),
                    Paragraph("<b>Price</b>", body_style),
                ]
            ]

            for item in book_items:
                title_val = item["title"] or item["ipn"]
                title_str = clean_text(title_val)
                price_val = item.get("price", 0.0)
                price_str = f"${price_val:.2f}" if price_val > 0 else "—"

                sub_table_data.append([
                    PrintableCheckbox(size=14),
                    Paragraph(title_str, body_style),
                    Paragraph(price_str, body_style),
                ])

            st = Table(sub_table_data, colWidths=[30, 420, 90])
            st.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECF0F1")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                    ("ALIGN", (0, 0), (0, -1), "CENTER"),
                    ("ALIGN", (2, 0), (2, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ])
            )
            sub_block.append(st)
            sub_block.append(Spacer(1, 6))

            story.append(KeepTogether(sub_block))

    doc.build(story)
    buffer.seek(0)

    response = HttpResponse(buffer, content_type="application/pdf")
    response["Content-Disposition"] = 'inline; filename="game_day_strategy_report.pdf"'

    logger.info("🔍 [Vanguard] ---- END LOOP ----")

    return response
