// /plugins/Cabal/cabal/static/cabal/js/cabal/style_sync.js

(function () {
    const isIframe = window.self !== window.top;
    const CONTEXT = isIframe ? '[CABAL IFRAME]' : '[CABAL PARENT]';

    // console.log(`${CONTEXT} style_sync.js initialized. Is iframe: ${isIframe}`);

    const ACCENT_COLORS = {
        red: { primary: '#dc3545', primaryRgb: '220, 53, 69', hover: '#bb2d3b' },
        green: { primary: '#198754', primaryRgb: '25, 135, 84', hover: '#157347' },
        blue: { primary: '#0d6efd', primaryRgb: '13, 110, 253', hover: '#0b5ed7' },
        orange: { primary: '#fd7e14', primaryRgb: '253, 126, 20', hover: '#e06b00' }
    };

    function generateAccentCSS(color) {
        return `
            :root, [data-bs-theme], body {
                --cabal-accent-color: ${color.primary} !important;
                --accent-color: ${color.primary} !important;
                --bs-primary: ${color.primary} !important;
                --bs-primary-rgb: ${color.primaryRgb} !important;
                --bs-link-color: ${color.primary} !important;
                --bs-link-hover-color: ${color.hover} !important;
                --bs-focus-ring-color: rgba(${color.primaryRgb}, 0.25) !important;
            }

            .text-primary, .text-accent { color: ${color.primary} !important; }
            .bg-primary, .bg-accent { background-color: ${color.primary} !important; }
            .border-primary, .border-accent { border-color: ${color.primary} !important; }

            .btn-primary, .btn-accent {
                --bs-btn-bg: ${color.primary} !important;
                --bs-btn-border-color: ${color.primary} !important;
                --bs-btn-hover-bg: ${color.hover} !important;
                --bs-btn-hover-border-color: ${color.hover} !important;
                --bs-btn-active-bg: ${color.hover} !important;
                --bs-btn-active-border-color: ${color.hover} !important;
                --bs-btn-focus-shadow-rgb: ${color.primaryRgb} !important;
                background-color: ${color.primary} !important;
                border-color: ${color.primary} !important;
            }

            .btn-outline-primary, .btn-outline-accent {
                color: ${color.primary} !important;
                border-color: ${color.primary} !important;
            }

            .btn-outline-primary:hover, .btn-outline-accent:hover {
                background-color: ${color.primary} !important;
                border-color: ${color.primary} !important;
                color: #ffffff !important;
            }

            .form-check-input:checked {
                background-color: ${color.primary} !important;
                border-color: ${color.primary} !important;
            }

            .nav-tab-btn.active {
                color: ${color.primary} !important;
            }

            .nav-tab-btn.active::after {
                background-color: ${color.primary} !important;
            }
        `;
    }

    function applyStylesToDocument(doc, state) {
        if (!doc || !doc.documentElement) {
            console.error(`${CONTEXT} Cannot apply styles: Target document or documentElement is null/undefined.`);

            return;
        }

        const { theme, accent } = state;
        // console.log(`${CONTEXT} Applying styles -> Theme: "${theme}", Accent: "${accent}"`);

        // 1. Theme Updates
        if (theme) {
            doc.documentElement.setAttribute('data-bs-theme', theme);

            if (doc.body) {
                if (theme === 'dark') {
                    doc.body.classList.remove('bg-light', 'text-dark');
                    doc.body.classList.add('bg-dark', 'text-light');
                } else {
                    doc.body.classList.remove('bg-dark', 'text-light');
                    doc.body.classList.add('bg-light', 'text-dark');
                }
            }
        }

        // 2. Accent Color Dynamic CSS Injection
        const activeAccent = ACCENT_COLORS[accent] ? accent : 'red';
        const color = ACCENT_COLORS[activeAccent];

        let styleTag = doc.getElementById('cabal-accent-styles');

        if (!styleTag) {
            // console.log(`${CONTEXT} Creating missing <style id="cabal-accent-styles"> element.`);

            styleTag = doc.createElement('style');
            styleTag.id = 'cabal-accent-styles';
            const targetHead = doc.head || doc.documentElement;
            targetHead.appendChild(styleTag);
        }

        styleTag.textContent = generateAccentCSS(color);
        doc.documentElement.setAttribute('data-cabal-accent', activeAccent);
        // console.log(`${CONTEXT} Dynamic CSS successfully written to <style id="cabal-accent-styles">.`);
    }

    function getStoredState() {
        const state = {
            theme: localStorage.getItem('cabal-theme') || 
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
            accent: localStorage.getItem('cabal-accent') || 'red'
        };

        // console.log(`${CONTEXT} Loaded stored state:`, state);

        return state;
    }

    // ==========================================
    // CHILD IFRAME CONTEXT
    // ==========================================
    if (isIframe) {
        const initialState = getStoredState();
        
        const initChild = () => {
            // console.log(`${CONTEXT} Executing child iframe initialization.`);

            applyStylesToDocument(document, initialState);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initChild);
        } else {
            initChild();
        }

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'CABAL_STYLE_UPDATE') {
                // console.log(`${CONTEXT} Valid CABAL_STYLE_UPDATE received inside iframe.`);

                applyStylesToDocument(document, event.data.payload);
            }
        });

        return;
    }

    // ==========================================
    // PARENT PORTAL CONTEXT
    // ==========================================
    let currentState = getStoredState();

    function syncState(partialState = {}) {
        // console.log(`${CONTEXT} syncState called with partialState:`, partialState);

        currentState = { ...currentState, ...partialState };

        if (partialState.theme) localStorage.setItem('cabal-theme', currentState.theme);
        if (partialState.accent) localStorage.setItem('cabal-accent', currentState.accent);

        applyStylesToDocument(document, currentState);
        updateControlUI(currentState);
        broadcastToIframes(currentState);
    }

    function broadcastToIframes(payload) {
        const iframes = document.querySelectorAll('.portal-viewport iframe');

        iframes.forEach((iframe, idx) => {
            // Direct DOM mutation (safely scoped)
            try {
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                    applyStylesToDocument(iframe.contentDocument, payload);
                }
            } catch (e) {
                console.warn(`${CONTEXT} Direct DOM access blocked on iframe [${idx}] (cross-origin or loading). Falling back to postMessage.`);
            }

            // PostMessage broadcast
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'CABAL_STYLE_UPDATE',
                    payload: payload
                }, '*');
            }
        });
    }

    function updateControlUI({ theme, accent }) {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.checked = (theme === 'dark');
        }

        const accentPicker = document.getElementById('accentPicker');
        if (accentPicker) {
            const buttons = accentPicker.querySelectorAll('.accent-option');
            buttons.forEach(btn => {
                const isActive = btn.getAttribute('data-accent') === accent;
                btn.classList.toggle('active', isActive);
                btn.classList.toggle('border-3', isActive);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        // console.log(`${CONTEXT} DOMContentLoaded fired on parent portal.`);
        
        syncState(currentState);

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('change', () => {
                syncState({ theme: themeToggle.checked ? 'dark' : 'light' });
            });
        }

        const accentPicker = document.getElementById('accentPicker');
        if (accentPicker) {
            accentPicker.addEventListener('click', (e) => {
                const btn = e.target.closest('.accent-option');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const accent = btn.getAttribute('data-accent');
                    if (accent) syncState({ accent });
                }
            });
        }

        document.querySelectorAll('.portal-viewport iframe').forEach((iframe, idx) => {
            iframe.addEventListener('load', () => {
                // console.log(`${CONTEXT} iframe [${idx}] (id="${iframe.id}") finished loading.`);

                try {
                    if (iframe.contentDocument) {
                        applyStylesToDocument(iframe.contentDocument, currentState);
                    }
                } catch (e) {}

                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        type: 'CABAL_STYLE_UPDATE',
                        payload: currentState
                    }, '*');
                }
            });
        });
    });
})();
