// /plugins/Cabal/cabal/static/cabal/js/cabal/accent_picker.js

document.addEventListener('DOMContentLoaded', () => {
    const accentButtons = document.querySelectorAll('.accent-option');
    
    const accentColors = {
        red: '#dc3545',
        green: '#198754',
        blue: '#0d6efd',
        orange: '#fd7e14'
    };

    let activeAccentColor = '';

    // Apply accent variables and attributes to current window
    function applyAccentToDOM(colorName, hex = null) {
        const selectedColor = hex || accentColors[colorName] || accentColors.red;
        activeAccentColor = colorName;

        document.documentElement.setAttribute('data-accent', colorName);
        document.documentElement.style.setProperty('--cabal-accent-color', selectedColor);

        // Update active class/styles on UI buttons if present in current document
        accentButtons.forEach(btn => {
            if (btn.dataset.accent === colorName) {
                btn.classList.add('active', 'ring');
                btn.style.outline = '2px solid ' + selectedColor;
            } else {
                btn.classList.remove('active', 'ring');
                btn.style.outline = 'none';
            }
        });
    }

    // Broadcast current accent to all portal iframes (from parent frame)
    function sendAccentToIframes(iframe = null) {
        const message = {
            type: 'ACCENT_CHANGE',
            accent: activeAccentColor,
            accentHex: accentColors[activeAccentColor] || accentColors.red
        };

        if (iframe) {
            iframe.contentWindow?.postMessage(message, '*');
        } else {
            document.querySelectorAll('.portal-viewport iframe').forEach(frame => {
                frame.contentWindow?.postMessage(message, '*');
            });
        }
    }

    function setAccentColor(colorName) {
        applyAccentToDOM(colorName);

        // Save preference
        localStorage.setItem('cabal-accent-color', colorName);

        // Broadcast accent change to iframes
        sendAccentToIframes();
    }

    // Attach click handlers for UI elements if present
    accentButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Keep dropdown open on selection
            setAccentColor(btn.dataset.accent);
        });
    });

    // Load saved accent or default to 'red'
    const savedAccent = localStorage.getItem('cabal-accent-color') || 'red';
    applyAccentToDOM(savedAccent);

    // Send accent details when an iframe finishes loading
    document.querySelectorAll('.portal-viewport iframe').forEach(iframe => {
        iframe.addEventListener('load', () => {
            sendAccentToIframes(iframe);
        });
    });
});

// Listen for incoming ACCENT_CHANGE messages inside child iframes
window.addEventListener('message', (event) => {
    if (event.data?.type === 'ACCENT_CHANGE') {
        const { accent, accentHex } = event.data;
        
        document.documentElement.setAttribute('data-accent', accent);
        if (accentHex) {
            document.documentElement.style.setProperty('--cabal-accent-color', accentHex);
        }
    }
});
