// Interface Selectors
const mainSearchInput = document.getElementById('tableSearchInput');

const fileInput = document.getElementById('csvFile'); 
const processBtn = document.getElementById('processBtn'); 
const exportBtn = document.getElementById('exportBtn'); 

const buyersTableBody = document.getElementById('buyersTableBody'); 
const tippersTableBody = document.getElementById('tippersTableBody');

// DOM Listeners Setup
fileInput.addEventListener('change', () => { 
    processBtn.disabled = !fileInput.files.length; 
    if (fileInput.files.length > 0) {
        updateStatus(`${fileInput.files.length} file(s) selected and ready for compilation.`, "info");
    }
});

mainSearchInput.addEventListener('input', () => { 
    currentPage.buyers = 1; currentPage.tippers = 1;
    renderActiveTables(); 
});

document.addEventListener("DOMContentLoaded", () => {
    const sizeBuyers = document.getElementById('entriesPerPageBuyers');
    const sizeTippers = document.getElementById('entriesPerPageTippers');
    const datePicker = document.getElementById('showDatePicker');
    
    if (sizeBuyers) {
        sizeBuyers.addEventListener('change', (e) => {
            rowsPerPage.buyers = parseInt(e.target.value); currentPage.buyers = 1; renderActiveTables();
        });
    }
    if (sizeTippers) {
        sizeTippers.addEventListener('change', (e) => {
            rowsPerPage.tippers = parseInt(e.target.value); currentPage.tippers = 1; renderActiveTables();
        });
    }
    if (datePicker) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        datePicker.value = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        updateLiveDatePreview(); 
    }
    renderAlphabetPickers();
});

// Grid UI Rendering Processors
function renderAlphabetPickers() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    ['buyers', 'tippers'].forEach(storeKey => {
        const container = document.getElementById(`alphabetPicker${storeKey.charAt(0).toUpperCase() + storeKey.slice(1)}`);
        if (!container) return;

        let html = `<button class="btn btn-sm btn-pink-outline me-1 mb-1 active" id="btn-all-${storeKey}" onclick="setAlphabetFilter('${storeKey}', 'ALL')">All</button>`;
        html += `<button class="btn btn-sm btn-outline-secondary me-1 mb-1" id="btn-num-${storeKey}" onclick="setAlphabetFilter('${storeKey}', '#')">#</button>`;
        letters.forEach(l => {
            html += `<button class="btn btn-sm btn-outline-secondary me-1 mb-1" id="btn-${l}-${storeKey}" onclick="setAlphabetFilter('${storeKey}', '${l}')">${l}</button>`;
        });
        container.innerHTML = html;
    });
}

function setAlphabetFilter(storeKey, letter) {
    activeLetterFilter[storeKey] = letter;
    currentPage[storeKey] = 1;
    const container = document.getElementById(`alphabetPicker${storeKey.charAt(0).toUpperCase() + storeKey.slice(1)}`);
    container.querySelectorAll('button').forEach(btn => {
        btn.classList.remove('btn-pink', 'btn-pink-outline', 'active');
        btn.classList.add('btn-outline-secondary');
    });
    
    let targetId = letter === 'ALL' ? `btn-all-${storeKey}` : letter === '#' ? `btn-num-${storeKey}` : `btn-${letter}-${storeKey}`;
    const activeBtn = document.getElementById(targetId);
    if(activeBtn) activeBtn.classList.add('btn-pink', 'active');
    renderActiveTables();
}

function toggleBubbleFilter(storeKey, bubbleRating, element) {
    const parentDrawer = element.closest('.style-drawer-inner');
    parentDrawer.querySelectorAll('.bubble-indicator').forEach(btn => {
        btn.style.borderColor = 'transparent'; btn.style.transform = 'scale(1)';
    });

    if (activeBubbleFilters[storeKey] === bubbleRating) {
        activeBubbleFilters[storeKey] = null;
    } else {
        activeBubbleFilters[storeKey] = bubbleRating;
        element.style.borderColor = '#ff007f'; element.style.transform = 'scale(1.15)';
    }
    currentPage[storeKey] = 1;
    renderActiveTables(); 
}

function handlePagination(storeKey, direction) {
    if (direction === 'next') currentPage[storeKey]++;
    else if (direction === 'prev' && currentPage[storeKey] > 1) currentPage[storeKey]--;
    renderActiveTables();
}

function renderActiveTables() {
    const query = mainSearchInput.value.toLowerCase().trim();

    const filterFn = (storeKey) => item => {
        const matchesSearch = !query || item.BUYER_NAME.toLowerCase().includes(query);
        
        let matchesLetter = false;
        const currentFilter = activeLetterFilter[storeKey];
        if (currentFilter === 'ALL') matchesLetter = true;
        else if (currentFilter === '#') matchesLetter = item.BUYER_NAME && /^[0-9_\W]/.test(item.BUYER_NAME);
        else matchesLetter = item.BUYER_NAME && item.BUYER_NAME.toUpperCase().startsWith(currentFilter);
        
        let matchesBubble = true;
        if (activeBubbleFilters[storeKey] !== null) {
            if (!item.LAST_TRANSACTION) matchesBubble = false;
            else {
                const diffDays = Math.ceil(Math.abs(new Date() - new Date(item.LAST_TRANSACTION)) / (1000 * 60 * 60 * 24));
                let currentRowsRating = 5; 
                if (diffDays <= 30) currentRowsRating = 1;
                else if (diffDays <= 60) currentRowsRating = 2;
                else if (diffDays <= 90) currentRowsRating = 3;
                else if (diffDays <= 120) currentRowsRating = 4;
                matchesBubble = (currentRowsRating === activeBubbleFilters[storeKey]);
            }
        }
        return matchesSearch && matchesLetter && matchesBubble;
    };

    const totalBuyersFiltered = runtimeCache.buyers.filter(filterFn('buyers'));
    const totalTippersFiltered = runtimeCache.tippers.filter(filterFn('tippers'));

    const startB = (currentPage.buyers - 1) * rowsPerPage.buyers;
    const buyersToRender = totalBuyersFiltered.slice(startB, startB + rowsPerPage.buyers);

    const startT = (currentPage.tippers - 1) * rowsPerPage.tippers;
    const tippersToRender = totalTippersFiltered.slice(startT, startT + rowsPerPage.tippers);

    const rowMapper = row => `
        <tr>
            <td>
                <div class="d-flex align-items-center gap-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary border-0 p-1" onclick="handleJustCopy('${row.BUYER_NAME}')">
                        <i class="fas fa-copy" style="color: #ff69b4;"></i>
                    </button>
                    <a href="https://www.whatnot.com/user/${row.BUYER_NAME}" onclick="handleLinkAndCopy(event, '${row.BUYER_NAME}')" class="girly-user-link">
                       ${row.BUYER_NAME}
                    </a>
                </div>
            </td>
            <td class="text-nowrap text-center"><span class="girly-badge-pill state-bubble">${row.STATE || 'N/A'}</span></td>
            <td class="text-nowrap text-center">${getColorCodedDateBadge(row.LAST_TRANSACTION)}</td>
        </tr>
    `;

    buyersTableBody.innerHTML = buyersToRender.map(rowMapper).join('') || `<tr><td colspan="3" class="text-center text-muted py-3">No matching buyers found.</td></tr>`;
    tippersTableBody.innerHTML = tippersToRender.map(rowMapper).join('') || `<tr><td colspan="3" class="text-center text-muted py-3">No matching tippers found.</td></tr>`;

    updatePaginationUI('buyers', totalBuyersFiltered.length);
    updatePaginationUI('tippers', totalTippersFiltered.length);
}

function updatePaginationUI(storeKey, totalCount) {
    const navContainer = document.getElementById(`pagination${storeKey.charAt(0).toUpperCase() + storeKey.slice(1)}`);
    if (!navContainer) return;

    const maxPage = Math.ceil(totalCount / rowsPerPage[storeKey]) || 1;
    if (currentPage[storeKey] > maxPage) currentPage[storeKey] = maxPage;

    navContainer.innerHTML = `
        <div class="d-flex flex-column flex-md-row align-items-center gap-2 justify-content-between mt-3 w-100 px-2 text-center text-md-start">
            <small class="text-muted" style="font-weight: 700; color: #ff007f !important; font-size: 0.85rem;">✨ Found ${totalCount} glamorous friends</small>
            <div class="d-flex align-items-center gap-1 justify-content-center flex-wrap">
                <button class="btn btn-sm btn-nav-girly px-2 py-1" ${currentPage[storeKey] === 1 ? 'disabled' : ''} onclick="handlePagination('${storeKey}', 'prev')">
                    <i class="fas fa-heart me-1" style="font-size: 0.65rem;"></i> Prev
                </button>
                <span class="btn btn-sm btn-pink-light px-2 py-1" style="opacity: 1; pointer-events: none; white-space: nowrap; font-size: 0.8rem; font-weight: 600;">Page ${currentPage[storeKey]} / ${maxPage}</span>
                <button class="btn btn-sm btn-nav-girly px-2 py-1" ${currentPage[storeKey] === maxPage ? 'disabled' : ''} onclick="handlePagination('${storeKey}', 'next')">
                    Next <i class="fas fa-heart ms-1" style="font-size: 0.65rem;"></i>
                </button>
            </div>
        </div>
    `;
}

function sortData(storeKey, columnField) {
    const sortIdentifier = `${storeKey}_${columnField}`;
    const direction = sortDirections[sortIdentifier] === 'asc' ? 'desc' : 'asc';
    sortDirections[sortIdentifier] = direction;

    document.querySelectorAll(`[id^="sort_${storeKey}_"]`).forEach(el => el.innerText = '↕');
    document.getElementById(`sort_${sortIdentifier}`).innerText = direction === 'asc' ? '▲' : '▼';

    runtimeCache[storeKey].sort((a, b) => {
        return direction === 'asc' ? 
            (a[columnField] || '').toString().toLowerCase().localeCompare((b[columnField] || '').toString().toLowerCase()) : 
            (b[columnField] || '').toString().toLowerCase().localeCompare((a[columnField] || '').toString().toLowerCase());
    });
    renderActiveTables();
}

// Bulk File Parser Pipeline
processBtn.addEventListener('click', async () => {
    const files = fileInput.files; if (!files.length) return;
    processBtn.disabled = true; fileInput.disabled = true;
    let processedFilesCount = 0; const totalFiles = files.length;
    updateStatus(`Starting bulk migration of ${totalFiles} file(s)...`, "warning");

    const filePromises = Array.from(files).map((file) => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                chunk: function(results) {
                    const innerTx = db.transaction(["buyers", "tippers"], "readwrite");
                    const buyersStore = innerTx.objectStore("buyers");
                    const tippersStore = innerTx.objectStore("tippers");

                    results.data.forEach(row => {
                        const buyerName = (row.BUYER_NAME || row["Buyer Username"] || '').toString().trim();
                        if (!buyerName) return;

                        const targetStore = (row.TRANSACTION_TYPE && row.TRANSACTION_TYPE.toUpperCase() === 'TIP') ? tippersStore : buyersStore;
                        const newDateStr = row.TRANSACTION_COMPLETED_AT_UTC || row["Last Seen Transaction"] || '';

                        const getReq = targetStore.get(buyerName);
                        getReq.onsuccess = function() {
                            const existingRecord = getReq.result;
                            let finalDate = newDateStr;

                            if (existingRecord && existingRecord.LAST_TRANSACTION) {
                                const existingTime = new Date(existingRecord.LAST_TRANSACTION).getTime();
                                const incomingTime = new Date(newDateStr).getTime();
                                if (!isNaN(existingTime) && !isNaN(incomingTime) && existingTime > incomingTime) {
                                    finalDate = existingRecord.LAST_TRANSACTION;
                                }
                            }

                            targetStore.put({
                                BUYER_NAME: buyerName,
                                STATE: row.BUYER_STATE || row.State || (existingRecord ? existingRecord.STATE : 'N/A'),
                                LAST_TRANSACTION: finalDate
                            });
                        };
                    });
                },
                complete: function() {
                    processedFilesCount++;
                    updateStatus(`Compiled ${processedFilesCount} of ${totalFiles} sheets... Synchronizing storage records.`, "warning");
                    resolve();
                },
                error: function(err) { reject(err); }
            });
        });
    });

    try {
        await Promise.all(filePromises);
        updateStatus(`Success! All ${totalFiles} sheets compiled. Timestamps synchronized.`, "success");
    } catch (error) {
        updateStatus("Bulk parsing encountered an error. Check browser console.", "danger");
    } finally {
        fileInput.disabled = false; fileInput.value = ""; loadTablesFromDB(); 
    }
});

// Excel Cloud Exporter Link
exportBtn.addEventListener('click', async () => {
    updateStatus("Preparing dataset for Excel export...", "warning");
    const buyers = await getAllStoreData("buyers");
    const tippers = await getAllStoreData("tippers");
    const exportedBuyers = buyers.filter(row => !nameBlacklist.includes((row.BUYER_NAME || '').toLowerCase().trim()));
    const exportedTippers = tippers.filter(row => !nameBlacklist.includes((row.BUYER_NAME || '').toLowerCase().trim()));

    fetch(window.ExporterConfig.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': window.ExporterConfig.csrfToken },
        body: JSON.stringify({ buyers: exportedBuyers, tippers: exportedTippers })
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'CustomerExporter_Report.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        updateStatus("Excel file generated successfully!", "success");
    })
    .catch(err => updateStatus("Export failed: " + err, "danger"));
});
