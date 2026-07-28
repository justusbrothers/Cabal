# syncroth/urls.py
from django.urls import path

from .pdf import WeeklyReportPDFView
from .views import DataTool, IndexView, MoveStockItems

app_name = "syncroth"

urlpatterns = [
    # Dashboard / Home
    path("", IndexView.as_view(), name="index"),
    # CSV & Data Processing Tool
    path("data-tool/", DataTool.as_view(), name="data-tool"),
    # API Endpoint for Stock Movement
    path("api/move-stock/", MoveStockItems.as_view(), name="move-stock"),
    # PDF Generation View
    path(
        "weekly-report-pdf/",
        WeeklyReportPDFView.as_view(),
        name="weekly_report_pdf",
    ),
]
