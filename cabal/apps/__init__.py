# /opt/inventree/plugins/Cabal/cabal/apps/__init__.py

from .avisia import Avisia, clear_customers, get_customers, upload_customers
from .cerebro import Cerebro
from .dewey import Dewey
from .forge import Forge
from .nexus import AttachPartImage, Nexus
from .quantify import Quantify
from .spectacle import Spectacle
from .syncroth import Syncroth, WeeklyReportPDFView
from .vanguard import LookupPacksApiView, LookupSinceApiView, Vanguard

__all__ = [
    "AttachPartImage",
    "Avisia",
    "Cerebro",
    "clear_customers",
    "Dewey",
    "Forge",
    "get_customers",
    "LookupPacksApiView",
    "LookupSinceApiView",
    "Nexus",
    "Quantify",
    "Spectacle",
    "Syncroth",
    "upload_customers",
    "Vanguard",
    "WeeklyReportPDFView",
]
