import logging

from django.db.models import Q
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin
from part.models import Part

logger = logging.getLogger("inventree")


@method_decorator(xframe_options_sameorigin, name="dispatch")
class Dewey(View):
    """
    Renders a static HTML template view for searching book IPNs via a list of terms.
    """

    def get(self, request, *args, **kwargs):
        return render(
            request,
            "dewey/dewey.html",
            {"results": None, "raw_search_terms": "", "debug_message": None},
        )

    def post(self, request, *args, **kwargs):
        raw_search_terms = request.POST.get("search_terms", "")
        # Split search terms by line and clean whitespace
        search_terms = [t.strip() for t in raw_search_terms.splitlines() if t.strip()]
        results = []
        debug_message = None

        if search_terms:
            logger.info(
                f"[Dewey] Triggered batch search for {len(search_terms)} "
                f"term(s) by user: {request.user}"
            )

            try:
                # Build a dynamic OR query combining all search terms
                query = Q()
                for term in search_terms:
                    query |= (
                        Q(name__icontains=term)
                        | Q(description__icontains=term)
                        | Q(IPN__icontains=term)
                    )

                # Query InvenTree parts using Django ORM
                parts = Part.objects.filter(query).distinct()

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
                            f"[Dewey] Could not fetch parameters for part "
                            f"{part.pk}: {param_err}"
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

                debug_message = (
                    f"Query executed successfully for {len(search_terms)}"
                    f" term(s). Found {len(results)} matching part(s)."
                )

            except Exception as e:
                logger.error(f"[Dewey] InvenTree query failed: {e}", exc_info=True)
                debug_message = f"Error during query execution: {str(e)}"

        context = {
            "results": results,
            "raw_search_terms": raw_search_terms,
            "debug_message": debug_message,
        }

        return render(request, "dewey/dewey.html", context)
