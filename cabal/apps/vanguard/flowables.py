# cabal/apps/vanguard/flowables.py

from reportlab.lib import colors
from reportlab.platypus import Flowable


class PrintableCheckbox(Flowable):
    """Draws a native checkbox square centered within its allocated space."""

    def __init__(self, size=12, border_color="#BDC3C7"):
        super().__init__()
        self.size = size
        self.border_color = colors.HexColor(border_color)

    def wrap(self, availWidth, availHeight):
        self.width = self.size
        self.height = self.size
        return self.size, self.size

    def draw(self):
        self.canv.saveState()
        self.canv.setStrokeColor(self.border_color)
        self.canv.setLineWidth(1)
        self.canv.rect(0, 0, self.size, self.size)
        self.canv.restoreState()
