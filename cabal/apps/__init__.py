# /opt/inventree/plugins/Cabal/cabal/apps/__init__.py

from .avisia.avisia import Avisia, clear_customers, get_customers, upload_customers
from .cerebro import Cerebro
from .dewey import Dewey
from .forge import Forge
from .nexus import AttachPartImage, Nexus
from .quantify import Quantify
from .spectacle import Spectacle
from .syncroth.pdf import WeeklyReportPDFView
from .syncroth.syncroth import Syncroth
from .vanguard.vanguard import LookupPacksApiView, LookupSinceApiView, Vanguard

__all__ = [
    "Avisia",
    "get_customers",
    "upload_customers",
    "clear_customers",
    "Dewey",
    "Cerebro",
    "Forge",
    "Nexus",
    "AttachPartImage",
    "Quantify",
    "Spectacle",
    "Syncroth",
    "WeeklyReportPDFView",
    "LookupPacksApiView",
    "LookupSinceApiView",
    "Vanguard",
]
