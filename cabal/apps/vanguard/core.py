# /plugins/Cabal/cabal/apps/vanguard/core.py

import io
import logging
import re
from pathlib import Path

from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin
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


if not logger.handlers:
    # Save log file alongside your python files
    log_file = Path(__file__).parent / "vanguard.log"
    file_handler = logging.FileHandler(log_file)

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Vanguard(View):
    template_name = "vanguard/vanguard.html"

    # Handle get
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

    # Handle post
    def post(self, request, *args, **kwargs):
        # Get action
        action = request.POST.get("action", "generate_pdf")
        logger.info(f"🔍 [Vanguard] Received post action: {action}")

        # Handle 'Clear All' action
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

            # Log catch
            logger.info("🔍 [Vanguard] 'clear_all' caught -- Return Render")

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
        logger.info(f"🔍 [Vanguard] ipn_raw: {ipn_raw}")

        packs_raw = request.POST.get("packs", "")
        logger.info(f"🔍 [Vanguard] packs_raw: {packs_raw}")

        sub_pulls_raw = request.POST.get("sub_box_pulls", "")
        logger.info(f"🔍 [Vanguard] sub_pulls_raw: {sub_pulls_raw}")

        lookup_date = request.POST.get("lookup_date", "")
        logger.info(f"🔍 [Vanguard] lookup_date: {lookup_date}")

        recommended_packs = []

        # Handle 'Date Lookup' action
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

        # Handle 'Save Session' & Further 'Date Lookup' Action (further)
        if action in ["save_session", "lookup_by_date"]:
            # Log catch
            logger.info(
                "🔍 [Vanguard] 'save_session' OR 'lookup_by_date' caught -- Return Render"
            )

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

        # Set more vars
        parsed_ipns = VanguardParser.parse_textarea_input(ipn_raw)
        logger.info(f"🔍 [Vanguard] parsed_ipns: {parsed_ipns}")

        parsed_packs = VanguardParser.parse_textarea_input(packs_raw)
        logger.info(f"🔍 [Vanguard] parsed_packs: {parsed_packs}")

        grouped_sub_pulls = VanguardParser.parse_sub_pulls_by_customer(sub_pulls_raw)
        logger.info(f"🔍 [Vanguard] grouped_sub_pulls: {grouped_sub_pulls}")

        items = []

        # Loop thru ipns
        for ipn in parsed_ipns:
            # Get raw title
            raw_title = VanguardParser.get_inventree_part_name(ipn)
            logger.info(f"🔍 [Vanguard] raw_title: {raw_title}")

            # Clean title
            formatted_title = clean_text(raw_title)
            logger.info(f"🔍 [Vanguard] formatted_title: {formatted_title}")

            # Append data
            items.append({"IPN": ipn, "Title": formatted_title, "Description": ""})

        # Log loop items
        logger.info(f"🔍 [Vanguard] items after 'for ipn in parsed_ipns': {items}")

        # Loop thru packs
        for pack_line in parsed_packs:
            # Get pack item
            pack_item = VanguardParser.parse_pack_entry(pack_line)
            logger.info(f"🔍 [Vanguard] pack_item: {pack_item}")

            # If we got a pack item
            if pack_item:
                # Clean pack titles
                pack_item["Title"] = clean_text(pack_item.get("Title", ""))
                logger.info(f'🔍 [Vanguard] pack_item["Title"]: {pack_item["Title"]}')

                # Append data
                items.append(pack_item)

        # Log loop items
        logger.info(
            f"🔍 [Vanguard] items after 'for pack_line in parsed_packs:': {items}"
        )

        # PDF generation pipeline
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

        # If we got 0 packs
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

        # If we got sub pulls
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

                # Col widths: 30 (checkbox), 420 (title), 90 (price) = 540 total width
                st = Table(sub_table_data, colWidths=[30, 420, 90])
                st.setStyle(
                    TableStyle([
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECF0F1")),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#BDC3C7")),
                        ("ALIGN", (0, 0), (0, -1), "CENTER"),
                        ("ALIGN", (2, 0), (2, -1), "RIGHT"),  # Right align price column
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

        logger.info("🔍 [Vanguard] ---- END LOOP ----")

        return response
