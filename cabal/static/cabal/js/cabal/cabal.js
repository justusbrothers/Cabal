// /plugins/Cabal/cabal/static/cabal/js/cabal/cabal.js

document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.nav-tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(tabButton => {
        tabButton.addEventListener('click', () => {
            const targetId = tabButton.getAttribute('data-target');

            // Remove active state from all buttons & panels
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Activate selected button & panel
            tabButton.classList.add('active');

            const targetPanel = document.getElementById(targetId);

            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
});
