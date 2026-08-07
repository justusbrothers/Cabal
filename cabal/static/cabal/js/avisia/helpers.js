// /plugins/Cabal/cabal/static/cabal/js/avisia/helpers.js

// 🗓️ Format the raw date selection nicely
function getFormattedShowDate() {
    const rawDateTimeVal = document.getElementById('showDatePicker')?.value;
    if (!rawDateTimeVal) return "[Pick a Date & Time]";
    
    const dateObj = new Date(rawDateTimeVal);
    if (isNaN(dateObj.getTime())) return "[Pick a Date & Time]";

    const today = new Date();
    
    // Check if the picked date matches today's exact year, month, and day
    const isToday = dateObj.getFullYear() === today.getFullYear() &&
                    dateObj.getMonth() === today.getMonth() &&
                    dateObj.getDate() === today.getDate();

    if (isToday) {
        const hours = dateObj.getHours();
        if (hours < 12) {
            return "this morning";
        } else if (hours < 17) {
            return "this afternoon";
        } else {
            return "this evening";
        }
    }

    // 🌟 Default fallback: Beautiful long-form format if the show is on a different day
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const dayName = days[dateObj.getDay()];
    const monthName = months[dateObj.getMonth()];
    const dayNum = dateObj.getDate();
    
    let hours = dateObj.getHours();
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${dayName} ${monthName} ${dayNum} at ${hours}:${minutes} ${ampm}`;
}

function updateLiveDatePreview() {
    const previewDiv = document.getElementById('liveDatePreview');
    if (previewDiv) {
        previewDiv.innerHTML = `<i class="fas fa-clock me-1"></i> Format: ${getFormattedShowDate()}`;
    }
}

// 🌈 Generate UI color rings based on transaction age
function getColorCodedDateBadge(dateString) {
    if (!dateString) return `<span class="grid-badge-pill">N/A</span>`;
    
    let rainbowClass = "bubble-rainbow-1"; 
    const txDate = new Date(dateString);
    if (isNaN(txDate.getTime())) return `<span class="grid-badge-pill">${dateString}</span>`;

    const now = new Date();
    const diffDays = Math.floor((now - txDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 120) rainbowClass = "bubble-rainbow-5";
    else if (diffDays > 90) rainbowClass = "bubble-rainbow-4";
    else if (diffDays > 60) rainbowClass = "bubble-rainbow-3";
    else if (diffDays > 30) rainbowClass = "bubble-rainbow-2";
    else rainbowClass = "bubble-rainbow-1";

    return `
        <span class="girly-badge-pill">
            <span class="bubble-indicator ${rainbowClass}"></span>
            ${dateString}
        </span>
    `;
}

// 🪄 Core Message Customizer Engines
function applyQuickTemplate(templateId) {
    const variantsPool = (typeof templatesMatrix !== 'undefined' && templatesMatrix[templateId]) ? templatesMatrix[templateId] : [];
    if (variantsPool.length === 0) return;

    const randomIndex = Math.floor(Math.random() * variantsPool.length);
    const chosenText = variantsPool[randomIndex];
    
    const messageTextarea = document.getElementById('bossLadyMessage');
    if (messageTextarea) messageTextarea.value = chosenText;
}

function generateCustomMessageForUser(username) {
    const textareaEl = document.getElementById('bossLadyMessage');
    const currentTextareaVal = textareaEl ? textareaEl.value : '';
    const showLinkVal = document.getElementById('bossLadyShowLink') ? document.getElementById('bossLadyShowLink').value.trim() : '';
    const formattedDate = getFormattedShowDate();
    
    // 1. Process custom layout tags inside the body message
    let customizedBody = currentTextareaVal.replace(/{name}/g, username);
    customizedBody = customizedBody.replace(/{date}/g, formattedDate);
    
    // 🪄 Dynamic Grammatical Fix: Catch "on this evening", "on this afternoon", "on this morning"
    customizedBody = customizedBody.replace(/on this morning/gi, "this morning");
    customizedBody = customizedBody.replace(/on this afternoon/gi, "this afternoon");
    customizedBody = customizedBody.replace(/on this evening/gi, "this evening");
    
    // 2. Prepend the show link with a clean blank spacing line if provided
    if (showLinkVal) {
        return `${showLinkVal}\n\n${customizedBody}`;
    }
    
    return customizedBody;
}

// 📋 Clipboard Routines
function handleJustCopy(username) {
    const customizedMessage = generateCustomMessageForUser(username);
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(customizedMessage).catch(() => fallbackCopyText(customizedMessage));
    } else {
        fallbackCopyText(customizedMessage);
    }
}

function handleLinkAndCopy(event, username) {
    if (event) event.preventDefault();
    const customizedMessage = generateCustomMessageForUser(username);
    const targetUrl = `https://www.whatnot.com/user/${username}`;
    const newWindow = window.open('', '_blank');

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(customizedMessage)
            .then(() => { if (newWindow) newWindow.location.href = targetUrl; })
            .catch(() => {
                fallbackCopyText(customizedMessage);
                if (newWindow) newWindow.location.href = targetUrl;
            });
    } else {
        fallbackCopyText(customizedMessage);
        if (newWindow) newWindow.location.href = targetUrl;
    }
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; 
    textarea.style.width = '1px'; 
    textarea.style.height = '1px';
    document.body.appendChild(textarea);
    textarea.focus(); 
    textarea.select();
    try { document.execCommand('copy'); } catch (err) { console.error('Fallback copy failed:', err); }
    document.body.removeChild(textarea);
}

function updateStatus(msg, type="info") {
    const statusEl = document.getElementById('statusMessage');
    if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = `alert alert-${type} mt-3`;
        statusEl.innerText = msg;
    }
}

// 🔃 Table Column Sorting Engine
function sortData(storeKey, columnKey) {
    if (typeof sortDirections === 'undefined' || typeof runtimeCache === 'undefined') return;

    // 1. Initialize sort state for this table if it doesn't exist
    if (!sortDirections[storeKey]) {
        sortDirections[storeKey] = {};
    }

    // 2. Toggle sort direction (default to ascending on first click)
    const currentDir = sortDirections[storeKey][columnKey] === 'asc' ? 'desc' : 'asc';
    sortDirections[storeKey][columnKey] = currentDir;

    // 3. Sort the global runtime cache for this specific store (buyers or tippers)
    if (!Array.isArray(runtimeCache[storeKey])) return;

    runtimeCache[storeKey].sort((a, b) => {
        // Multi-case fallbacks for hosted API DB schema variants
        let valA = a[columnKey] ?? a[columnKey.toLowerCase()] ?? a[columnKey.toUpperCase()] ?? '';
        let valB = b[columnKey] ?? b[columnKey.toLowerCase()] ?? b[columnKey.toUpperCase()] ?? '';

        // Special handling for date columns
        const upperCol = columnKey.toUpperCase();
        if (upperCol === 'LAST_TRANSACTION' || upperCol === 'LAST_SEEN' || upperCol === 'DATE') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
            if (isNaN(valA)) valA = 0;
            if (isNaN(valB)) valB = 0;
        } else {
            // Standard string comparison for names and states
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
        }

        if (valA < valB) return currentDir === 'asc' ? -1 : 1;
        if (valA > valB) return currentDir === 'asc' ? 1 : -1;
        return 0;
    });

    // 4. Reset to page 1 and redraw the UI
    if (typeof currentPage !== 'undefined') {
        currentPage[storeKey] = 1;
    }
    if (typeof renderActiveTables === 'function') {
        renderActiveTables();
    }
}

/**
 * Toggles color bubble age filters for buyers or tippers.
 * 
 * @param {string} storeKey - 'buyers' or 'tippers'
 * @param {string|number} filterValue - Age bracket ('0-30', '31-60', '61-90', '91-120', '120+') or range index (1, 2, 3, 4, 5)
 * @param {HTMLElement} buttonElement - The clicked DOM button element
 */
function toggleBubbleFilter(storeKey, filterValue, buttonElement) {
    if (typeof activeBubbleFilters === 'undefined') {
        window.activeBubbleFilters = {};
    }

    const normFilterValue = String(filterValue).trim();
    const isCurrentlyActive = String(activeBubbleFilters[storeKey]) === normFilterValue;

    // Toggle off if already active, otherwise activate new filter
    if (isCurrentlyActive) {
        activeBubbleFilters[storeKey] = null;
    } else {
        activeBubbleFilters[storeKey] = normFilterValue;
    }

    // Update UI active button styling within the panel's button container
    const container = buttonElement ? (buttonElement.closest('.bubble-filter-group') || buttonElement.parentElement) : null;

    if (container) {
        container.querySelectorAll('button, .bubble-btn, .bubble-indicator').forEach(btn => {
            btn.classList.remove('active', 'btn-pink', 'active-bubble-border');
        });
    }

    if (!isCurrentlyActive && buttonElement) {
        buttonElement.classList.add('active', 'btn-pink', 'active-bubble-border');
    }

    // Reset to first page & redraw tables
    if (typeof currentPage !== 'undefined') {
        currentPage[storeKey] = 1;
    }
    if (typeof renderActiveTables === 'function') {
        renderActiveTables();
    }
}

/**
 * Validates whether a transaction date falls into the active bubble age bracket.
 * Supports numeric ranges (1-5), strings ("1"-"5"), CSS names ("rainbow-2"), and ranges ("31-60").
 * 
 * @param {string|null} dateString - Transaction date string
 * @param {string|number|null} filterValue - Active age filter range
 * @returns {boolean}
 */
function matchesBubbleFilter(dateString, filterValue) {
    if (!filterValue) return true;
    if (!dateString) return false;

    const txDate = new Date(dateString);
    if (isNaN(txDate.getTime())) return false;

    const now = new Date();
    const diffDays = Math.floor((now - txDate) / (1000 * 60 * 60 * 24));

    const val = String(filterValue).toLowerCase().trim();

    // 🟢 Green Bubble (0-30 Days)
    if (val === '1' || val === '0-30' || val === 'rainbow-1' || val === 'bubble-rainbow-1') {
        return diffDays <= 30;
    }
    // 🟡 Yellow Bubble (31-60 Days)
    if (val === '2' || val === '31-60' || val === 'rainbow-2' || val === 'bubble-rainbow-2') {
        return diffDays > 30 && diffDays <= 60;
    }
    // 🟠 Orange Bubble (61-90 Days)
    if (val === '3' || val === '61-90' || val === 'rainbow-3' || val === 'bubble-rainbow-3') {
        return diffDays > 60 && diffDays <= 90;
    }
    // 🔴 Red Bubble (91-120 Days)
    if (val === '4' || val === '91-120' || val === 'rainbow-4' || val === 'bubble-rainbow-4') {
        return diffDays > 90 && diffDays <= 120;
    }
    // 🟣 Dark / Extended Bubble (120+ Days)
    if (val === '5' || val === '120+' || val === 'rainbow-5' || val === 'bubble-rainbow-5') {
        return diffDays > 120;
    }

    return true;
}

// 🌐 Explicitly expose functions to global window object for inline HTML event safety
window.getFormattedShowDate = getFormattedShowDate;
window.updateLiveDatePreview = updateLiveDatePreview;
window.getColorCodedDateBadge = getColorCodedDateBadge;
window.applyQuickTemplate = applyQuickTemplate;
window.generateCustomMessageForUser = generateCustomMessageForUser;
window.handleJustCopy = handleJustCopy;
window.handleLinkAndCopy = handleLinkAndCopy;
window.fallbackCopyText = fallbackCopyText;
window.updateStatus = updateStatus;
window.sortData = sortData;
window.toggleBubbleFilter = toggleBubbleFilter;
window.matchesBubbleFilter = matchesBubbleFilter;
