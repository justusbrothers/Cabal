// /plugins/Cabal/cabal/static/cabal/js/vanguard/script.js

// btnAlertSelected.addEventListener('click', function () {
//     const selectedCheckboxes = document.querySelectorAll('.pack-checkbox:checked');
//     if (selectedCheckboxes.length === 0) {
//         alert('No packs selected!');
//         return;
//     }

//     const selectedIpns = Array.from(selectedCheckboxes).map(cb => cb.value);
//     const packsTextarea = document.getElementById('packs');

//     if (packsTextarea) {
//         // Get existing text and trim extra whitespace
//         const currentContent = packsTextarea.value.trim();
//         const newIpnsText = selectedIpns.join('\n');

//         if (currentContent.length > 0) {
//             // Append new IPNs on a new line if textarea already has text
//             packsTextarea.value = `${currentContent}\n${newIpnsText}`;
//         } else {
//             // Otherwise, set it directly
//             packsTextarea.value = newIpnsText;
//         }

//         // Optional: Smoothly scroll down to the textarea so the user sees the update
//         packsTextarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
//         packsTextarea.focus();
//     }
// });

// Initial calculation for server-rendered items on page load
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('vanguard-clear-all').addEventListener('click', function () {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_IPN_CONTENT_KEY);
        localStorage.removeItem(STORAGE_PACKS_CONTENT_KEY);

        return confirm('Are you sure you want to clear all input fields?');
    });
});
