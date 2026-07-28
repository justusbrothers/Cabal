// js_modules/_comic_lookup.js
let scannerModal = null;
const modalBody = document.getElementById('modalScanBody');

/**
 * Global helper to extract Cover Variant letters from comic book barcodes.
 * Extends protection for both standard 17-digit layout formats and 5-digit extensions.
 */
function getVariantLetterFromUPC(upcString) {
    const cleaned = String(upcString || "").trim();
    if (cleaned.length < 5) return "";
    
    // Read the last 5 digits of the comic code string extension matrix
    const targetExtension = cleaned.length >= 17 ? cleaned.slice(-5) : cleaned;
    if (targetExtension.length < 5) return "";

    const variantDigit = targetExtension.charAt(3); 
    const printing = targetExtension.charAt(4);  
    
    let coverChar = "";
    switch(variantDigit) {
        case '1': coverChar = ""; break; 
        case '2': coverChar = "B"; break;
        case '3': coverChar = "C"; break;
        case '4': coverChar = "D"; break;
        case '5': coverChar = "E"; break;
        case '6': coverChar = "F"; break;
        case '7': coverChar = "G"; break;
        case '8': coverChar = "H"; break;
        case '9': coverChar = "I"; break;
        default: coverChar = "";
    }
    if (printing !== '1' && printing !== '0' && printing !== '') {
        coverChar += printing;
    }
    return coverChar;
}

function handleScanClick(e) {
    const targetGlobalIndex = parseInt(this.getAttribute('data-global-index'));
    const rowData = previewRows[targetGlobalIndex];
    if (!rowData || typeof upcColIndex === "undefined" || upcColIndex === -1) return;

    const extractedBarcode = String(rowData[upcColIndex] || "").trim();
    if (!extractedBarcode) { 
        alert("Target barcode column cell is empty."); 
        return; 
    }

    if (!scannerModal) {
        scannerModal = new bootstrap.Modal(document.getElementById('comicScannerModal'));
    }

    modalBody.innerHTML = `
        <div class="text-center my-4">
            <div class="spinner-border text-info" role="status"></div>
            <p class="mt-2 text-muted">Querying comic registry for: <strong>${extractedBarcode}</strong>...</p>
        </div>`;
    scannerModal.show();

    // Safely extract the token dynamically from the DOM wrapper environment
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || "";

    fetch('/plugin/cabal/spectacle/', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'X-CSRFToken': csrfToken 
        },
        body: JSON.stringify({ barcode: extractedBarcode })
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("Registry lookup connection error.")))
    .then(data => {
        if (!data.success || !data.comic_data) {
            throw new Error(data.message || "No matched records found in the registry.");
        }
        loadModalWithData(data, rowData, extractedBarcode);
    })
    .catch(err => { 
        modalBody.innerHTML = `<div class="alert alert-danger mt-2 font-monospace small">${err.message}</div>`; 
    });
}
