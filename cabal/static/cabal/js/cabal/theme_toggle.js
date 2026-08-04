// /plugins/Cabal/cabal/static/cabal/js/cabal/theme_toggle.js

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');

    function setTheme(theme) {
        // 1. Update HTML theme attribute
        document.documentElement.setAttribute('data-bs-theme', theme);

        localStorage.setItem('cabal-theme', theme);

        // 2. Toggle Body Utility Classes
        if (theme === 'dark') {
            document.body.classList.remove('bg-light', 'text-dark');
            document.body.classList.add('bg-dark', 'text-light');
        } else {
            document.body.classList.remove('bg-dark', 'text-light');
            document.body.classList.add('bg-light', 'text-dark');
        }

        if (themeToggle) {
            themeToggle.checked = (theme === 'dark');
        }

        // 3. Post message to all child iframes (from parent frame)
        const iframes = document.querySelectorAll('.portal-viewport iframe');
        iframes.forEach(iframe => {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme: theme }, '*');
            }
        });
    }

    // Switch Toggle Event Listener
    if (themeToggle) {
        themeToggle.addEventListener('change', () => {
            const selectedTheme = themeToggle.checked ? 'dark' : 'light';
            setTheme(selectedTheme);
        });
    }

    // Initialize Theme from localStorage or System Preference
    const savedTheme = localStorage.getItem('cabal-theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    
    setTheme(savedTheme);

    // Notify iframes upon initial or lazy load
    document.querySelectorAll('.portal-viewport iframe').forEach(iframe => {
        iframe.addEventListener('load', () => {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'dark';
            iframe.contentWindow.postMessage({ type: 'THEME_CHANGE', theme: currentTheme }, '*');
        });
    });
});

// Listen for incoming THEME_CHANGE messages inside child iframes
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'THEME_CHANGE') {
        const theme = event.data.theme;

        // Update <html> tag
        document.documentElement.setAttribute('data-bs-theme', theme);

        // Update <body> classes
        if (theme === 'dark') {
            document.body.classList.remove('bg-light', 'text-dark');
            document.body.classList.add('bg-dark', 'text-light');
        } else {
            document.body.classList.remove('bg-dark', 'text-light');
            document.body.classList.add('bg-light', 'text-dark');
        }
    }
});
