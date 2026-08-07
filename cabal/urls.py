# /plugins/Cabal/cabal/urls.py

from django.urls import path

from .apps import (
    Avisia,
    Cerebro,
    Syncroth,
    LookupPacksApiView,
    Nexus,
    Spectacle,
    Vanguard,
    WeeklyReportPDFView,
    clear_customers,
    get_customers,
    upload_customers,
)
from django.views.generic import TemplateView

app_name = "cabal"

urlpatterns = [
    path("", TemplateView.as_view(template_name="cabal/cabal.html"), name="portal"),
    path("api/avisia/customers/", get_customers, name="avisia-get-customers"),
    path(
        "api/avisia/customers/upload/", upload_customers, name="avisia-upload-customers"
    ),
    path("api/avisia/customers/clear/", clear_customers, name="avisia-clear-customers"),
    path("avisia/", Avisia.as_view(), name="avisia"),
    path("cerebro/", Cerebro, name="cerebro"),
    path("nexus/", Nexus.as_view(), name="nexus"),
    path("spectacle/", Spectacle.as_view(), name="spectacle"),
    path("syncroth/", Syncroth.as_view(), name="syncroth"),
    path("vanguard/", Vanguard.as_view(), name="vanguard"),
    path(
        "vanguard/api/lookup-packs/",
        LookupPacksApiView.as_view(),
        name="lookup_packs_api",
    ),
    path(
        "syncroth/weekly-report-pdf/",
        WeeklyReportPDFView.as_view(),
        name="weekly_report_pdf",
    ),
]
