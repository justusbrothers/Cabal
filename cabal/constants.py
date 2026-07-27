# constants.py in comic_scanner plugin

# -----------------------------------------------------------------
# 1. THE SINGLE SOURCE OF TRUTH REGISTRY
# -----------------------------------------------------------------
# Add, edit, or remove publishers entirely inside this list.
PUBLISHER_REGISTRY = [
    {
        "name": "Abstract Studio",
        "code": "ABS",
        "prefixes": ["89317"],
        "catId": 22,
        "catLabel": "Abstract Studio",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Action Lab Comics",
        "code": "ALC",
        "prefixes": ["78430"],
        "catId": 22,
        "catLabel": "Action Lab Comics",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Archie Comics",
        "code": "ARCH",
        "prefixes": [],
        "catId": 22,
        "catLabel": "Archie Comics (ARCH)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Bad Idea Comics",
        "code": "BAD",
        "prefixes": ["85001"],
        "catId": 22,
        "catLabel": "Indie (IND)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Boom! Studios",
        "code": "BOOM",
        "prefixes": ["84428"],
        "catId": 22,
        "catLabel": "Boom! Studios (BOOM)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Dark Horse Comics",
        "code": "DHC",
        "prefixes": ["761568"],
        "catId": 2,
        "catLabel": "Dark Horse Comics (DHC)",
        "locId": 73,
        "locLabel": "Dark Horse Bin (73)",
    },
    {
        "name": "DC Comics",
        "code": "DC",
        "prefixes": ["070989", "761941"],
        "catId": 3,
        "catLabel": "DC Comics (DC)",
        "locId": 91,
        "locLabel": "DC Bin (91)",
    },
    {
        "name": "Devil's Due Comics",
        "code": "DD",
        "prefixes": ["68267"],
        "catId": 22,
        "catLabel": "Indie (IND)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "DSTLRY",
        "code": "DST",
        "prefixes": ["614"],
        "catId": 22,
        "catLabel": "Indie (IND)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Dynamite Comics",
        "code": "DYN",
        "prefixes": ["72513"],
        "catId": 105,
        "catLabel": "Dynamite Entertainment (DYN)",
        "locId": 94,
        "locLabel": "Dynamite Bin (94)",
    },
    {
        "name": "IDW Publishing",
        "code": "IDW",
        "prefixes": ["827"],
        "catId": 24,
        "catLabel": "IDW Publishing (IDW)",
        "locId": 76,
        "locLabel": "IDW Bin (76)",
    },
    {
        "name": "Image Comics",
        "code": "IMG",
        "prefixes": ["704", "709", "70985"],
        "catId": 4,
        "catLabel": "Image Comics (IMG)",
        "locId": 70,
        "locLabel": "Image Bin (70)",
    },
    {
        "name": "Indie Comics",
        "code": "IND",
        "prefixes": [],
        "catId": 22,
        "catLabel": "Indie (IND)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Iron Age Comics",
        "code": "IAC",
        "prefixes": ["60554"],
        "catId": 22,
        "catLabel": "Iron Age Comics",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Keenspot",
        "code": "KS",
        "prefixes": ["60283"],
        "catId": 110,
        "catLabel": "Keenspot (KS)",
        "locId": 100,
        "locLabel": "Keenspot Bin (100)",
    },
    {
        "name": "Mad Cave Comics",
        "code": "MAD",
        "prefixes": ["60196"],
        "catId": 108,
        "catLabel": "Mad Cave Comics (MAD)",
        "locId": 98,
        "locLabel": "Mad Cave Bin (98)",
    },
    {
        "name": "Marvel Comics",
        "code": "MAR",
        "prefixes": ["071486", "59606", "759606"],
        "catId": 5,
        "catLabel": "Marvel Comics (MAR)",
        "locId": 66,
        "locLabel": "Marvel Bin (66)",
    },
    {
        "name": "Midnight Factory",
        "code": "MID",
        "prefixes": ["78200"],
        "catId": 22,
        "catLabel": "Midnight Factory",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Oni Press",
        "code": "ONI",
        "prefixes": ["64985"],
        "catId": 107,
        "catLabel": "Oni Press (ONI)",
        "locId": 97,
        "locLabel": "Oni Press Bin (97)",
    },
    {
        "name": "Titan Comics",
        "code": "TIT",
        "prefixes": ["65946"],
        "catId": 22,
        "catLabel": "Titan Comics (TIT)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Udon",
        "code": "UDON",
        "prefixes": ["855"],
        "catId": 22,
        "catLabel": "Udon (UDON)",
        "locId": 82,
        "locLabel": "Indie / Studio Boxes (82)",
    },
    {
        "name": "Valiant Entertainment",
        "code": "VAL",
        "prefixes": [],
        "catId": 23,
        "catLabel": "Valiant Entertainment (VAL)",
        "locId": 80,
        "locLabel": "Valiant Bin (80)",
    },
    {
        "name": "Vault Comics",
        "code": "VAU",
        "prefixes": ["85005"],
        "catId": 109,
        "catLabel": "Vault Comics (VAU)",
        "locId": 99,
        "locLabel": "Vault Bin (99)",
    },
    {
        "name": "Vertigo Comics",
        "code": "VER",
        "prefixes": [],
        "catId": 26,
        "catLabel": "Vertigo Comics (VER)",
        "locId": 84,
        "locLabel": "Vertigo Storage (84)",
    },
    # {"name": "New Publisher", "code": "NEW", "prefixes": ["123"], "catId": 22, "catLabel": "Indie (IND)", "locId": 82, "locLabel": "Indie / Studio Boxes (82)"},
]

# -----------------------------------------------------------------
# 2. RUNTIME COMPILATION ENGINE
# -----------------------------------------------------------------
# These initialize empty containers and automatically populate them on load.
PUBLISHER_CODES = {}
PUBLISHER_UPC_PREFIXES = {}
PUBLISHER_PART_CATEGORIES = {}

CATEGORIES_LIST = []
LOCATIONS_LIST = []

# Tracker sets to ensure we don't push duplicate dictionaries into our dropdown list selections
seen_categories = set()
seen_locations = set()

for pub in PUBLISHER_REGISTRY:
    # 1. Map string name directly to standard 3-4 letter short-code
    PUBLISHER_CODES[pub["name"]] = pub["code"]

    # 2. Map code directly to InvenTree Category Database PK ID
    PUBLISHER_PART_CATEGORIES[pub["code"]] = pub["catId"]

    # 3. Flatten out the list of prefix strings to map right back to the code string
    for prefix in pub.get("prefixes", []):
        PUBLISHER_UPC_PREFIXES[prefix] = pub["code"]

    # 4. Compile dynamic dictionary elements for dropdown menus without duplication
    if pub["catId"] not in seen_categories:
        seen_categories.add(pub["catId"])
        CATEGORIES_LIST.append({"id": pub["catId"], "name": pub["catLabel"]})

    if pub["locId"] not in seen_locations:
        seen_locations.add(pub["locId"])
        LOCATIONS_LIST.append({"id": pub["locId"], "name": pub["locLabel"]})

# Sort both dynamic dropdown layouts cleanly by their label names
CATEGORIES_LIST.sort(key=lambda x: x["name"])
LOCATIONS_LIST.sort(key=lambda x: x["name"])
