// /plugins/Cabal/cabal/static/cabal/js/cerebro/parsers.js

// ==========================================
// DOM ELEMENT RETRIEVAL
// ==========================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('csvFileInput');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const focFilterSelect = document.getElementById('focFilterSelect');
const customerCountDisplay = document.getElementById('customerCountDisplay');
const accordion = document.getElementById('customerAccordion');
const lunarTableBody = document.getElementById('lunarTableBody');
const penguinTableBody = document.getElementById('penguinTableBody');
const btnWipeDb = document.getElementById('btnWipeDb');
const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');
const themeLabel = document.getElementById('themeLabel');
const htmlTag = document.documentElement;
const sortBoxContainer = document.getElementById('sortBoxContainer');
const tabElements = document.querySelectorAll('button[data-bs-toggle="tab"]');

// ==========================================
// THEME AND DRAG-AND-DROP INTERACTIONS
// ==========================================
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
    window.handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    window.handleFile(e.target.files[0]);
  }
});

tabElements.forEach(tab => {
  tab.addEventListener('shown.bs.tab', (e) => {
    if (e.target.id === 'customers-tab') {
      sortBoxContainer.classList.remove('d-none');
    } else {
      sortBoxContainer.classList.add('d-none');
    }
  });
});

// Track FOC filter dropdown updates
focFilterSelect.addEventListener('change', (e) => {
  window.loadStoredDataAndRender(e.target.value);
});

// Database Wipe Interactive Trigger
btnWipeDb.addEventListener('click', () => {
  if (confirm("Are you sure you want to completely wipe all stored orders and checklists?")) {
    window.wipeDatabaseStore(() => {
      fileNameDisplay.innerText = "";
      window.loadStoredDataAndRender();
    });
  }
});

// ==========================================
// UI HELPER CALCULATIONS
// ==========================================
window.isBookFullyChecked = function(type, id) {
  let matchingItems = [];
  Object.values(window.parsedCustomers).forEach(cust => {
    cust.items.forEach(item => {
      const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
      if (itemId === id) {
        matchingItems.push(item);
      }
    });
  });
  return matchingItems.length > 0 && matchingItems.every(item => item.checked);
};

window.isCustomerCheckedForBook = function(customerName, type, id) {
  if (!window.parsedCustomers[customerName]) return false;
  const match = window.parsedCustomers[customerName].items.find(item => {
    const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
    return itemId === id;
  });
  return match ? match.checked : false;
};

window.getRemainingQuantity = function(type, id, totalQty) {
  let checkedQty = 0;
  Object.values(window.parsedCustomers).forEach(cust => {
    cust.items.forEach(item => {
      const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
      if (itemId === id && item.checked) {
        checkedQty += item.qty;
      }
    });
  });
  return Math.max(0, totalQty - checkedQty);
};

window.updateGlobalProgress = function() {
  let totalItems = 0;
  let completedItems = 0;
  let totalValue = 0;
  let completedValue = 0;

  // Get the currently selected FOC filter week
  const activeWeek = focFilterSelect?.value || window.currentWeekFilter || 'all';

  Object.values(window.parsedCustomers || {}).forEach(cust => {
    cust.items.forEach(item => {
      // If a specific week is filtered, ignore items that don't match it
      if (activeWeek !== 'all' && item.focDate !== activeWeek) {
        return; 
      }

      const qty = parseInt(item.qty, 10) || 0;
      // Clean up the price string (remove $, convert to float)
      const rawPrice = (item.price || "0").toString().replace(/[^0-9.]/g, '');
      const price = parseFloat(rawPrice) || 0;
      const totalItemCost = qty * price;

      // Add to running totals
      totalItems += qty;
      totalValue += totalItemCost;

      if (item.checked) {
        completedItems += qty;
        completedValue += totalItemCost;
      }
    });
  });

  // Update Item Counts on Dashboard
  const compItemsEl = document.getElementById('completedItemsCount');
  const totItemsEl = document.getElementById('totalItemsCount');
  if (compItemsEl) compItemsEl.innerText = completedItems;
  if (totItemsEl) totItemsEl.innerText = totalItems;

  // Update Financial Metrics on Dashboard (formatted to 2 decimal places)
  const compValEl = document.getElementById('completedValueCount');
  const totValEl = document.getElementById('totalValueCount');
  if (compValEl) compValEl.innerText = completedValue.toFixed(2);
  if (totValEl) totValEl.innerText = totalValue.toFixed(2);
};

window.updateCustomerBadge = function(customerName) {
  const custObj = window.parsedCustomers[customerName];
  if (!custObj) return;

  const totalItemsQty = custObj.items.reduce((sum, item) => sum + item.qty, 0);
  const remainingQty = custObj.items.reduce((sum, item) => sum + (item.checked ? 0 : item.qty), 0);
  const badgeElement = document.getElementById(`badge-${customerName.replace(/[^a-zA-Z0-9]/g, '_')}`);
  
  if (badgeElement) {
    let badgeColorClass = "bg-danger text-white"; // Default: Red (none pulled yet)
    let badgeText = `${remainingQty} left`;

    if (remainingQty === 0) {
      badgeColorClass = "bg-success text-white"; // Green: All items pulled
      badgeText = "Complete";
    } else if (remainingQty < totalItemsQty) {
      badgeColorClass = "bg-warning text-dark"; // Yellow/Orange: Partially complete
    }

    // Apply classes and enforce layout dimensions so it doesn't shrink or turn blue
    badgeElement.className = `badge rounded-pill ${badgeColorClass}`;
    badgeElement.style.minWidth = "80px";
    badgeElement.style.display = "inline-block";
    badgeElement.innerText = badgeText;
  }
};

// ==========================================
// RENDER PROCESSORS
// ==========================================
window.displayPreviews = function() {
  window.renderCustomerAccordion();
  window.renderLunarTable();
  window.renderPenguinTable();
  window.updateGlobalProgress();
};

window.renderCustomerAccordion = function() {
  const isAllWeeks = focFilterSelect?.value === 'all' || window.currentWeekFilter === 'all';
  const tableClass = isAllWeeks 
    ? "table table-striped table-tight show-foc table-sm align-middle" 
    : "table table-striped table-tight table-sm align-middle";

  // 1. Get the customer keys array
  const customersArray = Object.keys(window.parsedCustomers || {});
  
  // Ensure defaults are initialized
  window.currentSortColumn = window.currentSortColumn || 'name';
  window.currentSortDirection = window.currentSortDirection || 'asc';

  // 2. RUN THE OUTER CUSTOMER SORTING ALGORITHM
  customersArray.sort((a, b) => {
    let comparison = 0;
    const custA = window.parsedCustomers[a];
    const custB = window.parsedCustomers[b];

    if (window.currentSortColumn === 'name') {
      const getLastNameLocal = function(fullName) {
        if (!fullName) return '';
        if (fullName.includes(',')) {
          return fullName.split(',')[0].trim().toLowerCase();
        }
        const cleanName = fullName.replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v|esq\.?)$/i, '').trim();
        const parts = cleanName.split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : fullName.toLowerCase();
      };

      const nameA = getLastNameLocal(a);
      const nameB = getLastNameLocal(b);
      comparison = nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });

    } else if (window.currentSortColumn === 'items') {
      const totalQtyA = custA.items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
      const totalQtyB = custB.items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
      comparison = totalQtyA - totalQtyB;

    } else if (window.currentSortColumn === 'progress') {
      const remQtyA = custA.items.reduce((sum, item) => sum + (item.checked ? 0 : (parseInt(item.qty, 10) || 0)), 0);
      const remQtyB = custB.items.reduce((sum, item) => sum + (item.checked ? 0 : (parseInt(item.qty, 10) || 0)), 0);
      comparison = remQtyA - remQtyB; 
    }

    return window.currentSortDirection === 'asc' ? comparison : -comparison;
  });

  let accordionHtml = '';

  customersArray.forEach((customer, index) => {
    const custObj = window.parsedCustomers[customer];
    const safeId = customer.replace(/[^a-zA-Z0-9]/g, '_');
    
    const totalItemsQty = custObj.items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 0), 0);
    const remainingQty = custObj.items.reduce((sum, item) => sum + (item.checked ? 0 : (parseInt(item.qty, 10) || 0)), 0);

    let badgeColorClass = "bg-danger text-white";
    let badgeText = `${remainingQty} left`;

    if (remainingQty === 0) {
      badgeColorClass = "bg-success text-white";
      badgeText = "Complete";
    } else if (remainingQty < totalItemsQty) {
      badgeColorClass = "bg-warning text-dark";
    }

    // 2. Sort the inner items array before rendering
    const sortedItems = [...custObj.items].sort((a, b) => {
      let comparison = 0;
      const col = window.currentInnerSortColumn;

      if (col === 'comic' || col === 'publisher' || col === 'focDate') {
        const valA = (a[col] || '').toString().toLowerCase();
        const valB = (b[col] || '').toString().toLowerCase();
        comparison = valA.localeCompare(valB, undefined, { numeric: true });
      } else if (col === 'price') {
        const priceA = parseFloat(a.price) || 0;
        const priceB = parseFloat(b.price) || 0;
        comparison = priceA - priceB;
      } else if (col === 'qty') {
        const qtyA = parseInt(a.qty, 10) || 0;
        const qtyB = parseInt(b.qty, 10) || 0;
        comparison = qtyA - qtyB;
      }

      return window.currentInnerSortDirection === 'asc' ? comparison : -comparison;
    });

    // Generate items rows
    const itemsList = sortedItems.map((item, itemIdx) => {
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

      const focCellHtml = isAllWeeks ? `<td><span class="badge bg-info text-dark">${item.focDate || 'N/A'}</span></td>` : '';

      return `
        <tr class="${checkedRowClass}">
          <td class="text-center bg-transparent" onclick="event.stopPropagation();">
            <input class="form-check-input row-tracker-checkbox" type="checkbox" ${isChecked} data-customer="${customer}" data-index="${custObj.items.indexOf(item)}" style="cursor: pointer;" onclick="event.stopPropagation();">
          </td>
          <td><strong>${item.qty}x</strong></td>
          <td class="text-truncate">${item.comic}</td>
          <td class="text-truncate">${item.publisher}</td>
          ${focCellHtml}
          <td>${codeHtml}</td>
          <td class="text-end">$${item.price}</td>
        </tr>
      `;
    }).join('');

    // Helper to render sort indicator arrows in headers
    const getSortIndicator = (col) => {
      if (window.currentInnerSortColumn !== col) return '↕️';
      return window.currentInnerSortDirection === 'asc' ? '🔼' : '🔽';
    };

    // Table Headers with sorting triggers
    const focHeaderHtml = isAllWeeks 
      ? `<th class="sortable-header" onclick="event.stopPropagation(); handleInnerHeaderSort('focDate')">FOC Date ${getSortIndicator('focDate')}</th>` 
      : '';

    accordionHtml += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading_${safeId}">
          <button class="accordion-button collapsed" type="button" data-bs-target="#collapse_${safeId}">
            <div class="d-flex w-100 pe-3 align-items-center">
              <div style="width: 50%;" class="text-truncate">
                <strong>👤 ${customer}</strong>
              </div>
              
              <div style="width: 25%;" class="text-end fw-semibold pe-3 text-secondary">
                ${totalItemsQty} ${totalItemsQty === 1 ? 'item' : 'items'}
              </div>
              
              <div style="width: 25%;" class="text-end">
                <span id="badge-${safeId}" class="badge rounded-pill ${badgeColorClass}" style="min-width: 80px; display: inline-block;">
                  ${badgeText}
                </span>
              </div>
            </div>
          </button>
        </h2>
        <div id="collapse_${safeId}" class="accordion-collapse collapse" data-bs-parent="#customerAccordion">
          <div class="accordion-body bg-body">
            <p class="mb-2 text-muted">Code: ${custObj.info.code} | Email: ${custObj.info.email}</p>
            <table class="${tableClass}">
              <thead>
                <tr>
                  <th class="text-center">Add</th>
                  <th class="sortable-header" onclick="event.stopPropagation(); handleInnerHeaderSort('qty')">Qty ${getSortIndicator('qty')}</th>
                  <th class="sortable-header" onclick="event.stopPropagation(); handleInnerHeaderSort('comic')">Comic Book ${getSortIndicator('comic')}</th>
                  <th class="sortable-header" onclick="event.stopPropagation(); handleInnerHeaderSort('publisher')">Publisher ${getSortIndicator('publisher')}</th>
                  ${focHeaderHtml}
                  <th>Order Code</th>
                  <th class="text-end sortable-header" onclick="event.stopPropagation(); handleInnerHeaderSort('price')">Price ${getSortIndicator('price')}</th>
                </tr>
              </thead>
              <tbody>${itemsList}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  });

  accordion.innerHTML = accordionHtml || "<div class='text-center text-muted py-3'>No customer records loaded.</div>";

  if (customerCountDisplay) {
    customerCountDisplay.innerText = customersArray.length;
  }
};

window.buildCustomerListStr = function(custMap, type, id) {
  return Object.entries(custMap)
    .map(([name, qty]) => {
      const isChecked = window.isCustomerCheckedForBook(name, type, id);
      const checkedClass = isChecked ? 'badge-checked bg-success-subtle text-success border-success-subtle' : 'bg-body-secondary text-body border';
      return `<span class="badge me-2 mb-1 p-2 fw-normal ${checkedClass}">👤 ${name} <strong>(${qty}x)</strong></span>`;
    })
    .join('') || '<span class="text-muted small">None</span>';
};

window.renderLunarTable = function() {
  lunarTableBody.innerHTML = Object.values(window.lunarOrders).map((item, idx) => {
    const isChecked = item.checked ? 'checked' : '';
    const checkedRowClass = item.checked ? 'row-checked' : '';
    const totalQty = item.qty || 0;
    const remaining = window.getRemainingQuantity('lunar', item.lunar, totalQty);
    const lunarCode = (item.lunar || "").trim();
    
    let badgeColorClass = "bg-danger text-white";
    if (remaining === 0) {
      badgeColorClass = "bg-success text-white";
    } else if (remaining < totalQty) {
      badgeColorClass = "bg-warning text-dark";
    }

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
        <td>
          <span class="badge ${badgeColorClass}" style="font-size: 0.85rem; min-width: 75px; display: inline-block; text-align: center;">
            ${remaining} / ${totalQty} left
          </span>
        </td>
        <td class="text-truncate"><span class="text-primary fw-semibold">▶</span> ${item.comic}</td>
        <td class="text-truncate">${item.publisher}</td>
        <td>${linkHtml}</td>
        <td class="text-end">$${item.price}</td>
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
                <div class="d-flex flex-wrap mt-2">${window.buildCustomerListStr(item.customers, 'lunar', item.lunar)}</div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('') || "<tr><td colspan='6' class='text-center text-muted py-3'>No Lunar books found.</td></tr>";
};

window.renderPenguinTable = function() {
  penguinTableBody.innerHTML = Object.values(window.penguinOrders).map((item, idx) => {
    const isChecked = item.checked ? 'checked' : '';
    const checkedRowClass = item.checked ? 'row-checked' : '';
    const key = item.upc || item.comic;
    const totalQty = item.qty || 0;
    const remaining = window.getRemainingQuantity('penguin', key, totalQty);
    
    let badgeColorClass = "bg-danger text-white";
    if (remaining === 0) {
      badgeColorClass = "bg-success text-white";
    } else if (remaining < totalQty) {
      badgeColorClass = "bg-warning text-dark";
    }

    return `
      <tr class="clickable-row ${checkedRowClass}" data-bs-target="#penguinDrawer${idx}">
        <td class="text-center" onclick="event.stopPropagation();">
          <input class="form-check-input master-tracker-checkbox" type="checkbox" ${isChecked} data-type="penguin" data-id="${key}" style="cursor: pointer;">
        </td>
        <td>
          <span class="badge ${badgeColorClass}" style="font-size: 0.85rem; min-width: 75px; display: inline-block; text-align: center;">
            ${remaining} / ${totalQty} left
          </span>
        </td>
        <td class="text-truncate"><span class="text-primary fw-semibold">▶</span> ${item.comic}</td>
        <td class="text-truncate">${item.publisher}</td>
        <td><code>${item.upc || 'N/A'}</code></td>
        <td class="text-end">$${item.price}</td>
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
                <div class="d-flex flex-wrap mt-2">${window.buildCustomerListStr(item.customers, 'penguin', key)}</div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('') || "<tr><td colspan='6' class='text-center text-muted py-3'>No Penguin books found.</td></tr>";
};

// ==========================================
// INTERACTIVE CHECKLIST CONTROL EVENT LISTENERS
// ==========================================
accordion.addEventListener('change', (e) => {
  if (e.target.classList.contains('row-tracker-checkbox')) {
    e.stopPropagation();
    
    const customerName = e.target.getAttribute('data-customer');
    const itemIdx = parseInt(e.target.getAttribute('data-index'));
    const isChecked = e.target.checked;

    if (window.parsedCustomers[customerName] && window.parsedCustomers[customerName].items[itemIdx]) {
      const item = window.parsedCustomers[customerName].items[itemIdx];
      item.checked = isChecked;

      const tr = e.target.closest('tr');
      if (isChecked) {
        tr.classList.add('row-checked');
      } else {
        tr.classList.remove('row-checked');
      }

      window.updateItemStateInDB(customerName, item.comic, item.lunar, item.upc, isChecked);

      const isLunar = !!item.lunar;
      const targetId = isLunar ? item.lunar : (item.upc || item.comic);
      const shouldMasterBeChecked = window.isBookFullyChecked(isLunar ? 'lunar' : 'penguin', targetId);

      if (isLunar) {
        if (window.lunarOrders[targetId]) window.lunarOrders[targetId].checked = shouldMasterBeChecked;
      } else {
        if (window.penguinOrders[targetId]) window.penguinOrders[targetId].checked = shouldMasterBeChecked;
      }

      window.updateCustomerBadge(customerName);
      window.renderLunarTable();
      window.renderPenguinTable();
      window.updateGlobalProgress();
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.classList.contains('master-tracker-checkbox')) {
    const type = e.target.getAttribute('data-type');
    const id = e.target.getAttribute('data-id');
    const isChecked = e.target.checked;

    if (type === 'lunar' && window.lunarOrders[id]) {
      window.lunarOrders[id].checked = isChecked;
    } else if (type === 'penguin' && window.penguinOrders[id]) {
      window.penguinOrders[id].checked = isChecked;
    }

    Object.keys(window.parsedCustomers).forEach(custName => {
      window.parsedCustomers[custName].items.forEach(item => {
        const itemId = type === 'lunar' ? item.lunar : (item.upc || item.comic);
        if (itemId === id) {
          item.checked = isChecked;
          window.updateItemStateInDB(custName, item.comic, item.lunar, item.upc, isChecked);
        }
      });
    });

    window.renderCustomerAccordion();
    window.renderLunarTable();
    window.renderPenguinTable();
    window.updateGlobalProgress();
  }
});

// ==========================================
// DYNAMIC COLLAPSE HANDLER
// ==========================================
document.addEventListener('click', function (e) {
  const accordionButton = e.target.closest('.accordion-button');
  if (accordionButton) {
    e.preventDefault();
    const targetSelector = accordionButton.getAttribute('data-bs-target');
    const targetEl = document.querySelector(targetSelector);
    
    if (targetEl) {
      let collapseInstance = bootstrap.Collapse.getInstance(targetEl);
      if (!collapseInstance) {
        collapseInstance = new bootstrap.Collapse(targetEl, { toggle: false });
      }
      
      collapseInstance.toggle();
      
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

  const clickableRow = e.target.closest('.clickable-row');
  if (clickableRow) {
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

// ==========================================
// DOWNLOAD EXPORT ACTIONS
// ==========================================
// EXCEL GENERATION
document.getElementById('btnExcel').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();

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
  const uncheckedOrders = Object.values(lunarOrders).filter(item => !item.checked);
  
  if (uncheckedOrders.length === 0) {
    alert("No unchecked Lunar orders found in the current selection to export.");
    return;
  }

  const csvRows = uncheckedOrders.map(item => {
    const code = (item.lunar || "").trim();
    const remainingQty = getRemainingQuantity('lunar', item.lunar, item.qty);
    return `"${code.replace(/"/g, '""')}",${remainingQty}`;
  });

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
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

// ==========================================
// COLUMN HEADER SORTING TRIGGERS
// ==========================================
// Handle main header sort clicks without losing the open accordion panel
function handleHeaderSort(column) {
  // 1. Find the name of the currently open customer (if any)
  const openPanel = document.querySelector('#customerAccordion .accordion-collapse.show');
  let openCustomerName = null;
  if (openPanel) {
    const accordionItem = openPanel.closest('.accordion-item');
    const headerText = accordionItem ? accordionItem.querySelector('.accordion-header strong')?.innerText : null;
    if (headerText) {
      openCustomerName = headerText.replace('👤 ', '').trim();
    }
  }

  // 2. Update outer sorting direction
  if (window.currentSortColumn === column) {
    window.currentSortDirection = window.currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    window.currentSortColumn = column;
    window.currentSortDirection = 'asc';
  }

  // 3. Update the visual arrows on the sort buttons
  updateOuterSortArrows();

  // 4. Re-render everything
  window.renderCustomerAccordion();

  // 5. If a customer was open, locate their new panel and reopen it instantly
  if (openCustomerName) {
    const safeId = openCustomerName.replace(/[^a-zA-Z0-9]/g, '_');
    const targetPanel = document.getElementById(`collapse_${safeId}`) || document.querySelector(`[id$="${safeId}"]`);
    
    if (targetPanel) {
      const targetButton = document.querySelector(`[data-bs-target="#${targetPanel.id}"]`);
      if (targetButton) {
        targetButton.classList.remove('collapsed');
        targetButton.setAttribute('aria-expanded', 'true');
      }
      targetPanel.classList.add('show');
    }
  }
}

document.getElementById('headerSortName').addEventListener('click', () => handleHeaderSort('name'));
document.getElementById('headerSortItems').addEventListener('click', () => handleHeaderSort('items'));
document.getElementById('headerSortProgress').addEventListener('click', () => handleHeaderSort('progress'));

// Dynamically update the arrows on the top-row sorting buttons
function updateOuterSortArrows() {
  const columns = {
    name: { id: 'headerSortName', label: 'Name' },
    items: { id: 'headerSortItems', label: 'Total Items' },
    progress: { id: 'headerSortProgress', label: 'Remaining Items' }
  };

  Object.keys(columns).forEach(col => {
    const btn = document.getElementById(columns[col].id);
    if (btn) {
      let arrow = '↕️'; // Default inactive state arrow
      if (window.currentSortColumn === col) {
        arrow = window.currentSortDirection === 'asc' ? '🔼' : '🔽';
      }
      btn.innerText = `${columns[col].label} ${arrow}`;
    }
  });
}

// Handle inner table header clicks without losing which accordion is open
function handleInnerHeaderSort(column) {
  // 1. Find the currently open accordion panel (if any)
  const openPanel = document.querySelector('#customerAccordion .accordion-collapse.show');
  const openPanelId = openPanel ? openPanel.id : null;

  // 2. Update the sorting parameters
  if (window.currentInnerSortColumn === column) {
    window.currentInnerSortDirection = window.currentInnerSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    window.currentInnerSortColumn = column;
    window.currentInnerSortDirection = 'asc';
  }

  // 3. Re-render the tables
  window.renderCustomerAccordion();

  // 4. Restore the open panel state immediately
  if (openPanelId) {
    const targetPanel = document.getElementById(openPanelId);
    if (targetPanel) {
      // Find the corresponding button and remove the 'collapsed' class
      const targetButton = document.querySelector(`[data-bs-target="#${openPanelId}"]`);
      if (targetButton) {
        targetButton.classList.remove('collapsed');
        targetButton.setAttribute('aria-expanded', 'true');
      }
      
      // Re-apply the Bootstrap 'show' class directly to the panel
      targetPanel.classList.add('show');
    }
  }
};

// ==========================================
// EXPAND ALL / COLLAPSE ALL UTILITY
// ==========================================
let allExpanded = false;
document.getElementById('btnToggleAllAccordions').addEventListener('click', (e) => {
  const accordionItems = document.querySelectorAll('#customerAccordion .accordion-collapse');
  const buttons = document.querySelectorAll('#customerAccordion .accordion-button');
  
  allExpanded = !allExpanded;
  
  accordionItems.forEach(item => {
    let collapseInstance = bootstrap.Collapse.getInstance(item);
    if (!collapseInstance) {
      collapseInstance = new bootstrap.Collapse(item, { toggle: false });
    }
    if (allExpanded) {
      collapseInstance.show();
    } else {
      collapseInstance.hide();
    }
  });

  buttons.forEach(btn => {
    if (allExpanded) {
      btn.classList.remove('collapsed');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      btn.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  e.target.innerText = allExpanded ? '↔️ Collapse All' : '↔️ Expand All';
});

// ==========================================
// INITIALIZATION DOM ELEMENT BINDINGS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const focFilterSelect = document.getElementById('focFilterSelect');
  
  // Set default sorting arrow values
  window.currentSortColumn = 'name';
  window.currentSortDirection = 'asc';
  updateOuterSortArrows(); // <--- Run this here!

  if (focFilterSelect) {
    const defaultWednesday = window.getUpcomingWednesdayString();
    focFilterSelect.value = defaultWednesday;
    window.loadStoredDataAndRender(defaultWednesday);
  } else {
    window.loadStoredDataAndRender();
  }
});
