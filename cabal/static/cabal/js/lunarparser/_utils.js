// js_modules/_utils.js
function showTemporaryCheckmark(buttonElem) {
    const originalText = buttonElem.innerHTML;
    buttonElem.innerHTML = "✓";
    buttonElem.classList.remove("btn-outline-secondary");
    buttonElem.classList.add("btn-success", "text-white");
    
    setTimeout(() => {
        buttonElem.innerHTML = originalText;
        buttonElem.classList.remove("btn-success", "text-white");
        buttonElem.classList.add("btn-outline-secondary");
    }, 1200);
}

function fallbackInlineCopy(text, buttonElem) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-99999px';
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand('copy');
        showTemporaryCheckmark(buttonElem);
    } catch (err) {
        console.error('Inline copy fallback error: ', err);
    }
    document.body.removeChild(el);
}

/**
 * Appends a freshly imported IPN to the dashboard session log.
 * @param {string} ipn - The IPN string to record.
 */
function logSessionIpn(ipn) {
    const logTextArea = document.getElementById('sessionIpnLog');
    if (!logTextArea || !ipn) return;
    
    // Append the IPN on a new line (trimming any leading whitespace)
    const currentVal = logTextArea.value;
    logTextArea.value = currentVal ? `${currentVal}\n${ipn}` : ipn;
    
    // Auto-scroll to the bottom so the newest addition is always visible
    logTextArea.scrollTop = logTextArea.scrollHeight;
}

/**
 * Dynamic parameter syncing matching comic_scanner logic.
 * Handles automatic GET verification followed by either a PATCH or POST.
 */
function ensureParameter(partPk, templateName, value, isBoolean, templatePk, csrfToken) {
    if (!partPk || !templatePk) return Promise.resolve();

    const headers = {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken
    };

    // 1. Replicate value string formatting adjustments
    let dataValue = isBoolean
        ? (value === true || value === 'true' ? 'true' : 'false')
        : String(value || '').trim();

    // 2. Short-circuit conditional skips
    if (isBoolean && dataValue === 'false') return Promise.resolve();
    if (!isBoolean && !dataValue) return Promise.resolve();

    // 3. Query existing entries to prevent integrity conflicts
    return fetch(`/api/parameter/?model_id=${partPk}&template=${templatePk}`, {
        method: 'GET',
        headers: headers
    })
    .then(res => res.json())
    .then(data => {
        const existingItems = data.results || data || [];
        const hasExisting = (data.count > 0 || existingItems.length > 0);

        if (hasExisting) {
            // Update mode (PATCH)
            const paramId = existingItems[0].pk;
            return fetch(`/api/parameter/${paramId}/`, {
                method: 'PATCH',
                headers: headers,
                body: JSON.stringify({ data: dataValue })
            });
        } else {
            // Creation mode (POST)
            return fetch('/api/parameter/', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model_type: 'part.part',
                    model_id: partPk,
                    template: templatePk,
                    data: dataValue
                })
            });
        }
    })
    .then(res => {
        if (!res.ok) console.warn(`Failed mapping parameter asset connection for template ID: ${templatePk}`);
    })
    .catch(err => {
        console.error(`Pipeline runtime parameter synchronization failure for ${templateName}:`, err);
    });
}
