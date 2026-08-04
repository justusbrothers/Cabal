// /plugins/Cabal/cabal/static/cabal/js/avisia/config.js

// Initialize IndexedDB Pipeline
const request = indexedDB.open("CustomerExporterDB", 1);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if(!db.objectStoreNames.contains("buyers")) db.createObjectStore("buyers", { keyPath: "BUYER_NAME" });
    if(!db.objectStoreNames.contains("tippers")) db.createObjectStore("tippers", { keyPath: "BUYER_NAME" });
};

request.onsuccess = function(e) { 
    db = e.target.result; 
    loadTablesFromDB();
};

const getAllStoreData = (storeName) => {
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });
};

async function loadTablesFromDB() {
    const rawBuyers = await getAllStoreData("buyers");
    const rawTippers = await getAllStoreData("tippers");

    runtimeCache.buyers = rawBuyers.filter(row => !nameBlacklist.includes((row.BUYER_NAME || '').toLowerCase().trim()));
    runtimeCache.tippers = rawTippers.filter(row => !nameBlacklist.includes((row.BUYER_NAME || '').toLowerCase().trim()));

    document.getElementById('buyerCountDisplay').innerText = runtimeCache.buyers.length;
    document.getElementById('tipperCountDisplay').innerText = runtimeCache.tippers.length;

    if(runtimeCache.buyers.length > 0 || runtimeCache.tippers.length > 0) {
        document.getElementById('dataViewerCard').classList.remove('d-none');
        document.getElementById('exportBtn').disabled = false;
        renderActiveTables();
    }
}

function handleDeleteDatabase() {
    if (!confirm("Are you sure you want to completely delete the saved customer cache?")) return;

    const tx = db.transaction(["buyers", "tippers"], "readwrite");
    tx.objectStore("buyers").clear();
    tx.objectStore("tippers").clear();

    tx.oncomplete = () => {
        updateStatus("Local browser cache has been completely cleared.", "info");
        runtimeCache.buyers = []; runtimeCache.tippers = [];
        document.getElementById('buyerCountDisplay').innerText = "0";
        document.getElementById('tipperCountDisplay').innerText = "0";
        document.getElementById('dataViewerCard').classList.add('d-none');
        document.getElementById('exportBtn').disabled = true;
        document.getElementById('csvFile').value = ""; 
        document.getElementById('processBtn').disabled = true;
        renderActiveTables();
    };
}
