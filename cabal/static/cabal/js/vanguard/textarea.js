// /plugins/Cabal/cabal/static/cabal/js/vanguard/textarea.js

document.addEventListener('DOMContentLoaded', function() {
    function getStoredTimestamps() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch(e) {
            return {};
        }
    }

    function saveStoredTimestamps(tsObj) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(tsObj));
        } catch(e) {}
    }

    // Save IPN textarea content to localStorage
    function saveIpnContent() {
        if (!ipnTextarea) return;
        try {
            localStorage.setItem(STORAGE_IPN_CONTENT_KEY, ipnTextarea.value);
        } catch(e) {}
    }

    function updateTimestamps(lines) {
        const tsObj = getStoredTimestamps();
        const now = Date.now();
        let modified = false;

        lines.forEach(line => {
            if (line && !tsObj[line]) {
                tsObj[line] = now;
                modified = true;
            }
        });

        if (modified) {
            saveStoredTimestamps(tsObj);
        }
    }

    function getCleanLines() {
        if (!ipnTextarea) return [];
        return ipnTextarea.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    }

    // Restore IPN content from localStorage on load if textarea is empty
    if (ipnTextarea && !ipnTextarea.value.trim()) {
        const savedIpn = localStorage.getItem(STORAGE_IPN_CONTENT_KEY);
        if (savedIpn) {
            ipnTextarea.value = savedIpn;
        }
    }

    // Trigger server API query when lookup date changes
    function triggerDateLookupQuery() {
        const lookupDate = lookupDateInput ? lookupDateInput.value : '';
        const addedSinceDate = dateFilterInput ? dateFilterInput.value : '';

        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';

        if (ipnTextarea) {
            ipnTextarea.value = '';
            saveIpnContent();
        }

        fetch('/plugin/cabal/vanguard/api/lookup-since/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                lookup_date: lookupDate,
                added_since: addedSinceDate
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success' && Array.isArray(data.ipns)) {
                updateTimestamps(data.ipns);
                ipnTextarea.value = data.ipns.join('\n');
                saveIpnContent();
                applyFilters();
            }
        })
        .catch(err => {
            console.error('Error fetching date lookup:', err);
        });
    }

    // Apply combined filters
    function applyFilters() {
        const lines = getCleanLines();
        updateTimestamps(lines);
        const tsObj = getStoredTimestamps();

        const textQuery = filterInput ? filterInput.value.toLowerCase().trim() : '';
        const dateVal = dateFilterInput ? dateFilterInput.value : '';
        const minTimestamp = dateVal ? new Date(dateVal + 'T00:00:00').getTime() : 0;

        const filtered = lines.filter(line => {
            const matchesText = !textQuery || line.toLowerCase().includes(textQuery);
            const itemTs = tsObj[line] || Date.now();
            const matchesDate = !dateVal || itemTs >= minTimestamp;

            return matchesText && matchesDate;
        });

        ipnTextarea.value = filtered.join('\n');
        // Note: Filtering updates the view textarea, but if you want to preserve the master list, 
        // saveIpnContent() will capture what's in view or you can choose to save before filtering.
    }

    // Sort A-Z row by row
    if (sortBtn && ipnTextarea) {
        sortBtn.addEventListener('click', function() {
            let lines = getCleanLines();
            updateTimestamps(lines);
            lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            ipnTextarea.value = lines.join('\n');
            saveIpnContent();
            if (filterInput) filterInput.value = '';
            if (dateFilterInput) dateFilterInput.value = '';
        });
    }

    // Listen for manual typing / changes in IPN textarea
    if (ipnTextarea) {
        ipnTextarea.addEventListener('input', function() {
            saveIpnContent();
        });
    }

    if (lookupDateBtn) {
        lookupDateBtn.addEventListener('click', function() {
            applyFilters();
            triggerDateLookupQuery();
        });
    }

    if (dateFilterInput) {
        dateFilterInput.addEventListener('change', function() {
            applyFilters();
            triggerDateLookupQuery();
        });
    }

    if (clearFilterBtn && filterInput) {
        clearFilterBtn.addEventListener('click', function() {
            filterInput.value = '';
            applyFilters();
        });
    }

    if (clearDateBtn && dateFilterInput) {
        clearDateBtn.addEventListener('click', function() {
            dateFilterInput.value = '';
            applyFilters();
        });
    }

    // Populate initial timestamps on load
    updateTimestamps(getCleanLines());

    window.VanguardTextArea = {
        updateTimestamps,
        getCleanLines,
        applyFilters,
        saveIpnContent
    };
});
