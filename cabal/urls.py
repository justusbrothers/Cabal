############ cabal/urls.py ############

from django.urls import path

from cabal.vanguard.views import LookupPacksApiView, Vanguard
from .lunarparser import LunarParser
from .spectacle import Spectacle


app_name = "cabal"

urlpatterns = [
    path("lunarparser/", LunarParser.as_view(), name="lunarparser"),
    path("spectacle/", Spectacle.as_view(), name="spectacle"),
    path("vanguard/", Vanguard.as_view(), name="vanguard"),
    path(
        "vanguard/api/lookup-packs/",
        LookupPacksApiView.as_view(),
        name="lookup_packs_api",
    ),
]
