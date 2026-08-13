// /plugins/Cabal/cabal/static/cabal/js/vanguard/recommendations.js

document.addEventListener('DOMContentLoaded', function() {
    function clearAndHideIpnList(ref) {
        console.info('clearAndHideIpnList', { ref });
        if (container) container.style.display = 'none';
        if (listContainer) listContainer.innerHTML = '';
    }

    // Restore packs content from localStorage on load if textarea is empty
    if (packsTextarea && !packsTextarea.value.trim()) {
        try {
            const savedPacks = localStorage.getItem(STORAGE_PACKS_CONTENT_KEY);
            if (savedPacks) {
                packsTextarea.value = savedPacks;
            }
        } catch(e) {}
    }

    // Save packs textarea content to localStorage
    function savePacksContent() {
        if (!packsTextarea) return;
        try {
            localStorage.setItem(STORAGE_PACKS_CONTENT_KEY, packsTextarea.value);
        } catch(e) {}
    }

    // Listen for manual typing / changes in packs textarea
    if (packsTextarea) {
        packsTextarea.addEventListener('input', function() {
            savePacksContent();
        });
    }

    // Trigger recommended packs API lookup via button click
    function triggerRecommendedPacksLookup() {
        const ipnRaw = ipnTextarea ? ipnTextarea.value : '';
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';

        fetch('/plugin/cabal/vanguard/api/lookup-packs/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                ipn_list: ipnRaw
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                if (data.ipn_list && ipnTextarea) {
                    ipnTextarea.value = data.ipn_list;
                    if (window.VanguardTextArea && typeof window.VanguardTextArea.saveIpnContent === 'function') {
                        window.VanguardTextArea.saveIpnContent();
                    }
                    window.VanguardTextArea.updateTimestamps(window.VanguardTextArea.getCleanLines());
                    window.VanguardTextArea.applyFilters();
                }
                if (Array.isArray(data.recommended_packs)) {
                    renderRecommendedPacks(data.recommended_packs);
                }
            } else {
                console.warn(data.message || 'Could not fetch recommended packs.');
            }
        })
        .catch(err => {
            console.error('Error fetching recommended packs:', err);
        });
    }

    // Render or update recommended packs UI section
    function renderRecommendedPacks(packs) {
        if (typeof window.refreshRecommendedPacks === 'function') {
            window.refreshRecommendedPacks(packs);
            return;
        }

        if (!container || !listContainer) return;

        if (!packs || packs.length === 0) {
            clearAndHideIpnList('renderRecommendedPacks');
            return;
        }

        let html = '';
        packs.forEach((pack, index) => {
            const counter = index + 1;
            const sku = pack.recommended_pack_sku || pack.sku || '';
            const title = pack.title || '';
            const isChecked = !pack.has_missing_cover;
            const maxBuild = pack.max_buildable_packs || 1;

            let badgesHtml = '';
            if (Array.isArray(pack.cover_details)) {
                pack.cover_details.forEach(cover => {
                    const badgeClass = !cover.has_stock ? 'bg-danger' : 'bg-secondary';
                    badgesHtml += `
                        <span class="badge ${badgeClass}" title="Stock: ${cover.qty}">
                            ${cover.letter} <span class="opacity-75">(${cover.qty})</span>
                        </span>`;
                });
            }

            html += `
                <label class="list-group-item bg-dark d-flex gap-3 align-items-center py-3" style="cursor: pointer;">
                    <input type="checkbox" 
                           class="form-check-input flex-shrink-0 recommendation-checkbox pack-checkbox fs-4" 
                           id="pack_${counter}" 
                           name="selected_packs" 
                           value="${sku}"
                           ${isChecked ? 'checked' : ''}>
                           
                    <div class="d-flex flex-wrap w-100 justify-content-between align-items-center gap-2">
                        <div>
                            <h6 class="mb-1 fw-bold text-white">
                                ${sku} 
                                <span class="text-muted fw-normal ms-2">— ${title}</span>
                            </h6>
                            <div class="d-flex gap-1 mt-2">
                                ${badgesHtml}
                            </div>
                        </div>

                        <div class="d-flex align-items-center bg-body-tertiary p-2 rounded border border-secondary" onclick="event.preventDefault(); event.stopPropagation();">
                            <label for="pack_qty_${counter}" class="small text-muted me-2 mb-0">Build Qty:</label>
                            <input type="number" 
                                   id="pack_qty_${counter}" 
                                   name="pack_qty_${sku}" 
                                   class="form-control form-control-sm text-center fw-bold me-3" 
                                   style="width: 70px;"
                                   value="1" 
                                   min="0" 
                                   max="${maxBuild}"
                                   data-max="${maxBuild}"
                                   oninput="updateRemainingServerRender(this, 'remaining_${counter}')">
                                   
                            <div class="small">
                                Remaining: <strong id="remaining_${counter}" class="text-info fs-6">0</strong>
                            </div>
                        </div>
                    </div>
                </label>`;
        });

        listContainer.innerHTML = html;
        container.style.display = 'block';
    }

    if (clearPacksBtn) {
        clearPacksBtn.addEventListener('click', function() {
            console.log('clearPacksBtn');
            clearAndHideIpnList('clearPacksBtn');
        });
    }

    if (lookupPacksBtn) {
        lookupPacksBtn.addEventListener('click', function() {
            triggerRecommendedPacksLookup();
        });
    }

    if (btnAlertSelected && packsTextarea) {
        btnAlertSelected.addEventListener('click', function() {
            const checkboxes = document.querySelectorAll('.recommendation-checkbox:checked');
            
            let linesMap = new Map();
            packsTextarea.value.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
                const parts = line.split(/\s+x\d+$/);
                const baseSku = parts[0].trim();
                linesMap.set(baseSku, line);
            });
            
            checkboxes.forEach(checkbox => {
                const sku = checkbox.value;
                const parent = checkbox.closest('label');
                const qtyInput = parent.querySelector('input[type="number"]');
                const qty = qtyInput ? qtyInput.value : '1';
                
                const entry = parseInt(qty) > 1 ? `${sku}x${qty}` : sku;
                linesMap.set(sku, entry);
            });

            packsTextarea.value = Array.from(linesMap.values()).join('\n');
            savePacksContent();
        });
    }
});
