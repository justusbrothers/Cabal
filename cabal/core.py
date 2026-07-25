"""Just Us Brothers comic management tools"""

from plugin import InvenTreePlugin

from plugin.mixins import UrlsMixin

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

    # Optionally specify supported InvenTree versions
    # MIN_VERSION = '0.18.0'
    # MAX_VERSION = '2.0.0'

    # Custom URL endpoints (from UrlsMixin)
    # Ref: https://docs.inventree.org/en/latest/plugins/mixins/urls/
    def setup_urls(self):
        """Configure custom URL endpoints for this plugin."""
        from django.urls import path
        from .views import ExampleView

        return [
            # Provide path to a simple custom view - replace this with your own views
            path("example/", ExampleView.as_view(), name="example-view"),
        ]
