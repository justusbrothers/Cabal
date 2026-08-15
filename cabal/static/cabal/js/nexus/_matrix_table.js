// /plugins/Cabal/cabal/static/cabal/js/nexus/_matrix_table.js

const rowsPerPage = 10;
let currentPage = 1;
let activeFilteredRows = [];

if (typeof window.previewRows === 'undefined') window.previewRows = [];
if (typeof window.fullRows === 'undefined') window.fullRows = [];
if (typeof window.variantGroups === 'undefined') window.variantGroups = {};
let retailColIndex = -1;
let qtyColIndex = -1;
let upcColIndex = -1;
let discountedColIndex = -1;

function hydratePreviewRowsFromDOM() {
    if (window.previewRows.length > 0) return;

    // Pull filtered preview rows for the UI table
    const previewScript = document.getElementById('preview-data-matrix');
    if (previewScript) {
        try {
            window.previewRows = JSON.parse(previewScript.textContent);
            console.log("🐛 [Cabal Debug] Hydrated previewRows from JSON script:", window.previewRows.length, "rows");
        } catch (e) {
            console.error("🐛 [Cabal Debug] Failed to parse preview-data-matrix JSON:", e);
        }
    } else {
        console.warn("🐛 [Cabal Debug] preview-data-matrix script tag not found.");
    }

    // Pull full rows containing complete pricing data matrix for batch processor
    const fullScript = document.getElementById('full-data-matrix');
    if (fullScript) {
        try {
            window.fullRows = JSON.parse(fullScript.textContent);
            console.log("🐛 [Cabal Debug] Hydrated fullRows from JSON script:", window.fullRows.length, "rows");
        } catch (e) {
            console.error("🐛 [Cabal Debug] Failed to parse full-data-matrix JSON:", e);
        }
    } else {
        console.warn("🐛 [Cabal Debug] full-data-matrix script tag not found.");
    }

    // Fallback if script tags aren't present yet
    if (window.previewRows.length === 0) {
        const trs = document.querySelectorAll('#previewTableBody tr.parent-comic-row');
        const rows = [];
        trs.forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).slice(0, -1).map(td => td.textContent.trim());
            if (cells.length > 0 && !cells[0].includes("No data loaded")) {
                rows.push(cells);
            }
        });
        window.previewRows = rows;
        console.log("🐛 [Cabal Debug] Fallback DOM table scrape found previewRows:", window.previewRows.length);
    }

    if (window.fullRows.length === 0) {
        window.fullRows = [...window.previewRows];
    }
}

function syncColumnIndicesFromDOM() {
    const ths = Array.from(document.querySelectorAll('#previewTable th')).map(th => th.textContent.trim().toLowerCase());
    console.log("🐛 [Cabal Debug] Detected Table Headers:", ths);

    if (ths.length === 0) return;

    if (retailColIndex === -1) {
        const idx = ths.findIndex(h => h === 'retail' || h === 'price' || h === 'retail price');
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

    if (discountedColIndex === -1) {
        const idx = ths.findIndex(h => h === 'discounted price' || h === 'cost' || h === 'disc price' || h === 'wholesale' || h === 'discounted_price');
        if (idx !== -1) discountedColIndex = idx;
    }

    console.log("🐛 [Cabal Debug] Column Index Mappings -> Retail:", retailColIndex, "| Qty:", qtyColIndex, "| UPC:", upcColIndex, "| Discounted/Cost:", discountedColIndex);
}

function filterAndRenderMatrix() {
    syncColumnIndicesFromDOM();

    const filterToken = document.getElementById('uiTableFilterToken')?.value.trim().toLowerCase() || "";
    const rawFiltered = !filterToken ? [...window.previewRows] : window.previewRows.filter(row => {
        if (Array.isArray(row)) {
            return row.some(cell => String(cell).toLowerCase().includes(filterToken));
        }
        return Object.values(row).some(val => String(val).toLowerCase().includes(filterToken));
    });

    const parentMap = {};
    const standaloneOrParents = [];
    const childVariantsBacklog = [];

    rawFiltered.forEach(row => {
        if (!row) return;
        const upc = String(Array.isArray(row) ? (row[upcColIndex] || "") : (row.upc || row.barcode || "")).trim();
        
        if (upc.length === 17 && !upc.endsWith("11")) {
            childVariantsBacklog.push(row);
        } else {
            const baseUPC = upc.length === 17 ? upc.substring(0, 15) : upc;
            if (baseUPC && !parentMap[baseUPC]) parentMap[baseUPC] = [];
            standaloneOrParents.push(row);
        }
    });

    childVariantsBacklog.forEach(row => {
        const upc = String(Array.isArray(row) ? (row[upcColIndex] || "") : (row.upc || row.barcode || "")).trim();
        const baseUPC = upc.substring(0, 15);

        if (parentMap[baseUPC] !== undefined) {
            parentMap[baseUPC].push(row);
        } else {
            parentMap[baseUPC] = [];
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

    if (activeFilteredRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" class="text-center text-muted p-4">No data loaded. Upload a CSV file above to populate the table.</td></tr>`;
        updateControls(totalPages);
        return;
    }

    const start = (page - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, activeFilteredRows.length);

    for (let i = start; i < end; i++) {
        const targetRow = activeFilteredRows[i];
        const originalGlobalIndex = window.previewRows.indexOf(targetRow);
        
        const upc = String(Array.isArray(targetRow) ? (targetRow[upcColIndex] || "") : (targetRow.upc || targetRow.barcode || "")).trim();
        const baseUPC = upc.length === 17 ? upc.substring(0, 15) : null;
        const associatedVariants = baseUPC ? (window.variantGroups[baseUPC] || []) : [];

        let rowHtml = `
            <tr class="parent-comic-row align-middle" id="row-global-${originalGlobalIndex}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input parent-row-chk" data-global-index="${originalGlobalIndex}">
                </td>
        `;

        if (Array.isArray(targetRow)) {
            targetRow.forEach(cell => {
                rowHtml += `<td>${cell !== null && cell !== "" ? cell : '<span class="text-danger italic small">[empty]</span>'}</td>`;
            });
        } else {
            Object.values(targetRow).forEach(val => {
                rowHtml += `<td>${val !== null && val !== "" ? val : '<span class="text-danger italic small">[empty]</span>'}</td>`;
            });
        }

        rowHtml += `
            <td class="text-center">
                <div class="d-flex align-items-center justify-content-center gap-1">
                    <button type="button" class="btn btn-sm btn-outline-info scan-upc-btn" data-global-index="${originalGlobalIndex}">🔍 Scan</button>
                    ${associatedVariants.length > 0 ? `<button type="button" class="btn btn-sm btn-dark text-warning font-monospace toggle-drawer-btn" data-base-upc="${baseUPC}">▼ ${associatedVariants.length}</button>` : ''}
                </div>
            </td>
        </tr>`;

        tbody.insertAdjacentHTML('beforeend', rowHtml);

        if (associatedVariants.length > 0) {
            let drawerHtml = `
                <tr id="drawer-${baseUPC}" class="bg-dark bg-gradient d-none">
                    <td colspan="${targetRow.length + 2}" class="p-3 border-start border-warning border-3">
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
                const vGlobalIndex = window.previewRows.indexOf(vRow);
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

    // Re-sync master header checkbox state when page changes
    const selectAllCheckbox = document.getElementById('selectAllRows');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
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

function getSelectedRowIndices() {
    const selectedIndices = [];
    document.querySelectorAll('.parent-row-chk:checked').forEach(chk => {
        const idx = parseInt(chk.getAttribute('data-global-index'), 10);
        if (!isNaN(idx)) {
            selectedIndices.push(idx);
        }
    });
    return selectedIndices;
}

document.getElementById('uiTableFilterToken')?.addEventListener('input', filterAndRenderMatrix);

// Initial structural scan and hydration
document.addEventListener('DOMContentLoaded', () => {
    hydratePreviewRowsFromDOM();
    syncColumnIndicesFromDOM();

    // Hook up master select-all toggle header checkbox
    const selectAllCheckbox = document.getElementById('selectAllRows');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            document.querySelectorAll('.parent-row-chk').forEach(chk => {
                chk.checked = isChecked;
            });
            console.log("🐛 [Cabal Debug] Master select-all toggled:", isChecked);
        });
    }

    if (window.previewRows.length > 0) {
        filterAndRenderMatrix();
    }

    const batchProcessor = new InvenTreeBatchProcessor({ delayMs: 1200 });

    window.runAutomatedBatch = async function() {
        if (batchProcessor.isProcessing) {
            console.warn("🐛 [Cabal Debug] Batch process is already running.");
            return;
        }

        if (typeof hydratePreviewRowsFromDOM === 'function') {
            hydratePreviewRowsFromDOM();
        }

        const sourceDataset = window.fullRows.length > 0 ? window.fullRows : window.previewRows;

        if (!sourceDataset || sourceDataset.length === 0) {
            batchProcessor.logToUI("❌ No rows available to process. Please upload and render a CSV file first.");
            return;
        }

        // GUARD: Ensure at least one row is checked before starting the batch
        const selectedIndices = getSelectedRowIndices();
        if (selectedIndices.length === 0) {
            const msg = "⚠️ [Cabal Warning] Batch run aborted: No rows are currently selected. Please check at least one row checkbox to begin processing.";
            batchProcessor.logToUI(msg);
            alert("Please select at least one row using the checkboxes before starting the batch process.");
            return;
        }

        // Filter source dataset to only include checked rows based on global indices
        const filteredSourceDataset = sourceDataset.filter((_, idx) => selectedIndices.includes(idx));
        console.log(`🐛 [Cabal Debug] Starting batch with ${filteredSourceDataset.length} checked rows out of ${sourceDataset.length} total.`);

        const fullHeadersScript = document.getElementById('full-headers-matrix');
        const fullHeaders = fullHeadersScript ? JSON.parse(fullHeadersScript.textContent) : [];
        console.log("🐛 [Cabal Debug] Full Headers Matrix for Batch Processing:", fullHeaders);

        const rowsToProcess = filteredSourceDataset.map((row, idx) => {
            if (Array.isArray(row)) {
                let rowObj = {};

                fullHeaders.forEach((header, hIdx) => {
                    let cleanKey = header.toLowerCase().replace(/\s+/g, '_');
                    rowObj[cleanKey] = row[hIdx];
                });

                const mappedRow = {
                    title: rowObj.title || row[0] || "",
                    upc: rowObj.upc || row[1] || "",
                    qty: rowObj.qty || row[2] || 1,
                    retail: rowObj.retail || row[3] || 0.00,
                    discounted_price: rowObj.discounted_price || (discountedColIndex !== -1 ? row[discountedColIndex] : null) || row[4] || 0.00,
                    ...rowObj
                };

                if (idx < 3) {
                    console.log(`🐛 [Cabal Debug] Row [${idx}] mapped for batch:`, mappedRow);
                }

                return mappedRow;
            }
            return row;
        });

        console.log("🐛 [Cabal Debug] Total rows prepared for batch processing:", rowsToProcess.length);

        await batchProcessor.startBatch(rowsToProcess);
    };

    const batchTriggerBtn = document.getElementById('startBatchBtn');
    if (batchTriggerBtn) {
        batchTriggerBtn.addEventListener('click', () => {
            window.runAutomatedBatch();
        });
    }

    const batchStopBtn = document.getElementById('stopBatchBtn');
    if (batchStopBtn) {
        batchStopBtn.addEventListener('click', () => {
            batchProcessor.stop();
        });
    }
});
