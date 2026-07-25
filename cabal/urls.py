############ cabal/urls.py ############

from django.urls import path
from cabal.vanguard.views import LookupPacksApiView, VanguardView

app_name = "cabal"

urlpatterns = [
    path("vanguard/", VanguardView.as_view(), name="vanguard"),
    path(
        "vanguard/api/lookup-packs/",
        LookupPacksApiView.as_view(),
        name="lookup_packs_api",
    ),
]
