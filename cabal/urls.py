############ cabal/urls.py ############

from django.urls import path
from .views import IndexView
from .vanguard import CabalView

app_name = "cabal"

urlpatterns = [
    path("", IndexView.as_view(), name="index"),
    path("vanguard/", CabalView.as_view(), name="vanguard"),
]
