const adminMessage = document.getElementById('admin-message');
const adminApp = document.getElementById('admin-app');
const adminProducts = document.getElementById('admin-products');
const adminStaffList = document.getElementById('admin-staff-list');
const adminReports = document.getElementById('admin-reports');
const productDialog = document.getElementById('product-dialog');
const productForm = document.getElementById('product-form');
const variantDialog = document.getElementById('variant-dialog');
const variantForm = document.getElementById('variant-form');
const staffForm = document.getElementById('staff-form');

const orderStatuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];
const sectionTitles = {
  dashboard: 'Dashboard',
  products: 'Products',
  staff: 'Staff',
};
const sidebarPreferenceKey = 'jmotor-admin-sidebar-open';

let categories = [];
let categoriesLoaded = false;
let products = [];
let editingProductId = null;
let editingVariantId = null;
let variantProductId = null;

function setMessage(message) {
  adminMessage.textContent = message;
}

function formatPrice(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    maximumFractionDigits: 0,
  })}`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      window.location.assign('/admin-login.html');
    }
    throw new Error(result.error || result.message || 'The request could not be completed.');
  }
  return result;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function initializeAdminPage() {
  initializeSidebar();
  try {
    const response = await fetch('/api/auth/me');
    if (response.status === 401) {
      window.location.assign('/admin-login.html');
      return;
    }
    const user = await response.json();
    if (!response.ok) {
      throw new Error(user.error || user.message || 'Could not verify your account.');
    }
    if (user.role !== 'admin') {
      setMessage('Access denied');
      return;
    }

    adminApp.hidden = false;
    await selectSection(getSectionFromHash());
  } catch (error) {
    setMessage(error.message);
  }
}

function getSectionFromHash() {
  const section = window.location.hash.slice(1).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(sectionTitles, section)) {
    return section;
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
  return 'dashboard';
}

async function ensureCategories() {
  if (categoriesLoaded) {
    return;
  }
  categories = await requestJson('/api/categories');
  categoriesLoaded = true;
  populateCategoryOptions();
}

function populateCategoryOptions() {
  const select = document.getElementById('product-category');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a category';
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);
  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = String(category.id);
    option.textContent = category.name;
    select.append(option);

    const filterOption = document.createElement('option');
    filterOption.value = String(category.id);
    filterOption.textContent = category.name;
    document.getElementById('product-category-filter').append(filterOption);
  });
}

async function loadProducts() {
  products = await requestJson('/api/admin/products');
  applyProductFilters();
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function createTable(headers, className) {
  const table = document.createElement('table');
  table.className = className;
  const thead = document.createElement('thead');
  const headingRow = document.createElement('tr');
  headers.forEach((label) => headingRow.append(createTextElement('th', '', label)));
  thead.append(headingRow);
  table.append(thead, document.createElement('tbody'));
  return table;
}

function renderProducts(products) {
  adminProducts.replaceChildren();
  if (products.length === 0) {
    adminProducts.append(createTextElement('p', 'admin-empty portal-empty', 'No products found'));
    return;
  }

  const table = createTable(
    ['Product', 'Category', 'Price range', 'Total stock', 'Status', 'Actions'],
    'portal-data-table portal-products-table'
  );
  const tbody = table.tBodies[0];
  products.forEach((product) => {
    const { productRow, variantsRow } = createProductRows(product);
    tbody.append(productRow, variantsRow);
  });
  adminProducts.append(table);
}

function createProductRows(product) {
  const row = document.createElement('tr');
  const nameCell = document.createElement('td');
  nameCell.className = 'portal-product-name-cell';
  const nameButton = createButton(product.name, () => {
    variantsRow.hidden = !variantsRow.hidden;
    nameButton.setAttribute('aria-expanded', String(!variantsRow.hidden));
    chevron.textContent = variantsRow.hidden ? '›' : '⌄';
    chevron.setAttribute('aria-expanded', String(!variantsRow.hidden));
  }, 'portal-product-toggle');
  nameButton.setAttribute('aria-expanded', 'false');
  const chevron = createButton('›', () => nameButton.click(), 'portal-chevron-button');
  chevron.setAttribute('aria-label', `Show variants for ${product.name}`);
  chevron.setAttribute('aria-expanded', 'false');
  nameCell.append(chevron, nameButton);

  const prices = product.variants.map((variant) => Number(variant.price));
  const priceRange = prices.length
    ? prices.length === 1
      ? formatPrice(prices[0])
      : `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`
    : '—';
  const totalStock = product.variants.reduce((total, variant) => total + Number(variant.stock), 0);
  const statusCell = document.createElement('td');
  statusCell.append(createStatusBadge(product.active ? 'Active' : 'Inactive', product.active ? 'active' : 'inactive'));
  row.append(
    nameCell,
    createTextElement('td', '', product.category.name),
    createTextElement('td', '', priceRange),
    createTextElement('td', '', String(totalStock)),
    statusCell,
    createActionCell([
      createButton('Edit', () => openProductDialog(product)),
      createButton('Add variant', () => openVariantDialog(product.id)),
    ])
  );

  const variantsRow = document.createElement('tr');
  variantsRow.className = 'portal-product-variants-row';
  variantsRow.hidden = true;
  const variantsCell = document.createElement('td');
  variantsCell.colSpan = 6;
  variantsCell.append(createVariantsTable(product));
  variantsRow.append(variantsCell);
  return { productRow: row, variantsRow };
}

function createVariantsTable(product) {
  const wrapper = document.createElement('div');
  wrapper.className = 'portal-variants-wrap';
  if (product.variants.length === 0) {
    wrapper.append(createTextElement('p', 'admin-empty portal-empty', 'No variants.'));
    return wrapper;
  }

  const table = createTable(
    ['ID', 'Size', 'Color', 'Price', 'Stock', ''],
    'portal-data-table portal-variants-table'
  );
  const tbody = table.tBodies[0];
  product.variants.forEach((variant) => {
    const row = document.createElement('tr');
    row.append(
      createTextElement('td', '', `#${variant.id}`),
      createTextElement('td', '', variant.size || 'Default size'),
      createTextElement('td', '', variant.color || 'Default color'),
      createTextElement('td', '', formatPrice(variant.price)),
      createTextElement('td', '', String(variant.stock)),
      createActionCell([
        createButton('Edit variant', () => openVariantDialog(product.id, variant)),
      ])
    );
    tbody.append(row);
  });
  wrapper.append(table);
  return wrapper;
}

function createActionCell(buttons) {
  const cell = document.createElement('td');
  cell.className = 'portal-actions-cell';
  const actions = document.createElement('div');
  actions.className = 'portal-action-buttons';
  buttons.forEach((button) => actions.append(button));
  cell.append(actions);
  return cell;
}

function createStatusBadge(label, status) {
  const badge = createTextElement('span', 'portal-badge', label);
  badge.classList.add(`portal-badge--${status}`);
  return badge;
}

function createButton(label, action, className = 'admin-small-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function openProductDialog(product = null) {
  editingProductId = product ? product.id : null;
  document.getElementById('product-dialog-title').textContent = product ? 'Edit product' : 'Add product';
  productForm.elements.name.value = product ? product.name : '';
  productForm.elements.description.value = product ? product.description || '' : '';
  productForm.elements.categoryId.value = product ? String(product.category.id) : '';
  document.getElementById('active-field').hidden = !product;
  document.getElementById('product-active').checked = product ? product.active : true;
  document.getElementById('new-variants-field').hidden = Boolean(product);
  document.getElementById('new-variant-rows').replaceChildren();
  clearFormError(productForm);
  if (!product) {
    addVariantRow();
  }
  productDialog.showModal();
}

function addVariantRow(variant = {}) {
  const row = document.createElement('fieldset');
  row.className = 'admin-variant-row';
  const legend = document.createElement('legend');
  legend.textContent = 'Variant';
  row.append(legend);

  const fields = [
    ['size', 'Size', 'text', 30],
    ['color', 'Color', 'text', 50],
    ['price', 'Price (whole number)', 'number', null],
    ['stock', 'Stock', 'number', null],
  ];
  fields.forEach(([name, labelText, type, maxLength]) => {
    const wrapper = document.createElement('div');
    const label = document.createElement('label');
    const input = document.createElement('input');
    const id = `new-variant-${name}-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = id;
    label.textContent = labelText;
    input.id = id;
    input.name = name;
    input.type = type;
    if (maxLength) {
      input.maxLength = maxLength;
    } else {
      input.min = name === 'price' ? '1' : '0';
      input.step = '1';
      input.required = true;
    }
    if (variant[name] !== null && variant[name] !== undefined) {
      input.value = String(variant[name]);
    }
    wrapper.append(label, input);
    row.append(wrapper);
  });

  const remove = createButton('Remove row', () => {
    row.remove();
    updateVariantRowRemoveButtons();
  }, 'admin-remove-button');
  row.append(remove);
  document.getElementById('new-variant-rows').append(row);
  updateVariantRowRemoveButtons();
}

function updateVariantRowRemoveButtons() {
  const rows = document.querySelectorAll('.admin-variant-row');
  rows.forEach((row) => {
    row.querySelector('.admin-remove-button').hidden = rows.length <= 1;
  });
}

function readVariantRow(row) {
  return {
    size: row.querySelector('[name="size"]').value || null,
    color: row.querySelector('[name="color"]').value || null,
    price: row.querySelector('[name="price"]').valueAsNumber,
    stock: row.querySelector('[name="stock"]').valueAsNumber,
  };
}

function validateVariants(variants) {
  if (variants.length === 0) {
    return 'At least one variant is required.';
  }
  if (variants.some((variant) => !Number.isInteger(variant.price) || variant.price <= 0)) {
    return 'Variant price must be a positive whole number.';
  }
  if (variants.some((variant) => !Number.isInteger(variant.stock) || variant.stock < 0)) {
    return 'Variant stock must be a non-negative whole number.';
  }
  return '';
}

function clearFormError(form) {
  form.querySelector('.admin-form-error').textContent = '';
}

function setFormError(form, message) {
  form.querySelector('.admin-form-error').textContent = message;
}

async function saveProduct(event) {
  event.preventDefault();
  clearFormError(productForm);
  const name = productForm.elements.name.value.trim();
  const description = productForm.elements.description.value;
  const categoryId = Number(productForm.elements.categoryId.value);
  if (!name || !Number.isInteger(categoryId) || categoryId < 1) {
    setFormError(productForm, 'Enter a product name and choose a category.');
    return;
  }

  const body = { name, description, categoryId };
  if (editingProductId !== null) {
    body.active = document.getElementById('product-active').checked;
  } else {
    body.variants = Array.from(
      document.querySelectorAll('.admin-variant-row'),
      readVariantRow
    );
    const validationError = validateVariants(body.variants);
    if (validationError) {
      setFormError(productForm, validationError);
      return;
    }
  }

  const submitButton = productForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    if (editingProductId === null) {
      await requestJson('/api/admin/products', jsonOptions('POST', body));
    } else {
      await requestJson(
        `/api/admin/products/${encodeURIComponent(editingProductId)}`,
        jsonOptions('PATCH', body)
      );
    }
    productDialog.close();
    await refreshProducts();
  } catch (error) {
    setFormError(productForm, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function refreshProducts() {
  setMessage('Refreshing products...');
  try {
    await loadProducts();
    setMessage('');
  } catch (error) {
    setMessage(error.message);
  }
}

function openVariantDialog(productId, variant = null) {
  variantProductId = productId;
  editingVariantId = variant ? variant.id : null;
  document.getElementById('variant-dialog-title').textContent = variant ? 'Edit variant' : 'Add variant';
  variantForm.elements.size.value = variant ? variant.size || '' : '';
  variantForm.elements.color.value = variant ? variant.color || '' : '';
  variantForm.elements.price.value = variant ? String(variant.price) : '';
  variantForm.elements.stock.value = variant ? String(variant.stock) : '';
  clearFormError(variantForm);
  variantDialog.showModal();
}

async function saveVariant(event) {
  event.preventDefault();
  clearFormError(variantForm);
  const variant = {
    size: variantForm.elements.size.value || null,
    color: variantForm.elements.color.value || null,
    price: variantForm.elements.price.valueAsNumber,
    stock: variantForm.elements.stock.valueAsNumber,
  };
  const validationError = validateVariants([variant]);
  if (validationError) {
    setFormError(variantForm, validationError);
    return;
  }

  const submitButton = variantForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    if (editingVariantId === null) {
      await requestJson(
        `/api/admin/products/${encodeURIComponent(variantProductId)}/variants`,
        jsonOptions('POST', variant)
      );
    } else {
      await requestJson(
        `/api/admin/variants/${encodeURIComponent(editingVariantId)}`,
        jsonOptions('PATCH', variant)
      );
    }
    variantDialog.close();
    await refreshProducts();
  } catch (error) {
    setFormError(variantForm, error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function loadStaff() {
  const staff = await requestJson('/api/admin/staff');
  adminStaffList.replaceChildren();
  if (staff.length === 0) {
    adminStaffList.append(createTextElement('p', 'admin-empty portal-empty', 'No staff accounts.'));
    return;
  }

  const table = createTable(['Display name', 'Username', 'Role'], 'portal-data-table portal-staff-table');
  const tbody = table.tBodies[0];
  staff.forEach((user) => {
    const row = document.createElement('tr');
    const roleCell = document.createElement('td');
    roleCell.append(createStatusBadge(user.role, user.role === 'admin' ? 'active' : 'staff'));
    row.append(
      createTextElement('td', '', user.displayName),
      createTextElement('td', '', user.username),
      roleCell
    );
    tbody.append(row);
  });
  adminStaffList.append(table);
}

async function createStaff(event) {
  event.preventDefault();
  const submitButton = staffForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage('');
  try {
    const body = {
      username: staffForm.elements.username.value.trim(),
      password: staffForm.elements.password.value,
      displayName: staffForm.elements.displayName.value.trim(),
    };
    const result = await requestJson('/api/admin/staff', jsonOptions('POST', body));
    staffForm.reset();
    await loadStaff();
    setMessage(result.message || 'Staff account created.');
  } catch (error) {
    setMessage(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function loadDashboard() {
  const [report, orders] = await Promise.all([
    requestJson('/api/admin/reports'),
    requestJson('/api/staff/orders'),
  ]);
  renderDashboard(report, orders);
}

function renderDashboard(report, orders) {
  adminReports.replaceChildren();
  const counts = new Map(report.orderCounts.map((entry) => [entry.status, Number(entry.count)]));
  const totalOrders = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const stats = document.createElement('div');
  stats.className = 'portal-stat-grid';
  [
    ['Total sales', formatPrice(report.totalSales), 'Delivered orders'],
    ['Pending orders', String(counts.get('pending') || 0), 'Awaiting action'],
    ['Total orders', String(totalOrders), 'All order statuses'],
    ['Low-stock items', String(report.lowStockVariants.length), 'Variants under 5'],
  ].forEach(([label, value, note]) => {
    const card = document.createElement('article');
    card.className = 'portal-stat-card';
    card.append(
      createTextElement('p', 'portal-stat-label', label),
      createTextElement('p', 'portal-stat-value', value),
      createTextElement('p', 'portal-stat-note', note)
    );
    stats.append(card);
  });
  adminReports.append(stats);

  const columns = document.createElement('div');
  columns.className = 'portal-dashboard-grid';
  columns.append(createOrderChart(report.orderCounts), createLowStockPanel(report.lowStockVariants));
  adminReports.append(columns, createRecentOrdersPanel(orders));
}

function createOrderChart(orderCounts) {
  const card = document.createElement('section');
  card.className = 'portal-card';
  card.append(createTextElement('h2', 'portal-card-title', 'Orders by status'));

  const chart = document.createElement('div');
  chart.className = 'portal-status-chart';
  const maximum = Math.max(1, ...orderCounts.map((entry) => Number(entry.count)));
  orderCounts.forEach(({ status, count }) => {
    const row = document.createElement('div');
    row.className = 'portal-chart-row';
    const label = createStatusBadge(status, status);
    const track = document.createElement('div');
    track.className = 'portal-chart-track';
    const bar = document.createElement('div');
    bar.className = 'portal-chart-bar';
    bar.classList.add(`portal-chart-bar--${orderStatuses.includes(status) ? status : 'pending'}`);
    bar.style.width = `${Math.max(0, Number(count) / maximum * 100)}%`;
    track.append(bar);
    row.append(label, track, createTextElement('strong', 'portal-chart-count', String(count)));
    chart.append(row);
  });
  card.append(chart);
  return card;
}

function createLowStockPanel(variants) {
  const card = document.createElement('section');
  card.className = 'portal-card';
  card.append(createTextElement('h2', 'portal-card-title', 'Low stock'));
  if (variants.length === 0) {
    card.append(createTextElement('p', 'admin-empty portal-empty', 'No variants have stock under 5.'));
    return card;
  }

  const list = document.createElement('ul');
  list.className = 'portal-low-stock-list';
  variants.forEach((variant) => {
    const item = document.createElement('li');
    const details = createTextElement(
      'span',
      'portal-low-stock-details',
      `${variant.size || 'Default size'} · ${variant.color || 'Default color'}`
    );
    item.append(
      createTextElement('strong', '', variant.productName),
      details,
      createTextElement('span', 'portal-stock-count', String(variant.stock))
    );
    list.append(item);
  });
  card.append(list);
  return card;
}

function createRecentOrdersPanel(orders) {
  const card = document.createElement('section');
  card.className = 'portal-card portal-recent-orders';
  const heading = document.createElement('div');
  heading.className = 'portal-card-heading';
  heading.append(
    createTextElement('h2', 'portal-card-title', 'Recent orders'),
    createTextElement('a', 'portal-text-link', 'View all orders')
  );
  heading.lastElementChild.href = '/staff.html';
  card.append(heading);

  const scroll = document.createElement('div');
  scroll.className = 'portal-table-scroll';
  const table = createTable(['Order', 'Customer', 'Status', 'Total'], 'portal-data-table');
  const tbody = table.tBodies[0];
  const recentOrders = orders.slice(0, 5);
  if (recentOrders.length === 0) {
    const row = document.createElement('tr');
    const cell = createTextElement('td', 'portal-empty', 'No orders found.');
    cell.colSpan = 4;
    row.append(cell);
    tbody.append(row);
  } else {
    recentOrders.forEach((order) => {
      const row = document.createElement('tr');
      const status = orderStatuses.includes(order.status) ? order.status : 'pending';
      const statusCell = document.createElement('td');
      statusCell.append(createStatusBadge(order.status, status));
      row.append(
        createTextElement('td', '', `#${order.id}`),
        createTextElement('td', '', order.customerName || '—'),
        statusCell,
        createTextElement('td', '', formatPrice(order.total))
      );
      tbody.append(row);
    });
  }
  scroll.append(table);
  card.append(scroll);
  return card;
}

async function selectSection(section) {
  document.querySelectorAll('.portal-section').forEach((panel) => {
    panel.hidden = panel.dataset.section !== section;
  });
  document.querySelectorAll('.portal-nav-item[href^="#"]').forEach((link) => {
    const active = link.hash === `#${section}`;
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
  document.getElementById('portal-heading').textContent = sectionTitles[section];
  setMessage(`Loading ${sectionTitles[section].toLowerCase()}...`);

  try {
    if (section === 'dashboard') {
      await loadDashboard();
    } else if (section === 'products') {
      await ensureCategories();
      await loadProducts();
    } else if (section === 'staff') {
      await loadStaff();
    }
    setMessage('');
  } catch (error) {
    setMessage(error.message);
  }
}

function initializeSidebar() {
  const layout = document.querySelector('.portal-layout');
  const sidebarToggle = document.querySelector('.portal-sidebar-toggle');
  const contentToggle = document.querySelector('.portal-content-toggle');
  let isOpen = window.matchMedia('(min-width: 801px)').matches;
  try {
    const savedPreference = window.localStorage.getItem(sidebarPreferenceKey);
    if (savedPreference !== null) {
      isOpen = savedPreference === 'true';
    }
  } catch (error) {
    // Keep the viewport-based default if storage is unavailable.
  }
  setSidebarOpen(layout, sidebarToggle, contentToggle, isOpen);

  [sidebarToggle, contentToggle].forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const nextIsOpen = layout.classList.contains('is-sidebar-hidden');
      setSidebarOpen(layout, sidebarToggle, contentToggle, nextIsOpen);
      try {
        window.localStorage.setItem(sidebarPreferenceKey, String(nextIsOpen));
      } catch (error) {
        // The control remains usable when storage is unavailable.
      }
    });
  });
}

function setSidebarOpen(layout, sidebarToggle, contentToggle, isOpen) {
  layout.classList.toggle('is-sidebar-hidden', !isOpen);
  sidebarToggle.setAttribute('aria-expanded', String(isOpen));
  contentToggle.setAttribute('aria-expanded', String(isOpen));
  contentToggle.hidden = isOpen;
}

function applyProductFilters() {
  const search = document.getElementById('product-search').value.trim().toLocaleLowerCase();
  const categoryId = document.getElementById('product-category-filter').value;
  const status = document.getElementById('product-status-filter').value;
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLocaleLowerCase().includes(search);
    const matchesCategory = !categoryId || String(product.category.id) === categoryId;
    const matchesStatus = !status || (product.active ? 'active' : 'inactive') === status;
    return matchesSearch && matchesCategory && matchesStatus;
  });
  renderProducts(filteredProducts);
}

document.getElementById('product-search').addEventListener('input', applyProductFilters);
document.getElementById('product-category-filter').addEventListener('change', applyProductFilters);
document.getElementById('product-status-filter').addEventListener('change', applyProductFilters);

document.querySelectorAll('.portal-nav-item[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    if (link.hash !== window.location.hash) {
      window.location.hash = link.hash;
    } else {
      selectSection(link.hash.slice(1));
    }
  });
});
window.addEventListener('hashchange', () => {
  selectSection(getSectionFromHash());
});

document.querySelector('[data-portal-logout]').addEventListener('click', (event) => {
  window.logout(event);
});
document.getElementById('add-product-button').addEventListener('click', async () => {
  try {
    await ensureCategories();
    openProductDialog();
  } catch (error) {
    setMessage(error.message);
  }
});
document.getElementById('add-variant-row').addEventListener('click', () => addVariantRow());
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
productForm.addEventListener('submit', saveProduct);
variantForm.addEventListener('submit', saveVariant);
staffForm.addEventListener('submit', createStaff);

initializeAdminPage();
