############ cabal/urls.py ############

from django.urls import path
from cabal.spectacle.views import Spectacle
from cabal.vanguard.views import LookupPacksApiView, Vanguard

app_name = "cabal"

urlpatterns = [
    path("spectacle/", Spectacle.as_view(), name="spectacle"),
    path("vanguard/", Vanguard.as_view(), name="vanguard"),
    path(
        "vanguard/api/lookup-packs/",
        LookupPacksApiView.as_view(),
        name="lookup_packs_api",
    ),
]
