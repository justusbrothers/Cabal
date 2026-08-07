// /plugins/Cabal/cabal/static/cabal/js/avisia/app.js

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
    
    // Automatically fetch table records from PostgreSQL when page loads
    fetchTableData();
});

// Fetch Data from Backend PostgreSQL Database
async function fetchTableData() {
    try {
        const response = await fetch(window.ExporterConfig.dataUrl || '/plugin/cabal/avisia/data/');
        const contentType = response.headers.get("content-type");
        
        if (!contentType || !contentType.includes("application/json")) {
            console.error("Server returned non-JSON response for data fetch.");
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Failed to retrieve dataset.");
        }

        // Populate runtime cache with database records
        runtimeCache.buyers = data.buyers || [];
        runtimeCache.tippers = data.tippers || [];

        renderActiveTables();
    } catch (error) {
        console.error("Error fetching table data:", error);
    }
}

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

function handlePagination(storeKey, direction) {
    if (direction === 'next') currentPage[storeKey]++;
    else if (direction === 'prev' && currentPage[storeKey] > 1) currentPage[storeKey]--;
    renderActiveTables();
}

function renderActiveTables() {
    const query = mainSearchInput.value.toLowerCase().trim();

    console.info('renderActiveTables', {
        query
    })

    const filterFn = (storeKey) => item => {
        const buyerName = item.BUYER_NAME || item.buyer_name || '';
        const lastTx = item.LAST_TRANSACTION || item.last_transaction || null;

        // 1. Blacklist Filter Check
        if (typeof nameBlacklist !== 'undefined' && nameBlacklist.map(n => n.toLowerCase()).includes(buyerName.toLowerCase())) {
            return false;
        }

        // 2. Text Search Check
        const matchesSearch = !query || buyerName.toLowerCase().includes(query);
        
        // 3. Alphabet Picker Filter Check
        let matchesLetter = false;
        const currentLetter = activeLetterFilter[storeKey];
        if (currentLetter === 'ALL') matchesLetter = true;
        else if (currentLetter === '#') matchesLetter = buyerName && /^[0-9_\W]/.test(buyerName);
        else matchesLetter = buyerName && buyerName.toUpperCase().startsWith(currentLetter);
        
        // 4. Color Bubble Age Filter Check
        const activeBubble = activeBubbleFilters[storeKey];
        const matchesBubble = matchesBubbleFilter(lastTx, activeBubble);

        console.info('renderActiveTables:filterFn', {
            matchesSearch,
            matchesLetter,
            matchesBubble,
        })

        return matchesSearch && matchesLetter && matchesBubble;
    };

    const totalBuyersFiltered = runtimeCache.buyers.filter(filterFn('buyers'));
    const totalTippersFiltered = runtimeCache.tippers.filter(filterFn('tippers'));

    const startB = (currentPage.buyers - 1) * rowsPerPage.buyers;
    const buyersToRender = totalBuyersFiltered.slice(startB, startB + rowsPerPage.buyers);

    const startT = (currentPage.tippers - 1) * rowsPerPage.tippers;
    const tippersToRender = totalTippersFiltered.slice(startT, startT + rowsPerPage.tippers);

    console.info('renderActiveTables', {
        totalBuyersFiltered,
        totalTippersFiltered,
        startB,
        buyersToRender,
        startT,
        tippersToRender,
    })

    const rowMapper = row => {
        const name = row.BUYER_NAME || row.buyer_name || 'Unknown';
        const state = row.STATE || row.state || 'N/A';
        const lastTx = row.LAST_TRANSACTION || row.last_transaction || null;

        return `
            <tr>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <button type="button" class="btn btn-sm btn-outline-secondary border-0 p-1" onclick="handleJustCopy('${name}')">
                            <i class="fas fa-copy" style="color: #ff69b4;"></i>
                        </button>
                        <a href="https://www.whatnot.com/user/${name}" onclick="handleLinkAndCopy(event, '${name}')" class="girly-user-link">
                           ${name}
                        </a>
                    </div>
                </td>
                <td class="text-nowrap text-center"><span class="girly-badge-pill state-bubble">${state}</span></td>
                <td class="text-nowrap text-center">${typeof getColorCodedDateBadge === 'function' ? getColorCodedDateBadge(lastTx) : (lastTx || 'N/A')}</td>
            </tr>
        `;
    };

    console.info('renderActiveTables', {
        rowMapper
    })

    buyersTableBody.innerHTML = buyersToRender.map(rowMapper).join('') || `<tr><td colspan="3" class="text-center text-muted py-3">No matching buyers found.</td></tr>`;
    tippersTableBody.innerHTML = tippersToRender.map(rowMapper).join('') || `<tr><td colspan="3" class="text-center text-muted py-3">No matching tippers found.</td></tr>`;

    updatePaginationUI('buyers', totalBuyersFiltered.length);
    updatePaginationUI('tippers', totalTippersFiltered.length);
}

function updatePaginationUI(storeKey, totalCount) {
    const navContainer = document.getElementById(`pagination${storeKey.charAt(0).toUpperCase() + storeKey.slice(1)}`);
    const buyerCount = document.getElementById('buyerCountDisplay');
    const tipperCount = document.getElementById('tipperCountDisplay');

    console.info('updatePaginationUI', {
        navContainer,
        buyerCount,
        tipperCount,
    })

    if (!navContainer || !buyerCount || !tipperCount) return;

    if (storeKey === 'buyers') {
        buyerCount.innerHTML = `${totalCount}`;
    } else if (storeKey === 'tippers') {
        tipperCount.innerHTML = `${totalCount}`;
    }

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

// Bulk File Parser Pipeline (Direct to Backend Database)
processBtn.addEventListener('click', async () => {
    const files = fileInput.files; 
    if (!files.length) return;
    
    processBtn.disabled = true; 
    fileInput.disabled = true;
    updateStatus("Parsing CSV data for backend import...", "warning");

    let allBuyers = [];
    let allTippers = [];

    const filePromises = Array.from(files).map((file) => {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true, 
                skipEmptyLines: true,
                complete: function(results) {
                    results.data.forEach(row => {
                        const buyerName = (row.BUYER_NAME || '').toString().trim();
                        if (!buyerName) return;

                        const txType = (row.TRANSACTION_TYPE || '').toString().toUpperCase();
                        const isTip = txType.includes('TIP');
                        
                        const record = {
                            BUYER_NAME: buyerName,
                            STATE: row.BUYER_STATE || 'N/A',
                            LAST_TRANSACTION: row.TRANSACTION_COMPLETED_AT_UTC || row.ORDER_PLACED_AT_UTC || null
                        };

                        if (isTip) {
                            allTippers.push(record);
                        } else {
                            allBuyers.push(record);
                        }
                    });
                    resolve();
                },
                error: function(err) { 
                    reject(err); 
                }
            });
        });
    });

    try {
        await Promise.all(filePromises);
        updateStatus("Files parsed. Uploading data to backend database...", "warning");

        const response = await fetch(window.ExporterConfig.uploadUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'X-CSRFToken': window.ExporterConfig.csrfToken 
            },
            body: JSON.stringify({ 
                buyers: allBuyers, 
                tippers: allTippers 
            })
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const rawText = await response.text();
            console.error("Server returned non-JSON response:", rawText);
            throw new Error("Server encountered an internal error (500). Check terminal logs.");
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "Server failed to import dataset.");
        }

        updateStatus(data.message || `Successfully imported dataset!`, "success");

        // Automatically re-fetch table data to update UI views immediately after successful upload
        await fetchTableData();
        
    } catch (error) {
        console.error("Import error:", error);
        updateStatus("Import failed: " + error.message, "danger");
    } finally {
        fileInput.disabled = false; 
        fileInput.value = ""; 
        processBtn.disabled = true;
    }
});
