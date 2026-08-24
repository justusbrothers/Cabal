# /plugins/Cabal/cabal/apps/dewey.py

import logging
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.db.models import Q
from part.models import Part

logger = logging.getLogger("inventree")


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Dewey(View):
    """Renders a static HTML template view for searching book IPNs."""

    def get(self, request, *args, **kwargs):
        return render(
            request,
            "dewey/dewey.html",
            {"results": None, "search_term": "", "debug_message": None},
        )

    def post(self, request, *args, **kwargs):
        search_term = request.POST.get("search_term", "").strip()
        results = []
        debug_message = None

        if search_term:
            logger.info(
                f"[Dewey] Triggered search for term: '{search_term}' by user: {request.user}"
            )

            try:
                # Query InvenTree parts using Django ORM
                parts = Part.objects.filter(
                    Q(name__icontains=search_term)
                    | Q(description__icontains=search_term)
                    | Q(IPN__icontains=search_term)
                ).distinct()

                logger.info(
                    f"[Dewey] Query successful. Raw parts returned: {parts.count()}"
                )

                for part in parts:
                    part_params = {}

                    try:
                        for param in part.parameters.all():
                            if param.template:
                                part_params[param.template.name] = param.data
                    except Exception as param_err:
                        logger.warning(
                            f"[Dewey] Could not fetch parameters for part {part.pk}: {param_err}"
                        )

                    stock_qty = 0

                    try:
                        stock_qty = part.get_stock_qty()
                    except Exception:
                        pass

                    results.append({
                        "ipn": part.IPN or "N/A",
                        "name": part.name,
                        "description": part.description,
                        "category": part.category.name
                        if part.category
                        else "Uncategorized",
                        "stock": stock_qty,
                        "location": part.default_location.name
                        if part.default_location
                        else "No Location",
                        "upc": part_params.get("UPC", "N/A"),
                    })

                debug_message = f"Query executed successfully. Found {len(results)} matching part(s)."

            except Exception as e:
                logger.error(f"[Dewey] InvenTree query failed: {e}", exc_info=True)
                debug_message = f"Error during query execution: {str(e)}"

        context = {
            "results": results,
            "search_term": search_term,
            "debug_message": debug_message,
        }

        return render(request, "dewey/dewey.html", context)
