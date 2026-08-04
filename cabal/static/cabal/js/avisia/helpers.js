// 🗓️ Format the raw date selection nicely
function getFormattedShowDate() {
    const rawDateTimeVal = document.getElementById('showDatePicker').value;
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
    const now = new Date();
    const diffDays = (now - txDate) / (1000 * 60 * 60 * 24);

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
    const variantsPool = templatesMatrix[templateId] || [];
    if (variantsPool.length === 0) return;

    const randomIndex = Math.floor(Math.random() * variantsPool.length);
    const chosenText = variantsPool[randomIndex];
    
    const messageTextarea = document.getElementById('bossLadyMessage');
    messageTextarea.value = chosenText;
}

function generateCustomMessageForUser(username) {
    const currentTextareaVal = document.getElementById('bossLadyMessage').value;
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
    event.preventDefault();
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
    textarea.style.position = 'fixed'; textarea.style.width = '1px'; textarea.style.height = '1px';
    document.body.appendChild(textarea);
    textarea.focus(); textarea.select();
    try { document.execCommand('copy'); } catch (err) { console.error(err); }
    document.body.removeChild(textarea);
}

function updateStatus(msg, type="info") {
    statusMessage.style.display = 'block';
    statusMessage.className = `alert alert-${type} mt-3`;
    statusMessage.innerText = msg;
}
