# cabal/urls.py

from django.urls import path

from .views import (
    CustomerExporterView,
    CustomerOrders,
    DataToolView,
    LookupPacksApiView,
    NexusView,
    Spectacle,
    Vanguard,
    WeeklyReportPDFView,
)
from django.views.generic import TemplateView

app_name = "cabal"

urlpatterns = [
    path("", TemplateView.as_view(template_name="cabal/index.html"), name="portal"),
    path("customerexporter/", CustomerExporterView.as_view(), name="customerexporter"),
    path("customerorders/", CustomerOrders, name="customerorders"),
    path("nexus/", NexusView.as_view(), name="nexus"),
    path("spectacle/", Spectacle.as_view(), name="spectacle"),
    path("syncroth/", DataToolView.as_view(), name="datatool"),
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
