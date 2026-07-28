# syncroth/views.py
import logging
import re

from datetime import datetime

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Count, Sum
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.generic import View

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from part.models import Part
from stock.models import StockItem, StockLocation

from .parsers import (
    build_descriptiononly_data_file,
    build_inventree_data_file,
    build_whatnot_data_file,
)
from .utils import DOMAIN

try:
    from common.models import Parameter, ParameterTemplate
except ImportError:
    from part.models import Parameter, ParameterTemplate

logger = logging.getLogger("inventree")


class DataToolView(View):
    permission_classes = [IsAuthenticated]

    template_name = "syncroth/data-tool.html"

    def add_domain(self, path):
        if not path:
            return ""
        if path.startswith(("http://", "https://")):
            return path
        return f"{DOMAIN}/{path.lstrip('/')}"

    def get_parameter_value(self, part, parameter_name, default=None):
        try:
            # Native InvenTree relation lookup (if using part.parameters)
            if hasattr(part, "parameters"):
                param = part.parameters.filter(
                    template__name__iexact=parameter_name
                ).first()
                if param:
                    return param.data

            # Query lookup
            content_type = ContentType.objects.get_for_model(part)
            parameter = Parameter.objects.get(
                model_type=content_type,
                model_id=part.pk,
                template__name__iexact=parameter_name,
            )
            return parameter.data
        except Exception as e:
            logger.warning(f"Error getting parameter '{parameter_name}': {e}")
            return default

    def get_listing_price(self, part, override_param_names=None):
        """
        Retrieves the listing price for a part.
        1. Checks native InvenTree Part pricing first.
        2. Falls back to parameter overrides (e.g., Whatnot price param) if native price is not set.
        """
        # 1. Check Native InvenTree Part Pricing First
        native_price = None

        # Handle if 'part' is an InvenTree Model instance or API dictionary
        if hasattr(part, "get_price") and callable(part.get_price):
            native_price = part.get_price(1)
        elif isinstance(part, dict):
            # Checks common InvenTree API pricing keys
            native_price = (
                part.get("sale_price") or part.get("price") or part.get("pricing_min")
            )

        if native_price is not None and str(native_price).strip() != "":
            try:
                clean_price = (
                    str(native_price).replace("$", "").replace(",", "").strip()
                )
                price_float = float(clean_price)
                if price_float > 0:
                    return price_float
            except (ValueError, TypeError):
                pass  # Fallback to parameter lookup below if conversion fails

        # 2. Fallback to Parameter Overrides (e.g., Whatnot parameter)
        if override_param_names:
            for param_name in override_param_names:
                val = self.get_parameter_value(part, param_name)
                if val is not None and str(val).strip() != "":
                    try:
                        clean_val = str(val).replace("$", "").replace(",", "").strip()
                        return float(clean_val)
                    except (ValueError, TypeError):
                        continue

        return None

    def get_actual_quantity(self, item):
        if hasattr(item, "_is_pack_inheritance"):
            return getattr(item, "_pack_qty", 1)
        if isinstance(item, StockItem):
            return int(item.quantity)
        if isinstance(item, Part):
            stock_total = StockItem.objects.filter(part=item).aggregate(
                total=Sum("quantity")
            )["total"]
            return int(stock_total) if stock_total else 0
        return 1

    def get_part_images(self, part, max_images=8):
        images = []
        if hasattr(part, "attachments"):
            for attachment in part.attachments.all():
                fn = attachment.attachment.name.lower()
                if fn.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                    images.append(self.add_domain(attachment.attachment.url))
        if (
            part.image
            and hasattr(part.image, "url")
            and "placeholder" not in part.image.url.lower()
        ):
            images.append(self.add_domain(part.image.url))
        seen, final = set(), []
        for img in images:
            if img not in seen:
                seen.add(img)
                final.append(img)
            if len(final) >= max_images:
                break
        return final

    # --- Request Handling ---

    def get(self, request):
        return self.process_request(request, request.GET)

    def post(self, request):
        return self.process_request(request, request.POST)

    def process_request(self, request, source):
        ipn_list = request.POST.get("ipn_list") or request.GET.get("ipn_list")
        if ipn_list:
            request.session["active_ipn_list"] = ipn_list

        all_locations = StockLocation.objects.all()
        locations = StockLocation.objects.annotate(
            num_items=Count("stock_items")
        ).filter(num_items__gt=0)
        mode, export_items = "idle", []

        whatnot_only = source.get("whatnot_only", "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        selected_location_id = source.get("location", "").strip()
        url_ipn_list = source.get("ipn_list", "")
        whatnot_listing_type = source.get("whatnot_listing_type", "Auction")
        parser_name = source.get("parser", "whatnot").strip()
        output_format = source.get("format", "").strip()
        in_stock_date = source.get("in_stock_date", "").strip()

        logger.info("syncroth:DataTool:process_request:================")
        logger.info("syncroth:DataTool:process_request:request: %s", request)
        logger.info("syncroth:DataTool:process_request:source: %s", source)

        logger.info("syncroth:DataTool:process_request:ipn_list: %s", ipn_list)
        logger.info("syncroth:DataTool:process_request:whatnot_only: %s", whatnot_only)
        logger.info(
            "syncroth:DataTool:process_request:selected_location_id: %s",
            selected_location_id,
        )
        logger.info("syncroth:DataTool:process_request:url_ipn_list: %s", url_ipn_list)
        logger.info(
            "syncroth:DataTool:process_request:whatnot_listing_type: %s",
            whatnot_listing_type,
        )
        logger.info("syncroth:DataTool:process_request:parser_name: %s", parser_name)
        logger.info(
            "syncroth:DataTool:process_request:output_format: %s", output_format
        )
        logger.info(
            "syncroth:DataTool:process_request:in_stock_date: %s", in_stock_date
        )
        logger.info("syncroth:DataTool:process_request:================")

        # 1. Primary Lookups (Manual Textarea List -> WhatNot -> Location -> Date-Only)
        if url_ipn_list:
            mode = "manual"
            raw_ipns = [
                ipn.strip()
                for ipn in re.split(r"[\n\r,;\t]+", url_ipn_list)
                if ipn.strip()
            ]

            export_items = []
            pack_consumption = {}

            for original_ipn in raw_ipns:
                # 1. Extract and strip any trailing quantity multiplier (e.g. x2, X3, *2)
                qty_match = re.search(r"[xX\*](\d+)$", original_ipn)
                requested_packs = int(qty_match.group(1)) if qty_match else 1

                # Clean entry string without trailing quantity
                clean_entry = re.sub(r"[xX\*]\d+$", "", original_ipn).strip()
                upper_ipn = clean_entry.upper()

                pack_match = re.search(r"PACK", upper_ipn)

                if pack_match:
                    pack_match_form = re.search(r"[-]?(\d+)PACK", upper_ipn)

                    if pack_match_form:
                        pack_start = pack_match_form.start()
                        num_before = pack_match_form.group(1)
                        has_explicit_num = True
                        issues_per_pack = int(num_before)
                        deduction_per_component = issues_per_pack
                    else:
                        pack_start = upper_ipn.find("PACK")
                        has_explicit_num = False
                        issues_per_pack = 1
                        deduction_per_component = 1

                    base_ipn = clean_entry[:pack_start].rstrip("-")

                    after_pack = upper_ipn[pack_match.end() :].strip()
                    cover_letters = "".join([c for c in after_pack if c.isalpha()])

                    if not has_explicit_num and cover_letters:
                        issues_per_pack = len(cover_letters)

                    if issues_per_pack == 5 and not cover_letters:
                        cover_letters = "A"

                    if has_explicit_num:
                        clean_pack_ipn = (
                            f"{base_ipn}-{issues_per_pack}PACK{cover_letters}"
                        )
                    else:
                        clean_pack_ipn = f"{base_ipn}-PACK{cover_letters}"

                    try:
                        base_part = Part.objects.get(IPN=base_ipn)

                        pack_components = []
                        pack_covers = []
                        has_ratio = False

                        for letter in cover_letters:
                            if not letter.isalpha():
                                continue
                            target_ipn = (
                                base_ipn if letter == "A" else f"{base_ipn}{letter}"
                            )
                            try:
                                comp_part = Part.objects.get(IPN=target_ipn)
                                pack_components.append(comp_part)

                                text = f"{comp_part.name or ''} {comp_part.description or ''}"
                                scale_match = re.search(
                                    r"1[:/]\s*\d+", text, re.IGNORECASE
                                )
                                scale = (
                                    scale_match.group(0)
                                    .upper()
                                    .replace("/", ":")
                                    .replace(" ", "")
                                    if scale_match
                                    else None
                                )
                                if scale:
                                    has_ratio = True

                                pack_covers.append(
                                    letter if not scale else f"{letter} {scale}"
                                )

                                total_deduction = (
                                    deduction_per_component * requested_packs
                                )
                                pack_consumption[target_ipn] = (
                                    pack_consumption.get(target_ipn, 0)
                                    + total_deduction
                                )

                            except Part.DoesNotExist:
                                logger.warning(
                                    f"Pack component part not found: {target_ipn}"
                                )
                                continue

                        if pack_components:
                            pack_type = "Ratio Pack" if has_ratio else "Variant Pack"

                            if has_explicit_num and issues_per_pack == 5:
                                base_part._pack_display_name = (
                                    f"{issues_per_pack} Issues Cover {cover_letters}"
                                )
                            else:
                                base_part._pack_display_name = f"{issues_per_pack} Covers [{','.join(pack_covers)}]"

                            base_part._pack_type = pack_type
                            base_part._pack_components = pack_components
                            base_part._pack_covers = pack_covers
                            base_part._pack_qty = requested_packs
                            base_part._issues_per_pack = issues_per_pack
                            base_part._has_ratio = has_ratio
                            base_part._is_pack_inheritance = True
                            base_part.IPN = clean_pack_ipn
                            base_part._original_clean_ipn = clean_pack_ipn
                            base_part._clean_base_ipn = base_ipn

                            export_items.append(base_part)
                            continue

                    except Part.DoesNotExist:
                        logger.warning(f"Base part not found for pack: {base_ipn}")

                # Standard Non-Pack Item Fallback
                try:
                    part = Part.objects.get(IPN=clean_entry)
                    part._pack_qty = requested_packs
                    export_items.append(part)
                except Part.DoesNotExist:
                    logger.warning(f"SKU not found: {clean_entry}")
                    continue

            for item in export_items[:]:
                part = item.part if isinstance(item, StockItem) else item
                if (
                    not hasattr(part, "_is_pack_inheritance")
                    and part.IPN in pack_consumption
                ):
                    deduction = pack_consumption[part.IPN]
                    if hasattr(part, "_pack_qty"):
                        part._pack_qty = max(
                            0, getattr(part, "_pack_qty", 1) - deduction
                        )

        elif whatnot_only:
            field = "Listed on WhatNot"
            try:
                template = ParameterTemplate.objects.get(name=field)
                listed_params = Parameter.objects.filter(
                    template=template, data__in=[True, "True", "true", "1"]
                )
                export_items = list(
                    Part.objects.filter(parameters__in=listed_params).distinct()
                )
                mode = "listed_export"
            except ParameterTemplate.DoesNotExist:
                mode = "empty_listed"

        elif selected_location_id:
            try:
                location_obj = StockLocation.objects.get(id=selected_location_id)
                export_items = list(
                    StockItem.objects.filter(
                        location=location_obj, quantity__gt=0
                    ).select_related("part", "part__category", "part__default_location")
                )
                mode = "location"
            except StockLocation.DoesNotExist:
                pass

        # Fallback: Date-only search
        elif in_stock_date:
            try:
                date_params = Parameter.objects.filter(
                    template_id=68, data__icontains=in_stock_date
                )
                matching_part_ids = list(date_params.values_list("model_id", flat=True))
                export_items = list(Part.objects.filter(pk__in=matching_part_ids))
                mode = "date_search"
            except Exception as e:
                logger.error(f"Error executing date-only search: {e}")

        # 2. Refinement Step: Narrow down ONLY IF NOT MANUAL
        if in_stock_date and export_items and mode not in ("date_search", "manual"):
            try:
                date_params = Parameter.objects.filter(
                    template_id=68, data__icontains=in_stock_date
                )
                matching_part_ids = set(date_params.values_list("model_id", flat=True))

                filtered_items = []
                for item in export_items:
                    part_pk = item.part.pk if isinstance(item, StockItem) else item.pk
                    if part_pk in matching_part_ids:
                        filtered_items.append(item)
                export_items = filtered_items
            except Exception as e:
                logger.error(f"Error filtering by In Stock Date: {e}")

        # --- CSV Generation & Response ---
        csv_text = ""
        if export_items:
            DATA_PARSERS = {
                "description_only": build_descriptiononly_data_file,
                "inventree": build_inventree_data_file,
                "whatnot": lambda items, req: build_whatnot_data_file(
                    items,
                    request=req,
                    data_tool_instance=self,
                    whatnot_listing_type=whatnot_listing_type,
                ),
            }
            parser_func = DATA_PARSERS.get(parser_name, build_inventree_data_file)
            csv_text = parser_func(export_items, request)

        if output_format == "csv" and export_items:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            response = HttpResponse(csv_text, content_type="text/csv")
            response["Content-Disposition"] = (
                f'attachment; filename="{mode}_{timestamp}.csv"'
            )
            return response

        # Safe AJAX response
        if request.headers.get("X-Requested-With") == "XMLHttpRequest":
            item_ipns = [
                getattr(item.part if isinstance(item, StockItem) else item, "IPN", "")
                for item in export_items
            ]
            return JsonResponse({"csv_text": csv_text, "items": item_ipns})

        ipn_items = [
            getattr(item.part if isinstance(item, StockItem) else item, "IPN", "")
            for item in export_items
        ]
        context = {
            "all_locations": all_locations,
            "locations": locations,
            "incomplete_parts_list": "\n".join(ipn_items) if export_items else "",
            "parts_count": len(export_items),
            "csv_text": csv_text,
            "mode": mode,
            "parser_name": parser_name,
            "whatnot_listing_type": whatnot_listing_type,
            "selected_location": selected_location_id,
            "selected_in_stock_date": in_stock_date,
        }

        # Store items on request object so helper views like WeeklyReportPDFView can access them
        request.export_items = export_items

        return render(request, self.template_name, context)


class MoveStockItems(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        target_location_raw, ipn_list_raw = (
            request.data.get("location"),
            request.data.get("ipns", ""),
        )
        is_dry_run, ipns = (
            request.data.get("dry_run", False),
            [ipn.strip() for ipn in ipn_list_raw.split("\n") if ipn.strip()],
        )
        try:
            if str(target_location_raw).isdigit():
                new_location = StockLocation.objects.get(id=int(target_location_raw))
            else:
                new_location = StockLocation.objects.get(
                    name__iexact=str(target_location_raw).strip()
                )

            stock_items = StockItem.objects.filter(part__IPN__in=ipns, quantity__gt=0)
            items_list = []
            for item in stock_items:
                items_list.append({
                    "sku": item.part.IPN,
                    "old_loc": item.location.name if item.location else "No Location",
                    "new_loc": new_location.name,
                })

            if not is_dry_run:
                with transaction.atomic():
                    for item in stock_items:
                        item.move(
                            new_location,
                            notes="Bulk moved via Syncroth",
                            user=request.user,
                        )

            return Response({
                "status": "success",
                "dry_run": is_dry_run,
                "count": len(items_list),
                "items": items_list,
            })
        except StockLocation.DoesNotExist:
            return Response(
                {
                    "status": "error",
                    "message": f"Target location '{target_location_raw}' was not found.",
                },
                status=400,
            )
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=400)
