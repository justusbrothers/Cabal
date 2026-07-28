# cabal/urls.py

from django.urls import path

from .views import (
    CustomerOrders,
    LookupPacksApiView,
    LunarParser,
    Spectacle,
    Vanguard,
)

app_name = "cabal"

urlpatterns = [
    path("customerorders/", CustomerOrders, name="customerorders"),
    path("lunarparser/", LunarParser.as_view(), name="lunarparser"),
    path("spectacle/", Spectacle.as_view(), name="spectacle"),
    path("vanguard/", Vanguard.as_view(), name="vanguard"),
    path(
        "vanguard/api/lookup-packs/",
        LookupPacksApiView.as_view(),
        name="lookup_packs_api",
    ),
]
