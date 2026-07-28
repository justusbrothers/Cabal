// Complete application dataset
let rawParsedData = [];       // Complete original rows loaded from DB
let filteredRows = [];        // Currently selected subset (filtered by selected FOC week)

let parsedCustomers = {};     // Grouped by customer (filtered)
let lunarOrders = {};         // Aggregated Lunar orders (filtered)
let penguinOrders = {};       // Aggregated Penguin orders (filtered)

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('csvFileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const actionsCard = document.getElementById('actionsCard');
const previewCard = document.getElementById('previewCard');

const customerSortSelect = document.getElementById('customerSortSelect');
const focFilterSelect = document.getElementById('focFilterSelect');
const customerCountDisplay = document.getElementById('customerCountDisplay');
const accordion = document.getElementById('customerAccordion');
const lunarTableBody = document.getElementById('lunarTableBody');
const penguinTableBody = document.getElementById('penguinTableBody');
const btnWipeDb = document.getElementById('btnWipeDb');

// Dark Mode Interactivity Elements
const htmlTag = document.documentElement;
const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');
const themeLabel = document.getElementById('themeLabel');

themeToggleCheckbox.addEventListener('change', () => {
  if (themeToggleCheckbox.checked) {
    htmlTag.setAttribute('data-bs-theme', 'dark');
    themeLabel.innerText = '🌙 Dark Mode';
  } else {
    htmlTag.setAttribute('data-bs-theme', 'light');
    themeLabel.innerText = '☀️ Light Mode';
  }
});

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => { 
  e.preventDefault(); 
  const isDark = htmlTag.getAttribute('data-bs-theme') === 'dark';
  dropZone.style.backgroundColor = isDark ? '#22324d' : '#e3efff'; 
});
dropZone.addEventListener('dragleave', () => {
  const isDark = htmlTag.getAttribute('data-bs-theme') === 'dark';
  dropZone.style.backgroundColor = isDark ? '#1a2436' : '#f1f7ff';
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  const isDark = htmlTag.getAttribute('data-bs-theme') === 'dark';
  dropZone.style.backgroundColor = isDark ? '#1a2436' : '#f1f7ff';
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

const sortBoxContainer = document.getElementById('sortBoxContainer');
const tabElements = document.querySelectorAll('button[data-bs-toggle="tab"]');

tabElements.forEach(tab => {
  tab.addEventListener('shown.bs.tab', (e) => {
    if (e.target.id === 'customers-tab') {
      sortBoxContainer.classList.remove('d-none');
    } else {
      sortBoxContainer.classList.add('d-none');
    }
  });
});

// ==========================================
// INDEXEDDB CONFIGURATION & HANDLERS
// ==========================================
let db;
const dbName = "LunarParserDB";
const storeName = "orders";

const dbRequest = indexedDB.open(dbName, 1);

dbRequest.onupgradeneeded = function(e) {
  const database = e.target.result;
  const store = database.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
  store.createIndex("focDate", "focDate", { unique: false });
  store.createIndex("uniqueOrderKey", "uniqueOrderKey", { unique: true });
};

dbRequest.onsuccess = function(e) {
  db = e.target.result;
  console.log("Database initialized successfully!");
  loadStoredDataAndRender();
};

dbRequest.onerror = function(e) {
  console.error("Database failed to open:", e.target.error);
};

// Loads database items, configures dropdown filters, and loads active UI views
function loadStoredDataAndRender(targetFocFilter = "all") {
  if (!db) return;
  const transaction = db.transaction([storeName], "readonly");
  const store = transaction.objectStore(storeName);
  const request = store.getAll();

  request.onsuccess = function() {
    rawParsedData = request.result;

    if (rawParsedData.length > 0) {
      // Find unique FOC weeks to generate filtering choices
      const uniqueFocWeeks = [...new Set(rawParsedData.map(r => r.focDate))].sort();
      
      // Render dynamic FOC Week dropdown elements
      let filterHtml = `<option value="all" ${targetFocFilter === 'all' ? 'selected' : ''}>📅 All Weeks</option>`;
      uniqueFocWeeks.forEach(week => {
        filterHtml += `<option value="${week}" ${targetFocFilter === week ? 'selected' : ''}>📅 Week of ${week}</option>`;
      });
      focFilterSelect.innerHTML = filterHtml;

      // Apply selected dropdown filter option
      if (targetFocFilter === "all") {
        filteredRows = [...rawParsedData];
      } else {
        filteredRows = rawParsedData.filter(item => item.focDate === targetFocFilter);
      }

      processAndGroupOrders(filteredRows);

      previewCard.classList.remove('d-none');
      actionsCard.classList.remove('d-none');
    } else {
      // Reset everything if database is wiped clean
      previewCard.classList.add('d-none');
      actionsCard.classList.add('d-none');
      focFilterSelect.innerHTML = `<option value="all">📅 All Weeks</option>`;
    }
  };
}

// Wipes all records from the database
btnWipeDb.addEventListener('click', () => {
  if (confirm("Are you sure you want to completely wipe all stored orders and checklists?")) {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const clearRequest = store.clear();
    
    clearRequest.onsuccess = () => {
      fileNameDisplay.innerText = "";
      loadStoredDataAndRender();
    };
  }
});

// Track FOC filter dropdown updates
focFilterSelect.addEventListener('change', (e) => {
  loadStoredDataAndRender(e.target.value);
});

// Dynamic status update for checkboxes directly into IndexedDB
function updateItemStateInDB(customer, comic, lunarCode, upcCode, checked) {
  if (!db) return;
  const transaction = db.transaction([storeName], "readwrite");
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
}

// ==========================================
// PARSING & CORE IMPORT PIPELINE
// ==========================================
function handleFile(file) {
  fileNameDisplay.innerText = file.name;
  const reader = new FileReader();
  reader.onload = function(e) {
    parseCSV(e.target.result);
  };
  reader.readAsText(file);
}

function parseCSV(text) {
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

  // Process and overwrite files dynamically depending on their active FOC Dates
  saveAndMergeWithDB(incomingData);
}

// Overwrites matching FOC Dates in Database and commits imports
function saveAndMergeWithDB(incomingRows) {
  if (!db || incomingRows.length === 0) return;

  // Pull unique target FOC dates from incoming file
  const incomingFocDates = [...new Set(incomingRows.map(row => row["FOC Date"] || "N/A"))];

  const transaction = db.transaction([storeName], "readwrite");
  const store = transaction.objectStore(storeName);
  const index = store.index("focDate");

  let itemsToDelete = [];

  // Identify matches to replace
  incomingFocDates.forEach(date => {
    const range = IDBKeyRange.only(date);
    index.openCursor(range).onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        itemsToDelete.push(cursor.value.id);
        cursor.continue();
      } else {
        // If we completed scanning all elements, apply deletion batching
        executeWipeAndSave();
      }
    };
  });

  // Make sure executions are only triggered once all cursor cycles complete
  let runsCount = 0;
  function executeWipeAndSave() {
    runsCount++;
    if (runsCount < incomingFocDates.length) return;

    const deleteTx = db.transaction([storeName], "readwrite");
    const deleteStore = deleteTx.objectStore(storeName);

    itemsToDelete.forEach(id => deleteStore.delete(id));

    deleteTx.oncomplete = function() {
      // Save new rows
      const saveTx = db.transaction([storeName], "readwrite");
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
          // Create a compound key to assist searches
          uniqueOrderKey: `${customer}_${comic}_${lunar || upc}_${row["FOC Date"] || "N/A"}`
        });
      });

      saveTx.oncomplete = function() {
        console.log("Database update completed successfully.");
        // Trigger default focus filter to target the primary incoming week
        loadStoredDataAndRender(incomingFocDates[0]);
      };
    };
  }
}

// Re-render when changing sorting strategies
customerSortSelect.addEventListener('change', () => {
  renderCustomerAccordion();
});

// Grouping engine working strictly on currently filtered data rows
function processAndGroupOrders(data) {
  parsedCustomers = {};
  lunarOrders = {};
  penguinOrders = {};
  
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

    // Aggregating Lunar orders
    if (lunar) {
      if (!lunarOrders[lunar]) {
        lunarOrders[lunar] = { comic, publisher, lunar, qty: 0, price, focDate, checked: true, customers: {} };
      }
      lunarOrders[lunar].qty += qty;
      lunarOrders[lunar].customers[customer] = (lunarOrders[lunar].customers[customer] || 0) + qty;
      if (!isChecked) lunarOrders[lunar].checked = false; // Master remains unchecked if any single customer book is unfinished
    } else {
      const key = upc || comic;
      if (!penguinOrders[key]) {
        penguinOrders[key] = { comic, publisher, upc, qty: 0, price, focDate, checked: true, customers: {} };
      }
      penguinOrders[key].qty += qty;
      penguinOrders[key].customers[customer] = (penguinOrders[key].customers[customer] || 0) + qty;
      if (!isChecked) penguinOrders[key].checked = false;
    }

    // Grouping for Pull list
    if (!parsedCustomers[customer]) {
      parsedCustomers[customer] = {
        info: {
          email: item.email || "N/A",
          phone: item.phone || "N/A",
          code: item.code || "N/A"
        },
        items: []
      };
    }
    parsedCustomers[customer].items.push({ comic, publisher, lunar, upc, qty, price, focDate, checked: isChecked });
  });

  displayPreviews();
}

function displayPreviews() {
  renderCustomerAccordion();
  renderLunarTable();
  renderPenguinTable();
  updateGlobalProgress();
}

// Helper to check if ALL matching customers for a book have been checked off
function isBookFullyChecked(type, id) {
  let matchingItems = [];
  Object.values(parsedCustomers).forEach(cust => {
    cust.items.forEach(item => {
      const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
      if (itemId === id) {
        matchingItems.push(item);
      }
    });
  });
  return matchingItems.length > 0 && matchingItems.every(item => item.checked);
}

// Helper to check if a specific customer has checked off a specific book
function isCustomerCheckedForBook(customerName, type, id) {
  if (!parsedCustomers[customerName]) return false;
  const match = parsedCustomers[customerName].items.find(item => {
    const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
    return itemId === id;
  });
  return match ? match.checked : false;
}

// Helper to calculate active quantity remaining for Lunar or Penguin items
function getRemainingQuantity(type, id, totalQty) {
  let checkedQty = 0;
  Object.values(parsedCustomers).forEach(cust => {
    cust.items.forEach(item => {
      const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
      if (itemId === id && item.checked) {
        checkedQty += item.qty;
      }
    });
  });
  return Math.max(0, totalQty - checkedQty);
}

// Recalculates globally how many customer book pull quantities are checked off
function updateGlobalProgress() {
  let totalItems = 0;
  let completedItems = 0;

  Object.values(parsedCustomers).forEach(cust => {
    cust.items.forEach(item => {
      totalItems += item.qty;
      if (item.checked) {
        completedItems += item.qty;
      }
    });
  });

  document.getElementById('completedItemsCount').innerText = completedItems;
  document.getElementById('totalItemsCount').innerText = totalItems;
}

// Helper to fetch the dynamic color styling for a customer badge based on remaining count
function getBadgeColorAndText(remainingCount) {
  if (remainingCount >= 3) {
    return { class: "bg-danger text-white", text: `${remainingCount} left` };
  } else if (remainingCount === 2) {
    return { class: "bg-warning text-dark", style: "background-color: #fd7e14 !important; color: white !important;", text: "2 left" }; // custom orange
  } else if (remainingCount === 1) {
    return { class: "bg-warning text-dark", text: "1 left" }; // yellow
  } else {
    return { class: "bg-success text-white", text: "✓ Complete" }; // green
  }
}

// Updates the individual customer's badge dynamically on check/uncheck events
function updateCustomerBadge(customerName) {
  const custObj = parsedCustomers[customerName];
  if (!custObj) return;

  // Calculate uncompleted count
  const remainingCount = custObj.items.filter(item => !item.checked).length;
  const badgeElement = document.getElementById(`badge-${customerName.replace(/[^a-zA-Z0-9]/g, '_')}`);
  
  if (badgeElement) {
    const badgeConfig = getBadgeColorAndText(remainingCount);
    
    // Clear old styles and classes
    badgeElement.className = `badge rounded-pill ${badgeConfig.class}`;
    badgeElement.style = badgeConfig.style || '';
    badgeElement.innerText = badgeConfig.text;
  }
}

// Event listener to monitor individual customer checking progress (Bidirectional sync UP)
accordion.addEventListener('change', (e) => {
  if (e.target.classList.contains('row-tracker-checkbox')) {
    // Stop events from rising up to any bootstrap triggers
    e.stopPropagation();
    
    const customerName = e.target.getAttribute('data-customer');
    const itemIdx = parseInt(e.target.getAttribute('data-index'));
    const isChecked = e.target.checked;

    // Update actual data model state
    if (parsedCustomers[customerName] && parsedCustomers[customerName].items[itemIdx]) {
      const item = parsedCustomers[customerName].items[itemIdx];
      item.checked = isChecked;

      // Edit DOM row inline to avoid complete redraw/collapse
      const tr = e.target.closest('tr');
      if (isChecked) {
        tr.classList.add('row-checked');
      } else {
        tr.classList.remove('row-checked');
      }

      // Sync local IndexedDB state
      updateItemStateInDB(customerName, item.comic, item.lunar, item.upc, isChecked);

      // Sync master checkbox dynamically
      const isLunar = !!item.lunar;
      const targetId = isLunar ? item.lunar : (item.upc || item.comic);
      const shouldMasterBeChecked = isBookFullyChecked(isLunar ? 'lunar' : 'penguin', targetId);

      if (isLunar) {
        if (lunarOrders[targetId]) lunarOrders[targetId].checked = shouldMasterBeChecked;
      } else {
        if (penguinOrders[targetId]) penguinOrders[targetId].checked = shouldMasterBeChecked;
      }

      // Only rebuild the other tabs' tables, sync this specific customer's badge, and update counts
      updateCustomerBadge(customerName);
      renderLunarTable();
      renderPenguinTable();
      updateGlobalProgress();
    }
  }
});

// Event listener to monitor master list checking progress (Bidirectional sync DOWN)
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('master-tracker-checkbox')) {
    const type = e.target.getAttribute('data-type');
    const id = e.target.getAttribute('data-id');
    const isChecked = e.target.checked;

    // 1. Update master state
    if (type === 'lunar' && lunarOrders[id]) {
      lunarOrders[id].checked = isChecked;
    } else if (type === 'penguin' && penguinOrders[id]) {
      penguinOrders[id].checked = isChecked;
    }

    // 2. Sync down to every matching customer's item & Save to IndexedDB
    Object.keys(parsedCustomers).forEach(custName => {
      parsedCustomers[custName].items.forEach(item => {
        const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
        if (itemId === id) {
          item.checked = isChecked;
          updateItemStateInDB(custName, item.comic, item.lunar, item.upc, isChecked);
        }
      });
    });

    // 3. Complete re-render
    renderCustomerAccordion();
    renderLunarTable();
    renderPenguinTable();
    updateGlobalProgress();
  }
});

// Parses individual last name for accurate sorting
function getLastName(fullName) {
  if (fullName.includes(',')) {
    return fullName.split(',')[0].trim().toLowerCase();
  }
  const parts = fullName.trim().split(' ');
  return parts[parts.length - 1].toLowerCase();
}

function renderCustomerAccordion() {
  accordion.innerHTML = "";
  const sortValue = customerSortSelect.value;
  const customersArray = Object.keys(parsedCustomers);
  
  customerCountDisplay.innerText = `Total Active Patrons: ${customersArray.length}`;

  // Apply Chosen Sorting Strategy
  customersArray.sort((a, b) => {
    if (sortValue.startsWith('lastName')) {
      const nameA = getLastName(a);
      const nameB = getLastName(b);
      return sortValue === 'lastName-asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    } else if (sortValue.startsWith('items')) {
      const countA = parsedCustomers[a].items.length;
      const countB = parsedCustomers[b].items.length;
      return sortValue === 'items-desc' ? countB - countA : countA - countB;
    } else if (sortValue === 'complete-first') {
      const remA = parsedCustomers[a].items.filter(item => !item.checked).length;
      const remB = parsedCustomers[b].items.filter(item => !item.checked).length;
      return remA - remB; // 0 remaining (complete) comes first
    } else if (sortValue === 'incomplete-first') {
      const remA = parsedCustomers[a].items.filter(item => !item.checked).length;
      const remB = parsedCustomers[b].items.filter(item => !item.checked).length;
      return remB - remA; // highest remaining (least complete) comes first
    }
    return 0;
  });

  if (customersArray.length === 0) {
    accordion.innerHTML = "<div class='text-center text-muted py-3'>No customer pull lists found for this configuration.</div>";
    return;
  }

  customersArray.forEach((customer, index) => {
    const custObj = parsedCustomers[customer];
    const remainingCount = custObj.items.filter(item => !item.checked).length;
    const badgeConfig = getBadgeColorAndText(remainingCount);
    const safeId = customer.replace(/[^a-zA-Z0-9]/g, '_');

    const itemsList = custObj.items.map((item, itemIdx) => {
      const isChecked = item.checked ? 'checked' : '';
      const checkedRowClass = item.checked ? 'row-checked' : '';

      const lunarCode = (item.lunar || "").trim();
      let codeHtml = `<span class="badge bg-secondary">N/A</span>`;
      if (lunarCode) {
        const lunarUrl = `https://www.lunardistribution.com/order?search=${encodeURIComponent(lunarCode)}&publisher=&released=&availability=1&type=&salesgroup=&storeid=22186`;
        codeHtml = `
          <span class="badge bg-secondary d-inline-flex align-items-center gap-1" onclick="event.stopPropagation();">
            <span class="user-select-all" style="cursor: text;">${lunarCode}</span>
            <a href="${lunarUrl}" target="_blank" rel="noopener noreferrer" class="text-white text-decoration-none hover-link ps-1" style="cursor: pointer;" onclick="event.stopPropagation();">↗</a>
          </span>
        `;
      }

      return `
        <tr class="${checkedRowClass}">
          <td class="text-center bg-transparent" style="width: 5%" onclick="event.stopPropagation();">
            <input class="form-check-input row-tracker-checkbox" type="checkbox" ${isChecked} data-customer="${customer}" data-index="${itemIdx}" style="cursor: pointer;" onclick="event.stopPropagation();">
          </td>
          <td><strong>${item.qty}x</strong></td>
          <td>${item.comic}</td>
          <td>${item.publisher}</td>
          <td>${codeHtml}</td>
          <td><small>${item.focDate}</small></td>
          <td>$${item.price}</td>
        </tr>
      `;
    }).join('');

    const itemHtml = `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading${index}">
          <button class="accordion-button collapsed" type="button" data-bs-target="#collapse${index}">
            <div class="d-flex justify-content-between w-100 pe-3 align-items-center">
              <strong>👤 ${customer}</strong>
              <span id="badge-${safeId}" class="badge rounded-pill ${badgeConfig.class}" style="${badgeConfig.style || ''}">
                ${badgeConfig.text}
              </span>
            </div>
          </button>
        </h2>
        <div id="collapse${index}" class="accordion-collapse collapse" data-bs-parent="#customerAccordion">
          <div class="accordion-body bg-body">
            <p class="mb-2 text-muted">Code: ${custObj.info.code} | Email: ${custObj.info.email}</p>
            <table class="table table-striped table-tight table-sm align-middle">
              <thead>
                <tr>
                  <th class="text-center">Add</th>
                  <th>Qty</th>
                  <th>Comic Book</th>
                  <th>Publisher</th>
                  <th>Order Code</th>
                  <th>FOC Date</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>${itemsList}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    accordion.innerHTML += itemHtml;
  });
}

function buildCustomerListStr(custMap, type, id) {
  return Object.entries(custMap)
    .map(([name, qty]) => {
      const isChecked = isCustomerCheckedForBook(name, type, id);
      const checkedClass = isChecked ? 'badge-checked bg-success-subtle text-success border-success-subtle' : 'bg-body-secondary text-body border';
      return `<span class="badge me-2 mb-1 p-2 fw-normal ${checkedClass}">👤 ${name} <strong>(${qty}x)</strong></span>`;
    })
    .join('') || '<span class="text-muted small">None</span>';
}

// Renders master Lunar summary rows
function renderLunarTable() {
  lunarTableBody.innerHTML = Object.values(lunarOrders).map((item, idx) => {
    const isChecked = item.checked ? 'checked' : '';
    const checkedRowClass = item.checked ? 'row-checked' : '';
    const remaining = getRemainingQuantity('lunar', item.lunar, item.qty);
    const lunarCode = (item.lunar || "").trim();

    const lunarUrl = `https://www.lunardistribution.com/order?search=${encodeURIComponent(lunarCode)}&publisher=&released=&availability=1&type=&salesgroup=&storeid=22186`;
    const linkHtml = `
      <span class="d-inline-flex align-items-center gap-2" onclick="event.stopPropagation();">
        <code class="user-select-all text-body" style="cursor: text;">${lunarCode}</code>
        <a href="${lunarUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none hover-link" style="font-size: 0.9rem; user-select: none; cursor: pointer;" onclick="event.stopPropagation();">↗</a>
      </span>
    `;

    return `
      <tr class="clickable-row ${checkedRowClass}" data-bs-target="#lunarDrawer${idx}">
        <td class="text-center" onclick="event.stopPropagation();">
          <input class="form-check-input master-tracker-checkbox" type="checkbox" ${isChecked} data-type="lunar" data-id="${item.lunar}" style="cursor: pointer;">
        </td>
        <td><strong class="text-primary">${remaining}</strong> / <span class="text-muted">${item.qty}</span></td>
        <td><span class="text-primary fw-semibold">▶</span> ${item.comic}</td>
        <td>${item.publisher}</td>
        <td>${linkHtml}</td>
        <td>$${item.price}</td>
      </tr>
      <tr class="collapse drawer-row" id="lunarDrawer${idx}">
        <td colspan="6">
          <div class="drawer-content">
            <div class="row">
              <div class="col-md-3 border-end">
                <div class="drawer-label">FOC Date</div>
                <span class="badge bg-info text-dark p-2 fw-semibold">${item.focDate}</span>
              </div>
              <div class="col-md-9 ps-4">
                <div class="drawer-label">Customers to Pull This Book</div>
                <div class="d-flex flex-wrap mt-2">${buildCustomerListStr(item.customers, 'lunar', item.lunar)}</div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('') || "<tr><td colspan='6' class='text-center text-muted py-3'>No Lunar books found.</td></tr>";
}

// Renders master Penguin summary rows
function renderPenguinTable() {
  penguinTableBody.innerHTML = Object.values(penguinOrders).map((item, idx) => {
    const isChecked = item.checked ? 'checked' : '';
    const checkedRowClass = item.checked ? 'row-checked' : '';
    const key = item.upc || item.comic;
    const remaining = getRemainingQuantity('penguin', key, item.qty);
    return `
      <tr class="clickable-row ${checkedRowClass}" data-bs-target="#penguinDrawer${idx}">
        <td class="text-center" onclick="event.stopPropagation();">
          <input class="form-check-input master-tracker-checkbox" type="checkbox" ${isChecked} data-type="penguin" data-id="${key}" style="cursor: pointer;">
        </td>
        <td><strong class="text-primary">${remaining}</strong> / <span class="text-muted">${item.qty}</span></td>
        <td><span class="text-primary fw-semibold">▶</span> ${item.comic}</td>
        <td>${item.publisher}</td>
        <td><code>${item.upc || 'N/A'}</code></td>
        <td>$${item.price}</td>
      </tr>
      <tr class="collapse drawer-row" id="penguinDrawer${idx}">
        <td colspan="6">
          <div class="drawer-content">
            <div class="row">
              <div class="col-md-3 border-end">
                <div class="drawer-label">FOC Date</div>
                <span class="badge bg-info text-dark p-2 fw-semibold">${item.focDate}</span>
              </div>
              <div class="col-md-9 ps-4">
                <div class="drawer-label">Customers to Pull This Book</div>
                <div class="d-flex flex-wrap mt-2">${buildCustomerListStr(item.customers, 'penguin', key)}</div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('') || "<tr><td colspan='6' class='text-center text-muted py-3'>No Penguin books found.</td></tr>";
}

// ==========================================
// DYNAMIC COLLAPSE HANDLER (Event Delegation)
// ==========================================
document.addEventListener('click', function (e) {
  // 1. Handle Customer Accordion Buttons
  const accordionButton = e.target.closest('.accordion-button');
  if (accordionButton) {
    e.preventDefault(); // Stop any conflicting native Bootstrap actions
    const targetSelector = accordionButton.getAttribute('data-bs-target');
    const targetEl = document.querySelector(targetSelector);
    
    if (targetEl) {
      let collapseInstance = bootstrap.Collapse.getInstance(targetEl);
      if (!collapseInstance) {
        collapseInstance = new bootstrap.Collapse(targetEl, { toggle: false });
      }
      
      // Force the collapse transition
      collapseInstance.toggle();
      
      // Instantly update the visual state (blue color & arrow direction)
      const isCurrentlyCollapsed = accordionButton.classList.contains('collapsed');
      if (isCurrentlyCollapsed) {
        accordionButton.classList.remove('collapsed');
        accordionButton.setAttribute('aria-expanded', 'true');
      } else {
        accordionButton.classList.add('collapsed');
        accordionButton.setAttribute('aria-expanded', 'false');
      }
    }
    return;
  }

  // 2. Handle Master Table Row Drawers (Lunar and Penguin)
  const clickableRow = e.target.closest('.clickable-row');
  if (clickableRow) {
    // Ignore click if user clicked a checkbox, copyable code, or external link
    if (
      e.target.classList.contains('master-tracker-checkbox') || 
      e.target.closest('a') || 
      e.target.classList.contains('user-select-all')
    ) {
      return;
    }
    
    e.preventDefault();
    const targetSelector = clickableRow.getAttribute('data-bs-target');
    const targetEl = document.querySelector(targetSelector);
    
    if (targetEl) {
      let collapseInstance = bootstrap.Collapse.getInstance(targetEl);
      if (!collapseInstance) {
        collapseInstance = new bootstrap.Collapse(targetEl, { toggle: false });
      }
      collapseInstance.toggle();
    }
  }
});

// EXCEL GENERATION
document.getElementById('btnExcel').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Master Lunar (Filtered)
  const lunarSheetData = [
    ["LUNAR DISTRIBUTION - FILTERED MASTER ORDERS"],
    [],
    ["Total Qty", "Comic Title", "Publisher", "Lunar Code", "FOC Date", "Customer Name(s)", "Price"]
  ];
  Object.values(lunarOrders).forEach(i => {
    lunarSheetData.push([i.qty, i.comic, i.publisher, i.lunar, i.focDate, Object.keys(i.customers).join(', '), `$${i.price}`]);
  });
  const wsLunar = XLSX.utils.aoa_to_sheet(lunarSheetData);
  XLSX.utils.book_append_sheet(wb, wsLunar, "🌕 Lunar Orders");

  // Sheet 2: Master Penguin (Filtered)
  const penguinSheetData = [
    ["PENGUIN RANDOM HOUSE - FILTERED MASTER ORDERS"],
    [],
    ["Total Qty", "Comic Title", "Publisher", "UPC / ISBN", "FOC Date", "Customer Name(s)", "Price"]
  ];
  Object.values(penguinOrders).forEach(i => {
    penguinSheetData.push([i.qty, i.comic, i.publisher, i.upc, i.focDate, Object.keys(i.customers).join(', '), `$${i.price}`]);
  });
  const wsPenguin = XLSX.utils.aoa_to_sheet(penguinSheetData);
  XLSX.utils.book_append_sheet(wb, wsPenguin, "🐧 Penguin Orders");

  // Sheet 3+: Individual Customers (Filtered)
  Object.keys(parsedCustomers).forEach(customer => {
    const custObj = parsedCustomers[customer];
    const sheetData = [
      ["CUSTOMER ORDER SHEET"],
      ["Customer:", customer],
      ["Customer Code:", custObj.info.code],
      ["Email:", custObj.info.email],
      ["Phone:", custObj.info.phone],
      [],
      ["Qty", "Comic Title", "Publisher", "Lunar Code", "FOC Date", "Price"]
    ];

    custObj.items.forEach(i => {
      sheetData.push([i.qty, i.comic, i.publisher, i.lunar, i.focDate, `$${i.price}`]);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const sheetName = customer.substring(0, 31).replace(/[\\\?\*\/\[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, "Filtered_Comic_Geeks_Orders.xlsx");
});

// PDF GENERATION
document.getElementById('btnPdf').addEventListener('click', async () => {
  const { jsPDF } = window.jspdf;
  const zip = new JSZip();

  Object.keys(parsedCustomers).forEach(customer => {
    const custObj = parsedCustomers[customer];
    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("CUSTOMER COMIC ORDER", 14, 25);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 32);

    doc.line(14, 35, 196, 35);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("Customer Details:", 14, 45);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${customer}`, 14, 51);
    doc.text(`Code: ${custObj.info.code}`, 14, 57);
    doc.text(`Email: ${custObj.info.email}`, 14, 63);
    doc.text(`Phone: ${custObj.info.phone}`, 14, 69);

    doc.setFillColor(240, 240, 240);
    doc.rect(14, 77, 182, 8, "F");
    
    doc.setFont("helvetica", "bold");
    doc.text("Qty", 16, 82);
    doc.text("Comic Title", 30, 82);
    doc.text("Publisher", 115, 82);
    doc.text("Order Code", 150, 82);
    doc.text("FOC Date", 175, 82);

    let y = 92;
    doc.setFont("helvetica", "normal");
    
    custObj.items.forEach(item => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      
      doc.setFont("helvetica", "bold");
      doc.text(`${item.qty}x`, 16, y);
      
      doc.setFont("helvetica", "normal");
      const shortComic = item.comic.length > 38 ? item.comic.substring(0, 35) + "..." : item.comic;
      doc.text(shortComic, 30, y);
      doc.text(item.publisher, 115, y);
      doc.text(item.lunar || "N/A", 150, y);
      doc.text(item.focDate, 175, y);
      
      doc.setDrawColor(230);
      doc.line(14, y + 3, 196, y + 3);
      y += 10;
    });

    const pdfBlob = doc.output('blob');
    const filename = `${customer.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_order.pdf`;
    zip.file(filename, pdfBlob);
  });

  zip.generateAsync({type: "blob"}).then(function(content) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "Filtered_Customer_PDF_Orders.zip";
    link.click();
  });
});

// LUNAR QUICK UPLOAD CSV GENERATION (UNCHECKED ONLY)
document.getElementById('btnLunarCsv').addEventListener('click', () => {
  // Filter the master list to ONLY include items that are not checked (item.checked is false/falsy)
  const uncheckedOrders = Object.values(lunarOrders).filter(item => !item.checked);
  
  if (uncheckedOrders.length === 0) {
    alert("No unchecked Lunar orders found in the current selection to export.");
    return;
  }

  // Build headerless CSV rows: [Product Code/Lunar Code], [Qty]
  const csvRows = uncheckedOrders.map(item => {
    const code = (item.lunar || "").trim();
    
    // Calculate remaining quantity that still needs to be ordered
    const remainingQty = getRemainingQuantity('lunar', item.lunar, item.qty);
    
    // Standard CSV escaping for the code
    return `"${code.replace(/"/g, '""')}",${remainingQty}`;
  });

  // Join rows with standard newline characters
  const csvContent = csvRows.join("\n");
  
  // Create a download link and trigger it
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  // Name the file dynamically based on the selected FOC Week
  const selectedWeek = focFilterSelect.value;
  const cleanWeekName = selectedWeek.replace(/[^a-z0-9]/gi, '_');
  const fileName = `lunar_direct_upload_unchecked_${cleanWeekName}.csv`;
  
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});
