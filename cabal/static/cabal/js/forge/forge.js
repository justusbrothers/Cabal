// /plugins/Cabal/cabal/static/cabal/js/forge/forge.js

document.addEventListener('DOMContentLoaded', async function() {
    // Safely resolve Cabal whether running standalone or inside an iframe
    const Cabal = window.Cabal || window.parent?.Cabal || window.top?.Cabal;

    if (Cabal) {
        console.log("Successfully accessed parent's Cabal instance!", Cabal);
    } else {
        console.warn("Cabal object not found on parent or local scope.");
    }

    // Helper to safely access Cabal shared config from inside an iframe
    function getCabalConfig() {
        return window.CabalConfig || (window.parent && window.parent.CabalConfig) || {};
    }

    // Example usage inside your sub-app scripts:
    const config = getCabalConfig();
    const publishers = config.PUBLISHER_REGISTRY || [];
    const categories = config.CATEGORIES_LIST || [];
    const locations = config.LOCATIONS_LIST || [];
    const publisherupcprefixes = config.PUBLISHER_UPC_PREFIXES || [];

    console.log("Loaded Publishers in Iframe:", publishers.length);
    console.log('publishers', publishers);
    console.log('categories', categories);
    console.log('locations', locations);

    const form = document.getElementById('forge-form');
    const submitBtn = document.getElementById('forge-submit-btn');
    const logBox = document.getElementById('forge-log');

    // DOM Elements
    const publisherSelect = document.getElementById('forge-publisher');
    const categorySelect = document.getElementById('forge-category');
    const locationSelect = document.getElementById('forge-location');
    const upcInput = document.getElementById('forge-upc');
    const dryRunCheckbox = document.getElementById('forge-dry-run');
    
    // Preview Elements
    const imageInput = document.getElementById('forge-image');
    const imagePreview = document.getElementById('forge-image-preview');
    const previewPlaceholder = document.getElementById('preview-placeholder');

    // Simple visual logger
    function logOutput(msg) {
        console.log(msg);

        const p = document.createElement('div');
        p.textContent = `> ${msg}`;
        
        logBox.style.display = 'block';
        logBox.appendChild(p);
        logBox.scrollTop = logBox.scrollHeight;
    }

    // Live Image Preview Listener
    imageInput.addEventListener('input', function() {
        const url = imageInput.value.trim();
        if (url) {
            imagePreview.src = url;
            imagePreview.style.display = 'block';
            previewPlaceholder.style.display = 'none';

            // Handle bad image links gracefully
            imagePreview.onerror = function() {
                imagePreview.style.display = 'none';
                previewPlaceholder.style.display = 'block';
                previewPlaceholder.innerHTML = '<i class="fas fa-exclamation-triangle fa-2x text-warning mb-2"></i><p class="text-danger small mb-0">Failed to load image from URL.</p>';
            };
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            previewPlaceholder.style.display = 'block';
            previewPlaceholder.innerHTML = '<i class="fas fa-book-open fa-3x mb-3"></i><p class="mb-0">Enter an Image URL to preview the issue cover art.</p>';
        }
    });

    // 1. Populate Dropdowns using _config.js
    function initializeConfigData() {
        if (typeof publishers !== 'undefined') {
            publisherSelect.innerHTML = '<option value="">Select Publisher...</option>';

            publishers.forEach(pub => {
                const opt = document.createElement('option');

                opt.value = pub.code;
                opt.textContent = `${pub.name} (${pub.code})`;
                opt.dataset.catId = pub.catId;
                opt.dataset.locId = pub.locId;

                publisherSelect.appendChild(opt);
            });
        }

        if (typeof categories !== 'undefined') {
            categorySelect.innerHTML = '<option value="">Select Category...</option>';

            categories.forEach(cat => {
                const opt = document.createElement('option');

                opt.value = cat.id;
                opt.textContent = `${cat.name} (ID: ${cat.id})`;

                categorySelect.appendChild(opt);
            });
        }

        if (typeof locations !== 'undefined') {
            locationSelect.innerHTML = '<option value="">Select Location...</option>';

            locations.forEach(loc => {
                const opt = document.createElement('option');

                opt.value = loc.id;
                opt.textContent = `${loc.name}`;

                locationSelect.appendChild(opt);
            });
        }
    }

    // 2. Auto-bind Category and Location when Publisher changes
    publisherSelect.addEventListener('change', function() {
        const selectedOption = publisherSelect.options[publisherSelect.selectedIndex];
        if (!selectedOption.value) return;

        const catId = selectedOption.dataset.catId;
        const locId = selectedOption.dataset.locId;

        if (catId) categorySelect.value = catId;
        if (locId) locationSelect.value = locId;

        logOutput(`Auto-mapped category to ID ${catId} and location to ID ${locId} for ${selectedOption.textContent}`);
    });

    // 3. Auto-detect publisher by UPC prefix
    upcInput.addEventListener('input', function() {
        const upcVal = upcInput.value.trim();

        if (upcVal.length >= 5 && typeof publisherupcprefixes !== 'undefined') {
            for (let len = 6; len >= 3; len--) {
                const prefix = upcVal.substring(0, len);

                if (publisherupcprefixes[prefix]) {
                    const matchedCode = publisherupcprefixes[prefix];

                    publisherSelect.value = matchedCode;
                    publisherSelect.dispatchEvent(new Event('change'));

                    logOutput(`Detected publisher code '${matchedCode}' via UPC prefix '${prefix}'`);

                    break;
                }
            }
        }
    });

    initializeConfigData();

    // 4. Form Submission Handler
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const isDryRun = dryRunCheckbox ? dryRunCheckbox.checked : false;

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${isDryRun ? 'Simulating Forge...' : 'Forging...'}`;
        logBox.innerHTML = '';

        const title = document.getElementById('forge-title').value.trim();
        const publisherCode = publisherSelect.value;
        const selectedPubOption = publisherSelect.options[publisherSelect.selectedIndex];
        const publisherName = selectedPubOption ? selectedPubOption.textContent.split(' (')[0] : publisherCode;

        const payload = {
            metadata: {
                publisher: publisherName,
                publisher_code: publisherCode,
                condition: document.getElementById('forge-condition').value,
                store_date: document.getElementById('forge-store-date').value,
                upc: upcInput.value
            },
            part: {
                name: title,
                description: document.getElementById('forge-description').value,
                IPN: document.getElementById('forge-ipn').value || null,
                barcode: upcInput.value || null,
                category: parseInt(categorySelect.value) || null,
                image_url: document.getElementById('forge-image').value
            },
            pricing: {
                retail_price: parseFloat(document.getElementById('forge-retail-price').value) || null,
                discounted_price: parseFloat(document.getElementById('forge-discounted-price').value) || null,
                listed_on_whatnot: document.getElementById('forge-whatnot-listed').checked
            },
            stock: {
                quantity: parseInt(document.getElementById('forge-quantity').value) || 0,
                location: parseInt(locationSelect.value) || null
            }
        };

        logOutput(`Starting ${isDryRun ? '[DRY RUN] ' : ''}Forge for: ${title}...`);

        console.log('Cabal', Cabal);

        try {
            const result = await Cabal.createInvenTreePartAndStock(payload, isDryRun, logOutput);
            
            if (result.success) {
                logOutput(`✅ ${isDryRun ? '[DRY RUN SUCCESS]' : 'Successfully forged'} Part #${result.data?.part?.pk || result.data?.part?.id || 'Simulation'}`);
            } else {
                logOutput(`❌ Failed: ${result.message}`);
            }
        } catch (err) {
            logOutput(`💥 System Error: ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-hammer me-2"></i>Forge into Inventory';
        }
    });
});
