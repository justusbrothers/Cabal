// /plugins/Cabal/cabal/static/cabal/js/nexus/_matrix_table.js

let activeFilteredRows = [];
// Track hidden/entered row global indices
if (typeof window.hiddenGlobalIndices === 'undefined') window.hiddenGlobalIndices = new Set();
let showHiddenRows = false;

if (typeof window.previewRows === 'undefined') window.previewRows = [];
if (typeof window.fullRows === 'undefined') window.fullRows = [];
if (typeof window.variantGroups === 'undefined') window.variantGroups = {};
let retailColIndex = -1;
let qtyColIndex = -1;
let upcColIndex = -1;
let discountedColIndex = -1;

function hydratePreviewRowsFromDOM() {
    // 1. Hydrate previewRows if empty
    if (window.previewRows.length === 0) {
        const previewScript = document.getElementById('preview-data-matrix');
        if (previewScript) {
            try {
                window.previewRows = JSON.parse(previewScript.textContent);
                console.log("🐛 [Cabal Debug] Hydrated previewRows from JSON script:", window.previewRows.length, "rows");
            } catch (e) {
                console.error("🐛 [Cabal Debug] Failed to parse preview-data-matrix JSON:", e);
            }
        }
    }

    // 2. Hydrate fullRows independently if empty
    if (window.fullRows.length === 0) {
        const fullScript = document.getElementById('full-data-matrix');
        if (fullScript) {
            try {
                window.fullRows = JSON.parse(fullScript.textContent);
                console.log("🐛 [Cabal Debug] Hydrated fullRows from JSON script:", window.fullRows.length, "rows");
            } catch (e) {
                console.error("🐛 [Cabal Debug] Failed to parse full-data-matrix JSON:", e);
            }
        }
    }

    // 3. DOM Scraping Fallbacks if still empty
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
    }

    if (window.fullRows.length === 0) {
        window.fullRows = [...window.previewRows];
    }
}

function syncColumnIndicesFromDOM() {
    const ths = Array.from(document.querySelectorAll('#previewTable th')).map(th => th.textContent.trim().toLowerCase());
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
        
        const targetUpcIdx = (upcColIndex !== -1 && upcColIndex < row.length) ? upcColIndex : 1;
        const upc = String(Array.isArray(row) ? (row[targetUpcIdx] || "") : (row.upc || row.barcode || "")).trim();
        
        if (upc.length === 17 && !upc.endsWith("11")) {
            childVariantsBacklog.push(row);
        } else {
            const baseUPC = upc.length === 17 ? upc.substring(0, 15) : upc;
            if (baseUPC && !parentMap[baseUPC]) parentMap[baseUPC] = [];
            standaloneOrParents.push(row);
        }
    });

    childVariantsBacklog.forEach(row => {
        const targetUpcIdx = (upcColIndex !== -1 && upcColIndex < row.length) ? upcColIndex : 1;
        const upc = String(Array.isArray(row) ? (row[targetUpcIdx] || "") : (row.upc || row.barcode || "")).trim();
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
    renderAllRows();
}

function renderAllRows() {
    const tbody = document.getElementById('previewTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (activeFilteredRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" class="text-center text-muted p-4">No matching records found.</td></tr>`;
        updateEntryCount();
        return;
    }

    let visibleRenderedCount = 0;

    activeFilteredRows.forEach((targetRow) => {
        const originalGlobalIndex = window.previewRows.indexOf(targetRow);
        const isHidden = window.hiddenGlobalIndices.has(originalGlobalIndex);

        if (isHidden && !showHiddenRows) {
            return; // Skip rendering if hidden and toggle is off
        }

        visibleRenderedCount++;
        
        const targetUpcIdx = (upcColIndex !== -1 && upcColIndex < targetRow.length) ? upcColIndex : 1;
        const upc = String(Array.isArray(targetRow) ? (targetRow[targetUpcIdx] || "") : (targetRow.upc || targetRow.barcode || "")).trim();
        const baseUPC = upc.length === 17 ? upc.substring(0, 15) : null;
        const associatedVariants = baseUPC ? (window.variantGroups[baseUPC] || []) : [];

        let rowHtml = `
            <tr class="parent-comic-row align-middle ${isHidden ? 'table-secondary opacity-50 d-none-toggle' : ''}" id="row-global-${originalGlobalIndex}">
                <td class="text-center">
                    <input type="checkbox" class="form-check-input parent-row-chk" data-global-index="${originalGlobalIndex}" ${isHidden ? 'checked disabled' : ''}>
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
                    <button type="button" class="btn btn-sm btn-outline-danger hide-row-btn" data-global-index="${originalGlobalIndex}" title="Hide/Collapse Record">❌</button>
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
    });

    attachScanButtonEvents();
    attachDrawerEvents();
    attachHideButtonEvents();
    updateEntryCount();
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

function attachHideButtonEvents() {
    document.querySelectorAll('.hide-row-btn').forEach(btn => {
        btn.removeEventListener('click', handleHideClick);
        btn.addEventListener('click', handleHideClick);
    });
}

function handleHideClick() {
    const globalIndex = parseInt(this.getAttribute('data-global-index'), 10);
    if (isNaN(globalIndex)) return;

    // Toggle hidden status
    if (window.hiddenGlobalIndices.has(globalIndex)) {
        window.hiddenGlobalIndices.delete(globalIndex);
    } else {
        window.hiddenGlobalIndices.add(globalIndex);
    }

    // Find row and nullify/uncheck checkbox
    const row = document.getElementById(`row-global-${globalIndex}`);
    if (row) {
        const chk = row.querySelector('.parent-row-chk');
        if (chk) {
            chk.checked = false;
            chk.disabled = window.hiddenGlobalIndices.has(globalIndex);
        }
        
        if (!showHiddenRows && window.hiddenGlobalIndices.has(globalIndex)) {
            row.classList.add('d-none');
        }
    }
    
    updateEntryCount();
}

function ensureToggleControlExists() {
    const infoContainer = document.getElementById('paginationInfo')?.parentNode || document.getElementById('uiTableFilterToken')?.parentNode;
    if (!infoContainer || document.getElementById('toggleHiddenRowsBtn')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'toggleHiddenRowsBtn';
    toggleBtn.className = 'btn btn-sm btn-outline-secondary ms-2 font-monospace';
    toggleBtn.style.fontSize = '11px';
    toggleBtn.textContent = '👁️ Show Entered/Hidden (0)';
    
    toggleBtn.addEventListener('click', function() {
        showHiddenRows = !showHiddenRows;
        this.classList.toggle('active', showHiddenRows);
        this.classList.toggle('btn-secondary', showHiddenRows);
        this.classList.toggle('btn-outline-secondary', !showHiddenRows);
        renderAllRows();
    });

    infoContainer.appendChild(toggleBtn);
}

function updateEntryCount() {
    const info = document.getElementById('paginationInfo');
    if (!info) return;

    ensureToggleControlExists();
    const hiddenCount = window.hiddenGlobalIndices.size;
    const toggleBtn = document.getElementById('toggleHiddenRowsBtn');
    if (toggleBtn) {
        toggleBtn.textContent = `👁️ Show Entered/Hidden (${hiddenCount})`;
    }

    const totalFiltered = activeFilteredRows.length;
    const visibleCount = showHiddenRows ? totalFiltered : totalFiltered - Array.from(window.hiddenGlobalIndices).filter(idx => activeFilteredRows.some(r => window.previewRows.indexOf(r) === idx)).length;

    info.textContent = `Showing ${visibleCount} of ${totalFiltered} filtered entries (${hiddenCount} hidden)`;
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
    document.querySelectorAll('.parent-row-chk:checked:not(:disabled)').forEach(chk => {
        const idx = parseInt(chk.getAttribute('data-global-index'), 10);
        if (!isNaN(idx)) {
            selectedIndices.push(idx);
        }
    });
    return selectedIndices;
}

document.getElementById('uiTableFilterToken')?.addEventListener('input', filterAndRenderMatrix);

document.addEventListener('DOMContentLoaded', () => {
    hydratePreviewRowsFromDOM();
    syncColumnIndicesFromDOM();
    ensureToggleControlExists();

    const selectAllCheckbox = document.getElementById('selectAllRows');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            document.querySelectorAll('.parent-row-chk:not(:disabled)').forEach(chk => {
                chk.checked = isChecked;
            });
        });
    }

    if (window.previewRows.length > 0) {
        filterAndRenderMatrix();
    }

    const batchProcessor = new InvenTreeBatchProcessor({ delayMs: 1200 });

    window.runAutomatedBatch = async function() {
        if (batchProcessor.isProcessing) return;

        if (typeof hydratePreviewRowsFromDOM === 'function') {
            hydratePreviewRowsFromDOM();
        }

        // 🛑 Force array safety check
        let sourceDataset = window.fullRows.length > 0 ? window.fullRows : window.previewRows;
        if (!Array.isArray(sourceDataset)) {
            sourceDataset = Object.values(sourceDataset || {});
        }

        if (sourceDataset.length === 0) {
            batchProcessor.logToUI("❌ No rows available to process.");
            return;
        }

        const selectedIndices = getSelectedRowIndices();
        if (selectedIndices.length === 0) {
            batchProcessor.logToUI("⚠️ Batch run aborted: No rows selected.");
            alert("Please select at least one active row using the checkboxes.");
            return;
        }

        const filteredSourceDataset = sourceDataset.filter((_, idx) => selectedIndices.includes(idx));
        const fullHeadersScript = document.getElementById('full-headers-matrix');
        const fullHeaders = fullHeadersScript ? JSON.parse(fullHeadersScript.textContent) : [];

        const rowsToProcess = filteredSourceDataset.map((row) => {
            if (Array.isArray(row)) {
                let rowObj = {};

                fullHeaders.forEach((header, hIdx) => {
                    let cleanKey = header.toLowerCase().replace(/\s+/g, '_');
                    rowObj[cleanKey] = row[hIdx];
                });

                console.log('rowsToProcess', {
                    rowObj,
                    row
                });

                // If row was sliced from DOM cells instead of full data, map by column header names or dynamic indices
                return {
                    title: row[0] || rowObj.title || "",
                    upc: row[1] || rowObj.upc || (upcColIndex !== -1 ? row[upcColIndex] : null) || "",
                    qty: parseInt(row[4] || rowObj.qty || (qtyColIndex !== -1 ? row[qtyColIndex] : null), 10) || 1,
                    retail: parseFloat(row[2]) || rowObj.retail || rowObj.price || (retailColIndex !== -1 ? row[retailColIndex] : null) || 0.00,
                    discounted_price: parseFloat(row[3]) || rowObj.discounted_price || rowObj.discount_price || (discountedColIndex !== -1 ? row[discountedColIndex] : null) || 0.00
                };
            }

            // If it's already an object, map cleanly
            return {
                title: row.title || "",
                upc: row.upc || row.barcode || "",
                qty: parseInt(row.qty || row.quantity, 10) || 1,
                retail: parseFloat(row.retail || row.price) || 0.00,
                discounted_price: parseFloat(row.discounted_price || row.discount_price || row.cost) || 0.00
            };
        });

        console.log('rowsToProcess', rowsToProcess);

        await batchProcessor.startBatch(rowsToProcess);
    };

    document.getElementById('startBatchBtn')?.addEventListener('click', () => window.runAutomatedBatch());
    document.getElementById('stopBatchBtn')?.addEventListener('click', () => batchProcessor.stop());
});
