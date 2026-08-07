# /plugins/Cabal/cabal/apps/avisia/avisia.py

import io
import json
import pandas as pd

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.http import require_http_methods
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.decorators.csrf import csrf_exempt


def _ensure_db_tables():
    """Ensure PostgreSQL tables exist natively without migrations."""
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS buyers (
                BUYER_NAME VARCHAR(255) PRIMARY KEY,
                STATE VARCHAR(50),
                COUNTRY VARCHAR(50),
                LAST_TRANSACTION VARCHAR(50)
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tippers (
                BUYER_NAME VARCHAR(255) PRIMARY KEY
            );
        """)


@require_http_methods(["GET"])
def get_customers(request):
    _ensure_db_tables()
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT buyer_name, state, country, last_transaction FROM buyers;"
        )
        buyers = [
            {
                "BUYER_NAME": row[0],
                "STATE": row[1],
                "COUNTRY": row[2],
                "LAST_TRANSACTION": row[3],
            }
            for row in cursor.fetchall()
        ]

        cursor.execute("SELECT buyer_name FROM tippers;")
        tippers = [{"BUYER_NAME": row[0]} for row in cursor.fetchall()]

    return JsonResponse({"buyers": buyers, "tippers": tippers})


@csrf_exempt
@require_http_methods(["POST"])
def upload_customers(request):
    try:
        _ensure_db_tables()
        payload = json.loads(request.body)
        incoming_buyers = payload.get("buyers", [])
        incoming_tippers = payload.get("tippers", [])

        with connection.cursor() as cursor:
            for b in incoming_buyers:
                name = b.get("BUYER_NAME")
                if not name:
                    continue
                cursor.execute(
                    """
                    INSERT INTO buyers (buyer_name, state, country, last_transaction)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (buyer_name) DO UPDATE 
                    SET state = EXCLUDED.state,
                        country = EXCLUDED.country,
                        last_transaction = EXCLUDED.last_transaction;
                """,
                    [name, b.get("STATE"), b.get("COUNTRY"), b.get("LAST_TRANSACTION")],
                )

            for t in incoming_tippers:
                name = t.get("BUYER_NAME")
                if not name:
                    continue
                cursor.execute(
                    """
                    INSERT INTO tippers (buyer_name)
                    VALUES (%s)
                    ON CONFLICT (buyer_name) DO NOTHING;
                """,
                    [name],
                )

        return JsonResponse({
            "status": "success",
            "message": "Data saved directly to PostgreSQL!",
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def clear_customers(request):
    _ensure_db_tables()
    with connection.cursor() as cursor:
        cursor.execute("DELETE FROM buyers;")
        cursor.execute("DELETE FROM tippers;")
    return JsonResponse({
        "status": "success",
        "message": "PostgreSQL database cleared.",
    })


class Avisia(View):
    template_name = "avisia/avisia.html"

    @method_decorator(xframe_options_sameorigin)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def get(self, request, *args, **kwargs):
        return render(request, self.template_name, context={})

    def post(self, request, *args, **kwargs):
        try:
            _ensure_db_tables()
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT buyer_name, state, country, last_transaction FROM buyers;"
                )
                buyers_list = [
                    {
                        "BUYER_NAME": row[0],
                        "STATE": row[1],
                        "COUNTRY": row[2],
                        "LAST_TRANSACTION": row[3],
                    }
                    for row in cursor.fetchall()
                ]
                cursor.execute("SELECT buyer_name FROM tippers;")
                tippers_list = [{"BUYER_NAME": row[0]} for row in cursor.fetchall()]

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
                        writer, sheet_name="Buyers (Orders & Giveaways)", index=False
                    )
                else:
                    pd.DataFrame(columns=["Buyer Username"]).to_excel(
                        writer, sheet_name="Buyers (Orders & Giveaways)", index=False
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
