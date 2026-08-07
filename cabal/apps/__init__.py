# /opt/inventree/plugins/Cabal/cabal/apps/__init__.py

from .avisia.avisia import (
    Avisia as Avisia,
    get_customers as get_customers,
    upload_customers as upload_customers,
    clear_customers as clear_customers,
)
from .cerebro import Cerebro as Cerebro
from .nexus import Nexus as Nexus
from .spectacle import Spectacle as Spectacle
from .syncroth.syncroth import Syncroth as Syncroth
from .syncroth.pdf import WeeklyReportPDFView as WeeklyReportPDFView
from .vanguard.vanguard import (
    LookupPacksApiView as LookupPacksApiView,
    Vanguard as Vanguard,
)
