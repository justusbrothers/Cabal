# /plugins/Cabal/cabal/apps/vanguard/styles.py


from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

styles = getSampleStyleSheet()

h1_style = ParagraphStyle(
    "CustomH1",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=17,
    leading=21,
    textColor=colors.HexColor("#2C3E50"),
    spaceBefore=14,
    spaceAfter=8,
)

h2_style = ParagraphStyle(
    "CustomH2",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=17,
    textColor=colors.HexColor("#2C3E50"),
    spaceBefore=14,
    spaceAfter=8,
)

h3_style = ParagraphStyle(
    "CustomH3",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=15,
    textColor=colors.HexColor("#2C3E50"),
    spaceBefore=14,
    spaceAfter=8,
)

sub_hdr_style = ParagraphStyle(
    "SubHeader",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=10,
    leading=13,
    textColor=colors.HexColor("#34495E"),
    spaceBefore=6,
    spaceAfter=4,
)

body_style = ParagraphStyle(
    "ReportBody",
    parent=styles["Normal"],
    fontSize=9,
    leading=12,
    textColor=colors.HexColor("#333333"),
)
