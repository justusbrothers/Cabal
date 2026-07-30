// js_modules/_config.js

// Read variables from global window context, or default to -1 if unassigned
window.upcColIndex = typeof window.upcColIndex === 'number' ? window.upcColIndex : -1;
window.retailColIndex = typeof window.retailColIndex === 'number' ? window.retailColIndex : -1;
window.qtyColIndex = typeof window.qtyColIndex === 'number' ? window.qtyColIndex : -1;

// --- DYNAMIC VARIANT SUBSYSTEM REGISTRY STATE ---
window.variantRegistry = window.variantRegistry || {};

// -----------------------------------------------------------------
// 1. THE SINGLE SOURCE OF TRUTH REGISTRY
// -----------------------------------------------------------------
const PUBLISHER_REGISTRY = [
    { name: 'Abstract Studio', code: 'ABS', prefixes: ['89317'], catId: 22, catLabel: 'Abstract Studio', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Action Lab Comics', code: 'ALC', prefixes: ['78430'], catId: 22, catLabel: 'Action Lab Comics', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Archie Comics', code: 'ARCH', prefixes: [], catId: 22, catLabel: 'Archie Comics (ARCH)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Bad Idea Studios', code: 'BAD', prefixes: ['85001'], catId: 22, catLabel: 'Indie (IND)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Boom! Studios', code: 'BOOM', prefixes: ['84428'], catId: 22, catLabel: 'Boom! Studios (BOOM)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Dark Horse Comics', code: 'DHC', prefixes: ['761568'], catId: 2, catLabel: 'Dark Horse Comics (DHC)', locId: 73, locLabel: 'Dark Horse Bin (73)' },
    { name: 'DC Comics', code: 'DC', prefixes: ['070989', '761941'], catId: 3, catLabel: 'DC Comics (DC)', locId: 91, locLabel: 'DC Bin (91)' },
    { name: 'Devil\'s Due Comics', code: 'DD', prefixes: ['68267'], catId: 22, catLabel: 'Indie (IND)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'DSTLRY', code: 'DST', prefixes: ['614'], catId: 22, catLabel: 'Indie (IND)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Dynamite Entertainment', code: 'DYN', prefixes: ['72513'], catId: 105, catLabel: 'Dynamite Entertainment (DYN)', locId: 94, locLabel: 'Dynamite Bin (94)' },
    { name: 'IDW Publishing', code: 'IDW', prefixes: ['827'], catId: 24, catLabel: 'IDW Publishing (IDW)', locId: 76, locLabel: 'IDW Bin (76)' },
    { name: 'Image Comics', code: 'IMG', prefixes: ['704', '709', '70985'], catId: 4, catLabel: 'Image Comics (IMG)', locId: 70, locLabel: 'Image Bin (70)' },
    { name: 'Indie Comics', code: 'IND', prefixes: [], catId: 22, catLabel: 'Indie (IND)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Iron Age Comics', code: 'IAC', prefixes: ['60554'], catId: 22, catLabel: 'Iron Age Comics', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Keenspot', code: 'KS', prefixes: ['60283'], catId: 110, catLabel: 'Keenspot (KS)', locId: 100, locLabel: 'Keenspot Bin (100)' },
    { name: 'Mad Cave Comics', code: 'MAD', prefixes: ['60196'], catId: 108, catLabel: 'Mad Cave Comics (MAD)', locId: 98, locLabel: 'Mad Cave Bin (98)' },
    { name: 'Marvel Comics', code: 'MAR', prefixes: ['071486', '59606', '759606'], catId: 5, catLabel: 'Marvel Comics (MAR)', locId: 66, locLabel: 'Marvel Bin (66)' },
    { name: 'Midnight Factory', code: 'MID', prefixes: ['78200'], catId: 22, catLabel: 'Midnight Factory', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Oni Press', code: 'ONI', prefixes: ['64985'], catId: 107, catLabel: 'Oni Press (ONI)', locId: 97, locLabel: 'Oni Press Bin (97)' },
    { name: 'Titan Comics', code: 'TIT', prefixes: ['65946'], catId: 22, catLabel: 'Titan Comics (TIT)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Udon', code: 'UDON', prefixes: ['855'], catId: 22, catLabel: 'Udon (UDON)', locId: 82, locLabel: 'Indie / Studio Boxes (82)' },
    { name: 'Valiant Entertainment', code: 'VAL', prefixes: [], catId: 23, catLabel: 'Valiant Entertainment (VAL)', locId: 80, locLabel: 'Valiant Bin (80)' },
    { name: 'Vault Comics', code: 'VAU', prefixes: ['85005'], catId: 109, catLabel: 'Vault Comics (VAU)', locId: 99, locLabel: 'Vault Bin (99)' },
    { name: 'Vertigo Comics', code: 'VER', prefixes: [], catId: 26, catLabel: 'Vertigo Comics (VER)', locId: 84, locLabel: 'Vertigo Storage (84)' }
];

// -----------------------------------------------------------------
// 2. RUNTIME COMPILATION ENGINE
// -----------------------------------------------------------------
// These dynamically construct the legacy data structures on load.
const PUBLISHER_CODES = {};
const PUBLISHER_UPC_PREFIXES = {};
const PUBLISHER_PART_CATEGORIES = {};
const PUBLISHER_STOCK_LOCATIONS = {};

const CATEGORIES_LIST = [];
const LOCATIONS_LIST = [];

// Track categories and locations we have already added to avoid duplicates
const seenCategories = new Set();
const seenLocations = new Set();

PUBLISHER_REGISTRY.forEach(pub => {
    // Build direct code map
    PUBLISHER_CODES[pub.name] = pub.code;
    
    // Build category maps
    PUBLISHER_PART_CATEGORIES[pub.code] = pub.catId;
    if (pub.catLabel && !seenCategories.has(pub.catId)) {
        seenCategories.add(pub.catId);
        CATEGORIES_LIST.push({ id: pub.catId, name: pub.catLabel });
    }
    
    // Build stock location maps
    PUBLISHER_STOCK_LOCATIONS[pub.code] = pub.locId;
    if (pub.locId && !seenLocations.has(pub.locId)) {
        seenLocations.add(pub.locId);
        // Fallback name if no explicit label is defined
        const locName = pub.locLabel || `${pub.name} Storage (${pub.locId})`; 
        LOCATIONS_LIST.push({ id: pub.locId, name: locName });
    }
    
    // Expand prefixes into flat mapper
    if (pub.prefixes && Array.isArray(pub.prefixes)) {
        pub.prefixes.forEach(prefix => {
            PUBLISHER_UPC_PREFIXES[prefix] = pub.code;
        });
    }
});

// Sort array dropdown lists nicely for layout rendering consistency
CATEGORIES_LIST.sort((a, b) => a.name.localeCompare(b.name));
LOCATIONS_LIST.sort((a, b) => a.name.localeCompare(b.name));
