// /plugins/Cabal/cabal/static/cabal/js/nexus/_matrix_table.js

const rowsPerPage = 10;
let currentPage = 1;

let activeFilteredRows = [];

// Ensure global context fallback tracking hooks without re-declaration errors
if (typeof window.previewRows === 'undefined') window.previewRows = [];
if (typeof window.variantGroups === 'undefined') window.variantGroups = {};
if (typeof retailColIndex === 'undefined') window.retailColIndex = -1;
if (typeof qtyColIndex === 'undefined') window.qtyColIndex = -1;
if (typeof upcColIndex === 'undefined') window.upcColIndex = -1;

// Dynamically track indexing markers from the DOM if available
function syncColumnIndicesFromDOM() {
    const ths = Array.from(document.querySelectorAll('#previewTable th')).map(th => th.textContent.trim().toLowerCase());
    if (ths.length === 0) return;

    if (retailColIndex === -1) {
        const idx = ths.findIndex(h => h === 'retail' || h === 'price');
        if (idx !== -1) retailColIndex = idx;
    }
    if (qtyColIndex === -1) {
        const idx = ths.findIndex(h => h === 'qty' || h === 'quantity');
        if (idx !== -1) qtyColIndex = idx;
    }
    if (upcColIndex === -1) {
        const idx = ths.findIndex(h => h === 'upc' || h === 'barcode');
        if (idx !== -1) upcColIndex = idx;
    }
}

// Initial structural scan execution pass
syncColumnIndicesFromDOM();

function filterAndRenderMatrix() {
    if (upcColIndex === -1 || retailColIndex === -1 || qtyColIndex === -1) {
        syncColumnIndicesFromDOM();
    }

    const filterToken = document.getElementById('uiTableFilterToken')?.value.trim().toLowerCase() || "";
    const rawFiltered = !filterToken ? [...previewRows] : previewRows.filter(row => row.some(cell => String(cell).toLowerCase().includes(filterToken)));
    
    // --- ADVANCED VARIANT ARCHITECTURE GROUPING ENGINE ---
    const parentMap = {};
    const standaloneOrParents = [];
    const childVariantsBacklog = [];

    rawFiltered.forEach(row => {
        if (!row) return;
        
        if (upcColIndex === -1 || upcColIndex >= row.length) {
            standaloneOrParents.push(row);
            return;
        }

        const upc = String(row[upcColIndex] || "").trim();
        
        // If it's a 17-digit barcode that does NOT end in 11, it's a potential child variant
        if (upc.length === 17 && !upc.endsWith("11")) {
            childVariantsBacklog.push(row);
        } else {
            // It's a true Cover A (11) or non-17 digit book, it always acts as a primary parent row
            const baseUPC = upc.length === 17 ? upc.substring(0, 15) : upc;
            if (!parentMap[baseUPC]) parentMap[baseUPC] = [];
            standaloneOrParents.push(row);
        }
    });

    // Now look at our backlog of child variants (like Cover B / 21)
    childVariantsBacklog.forEach(row => {
        const upc = String(row[upcColIndex] || "").trim();
        const baseUPC = upc.substring(0, 15);

        // Crucial Fix: If a true Cover A parent row (11) exists for this base UPC, nest it as a drawer child
        if (parentMap[baseUPC] !== undefined) {
            parentMap[baseUPC].push(row);
        } else {
            // If Cover A is completely missing from the CSV, promote the first variant found (like Cover B) 
            // to be the main visible parent row so it doesn't vanish from the table!
            parentMap[baseUPC] = []; // Initialize drawer mapping for other secondary variants
            standaloneOrParents.push(row);
        }
    });

    window.variantGroups = parentMap; 
    activeFilteredRows = standaloneOrParents;
    currentPage = 1; 
    displayPage(1);
}

function displayPage(page) {
    const totalPages = Math.ceil(activeFilteredRows.length / rowsPerPage) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    currentPage = page;

    const tbody = document.getElementById('previewTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const start = (page - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, activeFilteredRows.length);

    for (let i = start; i < end; i++) {
        const targetRow = activeFilteredRows[i];
        const originalGlobalIndex = previewRows.indexOf(targetRow);
        
        // Bounds checking safety fallback
        const upc = (upcColIndex !== -1 && upcColIndex < targetRow.length) ? String(targetRow[upcColIndex] || "").trim() : "";
        const baseUPC = upc.length === 17 ? upc.substring(0, 15) : null;
        const associatedVariants = baseUPC ? (window.variantGroups[baseUPC] || []) : [];

        let rowHtml = `<tr class="parent-comic-row align-middle" id="row-global-${originalGlobalIndex}">`;
        
        targetRow.forEach(cell => {
            const cellStr = String(cell || "").trim();
            if (cellStr.startsWith('=HYPERLINK(')) {
                const match = cellStr.match(/=HYPERLINK\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/i);
                rowHtml += match ? `<td><a href="${match[1]}" target="_blank" class="text-info text-decoration-none fw-bold me-2">🔗 ${match[2]}</a></td>` : `<td><span class="text-danger italic small">[Link Error]</span></td>`;
            } else if (cell === "Hyperlink Formula Generated") {
                rowHtml += `<td><span class="text-muted italic">🔗 [Formula generated]</span></td>`;
            } else if (cell === null || cell === "") {
                rowHtml += `<td><span class="text-danger italic small">[empty]</span></td>`;
            } else {
                rowHtml += `<td>${cell}</td>`;
            }
        });

        rowHtml += `
            <td class="text-center">
                <div class="d-flex align-items-center justify-content-center gap-1">
                    <button type="button" class="btn btn-sm btn-outline-info scan-upc-btn" data-global-index="${originalGlobalIndex}">🔍 Scan UPC</button>
                    ${associatedVariants.length > 0 ? `<button type="button" class="btn btn-sm btn-dark text-warning font-monospace toggle-drawer-btn" data-base-upc="${baseUPC}">▼ ${associatedVariants.length}</button>` : ''}
                </div>
            </td></tr>`;

        tbody.insertAdjacentHTML('beforeend', rowHtml);

        // --- NESTED DRAWER EXPANSION ENGINE PANEL ---
        if (associatedVariants.length > 0) {
            let drawerHtml = `
                <tr id="drawer-${baseUPC}" class="bg-dark bg-gradient d-none">
                    <td colspan="${targetRow.length + 1}" class="p-3 border-start border-warning border-3">
                        <div class="fw-bold mb-2 text-warning font-monospace small">📁 Associated Secondary Barcode Variants Detected:</div>
                        <div class="table-responsive">
                            <table class="table table-sm table-bordered border-secondary text-white mb-0 small m-0">
                                <thead>
                                    <tr class="table-dark text-muted font-monospace" style="font-size: 11px;">
                                        <th class="text-center" style="width: 60px;">Sync Chk</th>
                                        <th>Variant Code</th>
                                        <th>Full Barcode String</th>
                                        <th>Price Row</th>
                                        <th>Action Line</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            associatedVariants.forEach(vRow => {
                const vGlobalIndex = previewRows.indexOf(vRow);
                const vUPC = (upcColIndex !== -1 && upcColIndex < vRow.length) ? String(vRow[upcColIndex] || "").trim() : "";
                const suffix = vUPC.slice(-5);
                const price = (retailColIndex !== -1 && retailColIndex < vRow.length) ? (vRow[retailColIndex] || "$0.00") : "N/A";
                
                drawerHtml += `
                    <tr class="align-middle">
                        <td class="text-center">
                            <input type="checkbox" class="form-check-input variant-row-sync-chk" id="table-chk-${vUPC}" data-global-index="${vGlobalIndex}">
                        </td>
                        <td class="font-monospace text-info fw-bold">${suffix.substring(0,3)} [${suffix.substring(3)}]</td>
                        <td class="font-monospace text-muted small">${vUPC}</td>
                        <td class="font-monospace text-success">${price}</td>
                        <td>
                            <button type="button" class="btn btn-xs btn-outline-secondary text-info font-monospace py-0 scan-upc-btn" data-global-index="${vGlobalIndex}" style="font-size:10px;">Edit</button>
                        </td>
                    </tr>`;
            });

            drawerHtml += `</tbody></table></div></td></tr>`;
            tbody.insertAdjacentHTML('beforeend', drawerHtml);
        }
    }
    attachScanButtonEvents();
    attachDrawerEvents();
    updateControls(totalPages);
}

function attachDrawerEvents() {
    document.querySelectorAll('.toggle-drawer-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const base = this.getAttribute('data-base-upc');
            const targetDrawer = document.getElementById(`drawer-${base}`);
            if (targetDrawer) {
                targetDrawer.classList.toggle('d-none');
                const isHidden = targetDrawer.classList.contains('d-none');
                this.textContent = isHidden ? `▼ ${window.variantGroups[base].length}` : `▲ Hide`;
            }
        });
    });
}

function updateControls(totalPages) {
    const info = document.getElementById('paginationInfo');
    const controls = document.getElementById('paginationControls');
    if (!info || !controls) return;

    const start = activeFilteredRows.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
    const end = Math.min(start + rowsPerPage - 1, activeFilteredRows.length);
    info.textContent = `Showing ${start} to ${end} of ${activeFilteredRows.length} total entries`;

    controls.innerHTML = '';
    if (totalPages <= 1) return;

    controls.insertAdjacentHTML('beforeend', `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a></li>`);
    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
            controls.insertAdjacentHTML('beforeend', `<li class="page-item ${currentPage === p ? 'active' : ''}"><a class="page-link" href="#" data-page="${p}">${p}</a></li>`);
        } else if (p === currentPage - 3 || p === currentPage + 3) {
            controls.insertAdjacentHTML('beforeend', `<li class="page-item disabled"><span class="page-link">...</span></li>`);
        }
    }
    controls.insertAdjacentHTML('beforeend', `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}">Next</a></li>`);

    controls.querySelectorAll('a[data-page]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            displayPage(parseInt(this.getAttribute('data-page')));
        });
    });
}

function attachScanButtonEvents() {
    if (typeof handleScanClick !== 'function') return;
    document.querySelectorAll('.scan-upc-btn').forEach(btn => {
        btn.removeEventListener('click', handleScanClick);
        btn.addEventListener('click', handleScanClick);
    });
}

document.getElementById('uiTableFilterToken')?.addEventListener('input', filterAndRenderMatrix);

function parseCSVStringToMatrix(text) {
    const lines = text.split(/\r\n|\n/);
    const matrix = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; 
        
        const row = [];
        let insideQuotes = false;
        let currentCell = '';
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            if (char === '"') {
                insideQuotes = !insideQuotes; 
            } else if (char === ',' && !insideQuotes) {
                row.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        row.push(currentCell.trim()); 
        matrix.push(row);
    }
    return matrix;
}

document.getElementById('lunarExcelResetInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const tbody = document.getElementById('previewTableBody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="20" class="text-center p-5">
                    <div class="spinner-border text-info" role="status"></div>
                    <p class="mt-2 font-monospace text-muted small">Streaming and filtering CSV matrix progress tracking logs...</p>
                </td>
            </tr>`;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const rawCSVText = evt.target.result;
            const fullMatrix = parseCSVStringToMatrix(rawCSVText);

            if (fullMatrix.length === 0) {
                throw new Error("Target CSV data map holds no structural elements.");
            }

            // --- CRITICAL AUTO-CORRECT MAPPING MATRIX FIX ENGINE ---
            // Read headers from the uploaded file and automatically update index mappings dynamically!
            const headers = fullMatrix[0].map(h => h.toLowerCase().trim());
            
            let ipnIndex = headers.findIndex(h => h === 'ipn' || h === 'ipn_proposed' || h === 'ipn proposed');
            
            let csvUpcIndex = headers.findIndex(h => h === 'upc' || h === 'barcode');
            if (csvUpcIndex !== -1) upcColIndex = csvUpcIndex;

            let csvRetailIndex = headers.findIndex(h => h === 'retail' || h === 'price');
            if (csvRetailIndex !== -1) retailColIndex = csvRetailIndex;

            let csvQtyIndex = headers.findIndex(h => h === 'qty' || h === 'quantity');
            if (csvQtyIndex !== -1) qtyColIndex = csvQtyIndex;

            const dataRows = fullMatrix.slice(1);

            const filteredBacklogRows = dataRows.filter(row => {
                if (ipnIndex === -1 || ipnIndex >= row.length) return true; 
                const ipnValue = String(row[ipnIndex] || "").trim();
                return ipnValue === ""; 
            });

            if (Array.isArray(previewRows)) {
                previewRows.length = 0; 
                previewRows.push(...filteredBacklogRows); 
                
                filterAndRenderMatrix();

                if (typeof logSessionIpn === "function") {
                    logSessionIpn(`[SYSTEM] Restarted flow using progress CSV. Remaining row backlog counts: ${previewRows.length}`);
                }
            } else {
                console.error("Global table matrix reference tracking point undefined.");
            }

        } catch (err) {
            console.error("CSV engine parser structural crash:", err);
            alert(`Failed parsing spreadsheet: ${err.message}`);
            filterAndRenderMatrix();
        }
    };

    reader.readAsText(file);
    e.target.value = '';
});
