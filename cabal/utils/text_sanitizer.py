# cabal/utils/text_sanitizer.py

import re
import unicodedata


def fix_word_case(match):
    w = match.group(0)

    # Keep short acronyms intact (e.g., "IPN", "UPC", "DC")
    if w.isupper() and len(w) <= 3:
        return w
    return w[0].upper() + w[1:].lower()


def clean_text(text: str, ascii_only: bool = False) -> str:
    """Global helper to repair encoding glitches, replace corrupted symbols,

    fix mid-word casing (e.g. 'JiméNez' -> 'Jiménez'), and normalize titles
    and descriptions across all Cabal tools.
    """
    if not text or not isinstance(text, str):
        return text if text is not None else ""

    # 1. Repair double-encoded UTF-8 / Latin-1 byte corruption (Mojibake)
    try:
        text = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    # 2. Fix specific corrupted strings
    known_replacements = {
        "šEji■": "Sejic",
    }
    for bad_str, good_str in known_replacements.items():
        text = text.replace(bad_str, good_str)

    # 3. Unicode Normalization (NFC joins base characters + accents)
    text = unicodedata.normalize("NFC", text)

    # 4. Fix mid-word casing corruption (e.g. "JiméNez" -> "Jiménez")
    text = re.sub(r"\b[a-zA-Z\u00C0-\u024F]+\b", fix_word_case, text)

    # 5. Optional: Convert accents to ASCII for font compatibility
    if ascii_only:
        text = (
            unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode("utf-8")
        )

    # 6. Clean up redundant whitespace
    return re.sub(r"\s+", " ", text).strip()


def normalize_title_trailing_the(title: str) -> str:
    """Ensures 'The' is moved from the front of the series name to right before issue numbers
    or cover/variant descriptions.

    Examples:
        'The Walking Dead #1 - Cover B' -> 'Walking Dead, The #1 - Cover B'
        'The Batman #50'                -> 'Batman, The #50'
        'The Avengers'                  -> 'Avengers, The'
    """
    if not title:
        return ""

    # 1. Match 'The <Series Name>' followed by '#', 'Vol.', '-', or end of string
    # Captures: Group 1 = Series Name, Group 2 = Rest of title starting with separator
    title_pattern = re.compile(
        r"^The\s+(.+?)(\s*(?:#|Vol\.|-|\bCover\b).*|$)", re.IGNORECASE
    )

    if title_pattern.search(title):
        title = title_pattern.sub(r"\1, The\2", title)

    # 2. Clean up any double spaces or awkward spacing around commas
    title = re.sub(r"\s*,\s*", ", ", title)
    title = re.sub(r"\s+", " ", title)

    return title.strip()
