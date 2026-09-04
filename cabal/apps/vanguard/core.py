# /plugins/Cabal/cabal/apps/vanguard/core.py

import logging
from pathlib import Path

from django.contrib import messages
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin

from cabal.utils import clean_text

from .helpers import VanguardParser
from .pdf import generate_pdf_response

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

                    # Automatically append newly recommended pack IPNs to the packs textarea
                    if recommended_packs:
                        existing_packs = VanguardParser.parse_textarea_input(packs_raw)
                        new_pack_ipns = [
                            rec["recommended_pack_ipn"] for rec in recommended_packs
                        ]
                        combined_packs = list(
                            dict.fromkeys(existing_packs + new_pack_ipns)
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

        # Handle 'Save Session' & Further 'Date Lookup' Action
        if action in ["save_session", "lookup_by_date"]:
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

        # Process input items
        parsed_ipns = VanguardParser.parse_textarea_input(ipn_raw)
        logger.info(f"🔍 [Vanguard] parsed_ipns: {parsed_ipns}")

        parsed_packs = VanguardParser.parse_textarea_input(packs_raw)
        logger.info(f"🔍 [Vanguard] parsed_packs: {parsed_packs}")

        items = []

        # Process IPNs
        for ipn in parsed_ipns:
            raw_title = VanguardParser.get_inventree_part_name(ipn)
            logger.info(f"🔍 [Vanguard] raw_title: {raw_title}")

            formatted_title = clean_text(raw_title)
            logger.info(f"🔍 [Vanguard] formatted_title: {formatted_title}")

            items.append({"IPN": ipn, "Title": formatted_title, "Description": ""})

        logger.info(f"🔍 [Vanguard] items after 'for ipn in parsed_ipns': {items}")

        # Process Packs
        for pack_line in parsed_packs:
            pack_item = VanguardParser.parse_pack_entry(pack_line)
            logger.info(f"🔍 [Vanguard] pack_item: {pack_item}")

            if pack_item:
                pack_item["Title"] = clean_text(pack_item.get("Title", ""))
                logger.info(f'🔍 [Vanguard] pack_item["Title"]: {pack_item["Title"]}')

                items.append(pack_item)

        logger.info(
            f"🔍 [Vanguard] items after 'for pack_line in parsed_packs:': {items}"
        )

        # Delegate PDF building and HTTP response generation
        return generate_pdf_response(items, sub_pulls_raw)
