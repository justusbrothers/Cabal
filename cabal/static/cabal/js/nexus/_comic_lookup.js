// /plugins/Cabal/cabal/static/cabal/js/nexus/_comic_lookup.js

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
    console.group(`🖱️ [Scan Click Handler] Click event triggered on scan button`);
    
    const targetGlobalIndex = parseInt(this.getAttribute('data-global-index'), 10);
    console.log(`📌 Target Global Index parsed:`, targetGlobalIndex);

    const rowData = previewRows[targetGlobalIndex];
    console.log(`📋 Row Data retrieved from previewRows:`, rowData);

    if (!rowData) {
        console.warn(`⚠️ [Scan Click] Row data not found for index ${targetGlobalIndex}. Aborting.`);
        console.groupEnd();
        return;
    }

    // Explicitly grab index 1 for the barcode (or fallback to upcColIndex if index 1 is missing)
    const targetIndex = 1;
    const rawCellVal = rowData[targetIndex] !== undefined ? rowData[targetIndex] : rowData[upcColIndex];
    console.log(`🔍 [Scan Click] Target cell value at index ${targetIndex}:`, rawCellVal, `(Type: ${typeof rawCellVal})`);

    const extractedBarcode = String(rawCellVal || "").trim();
    console.log(`barcode [Scan Click] Extracted & trimmed barcode:`, JSON.stringify(extractedBarcode));

    if (!extractedBarcode) {
        console.warn(`⚠️ [Scan Click] Extracted barcode is empty! Alerting user.`);
        alert("Target barcode column cell is empty.");
        console.groupEnd();
        return;
    }

    if (!scannerModal) {
        console.log(`🪟 [Scan Click] Initializing Bootstrap scannerModal instance...`);
        scannerModal = new bootstrap.Modal(document.getElementById('comicScannerModal'));
    }

    modalBody.innerHTML = `
        <div class="text-center my-4">
            <div class="spinner-border text-info" role="status"></div>
            <p class="mt-2 text-muted">Querying comic registry for: <strong>${extractedBarcode}</strong>...</p>
        </div>`;
    scannerModal.show();
    console.log(`🚀 [Scan Click] Modal displayed. Dispatching performSpectacleLookup for barcode: "${extractedBarcode}"`);

    window.Cabal.performSpectacleLookup(extractedBarcode, rowData[0] || "", 
        (data) => {
            console.log(`🎉 [Scan Click Success Callback] Lookup succeeded with data:`, data);
            loadModalWithData(data, rowData, extractedBarcode);
            console.groupEnd();
        },
        (err) => {
            console.error(`❌ [Scan Click Error Callback] Lookup failed with error:`, err);
            modalBody.innerHTML = `<div class="alert alert-danger mt-2 font-monospace small"><strong>Lookup Failed for Barcode "${extractedBarcode}":</strong> ${err.error}</div>`;
            console.groupEnd();
        }
    );
}
