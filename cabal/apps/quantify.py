# /plugins/Cabal/cabal/apps/quantify.py

import csv
import io
import logging

from django.contrib import messages
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.generic import View
from part.models import Part
from rest_framework.permissions import IsAuthenticated
from stock.models import StockItem

logger = logging.getLogger("inventree")

"""
Cabal Quantify View: Bulk update or set stock quantities using a CSV input (IPN, stock_qty)
with dry-run preview support.
"""


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Quantify(View):
    permission_classes = [IsAuthenticated]

    template_name = "quantify/quantify.html"

    def get(self, request):
        return self.process_request(request, request.GET)

    def post(self, request):
        return self.process_request(request, request.POST)

    def process_request(self, request, source):
        context = {}

        csv_data = request.POST.get("csv_input", "").strip()
        is_dry_run = request.POST.get("dry_run") == "on"

        if not csv_data:
            messages.error(request, "Please provide CSV data.")
            return render(request, self.template_name, context)

        updated_count = 0
        created_count = 0
        preview_logs = []
        errors = []

        try:
            # Parse CSV using StringIO
            f = io.StringIO(csv_data)
            reader = csv.DictReader(f)

            # Normalize field names to lowercase/stripped just in case
            reader.fieldnames = (
                [name.strip().lower() for name in reader.fieldnames]
                if reader.fieldnames
                else []
            )

            if not {"ipn", "stock_qty"}.issubset(reader.fieldnames):
                messages.error(
                    request,
                    "Invalid CSV format. Columns must include 'IPN' and 'stock_qty'.",
                )
                return render(request, self.template_name, context)

            for row in reader:
                ipn = row.get("ipn", "").strip()
                qty_str = row.get("stock_qty", "").strip()

                if not ipn:
                    continue

                try:
                    target_qty = int(qty_str)
                except ValueError:
                    errors.append(f"Invalid quantity '{qty_str}' for IPN {ipn}")
                    continue

                # Find the part by IPN
                try:
                    part = Part.objects.get(IPN=ipn)
                except Part.DoesNotExist:
                    errors.append(f"Part with IPN '{ipn}' not found.")
                    continue

                stock_item = StockItem.objects.filter(part=part).first()

                if stock_item:
                    old_qty = stock_item.quantity
                    updated_count += 1
                    preview_logs.append({
                        "ipn": ipn,
                        "action": "UPDATE",
                        "old_qty": old_qty,
                        "new_qty": target_qty,
                    })
                    if not is_dry_run:
                        stock_item.quantity = target_qty
                        stock_item.save()
                else:
                    created_count += 1
                    preview_logs.append({
                        "ipn": ipn,
                        "action": "CREATE",
                        "old_qty": "None",
                        "new_qty": target_qty,
                    })
                    if not is_dry_run:
                        StockItem.objects.create(
                            part=part,
                            quantity=target_qty,
                            status=10,  # OK / Available status
                        )

            # Perform actual DB commit only if not a dry run
            if not is_dry_run:
                messages.success(
                    request,
                    f"Successfully committed! Updated {updated_count} items, created {created_count} new stock entries.",
                )
            else:
                messages.info(
                    request,
                    f"🔍 DRY RUN COMPLETE: Would update {updated_count} items and create {created_count} entries. No changes were saved.",
                )

            if errors:
                for err in errors[:5]:
                    messages.warning(request, err)

            context["preview_logs"] = preview_logs
            context["is_dry_run_result"] = is_dry_run

        except Exception as e:
            logger.error(f"❌ [Quantify Error]: {e}")
            messages.error(request, f"Failed to process CSV: {e}")

        return render(request, self.template_name, context)
