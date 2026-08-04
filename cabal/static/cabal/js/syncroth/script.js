// /plugins/Cabal/cabal/static/cabal/js/syncroth/script.js

function copyIPSListToClipboard() {
    const textarea = document.getElementById("partsList");
    if (!textarea) return;
    textarea.select();
    textarea.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(textarea.value.trim()).then(() => {
        document.getElementById("copyStatus").innerText = "Copied!";
        setTimeout(() => document.getElementById("copyStatus").innerText = "", 3000);
    }).catch(() => {
        document.getElementById("copyStatus").innerText = "Copy failed";
    });
}

function copyCSVToClipboard() {
    const csv = document.getElementById("csvData")?.value.trim();
    if (!csv) {
        document.getElementById("csvCopyStatus").innerText = "No CSV data";
        setTimeout(() => document.getElementById("csvCopyStatus").innerText = "", 3000);
        return;
    }
    navigator.clipboard.writeText(csv).then(() => {
        document.getElementById("csvCopyStatus").innerText = "CSV copied!";
        setTimeout(() => document.getElementById("csvCopyStatus").innerText = "", 3000);
    }).catch(() => {
        document.getElementById("csvCopyStatus").innerText = "Copy failed";
    });
}

let updateTimeout;

function getCSRFToken() {
    const tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    if (tokenInput) return tokenInput.value;
    const cookieMatch = document.cookie.match(/csrftoken=([\w-]+)/);
    return cookieMatch ? cookieMatch[1] : "";
}

// Dynamic PDF Download URL Sync Function
function updatePDFButtonLink() {
    const pdfBtn = document.getElementById("download-pdf-btn");
    if (!pdfBtn) return;

    const partsTextarea = document.getElementById("partsList");
    const ipn_list = partsTextarea ? partsTextarea.value.trim() : "";
    
    const inStockDate = document.getElementById("in_stock_date")?.value || "";
    const location = document.querySelector('input[name="location"][type="hidden"]')?.value || 
                     document.getElementById("location")?.value || "";
    const data_point = document.querySelector('input[name="data_point"][type="hidden"]')?.value || 
                       document.getElementById("data_point")?.value || "";

    // Build URL using base Django href
    const pdfUrl = new URL("{% url 'plugin:cabal:weekly_report_pdf' %}", window.location.origin);
    
    if (ipn_list) pdfUrl.searchParams.set("ipn_list", ipn_list);
    if (location) pdfUrl.searchParams.set("location", location);
    if (data_point) pdfUrl.searchParams.set("data_point", data_point);
    if (inStockDate) pdfUrl.searchParams.set("in_stock_date", inStockDate);

    pdfBtn.href = pdfUrl.toString();
}

async function updateCSV() {
    // Sync PDF download button parameters simultaneously
    updatePDFButtonLink();

    const partsTextarea = document.getElementById("partsList");
    if (!partsTextarea) return;

    const ipn_list = partsTextarea.value.trim();
    if (!ipn_list) {
        if (document.getElementById("csvData")) document.getElementById("csvData").value = "";
        const preview = document.getElementById("csvPreview");
        if (preview) preview.innerText = "No IPNs entered yet.";
        return;
    }

    const parser = document.getElementById("export_type")?.value || "whatnot";

    let ebay_listing_type = "FixedPriceItem";
    const ebaySelect = document.getElementById("ebay_listing_type");
    if (ebaySelect && ebaySelect.offsetParent !== null) {
        ebay_listing_type = ebaySelect.value;
    }

    let whatnot_listing_type = "Auction";
    const whatnotSelect = document.getElementById("whatnot_listing_type");
    if (whatnotSelect && whatnotSelect.offsetParent !== null) {
        whatnot_listing_type = whatnotSelect.value;
    }

    const inStockDate = document.getElementById("in_stock_date")?.value || "";
    let whatnot_custom_suffix = document.getElementById("whatnot_release_date")?.value || "";
    const csrfToken = getCSRFToken();

    let location = document.querySelector('input[name="location"][type="hidden"]')?.value || 
                   document.getElementById("location")?.value || "";
    let data_point = document.querySelector('input[name="data_point"][type="hidden"]')?.value || 
                     document.getElementById("data_point")?.value || "";

    const formData = new FormData();
    formData.append("csrfmiddlewaretoken", csrfToken);
    formData.append("ipn_list", ipn_list);
    formData.append("parser", parser);
    formData.append("ebay_listing_type", ebay_listing_type);
    formData.append("whatnot_listing_type", whatnot_listing_type);
    formData.append("whatnot_custom_suffix", whatnot_custom_suffix);

    if (inStockDate) formData.append("in_stock_date", inStockDate);
    if (location) formData.append("location", location);
    if (data_point) formData.append("data_point", data_point);

    try {
        const response = await fetch(window.location.href, {
            method: "POST",
            body: formData,
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.csv_text !== undefined) {
                if (document.getElementById("csvData")) document.getElementById("csvData").value = data.csv_text;
                const preview = document.getElementById("csvPreview");
                if (preview) preview.innerText = data.csv_text || "CSV generated (empty content)";
                
                const status = document.getElementById("csvCopyStatus");
                if (status) {
                    status.innerText = "CSV updated!";
                    setTimeout(() => status.innerText = "", 3000);
                }
            }
        } else {
            console.error("Server error", response.status);
        }
    } catch (err) {
        console.error("Fetch error", err);
    }
}

function triggerDebouncedUpdate() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(updateCSV, 400);
}

function formatDateToHumanReadable(dateString) {
    if (!dateString) return "";
    const parts = dateString.split("-");
    if (parts.length !== 3) return dateString;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const dateObj = new Date(year, month, day);
    return dateObj.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

function syncReleaseDateInput() {
    const inStockDateInput = document.getElementById("in_stock_date");
    const releaseDateInput = document.getElementById("whatnot_release_date");
    const hiddenSuffix = document.getElementById('hidden_whatnot_custom_suffix');

    if (inStockDateInput && releaseDateInput) {
        if (inStockDateInput.value) {
            const formattedDate = formatDateToHumanReadable(inStockDateInput.value);
            releaseDateInput.value = ` [In Stock: ${formattedDate}]`;
            if (hiddenSuffix) hiddenSuffix.value = releaseDateInput.value;
        } else {
            releaseDateInput.value = "";
            if (hiddenSuffix) hiddenSuffix.value = "";
        }
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const inStockDateInput = document.getElementById("in_stock_date");
    const releaseDateInput = document.getElementById("whatnot_release_date");
    const locationSelect = document.getElementById("location");
    const dataPointSelect = document.getElementById("data_point");
    const partsList = document.getElementById("partsList");

    // 1. Initial Sync on render
    if (inStockDateInput && releaseDateInput && !releaseDateInput.value) {
        syncReleaseDateInput();
    }

    // 2. Top-level Search Selectors (Location & Data Point)
    if (locationSelect) {
        locationSelect.addEventListener("change", triggerDebouncedUpdate);
    }

    if (dataPointSelect) {
        dataPointSelect.addEventListener("change", triggerDebouncedUpdate);
    }

    // 3. Date Selectors
    if (inStockDateInput) {
        inStockDateInput.addEventListener("change", function () {
            syncReleaseDateInput();
            triggerDebouncedUpdate();
        });
    }

    if (releaseDateInput) {
        releaseDateInput.addEventListener('input', function() {
            const hiddenSuffix = document.getElementById('hidden_whatnot_custom_suffix');
            if (hiddenSuffix) hiddenSuffix.value = this.value;
            triggerDebouncedUpdate();
        });
    }

    // 4. IPN Stream Textarea Input & Paste Events
    if (partsList) {
        partsList.addEventListener("input", function() {
            triggerDebouncedUpdate();
            const hiddenIpn = document.querySelector('input[name="ipn_list"][type="hidden"]');
            if (hiddenIpn) {
                const ipnArray = this.value.trim().split(/[\n\r,;\t\s]+/).filter(s => s.trim());
                hiddenIpn.value = ipnArray.join(',');
            }
        });

        partsList.addEventListener("paste", function() {
            setTimeout(triggerDebouncedUpdate, 50);
        });
    }

    // 5. Parser Selectors
    document.getElementById("export_type")?.addEventListener("change", function() {
        const val = this.value;
        const ebayOptions = document.getElementById("ebay_options");
        if (ebayOptions) ebayOptions.style.display = (val === "ebay") ? "block" : "none";

        const whatnotOptions = document.getElementById("whatnot_options");
        if (whatnotOptions) whatnotOptions.style.display = (val === "whatnot") ? "block" : "none";

        const dlParser = document.getElementById("download_parser");
        if (dlParser) dlParser.value = val;

        triggerDebouncedUpdate();
    });

    document.getElementById("ebay_listing_type")?.addEventListener("change", function() {
        const hiddenEbay = document.getElementById("hidden_ebay_listing_type");
        if (hiddenEbay) hiddenEbay.value = this.value;
        triggerDebouncedUpdate();
    });

    document.getElementById("whatnot_listing_type")?.addEventListener("change", function() {
        const hiddenWhatnot = document.getElementById("hidden_whatnot_listing_type");
        if (hiddenWhatnot) hiddenWhatnot.value = this.value;
        triggerDebouncedUpdate();
    });

    // 6. Section Toggles
    document.getElementById("show-move-section-btn")?.addEventListener("click", () => {
        const moveSection = document.getElementById("move-stock-section");
        if (moveSection) {
            moveSection.style.display = (moveSection.style.display === "none" || !moveSection.style.display) ? "block" : "none";
        }
    });

    document.getElementById("export-csv-button")?.addEventListener("click", function() {
        const csvSection = document.getElementById("csv-exporter");
        if (!csvSection) return;
        const isHidden = csvSection.style.display === "none" || !csvSection.style.display;
        csvSection.style.display = isHidden ? "block" : "none";
        this.classList.toggle("btn-active", isHidden);
    });

    // 7. Initial Trigger
    updateCSV();
});
