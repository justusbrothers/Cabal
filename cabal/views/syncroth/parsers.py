# syncroth/parsers.py
import csv
import io
import re
import unicodedata

from datetime import datetime


def clean_syncroth_text(text: str) -> str:
    """Fixes Mojibake character encoding issues and standardizes unicode/casing

    for creator names, titles, and descriptions.
    """
    if not text or not isinstance(text, str):
        return text if text is not None else ""

    # Step 1: Repair double-encoded UTF-8 / Latin-1 byte corruption (Mojibake)
    try:
        text = text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass

    # Step 2: Normalize Unicode canonical composition (NFC form)
    text = unicodedata.normalize("NFC", text)

    # Step 3: Fix mid-word casing corruption (e.g. "JiméNez" -> "Jiménez")
    # Only applies to words with mixed casing inside words
    def fix_word_case(match):
        w = match.group(0)
        # If the word is entirely uppercase (e.g. "IPN", "UPC", "DC"), keep it upper
        if w.isupper() and len(w) <= 3:
            return w
        return w[0].upper() + w[1:].lower()

    # Replaces words that have irregular capitalization while preserving spaces & punctuation
    text = re.sub(r"\b[a-zA-Z\u00C0-\u024F]+\b", fix_word_case, text)

    return text.strip()


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

    # First clean character encodings and casing
    title = clean_syncroth_text(title)

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


def build_descriptiononly_data_file(items, request=None):
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(["pk", "IPN", "Name", "Description"])
    for item in items:
        part = item.part if hasattr(item, "part") else item
        writer.writerow([
            part.pk,
            part.IPN,
            clean_syncroth_text(part.name),
            clean_syncroth_text(part.description),
        ])
    return output.getvalue()


def build_inventree_data_file(items, request=None):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "pk",
        "IPN",
        "Active",
        "Category",
        "Category Name",
        "Default Location",
        "Description",
        "Image",
        "Is Template",
        "Link",
        "Name",
        "ID",
        "Variant Of",
    ])
    for item in items:
        part = item.part if hasattr(item, "part") else item
        writer.writerow([
            part.pk,
            part.IPN,
            part.active,
            part.category.pk if part.category else "",
            clean_syncroth_text(part.category.name if part.category else ""),
            part.default_location.pk if part.default_location else "",
            clean_syncroth_text(part.description),
            part.image,
            part.is_template,
            part.link,
            clean_syncroth_text(part.name),
            part.pk,
            part.variant_of.pk if part.variant_of else "",
        ])
    return output.getvalue()


def build_whatnot_data_file(
    items,
    request=None,
    data_tool_instance=None,
    whatnot_listing_type="Auction",
):
    custom_suffix = ""
    if request:
        custom_suffix = (
            request.POST.get("whatnot_custom_suffix", "").strip()
            or request.GET.get("whatnot_custom_suffix", "").strip()
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Category",
        "Sub Category",
        "Title",
        "Description",
        "Quantity",
        "Type",
        "Price",
        "Shipping Profile",
        "Offerable",
        "Hazmat",
        "Condition",
        "Cost Per Item",
        "SKU",
        "Image URL 1",
        "Image URL 2",
        "Image URL 3",
        "Image URL 4",
        "Image URL 5",
        "Image URL 6",
        "Image URL 7",
        "Image URL 8",
    ])

    def format_date_str(date_str):
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            formatted = dt.strftime("%B %d, %Y")
            return re.sub(r"\b0(\d,)", r"\1", formatted)
        except (ValueError, TypeError):
            return date_str

    def clean_description_text(text):
        if not text:
            return ""

        text = clean_syncroth_text(text)

        def date_tag_replacer(match):
            iso_date = match.group(1)
            formatted_date = format_date_str(iso_date)
            return f"[In Stock: {formatted_date}]"

        text = re.sub(
            r"\[In Stock:\s*(\d{4}-\d{2}-\d{2})\]",
            date_tag_replacer,
            text,
            flags=re.IGNORECASE,
        )

        def replacer(match):
            segment = match.group(0)
            if segment.isupper():
                return segment.lower().capitalize()
            return segment

        cleaned = re.sub(r"\b[A-Z]{2,}(?:\s+[A-Z0-9\W_]+)*\b", replacer, text)
        cleaned = re.sub(r"…\s+([a-z])", lambda m: f"… {m.group(1).upper()}", cleaned)
        return cleaned.strip()

    if custom_suffix:
        custom_suffix = re.sub(
            r"\[In Stock:\s*(\d{4}-\d{2}-\d{2})\]",
            lambda m: f"[In Stock: {format_date_str(m.group(1))}]",
            custom_suffix,
            flags=re.IGNORECASE,
        )

    pack_deductions = {}

    for item in items:
        part = getattr(item, "part", item)
        if hasattr(part, "_is_pack_inheritance") and hasattr(part, "_pack_components"):
            pack_multiplier = getattr(part, "_pack_qty", 1)
            upper_clean_ipn = part.IPN.upper()

            if re.search(r"[-]?\d+PACK", upper_clean_ipn):
                deduction_per_component = getattr(part, "_issues_per_pack", 1)
            else:
                deduction_per_component = 1

            for component in part._pack_components:
                total_books_used = pack_multiplier * deduction_per_component
                pack_deductions[component.IPN] = (
                    pack_deductions.get(component.IPN, 0) + total_books_used
                )

    for item in items:
        part = getattr(item, "part", item)
        qty = data_tool_instance.get_actual_quantity(item)

        if not hasattr(part, "_is_pack_inheritance") and part.IPN in pack_deductions:
            qty -= pack_deductions[part.IPN]

        if qty <= 0:
            continue

        cond = data_tool_instance.get_parameter_value(
            part, "Condition", default="Near Mint"
        )
        imgs = []

        is_pack = hasattr(part, "_is_pack_inheritance") and hasattr(
            part, "_pack_components"
        )

        inferred_book_count = 1
        if not is_pack:
            upper_ipn = part.IPN.upper()
            pack_match = re.search(r"PACK", upper_ipn)
            if pack_match:
                prefix_match = re.search(r"(\d+)PACK", upper_ipn)
                if prefix_match:
                    inferred_book_count = int(prefix_match.group(1))
                else:
                    after_pack = upper_ipn[pack_match.end() :].strip()
                    after_pack = re.sub(r"[xX\*]\d+$", "", after_pack).strip()
                    cover_letters = "".join([c for c in after_pack if c.isalpha()])

                    if cover_letters:
                        inferred_book_count = len(cover_letters)
                    else:
                        inferred_book_count = 1

        price = 0.0  # Safe price default

        if is_pack:
            price_names = (
                [
                    "WhatNot Auction Price",
                    "Whatnot Auction Price",
                    "WhatNot Buy Now Price",
                    "Whatnot Buy Now Price",
                ]
                if whatnot_listing_type == "Auction"
                else [
                    "WhatNot Buy Now Price",
                    "Whatnot Buy Now Price",
                    "WhatNot Auction Price",
                    "Whatnot Auction Price",
                ]
            )

            desc_parts = []
            book_count = getattr(part, "_issues_per_pack", len(part._pack_components))
            pack_type = getattr(part, "_pack_type", "Variant Pack")
            pack_qty = getattr(part, "_pack_qty", 1)

            # 1. First attempt: Sum prices from components
            for component in part._pack_components:
                comp_price = data_tool_instance.get_listing_price(
                    component, override_param_names=price_names
                )

                # Direct parameter fallback if get_listing_price returned None
                if comp_price is None and hasattr(component, "parameters"):
                    for param in component.parameters.all():
                        if param.template.name.lower() in [
                            p.lower() for p in price_names
                        ]:
                            try:
                                comp_price = float(param.data)
                                break
                            except (ValueError, TypeError):
                                pass

                if comp_price:
                    if book_count == 5 and len(part._pack_components) == 1:
                        price += float(comp_price) * 5
                    else:
                        price += float(comp_price)

                comp_imgs = data_tool_instance.get_part_images(component, max_images=8)
                if comp_imgs:
                    imgs.append(comp_imgs[0])

                last_char = component.IPN[-1].upper()
                cover_letter = last_char if last_char.isalpha() else "A"
                comp_name = getattr(component, "name", "") or ""

                cover_match = re.search(r"(Cover\s+[A-Z].*)", comp_name, re.IGNORECASE)
                if cover_match:
                    variant_detail = cover_match.group(1).strip()
                elif " - " in comp_name:
                    variant_detail = (
                        f"Cover {cover_letter} " + comp_name.split(" - ", 1)[1].strip()
                    )
                else:
                    variant_detail = f"Cover {cover_letter}"

                desc_parts.append(
                    f"{pack_qty}x {clean_syncroth_text(variant_detail)}".strip()
                )

            # 2. Second attempt: If components had no prices, check the Pack PART itself
            if price == 0.0:
                pack_price = data_tool_instance.get_listing_price(
                    part, override_param_names=price_names
                )
                if pack_price is not None:
                    price = float(pack_price)

            # 3. Third attempt: Direct parameter check on the Pack PART
            if price == 0.0 and hasattr(part, "parameters"):
                for param in part.parameters.all():
                    if param.template.name.lower() in [p.lower() for p in price_names]:
                        try:
                            price = float(param.data)
                            break
                        except (ValueError, TypeError):
                            pass

            # Check if this is explicitly a 5PACK (5 copies of the same book)
            upper_ipn = part.IPN.upper() if hasattr(part, "IPN") else ""
            is_explicit_5pack = (
                "5PACK" in upper_ipn or getattr(part, "_pack_type", "") == "5PACK"
            )

            if book_count == 5 and is_explicit_5pack:
                cover_display = getattr(part, "_pack_display_name", "5 Issues")
                title = f"WhatNot Host Booster Pack - 5 Issues - {clean_syncroth_text(cover_display)}"

                if len(part._pack_components) > 0:
                    first_comp = part._pack_components[0]
                    first_char = first_comp.IPN[-1].upper()
                    c_let = first_char if first_char.isalpha() else "A"
                    desc_parts = [f"{pack_qty * 5}x Cover {c_let}"]
            else:
                cover_display = getattr(
                    part, "_pack_display_name", f"{book_count} Covers"
                )
                raw_title = f"{part.name} - {pack_type} - {cover_display}"
                title = normalize_title_trailing_the(raw_title)

            desc = f"Pack includes: {'; '.join(desc_parts)};"
            true_book_count = book_count

            # Fallback: If pack components didn't have prices, check the pack parent part directly
            if price == 0.0:
                parent_price = data_tool_instance.get_listing_price(
                    part, override_param_names=price_names
                )
                if parent_price:
                    price = float(parent_price)

        else:
            title = normalize_title_trailing_the(part.name)
            price_names = (
                [
                    "WhatNot Auction Price",
                    "Whatnot Auction Price",
                    "WhatNot Buy Now Price",
                    "Whatnot Buy Now Price",
                ]
                if whatnot_listing_type == "Auction"
                else [
                    "WhatNot Buy Now Price",
                    "Whatnot Buy Now Price",
                    "WhatNot Auction Price",
                    "Whatnot Auction Price",
                ]
            )

            # 1. Try helper method
            raw_price = data_tool_instance.get_listing_price(
                part, override_param_names=price_names
            )

            # 2. Fallback: Direct parameter inspection if raw_price is None
            if raw_price is None and hasattr(part, "parameters"):
                for param in part.parameters.all():
                    if param.template.name.lower() in [p.lower() for p in price_names]:
                        try:
                            raw_price = float(param.data)
                            break
                        except (ValueError, TypeError):
                            pass

            price = float(raw_price) if raw_price is not None else 0.0

            desc = part.description
            imgs = data_tool_instance.get_part_images(part, max_images=8)
            true_book_count = inferred_book_count

        desc = clean_description_text(desc)

        if custom_suffix:
            desc = f"{desc} {custom_suffix}".strip()

        if not is_pack and inferred_book_count == 1:
            shipping_profile = data_tool_instance.get_parameter_value(
                part, "Whatnot_ShippingProfile", "Single Comic Book"
            )
        else:
            if true_book_count == 1:
                shipping_profile = "Single Comic Book"
            elif true_book_count == 2:
                shipping_profile = "Two Issue Bundle"
            elif true_book_count == 3:
                shipping_profile = "Three Issue Bundle"
            elif true_book_count == 4:
                shipping_profile = "Four Issue Bundle"
            elif true_book_count == 5:
                shipping_profile = "Five Issue Bundle"
            else:
                shipping_profile = "1-2 lbs"

        # Ratio override (e.g. 1:25 Variant)
        ratio_match = re.search(r"\b\d+:(\d+)\b", title)
        if ratio_match:
            try:
                price = float(ratio_match.group(1))
            except (ValueError, TypeError):
                pass

        while len(imgs) < 8:
            imgs.append("")
        imgs = imgs[:8]

        # FIXED: Safe price formatting (handles float/int properly)
        formatted_price = str(round(price)) if price > 0 else ""

        print(
            f"[DEBUG CSV] IPN: {part.IPN} | Type: {whatnot_listing_type} | Raw Price: {raw_price} | Final Price: {formatted_price}"
        )

        writer.writerow([
            data_tool_instance.get_parameter_value(
                part, "Whatnot_Category", "Comics & Manga"
            ),
            data_tool_instance.get_parameter_value(
                part, "Comic Book Age", "Modern Comics"
            ),
            title,
            desc,
            str(qty),
            whatnot_listing_type,
            formatted_price,
            shipping_profile,
            data_tool_instance.get_parameter_value(part, "Whatnot_Offerable", "Yes"),
            "Not Hazmat",
            cond,
            "",
            part._original_clean_ipn
            if hasattr(part, "_original_clean_ipn")
            else part.IPN,
            *imgs,
        ])
    return output.getvalue()
