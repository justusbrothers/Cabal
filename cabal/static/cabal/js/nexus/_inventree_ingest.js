// /plugins/Cabal/cabal/static/cabal/js/nexus/_inventree_ingest.js

const submitBtn = document.getElementById('submitToInvenTreeBtn');

function loadModalWithData(spectacleData, originalRowData, currentUPC) {
    const comic = spectacleData?.comic_data || {};
    console.info('loadModalWithData:comic', comic)
    const variants = spectacleData.variants || [];
    console.info('loadModalWithData:variants', variants)
    console.info('loadModalWithData:originalRowData', originalRowData)
    console.info('loadModalWithData:currentUPC', currentUPC)

    let retailVal = (retailColIndex !== -1) ? String(originalRowData[retailColIndex] || "").replace(/[^0-9.]/g, '').trim() : "";
    let quantityVal = (qtyColIndex !== -1) ? String(originalRowData[qtyColIndex] || "1").replace(/[^0-9]/g, '').trim() || "1" : "1";
    let finalPrice = retailVal || comic.whatnot_price || "";
    let storeDate = comic.store_date || "";

    let matchedPubCode = comic.pub_code || "UNK";
    let finalCategory = comic.category || PUBLISHER_PART_CATEGORIES[matchedPubCode] || 1;
    let finalLocation = PUBLISHER_STOCK_LOCATIONS[matchedPubCode] || "";

    let variantVal = comic.variant_name || "";
    
    // --- SPECIAL HANDLING FOR 21 / COVER B AS PRIMARY SCAN TRIGGER ---
    let initialCoverLetter = getVariantLetterFromUPC(currentUPC);
    if (currentUPC && currentUPC.length === 17 && currentUPC.endsWith("21") && !initialCoverLetter) {
        initialCoverLetter = "B"; // Explicitly fallback/enforce Cover B if default engine skips it
    }

    // --- AUTOMATIC INCOMING IPN OVERRIDE MECHANISM ---
    let incomingIpn = String(comic.ipn_proposed || "").trim();
    if (incomingIpn && currentUPC && currentUPC.length === 17) {
        const match = incomingIpn.match(/-([0-9]{3})([A-Z]*[0-9]*)$/i);
        if (match) {
            const ipnBase = incomingIpn.substring(0, incomingIpn.lastIndexOf(match[0]));
            const existingSuffix = match[2];
            
            if (!existingSuffix.toUpperCase().includes(initialCoverLetter)) {
                incomingIpn = `${ipnBase}-${match[1]}${initialCoverLetter}`;
            }
        }
    }

    // --- DYNAMIC LIVE MODAL VARIANT CHECKLIST GENERATION ---
    const baseUPC = currentUPC.length === 17 ? currentUPC.substring(0, 15) : null;
    let variantsChecklistHtml = `
        <div class="p-3 bg-dark bg-gradient text-white rounded border border-secondary mt-1 shadow-sm">
            <span class="text-warning font-monospace small fw-bold d-block mb-2">📋 Interactive Variant Checksheet Entry Tool:</span>`;
    
    if (baseUPC) {
        // Variant sequential list suffix ranges matching 11, 21, 31, 41 up to 91
        const targetExtensions = ["11", "21", "31", "41", "51", "61", "71", "81", "91"];
        variantsChecklistHtml += `<div class="row g-2">`;
        
        targetExtensions.forEach(ext => {
            const compiledUPC = `${baseUPC}${ext}`;
            // Scan if the matching version row physically exists inside your un-ingested backlog array
            const rowExistsInBacklog = previewRows.find(r => r && upcColIndex !== -1 && String(r[upcColIndex] || "").trim() === compiledUPC);
            // Sync initial state directly from current layout checkbox checks
            const originalTableChk = document.getElementById(`table-chk-${compiledUPC}`);
            const isInitiallyChecked = originalTableChk && originalTableChk.checked ? 'checked' : '';
            
            // Mark it checked automatically inside the modal if it matches the current UPC that triggered the modal view
            const forceChecked = (compiledUPC === currentUPC) ? 'checked' : isInitiallyChecked;
            
            variantsChecklistHtml += `
                <div class="col-6 col-md-3">
                    <div class="form-check p-2 border border-secondary rounded bg-opacity-10 bg-light d-flex align-items-center gap-2 m-0 h-100">
                        <input class="form-check-input modal-variant-sync-trigger ms-1" type="checkbox" id="modal-chk-${compiledUPC}" data-upc="${compiledUPC}" ${forceChecked}>
                        <label class="form-check-label font-monospace small m-0 flex-grow-1 cursor-pointer select-none ${rowExistsInBacklog ? 'text-info fw-bold' : 'text-muted text-decoration-line-through'}" for="modal-chk-${compiledUPC}">
                            ${ext} ${rowExistsInBacklog ? '📦' : '∅'}
                        </label>
                    </div>
                </div>`;
        });
        variantsChecklistHtml += `</div>`;
    } else {
        variantsChecklistHtml += `<div class="small text-muted italic p-1">17-Digit structural configuration missing from active UPC line. Cannot auto-calculate matrix.</div>`;
    }
    variantsChecklistHtml += `</div>`;

    let categoryOptionsHtml = CATEGORIES_LIST.map(cat => `<option value="${cat.id}" ${(cat.id === parseInt(finalCategory)) ? 'selected' : ''}>${cat.name}</option>`).join('');
    let locationOptionsHtml = `<option value="" ${!finalLocation ? 'selected' : ''}>-- No Stock Location --</option>` + 
        LOCATIONS_LIST.map(loc => `<option value="${loc.id}" ${(loc.id === parseInt(finalLocation)) ? 'selected' : ''}>${loc.name}</option>`).join('');

    let metronBadgeHtml = "";
    if (comic.metron_id) {
        const metronUrl = `https://metron.cloud/issue/${comic.metron_id}/`;
        metronBadgeHtml = `
            <div class="mt-2">
                <a href="${metronUrl}" target="_blank" class="btn btn-sm btn-outline-primary w-100 d-flex align-items-center justify-content-center gap-1 shadow-sm">
                    🌐 View on Metron
                </a>
            </div>`;
    }

    const fallbackImage = 'https://placehold.co/200x300?text=No+Cover';
    let cleanDescription = (comic.description || '').replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();
    if (cleanDescription.length > 250) cleanDescription = cleanDescription.substring(0, 247) + '...';

    modalBody.innerHTML = `
        <div class="row g-3">
            <div class="col-md-3 text-center">
                <img id="comic_cover_preview" src="${comic.image_url || fallbackImage}" class="img-fluid rounded border shadow-sm" style="max-height:300px;" alt="Cover">
                ${metronBadgeHtml}
            </div>

            <div class="col-md-9">
                <div class="row g-2">
                    <div class="col-md-8"><label class="form-label small fw-bold text-muted">Title</label><input type="text" id="edit_title" class="form-control form-control-sm" value="${comic.title || ''}"></div>
                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Cover Letter</label><input type="text" id="edit_cover" class="form-control form-control-sm" value="${initialCoverLetter}"></div>
                    <div class="col-md-12"><label class="form-label small fw-bold text-muted">Variant Name</label><input type="text" id="edit_variant" class="form-control form-control-sm" value="${variantVal}" placeholder="e.g. Variant Cover"></div>
                    
                    <div class="col-12 mt-1">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <label class="form-label small fw-bold text-muted mb-0">Final Combined Part Name Preview</label>
                            <span id="combined_title_counter" class="badge bg-secondary font-monospace">0 / 100</span>
                        </div>
                        <div id="combined_title_preview" class="p-2 border rounded bg-light text-secondary font-monospace small" style="min-height: 31px; word-break: break-all;">
                        </div>
                    </div>
                    
                    <div class="col-md-7"><label class="form-label small fw-bold text-muted">IPN</label>
                        <div class="input-group input-group-sm">
                            <input type="text" id="edit_ipn" class="form-control font-monospace" value="${incomingIpn}">
                            <button class="btn btn-outline-secondary" id="copy_ipn_inline_btn" type="button">📋</button>
                        </div>
                    </div>
                    <div class="col-md-5">
                        <label class="form-label small fw-bold text-muted">UPC / Barcode</label>
                        <div class="input-group input-group-sm">
                            <button class="btn btn-outline-secondary" id="decrement_variant_btn" type="button">−</button>
                            <input type="text" id="edit_upc" class="form-control font-monospace text-center" value="${currentUPC}">
                            <button class="btn btn-outline-secondary" id="increment_variant_btn" type="button">+</button>
                        </div>
                    </div>

                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Price ($)</label><input type="number" id="edit_price" class="form-control form-control-sm" value="${finalPrice}"></div>
                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Store Date</label><input type="text" id="edit_store_date" class="form-control form-control-sm" value="${storeDate}"></div>
                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Qty</label><input type="number" id="edit_qty" class="form-control form-control-sm" value="${quantityVal}"></div>

                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Category</label><select id="edit_category" class="form-select form-select-sm">${categoryOptionsHtml}</select></div>
                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Stock Location</label><select id="edit_location" class="form-select form-select-sm">${locationOptionsHtml}</select></div>
                    <div class="col-md-4"><label class="form-label small fw-bold text-muted">Condition</label><select id="edit_condition" class="form-select form-select-sm"><option value="Near Mint" selected>Near Mint</option></select></div>
                    
                    <div class="col-12 mt-2"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="edit_whatnot_sync" checked><label class="form-check-label" for="edit_whatnot_sync">Listed on WhatNot?</label></div></div>
                </div>
            </div>

            <div class="col-12">
                ${variantsChecklistHtml}
            </div>

            <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label small fw-bold text-muted mb-0">Image URL</label></div>
                <input type="text" id="edit_image_url" class="form-control form-control-sm" value="${comic.image_url || ''}">
                <div class="d-flex justify-content-between align-items-center mb-1 mt-3">
                    <label class="form-label small fw-bold text-muted mb-0">Description</label>
                    <span id="description_counter" class="badge bg-secondary font-monospace">0 / 250</span>
                </div>
                <textarea id="edit_description" class="form-control form-control-sm" rows="3">${cleanDescription}</textarea>
            </div>
        </div>`;

    const upcInput = document.getElementById('edit_upc');
    const ipnInput = document.getElementById('edit_ipn');
    const coverInput = document.getElementById('edit_cover');

    // --- TWO-WAY INTERACTIVE CHECKLIST CROSS-SYNC BINDINGS ---
    document.querySelectorAll('.modal-variant-sync-trigger').forEach(chk => {
        chk.addEventListener('change', function() {
            const upcTargetKey = this.getAttribute('data-upc');
            const targetTableBox = document.getElementById(`table-chk-${upcTargetKey}`);
            if (targetTableBox) {
                targetTableBox.checked = this.checked;
            }
        });
    });

    if (upcInput) {
        upcInput.addEventListener('input', function() {
            const newUPC = this.value.trim();
            if (newUPC.length >= 8) {
                const matchingRow = previewRows.find(row => row && upcColIndex < row.length && String(row[upcColIndex] || "").trim() === newUPC);
                if (matchingRow) {
                    let newPrice = (retailColIndex !== -1) ? String(matchingRow[retailColIndex] || "").replace(/[^0-9.]/g, '').trim() : "";
                    if (newPrice !== "") {
                        document.getElementById('edit_price').value = newPrice;
                    }
                    document.getElementById('edit_qty').value = (qtyColIndex !== -1) ? String(matchingRow[qtyColIndex] || "1").replace(/[^0-9]/g, '').trim() || "1" : "1";
                }
            }
            if (newUPC.length >= 5) {
                if (coverInput) {
                    let calculatedLetter = getVariantLetterFromUPC(newUPC);
                    if (newUPC.endsWith("21") && !calculatedLetter) calculatedLetter = "B";
                    coverInput.value = calculatedLetter;
                    coverInput.dispatchEvent(new Event('input')); 
                }
                if (ipnInput) {
                    const currentIpn = ipnInput.value.trim();
                    const match = currentIpn.match(/-([0-9]{3})([A-Z]*[0-9]*)$/i);
                    if (match) {
                        const ipnBase = currentIpn.substring(0, currentIpn.lastIndexOf(match[0]));
                        let calculatedLetter = getVariantLetterFromUPC(newUPC);
                        if (newUPC.endsWith("21") && !calculatedLetter) calculatedLetter = "B";
                        ipnInput.value = `${ipnBase}-${match[1]}${calculatedLetter}`;
                    }
                }
            }
        });

        upcInput.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                let currentVal = this.value.trim();
                if (currentVal.length === 17) {
                    e.preventDefault();
                    let base = currentVal.substring(0, 15);
                    let variantDigit = parseInt(currentVal.charAt(15));
                    let printingDigit = currentVal.charAt(16);
                    
                    if (e.key === 'ArrowUp' && variantDigit < 9) variantDigit++;
                    else if (e.key === 'ArrowDown' && variantDigit > 1) variantDigit--;
                    
                    this.value = `${base}${variantDigit}${printingDigit}`;
                    this.dispatchEvent(new Event('input'));
                }
            }
        });
    }

    const decBtn = document.getElementById('decrement_variant_btn');
    const incBtn = document.getElementById('increment_variant_btn');

    function stepVariant(direction) {
        if (!upcInput) return;
        let currentVal = upcInput.value.trim();

        if (currentVal.length === 17) {
            let base = currentVal.substring(0, 15);
            let variantDigit = parseInt(currentVal.charAt(15), 10);
            let printingDigit = currentVal.charAt(16);

            if (direction === 'up' && variantDigit < 9) variantDigit++;
            else if (direction === 'down' && variantDigit > 1) variantDigit--;

            const targetUPC = `${base}${variantDigit}${printingDigit}`;
            
            // --- SPECTACLE LOOKUP ENGINE ---
            // Look up the variant matching the new target UPC directly from the Spectacle response
            const matchedVariant = spectacleData?.variants?.find(v => v.upc === targetUPC);

            upcInput.value = targetUPC;

            if (matchedVariant) {
                // Update modal fields with variant details from Spectacle payload
                if (document.getElementById('edit_variant')) {
                    document.getElementById('edit_variant').value = matchedVariant.variant || "";
                }
                if (document.getElementById('edit_price')) {
                    document.getElementById('edit_price').value = matchedVariant.whatnot_price || matchedVariant.price || "";
                }
                if (document.getElementById('edit_image_url')) {
                    document.getElementById('edit_image_url').value = matchedVariant.image_url || "";
                    document.getElementById('comic_cover_preview').src = matchedVariant.image_url || fallbackImage;
                }
                if (document.getElementById('edit_description') && matchedVariant.description) {
                    let cleanDesc = matchedVariant.description.replace(/<\/?[^>]+(>|$)/g, " ").replace(/\s+/g, " ").trim();
                    if (cleanDesc.length > 250) cleanDesc = cleanDesc.substring(0, 247) + '...';
                    document.getElementById('edit_description').value = cleanDesc;
                    
                    // Trigger event to refresh description counter badge
                    document.getElementById('edit_description').dispatchEvent(new Event('input'));
                }
            }

            // Trigger input event to calculate IPN, cover letter, and Live Title Preview
            upcInput.dispatchEvent(new Event('input'));

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(targetUPC).catch(err => console.error(err));
            }
        }
    }

    if (incBtn) incBtn.addEventListener('click', () => stepVariant('up'));
    if (decBtn) decBtn.addEventListener('click', () => stepVariant('down'));

    const titleInp = document.getElementById('edit_title');
    const variantInp = document.getElementById('edit_variant');
    const previewDiv = document.getElementById('combined_title_preview');
    const combinedCounter = document.getElementById('combined_title_counter');

    function updateLivePreview() {
        if (!previewDiv || !titleInp) return;
        const base = titleInp.value.trim();
        const cover = coverInput ? coverInput.value.trim() : "";
        let variant = variantInp ? variantInp.value.trim() : "";
        
        variant = variant.replace(/cover\s+[a-z]\b/gi, "");
        if (cover) {
            const coverLetterRegex = new RegExp(`\\bcover\\s+${cover}\\b|\\b${cover}\\b`, 'gi');
            variant = variant.replace(coverLetterRegex, "");
        }
        variant = variant.replace(/\s+/g, " ").trim();
        
        let combined = base;
        if (cover || variant) {
            combined += " -";
            if (cover) combined += ` Cover ${cover}`;
            if (variant) combined += ` ${variant}`;
        }
        
        combined = combined.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ");
        previewDiv.textContent = combined;

        if (combinedCounter) {
            const currentLength = combined.length;
            combinedCounter.textContent = `${currentLength} / 100`;
            if (currentLength > 100) combinedCounter.className = "badge bg-danger font-monospace";
            else if (currentLength >= 90) combinedCounter.className = "badge bg-warning text-dark font-monospace";
            else combinedCounter.className = "badge bg-secondary font-monospace";
        }
    }

    if (titleInp) titleInp.addEventListener('input', updateLivePreview);
    if (variantInp) variantInp.addEventListener('input', updateLivePreview);
    if (coverInput) coverInput.addEventListener('input', updateLivePreview);

    updateLivePreview();

    document.getElementById('edit_image_url')?.addEventListener('input', function() {
        document.getElementById('comic_cover_preview').src = this.value.trim() || fallbackImage;
    });

    document.getElementById('copy_ipn_inline_btn')?.addEventListener('click', function() {
        const textToCopy = ipnInput?.value.trim();
        if (textToCopy && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                if (typeof showTemporaryCheckmark === "function") showTemporaryCheckmark(this);
            });
        }
    });

    const descTextArea = document.getElementById('edit_description');
    const descCounter = document.getElementById('description_counter');

    if (descTextArea && descCounter) {
        const updateCounter = () => {
            const currentLength = descTextArea.value.length;
            descCounter.textContent = `${currentLength} / 250`;
            if (currentLength > 250) descCounter.className = "badge bg-danger font-monospace";
            else if (currentLength >= 225) descCounter.className = "badge bg-warning text-dark font-monospace";
            else descCounter.className = "badge bg-secondary font-monospace";
        };
        descTextArea.addEventListener('input', updateCounter);
        updateCounter();
    }

    const imageUrlInp = document.getElementById('edit_image_url');
    if (imageUrlInp) {
        imageUrlInp.addEventListener('click', function() { this.select(); });
    }
}

submitBtn.addEventListener('click', function() {
    const activeUPC = document.getElementById('edit_upc')?.value.trim() || "";
    const sanitizedCombinedTitle = document.getElementById('combined_title_preview')?.textContent.trim() || document.getElementById('edit_title').value.trim();

    const payload = {
        active_upc: activeUPC,
        category_id: parseInt(document.getElementById('edit_category').value) || 1,
        condition: document.getElementById('edit_condition').value,
        description: document.getElementById('edit_description').value.trim(),
        image_url: document.getElementById('edit_image_url')?.value.trim() || "",
        ipn_proposed: document.getElementById('edit_ipn')?.value.trim() || "",
        listed_on_whatnot: document.getElementById('edit_whatnot_sync').checked ? "True" : "False",
        location_id: parseInt(document.getElementById('edit_location').value) || null,
        quantity: parseInt(document.getElementById('edit_qty').value) || 1,
        store_date: document.getElementById('edit_store_date').value || "",
        title: sanitizedCombinedTitle,
        whatnot_price: document.getElementById('edit_price').value || "0",
    };

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span> Creating...`;

    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || "";

    fetch('/api/part/', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'X-CSRFToken': csrfToken 
        },
        body: JSON.stringify({
            active: true,
            category: payload.category_id,
            description: payload.description,
            image: null,
            IPN: payload.ipn_proposed,
            name: payload.title,
            remote_image: payload.image_url || null,
            virtual: false,
        })
    })
    .then(res => { 
        if (!res.ok) {
            throw new Error("Part definition structural compilation failure.");
        }

        return res.json(); 
    })
    .then(partData => {
        if (!partData.pk) {
            throw new Error("Part created without a valid database primary key response.");
        }

        const sequentialPromises = [];
        
        if (typeof ensureParameter === "function") {
            sequentialPromises.push(ensureParameter(partData.pk, 'listed_on_whatnot', payload.listed_on_whatnot === "True", true, 11, csrfToken));
            sequentialPromises.push(ensureParameter(partData.pk, 'whatnot_price', payload.whatnot_price, false, 21, csrfToken));
            sequentialPromises.push(ensureParameter(partData.pk, 'store_date', payload.store_date, false, 68, csrfToken));
            sequentialPromises.push(ensureParameter(partData.pk, 'condition', payload.condition, false, 16, csrfToken));
            sequentialPromises.push(ensureParameter(partData.pk, 'upc', payload.active_upc, false, 64, csrfToken));
        }

        if (payload.location_id) {
            sequentialPromises.push(
                fetch('/api/stock/', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'X-CSRFToken': csrfToken 
                    },
                    body: JSON.stringify({
                        part: partData.pk,
                        quantity: payload.quantity,
                        location: payload.location_id,
                        notes: `Ingested via Nexus. Condition grade: ${payload.condition}`
                    })
                }).then(stockRes => {
                    if (!stockRes.ok) throw new Error("Part created, but Stock Record ingestion failed.");
                })
            );
        }

        return Promise.all(sequentialPromises).then(() => partData);
    })
    .then(() => {
        submitBtn.className = "btn btn-sm btn-success font-monospace";
        submitBtn.innerHTML = `✓ Saved! Modal kept open`;

        // --- DYNAMIC POST-SAVE CHECKBOX STATE AUTO-COMMIT ENGINE ---
        if (activeUPC) {
            const directTargetTableBox = document.getElementById(`table-chk-${activeUPC}`);
            if (directTargetTableBox) {
                directTargetTableBox.checked = true;
            }

            const directTargetModalBox = document.getElementById(`modal-chk-${activeUPC}`);
            if (directTargetModalBox) {
                directTargetModalBox.checked = true;
            }

            const matchingBacklogIndex = previewRows.findIndex(row => row && upcColIndex !== -1 && String(row[upcColIndex] || "").trim() === activeUPC);
            if (matchingBacklogIndex !== -1) {
                const parentRowElement = document.getElementById(`row-global-${matchingBacklogIndex}`);
                if (parentRowElement) {
                    parentRowElement.classList.add('table-success');
                }
            }
        }

        if (typeof logSessionIpn === "function") {
            logSessionIpn(payload.ipn_proposed);
        }

        setTimeout(() => {
            submitBtn.className = "btn btn-sm btn-success font-monospace";
            submitBtn.innerHTML = `🚀 Create Part & Stock Record`;
            submitBtn.disabled = false;
        }, 2000);
    })
    .catch(err => {
        alert(`Pipeline Error: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.className = "btn btn-sm btn-danger text-white font-monospace";
        submitBtn.innerHTML = `🚀 Create Part & Stock Record`;
    });
});
