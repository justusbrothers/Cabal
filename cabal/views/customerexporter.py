# cabal/views/customerexporter.py

import io
import json
import pandas as pd

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.clickjacking import xframe_options_sameorigin


class CustomerExporterView(View):
    template_name = "customerexporter/parser_interface.html"

    @method_decorator(xframe_options_sameorigin)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name, context={})

    def post(self, request, *args, **kwargs):
        try:
            data = json.loads(request.body)
            buyers_list = data.get("buyers", [])
            tippers_list = data.get("tippers", [])
            df_buyers = pd.DataFrame(buyers_list)
            df_tippers = pd.DataFrame(tippers_list)
            rename_map = {
                "BUYER_NAME": "Buyer Username",
                "STATE": "State",
                "COUNTRY": "Country",
                "LAST_TRANSACTION": "Last Seen Transaction",
            }

            if not df_buyers.empty:
                df_buyers = df_buyers.rename(columns=rename_map)

            if not df_tippers.empty:
                df_tippers = df_tippers.rename(columns=rename_map)

            output = io.BytesIO()

            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                if not df_buyers.empty:
                    df_buyers.to_excel(
                        writer,
                        sheet_name="Buyers (Orders & Giveaways)",
                        index=False,
                    )
                else:
                    pd.DataFrame(columns=["Buyer Username"]).to_excel(
                        writer,
                        sheet_name="Buyers (Orders & Giveaways)",
                        index=False,
                    )

                if not df_tippers.empty:
                    df_tippers.to_excel(writer, sheet_name="Tippers", index=False)
                else:
                    pd.DataFrame(columns=["Buyer Username"]).to_excel(
                        writer, sheet_name="Tippers", index=False
                    )

            output.seek(0)

            response = HttpResponse(
                output.getvalue(),
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )

            response["Content-Disposition"] = (
                'attachment; filename="Whatnot_CustomerExporter_Report.xlsx"'
            )

            return response

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
