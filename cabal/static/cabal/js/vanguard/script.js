// Server-side rendered card quantity helper
function updateRemainingServerRender(inputElem, remainingElemId) {
    const max = parseInt(inputElem.dataset.max) || 0;
    const buildVal = parseInt(inputElem.value) || 0;
    const remainingSpan = document.getElementById(remainingElemId);
    if (!remainingSpan) return;

    const remaining = max - buildVal;
    remainingSpan.textContent = remaining;

    if (remaining <= 0) {
        remainingSpan.className = 'remaining-badge out-of-stock';
    } else if (remaining < 2) {
        remainingSpan.className = 'remaining-badge low-stock';
    } else {
        remainingSpan.className = 'remaining-badge';
    }
}

// JavaScript Dynamic Render Section
function renderPackRecommendations(packs) {
    const container = document.getElementById('recommendations-container');
    const listDiv = document.getElementById('recommendations-list');
    listDiv.innerHTML = '';

    if (!packs || packs.length === 0) {
        container.style.display = 'none';
        return;
    }

    packs.forEach((pack, index) => {
        const item = document.createElement('div');
        item.className = 'recommendation-card-item';

        const maxBuildable = pack.max_buildable_packs;

        // Check if any cover variant in this pack is missing/low stock
        const hasMissingCover = (pack.cover_details || []).some(cover => !cover.has_stock);
        const isChecked = !hasMissingCover ? 'checked' : '';

        // Render cover badges with superscript stock counts
        const coverBadgesHtml = (pack.cover_details || []).map(cover => {
            const isMissing = !cover.has_stock;
            const badgeClass = isMissing ? 'cover-badge missing-cover' : 'cover-badge';
            const tooltip = isMissing 
                ? `Cover ${cover.letter}: Insufficient stock (${cover.qty} available, min 2 required)` 
                : `Cover ${cover.letter}: Stock ${cover.qty}`;
            
            return `<span class="${badgeClass}" title="${tooltip}">${cover.letter}<sup>${cover.qty}</sup></span>`;
        }).join('');

        item.innerHTML = `
            <input 
                type="checkbox" 
                class="recommendation-checkbox pack-checkbox" 
                id="pack_dyn_${index}" 
                name="selected_packs" 
                value="${pack.recommended_pack_sku}" 
                ${isChecked}
            >
            <div class="recommendation-content">
                <div class="recommendation-header">
                    <label for="pack_dyn_${index}" class="recommendation-title" style="cursor: pointer;">
                        <strong>${pack.recommended_pack_sku}</strong> — ${pack.title}
                    </label>
                    <div class="cover-flags">
                        ${coverBadgesHtml}
                    </div>
                </div>
                <div class="recommendation-qty-row">
                    <label for="pack_qty_dyn_${index}">Build Qty:</label>
                    <input 
                        type="number" 
                        id="pack_qty_dyn_${index}" 
                        class="qty-input" 
                        name="pack_qty_${pack.recommended_pack_sku}" 
                        value="1" 
                        min="0" 
                        max="${maxBuildable}"
                        data-max="${maxBuildable}"
                    >
                    <span>Packs Remaining: <strong id="remaining_dyn_${index}" class="remaining-badge">0</strong></span>
                </div>
            </div>
        `;

        listDiv.appendChild(item);

        const qtyInput = item.querySelector(`#pack_qty_dyn_${index}`);
        const remainingSpan = item.querySelector(`#remaining_dyn_${index}`);

        function updateRemaining() {
            const max = parseInt(qtyInput.dataset.max) || 0;
            const buildVal = parseInt(qtyInput.value) || 0;
            const remaining = max - buildVal;

            remainingSpan.textContent = remaining;

            if (remaining <= 0) {
                remainingSpan.className = 'remaining-badge out-of-stock';
            } else if (remaining < 2) {
                remainingSpan.className = 'remaining-badge low-stock';
            } else {
                remainingSpan.className = 'remaining-badge';
            }
        }

        qtyInput.addEventListener('input', updateRemaining);
        updateRemaining();
    });

    container.style.display = 'block';
}

document.getElementById('btn-lookup-date').addEventListener('click', async function () {
    const form = document.getElementById('vanguard-form');
    const formData = new FormData(form);

    try {
        const response = await fetch("api/lookup-packs/", {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]').value
            }
        });

        const data = await response.json();

        if (data.status === 'success' || data.status === 'warning') {
            if (data.ipn_list) {
                document.getElementById('ipn_list').value = data.ipn_list;
            }
            renderPackRecommendations(data.recommended_packs || []);
        } else {
            alert(data.message || 'An error occurred during lookup.');
        }
    } catch (error) {
        console.error('Error fetching recommendations:', error);
    }
});

document.getElementById('btn-alert-selected').addEventListener('click', function () {
    const selectedCheckboxes = document.querySelectorAll('.pack-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('No packs selected!');
        return;
    }

    const selectedSkus = Array.from(selectedCheckboxes).map(cb => cb.value);
    const packsTextarea = document.getElementById('packs');

    if (packsTextarea) {
        // Get existing text and trim extra whitespace
        const currentContent = packsTextarea.value.trim();
        const newSkusText = selectedSkus.join('\n');

        if (currentContent.length > 0) {
            // Append new SKUs on a new line if textarea already has text
            packsTextarea.value = `${currentContent}\n${newSkusText}`;
        } else {
            // Otherwise, set it directly
            packsTextarea.value = newSkusText;
        }

        // Optional: Smoothly scroll down to the textarea so the user sees the update
        packsTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        packsTextarea.focus();
    }
});

// Initial calculation for server-rendered items on page load
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.qty-input').forEach(input => {
        const id = input.id.replace('pack_qty_', 'remaining_');
        updateRemainingServerRender(input, id);
    });
});
