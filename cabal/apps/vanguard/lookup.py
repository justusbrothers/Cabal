# /plugins/Cabal/cabal/apps/vanguard/lookup.py


from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .helpers import VanguardParser


class LookupPacksApiView(APIView):
    """API endpoint to look up IPNs by date and recommend available cover packs."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        ipn_raw = request.data.get("ipn_list", "")
        sub_ipn_raw = request.data.get("sub_ipns", "")
        existing_lines = VanguardParser.parse_textarea_input(ipn_raw)
        recommended_ipn_list = list(dict.fromkeys(existing_lines))
        updated_ipn_text = "\n".join(recommended_ipn_list)

        recommended_packs = VanguardParser.recommend_packs_from_ipns(
            ipn_list=recommended_ipn_list, min_stock=2, sub_ipns=sub_ipn_raw
        )

        return Response(
            {
                "status": "success",
                "message": f"Found {len(recommended_packs)} pack recommendation(s).",
                "ipn_list": updated_ipn_text,
                "recommended_packs": recommended_packs,
                "_debug": {
                    "received_sub_ipns_raw": sub_ipn_raw,
                },
            },
            status=status.HTTP_200_OK,
        )


class LookupSinceApiView(APIView):
    """API endpoint to look up IPNs by date and result from 'added since' value."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        lookup_date = request.data.get("lookup_date", "")
        added_since = request.data.get("added_since", "")

        if not lookup_date:
            return Response(
                {"status": "error", "message": "Please select a date first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Retrieve IPNs by the selected lookup date param
        date_ipns = VanguardParser.get_ipns_by_param_date(lookup_date)

        # Filter by added_since date if provided
        filtered_ipns = []
        if added_since:
            filtered_ipns = VanguardParser.filter_ipns_by_creation_date(
                date_ipns, added_since
            )
        else:
            filtered_ipns = date_ipns

        return Response(
            {
                "status": "success",
                "lookup_date": lookup_date,
                "added_since": added_since,
                "ipns": filtered_ipns,
            },
            status=status.HTTP_200_OK,
        )
