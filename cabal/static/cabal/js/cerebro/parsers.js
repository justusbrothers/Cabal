// /plugins/Cabal/cabal/static/cabal/js/cerebro/parsers.js

// ==========================================
// INDEXEDDB CONFIGURATION & HANDLERS
// ==========================================
window.db = null;
const dbName = "NexusDB";
const storeName = "orders";

const dbRequest = indexedDB.open(dbName, 1);

dbRequest.onupgradeneeded = function(e) {
  const database = e.target.result;
  const store = database.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
  store.createIndex("focDate", "focDate", { unique: false });
  store.createIndex("uniqueOrderKey", "uniqueOrderKey", { unique: true });
};

dbRequest.onsuccess = function(e) {
  window.db = e.target.result;
  console.log("Database initialized successfully!");
  
  // Target the upcoming Wednesday's FOC Date upon database initialization
  const defaultFoc = window.getUpcomingWednesdayString();
  window.loadStoredDataAndRender(defaultFoc);
};

dbRequest.onerror = function(e) {
  console.error("Database failed to open:", e.target.error);
};

// Loads database items, configures dropdown filters, and loads active UI views
window.loadStoredDataAndRender = function(targetFocFilter = null) {
  if (!window.db) return;
  
  // If no target filter is passed, default dynamically to the upcoming Wednesday
  if (!targetFocFilter) {
    targetFocFilter = window.getUpcomingWednesdayString();
  }

  const transaction = window.db.transaction([storeName], "readonly");
  const store = transaction.objectStore(storeName);
  const request = store.getAll();

  request.onsuccess = function() {
    window.rawParsedData = request.result;

    if (window.rawParsedData.length > 0) {
      // Find unique FOC weeks to generate filtering choices
      const uniqueFocWeeks = [...new Set(window.rawParsedData.map(r => r.focDate))].sort();
      
      // Render dynamic FOC Week dropdown elements
      let filterHtml = `<option value="all" ${targetFocFilter === 'all' ? 'selected' : ''}>📅 All Weeks</option>`;
      uniqueFocWeeks.forEach(week => {
        filterHtml += `<option value="${week}" ${targetFocFilter === week ? 'selected' : ''}>📅 Week of ${week}</option>`;
      });
      document.getElementById('focFilterSelect').innerHTML = filterHtml;

      // Apply selected dropdown filter option
      if (targetFocFilter === "all") {
        window.filteredRows = [...window.rawParsedData];
      } else {
        window.filteredRows = window.rawParsedData.filter(item => item.focDate === targetFocFilter);
      }

      window.processAndGroupOrders(window.filteredRows);

      document.getElementById('previewCard').classList.remove('d-none');
      document.getElementById('actionsCard').classList.remove('d-none');
    } else {
      // Reset everything if database is wiped clean
      document.getElementById('previewCard').classList.add('d-none');
      document.getElementById('actionsCard').classList.add('d-none');
      document.getElementById('focFilterSelect').innerHTML = `<option value="all">📅 All Weeks</option>`;
    }
  };
};

// Dynamic status update for checkboxes directly into IndexedDB
window.updateItemStateInDB = function(customer, comic, lunarCode, upcCode, checked) {
  if (!window.db) return;
  const transaction = window.db.transaction([storeName], "readwrite");
  const store = transaction.objectStore(storeName);
  
  const request = store.getAll();
  request.onsuccess = function() {
    const records = request.result;
    const targetRecord = records.find(item => {
      return item.customer === customer && 
             item.comic === comic && 
             (item.lunar === lunarCode || item.upc === upcCode);
    });

    if (targetRecord) {
      targetRecord.checked = checked;
      store.put(targetRecord);
    }
  };
};

// Wipes all records from database store
window.wipeDatabaseStore = function(callback) {
  if (!window.db) return;
  const transaction = window.db.transaction([storeName], "readwrite");
  const store = transaction.objectStore(storeName);
  const clearRequest = store.clear();
  clearRequest.onsuccess = () => {
    if (callback) callback();
  };
};

// ==========================================
// PARSING & CORE IMPORT PIPELINE
// ==========================================
window.handleFile = function(file) {
  document.getElementById('fileNameDisplay').innerText = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    window.parseCSV(e.target.result);
  };
  reader.readAsText(file);
};

window.parseCSV = function(text) {
  const rows = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    let nextChar = text[i+1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') { row[row.length - 1] += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') { i++; }
      rows.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') { rows.push(row); }

  const headers = rows[0].map(h => h.trim());
  const incomingData = [];
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length < headers.length) continue;
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    incomingData.push(obj);
  }

  window.saveAndMergeWithDB(incomingData);
};

window.saveAndMergeWithDB = function(incomingRows) {
  if (!window.db || incomingRows.length === 0) return;

  const incomingFocDates = [...new Set(incomingRows.map(row => row["FOC Date"] || "N/A"))];
  const transaction = window.db.transaction([storeName], "readwrite");
  const store = transaction.objectStore(storeName);
  const index = store.index("focDate");

  let itemsToDelete = [];

  incomingFocDates.forEach(date => {
    const range = IDBKeyRange.only(date);
    index.openCursor(range).onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        itemsToDelete.push(cursor.value.id);
        cursor.continue();
      } else {
        executeWipeAndSave();
      }
    };
  });

  let runsCount = 0;
  function executeWipeAndSave() {
    runsCount++;
    if (runsCount < incomingFocDates.length) return;

    const deleteTx = window.db.transaction([storeName], "readwrite");
    const deleteStore = deleteTx.objectStore(storeName);

    itemsToDelete.forEach(id => deleteStore.delete(id));

    deleteTx.oncomplete = function() {
      const saveTx = window.db.transaction([storeName], "readwrite");
      const saveStore = saveTx.objectStore(storeName);

      incomingRows.forEach(row => {
        const lunar = (row["Lunar"] || "").trim();
        const upc = (row["UPC/ISBN10"] || "").trim();
        const comic = row["Comic"];
        const customer = row["Customer"] || "Unknown";
        
        saveStore.add({
          customer: customer,
          email: row["Customer Email"] || "N/A",
          phone: row["Customer Phone"] || "N/A",
          code: row["Customer Code"] || "N/A",
          comic: comic,
          publisher: row["Publisher"] || "",
          lunar: lunar,
          upc: upc,
          qty: parseInt(row["Quantity"]) || 1,
          price: row["Our Price"] || "0.00",
          focDate: row["FOC Date"] || "N/A",
          checked: false,
          uniqueOrderKey: `${customer}_${comic}_${lunar || upc}_${row["FOC Date"] || "N/A"}`
        });
      });

      saveTx.oncomplete = function() {
        console.log("Database update completed successfully.");
        
        // After data merge, default selection to incoming FOC date 
        window.loadStoredDataAndRender(incomingFocDates[0]);
      };
    };
  }
};

// Grouping engine working strictly on currently filtered data rows
window.processAndGroupOrders = function(data) {
  window.parsedCustomers = {};
  window.lunarOrders = {};
  window.penguinOrders = {};
  
  data.forEach(item => {
    const comic = item.comic;
    const publisher = item.publisher || "";
    const lunar = (item.lunar || "").trim();
    const upc = (item.upc || "").trim();
    const qty = item.qty;
    const price = item.price || "0.00";
    const customer = item.customer || "Unknown";
    const focDate = item.focDate || "N/A";
    const isChecked = item.checked || false;

    if (lunar) {
      if (!window.lunarOrders[lunar]) {
        window.lunarOrders[lunar] = { comic, publisher, lunar, qty: 0, price, focDate, checked: true, customers: {} };
      }
      window.lunarOrders[lunar].qty += qty;
      window.lunarOrders[lunar].customers[customer] = (window.lunarOrders[lunar].customers[customer] || 0) + qty;
      if (!isChecked) window.lunarOrders[lunar].checked = false;
    } else {
      const key = upc || comic;
      if (!window.penguinOrders[key]) {
        window.penguinOrders[key] = { comic, publisher, upc, qty: 0, price, focDate, checked: true, customers: {} };
      }
      window.penguinOrders[key].qty += qty;
      window.penguinOrders[key].customers[customer] = (window.penguinOrders[key].customers[customer] || 0) + qty;
      if (!isChecked) window.penguinOrders[key].checked = false;
    }

    if (!window.parsedCustomers[customer]) {
      window.parsedCustomers[customer] = {
        info: {
          email: item.email || "N/A",
          phone: item.phone || "N/A",
          code: item.code || "N/A"
        },
        items: []
      };
    }
    window.parsedCustomers[customer].items.push({ comic, publisher, lunar, upc, qty, price, focDate, checked: isChecked });
  });

  window.displayPreviews();
};
