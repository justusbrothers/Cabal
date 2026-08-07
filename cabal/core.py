# /plugins/Cabal/cabal/core.py

from plugin import InvenTreePlugin
from plugin.mixins import UrlsMixin

from .urls import urlpatterns
from . import PLUGIN_VERSION


class Cabal(UrlsMixin, InvenTreePlugin):
    TITLE = "Cabal"
    NAME = "cabal"
    SLUG = "cabal"
    DESCRIPTION = "JustUs Brothers comic management tools"
    VERSION = PLUGIN_VERSION
    AUTHOR = "JustUs Brothers"
    WEBSITE = "https://justusbrothers.shop"
    LICENSE = "MIT"

    django_app_config = "cabal.apps.apps.CabalConfig"

    def setup_urls(self):
        return urlpatterns
