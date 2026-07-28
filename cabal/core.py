# cabal/core.py

#### Just Us Brothers comic management tools

from plugin import InvenTreePlugin
from plugin.mixins import UrlsMixin

from .urls import urlpatterns

from . import PLUGIN_VERSION


class Cabal(UrlsMixin, InvenTreePlugin):
    """Cabal - custom InvenTree plugin."""

    # Plugin metadata
    TITLE = "Cabal"
    NAME = "Cabal"
    SLUG = "cabal"
    DESCRIPTION = "Just Us Brothers comic management tools"
    VERSION = PLUGIN_VERSION

    # Additional project information
    AUTHOR = "Just Us Brothers"
    WEBSITE = "https://justusbrothers.shop"
    LICENSE = "MIT"

    def setup_urls(self):
        return urlpatterns
