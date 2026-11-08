const staffMessage = document.getElementById('staff-message');
const staffApp = document.getElementById('staff-app');
const orderStatusFilter = document.getElementById('order-status-filter');
const staffOrdersList = document.getElementById('staff-orders-list');
const staffOrderDetail = document.getElementById('staff-order-detail');
const staffStockMessage = document.getElementById('staff-stock-message');
const staffVariantsList = document.getElementById('staff-variants-list');
const staffAdminLink = document.getElementById('staff-admin-link');
const staffSections = {
  orders: document.getElementById('staff-orders-panel'),
  stock: document.getElementById('staff-stock-panel'),
};
const staffSidebarPreferenceKey = 'jmotor-staff-sidebar-open';

let selectedOrderId = null;
let staffCategories = [];
let staffVariants = [];
let staffCategoriesLoaded = false;
let staffVariantsLoaded = false;
const stockRowMessages = new Map();

function formatPrice(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function setMessage(message) {
  staffMessage.textContent = message;
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

function initializeSidebar() {
  const layout = document.querySelector('.portal-layout');
  const sidebarToggle = document.querySelector('.portal-sidebar-toggle');
  const contentToggle = document.querySelector('.portal-content-toggle');
  let isOpen = window.matchMedia('(min-width: 801px)').matches;
  try {
    const savedPreference = window.localStorage.getItem(staffSidebarPreferenceKey);
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
        window.localStorage.setItem(staffSidebarPreferenceKey, String(nextIsOpen));
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

function getSectionFromHash() {
  const section = window.location.hash.slice(1).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(staffSections, section)) {
    return section;
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#orders`);
  return 'orders';
}

async function initializeStaffPage() {
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
    if (user.role !== 'staff' && user.role !== 'admin') {
      setMessage('Access denied');
      return;
    }

    staffAdminLink.hidden = user.role !== 'admin';
    staffApp.hidden = false;
    await selectSection(getSectionFromHash());
  } catch (error) {
    setMessage(error.message);
  }
}

async function selectSection(section) {
  Object.entries(staffSections).forEach(([name, panel]) => {
    panel.hidden = name !== section;
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
  document.getElementById('staff-portal-heading').textContent =
    section === 'orders' ? 'Orders' : 'Stock';

  if (section === 'orders') {
    await loadOrders();
  } else {
    await loadStock();
  }
}

async function loadOrders() {
  setMessage('Loading orders...');
  const status = orderStatusFilter.value;
  const query = status ? `?status=${encodeURIComponent(status)}` : '';

  try {
    const orders = await requestJson(`/api/staff/orders${query}`);
    staffOrdersList.replaceChildren();

    if (orders.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'staff-empty';
      cell.textContent = 'No orders found.';
      row.append(cell);
      staffOrdersList.append(row);
    } else {
      orders.forEach((order) => {
        staffOrdersList.append(createOrderRow(order));
      });
    }
    setMessage('');
  } catch (error) {
    setMessage(error.message);
  }
}

function createOrderRow(order) {
  const row = document.createElement('tr');
  row.className = 'staff-order-row';
  row.dataset.orderId = String(order.id);
  row.tabIndex = 0;
  row.setAttribute('aria-label', `View order ${order.id}, ${order.status}`);
  if (String(order.id) === String(selectedOrderId)) {
    row.classList.add('is-selected');
  }

  const values = [
    `#${order.id}`,
    formatDate(order.created_at),
    order.customerName || '—',
    order.status,
    formatPrice(order.total),
    order.paymentMethod || '—',
    order.paymentStatus || '—',
  ];

  values.forEach((value, index) => {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (index === 0) {
      cell.className = 'staff-order-id';
    }
    row.append(cell);
  });

  row.addEventListener('click', () => showOrder(order.id));
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      showOrder(order.id);
    }
  });
  return row;
}

async function showOrder(orderId) {
  selectedOrderId = orderId;
  staffOrdersList.querySelectorAll('.staff-order-row').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.orderId === String(orderId));
  });
  staffOrderDetail.hidden = true;
  try {
    const order = await requestJson(
      `/api/staff/orders/${encodeURIComponent(orderId)}`
    );
    renderOrderDetail(order);
    staffOrderDetail.hidden = false;
  } catch (error) {
    setMessage(error.message);
  }
}

function appendSectionHeading(parent, text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  parent.append(heading);
}

function renderOrderDetail(order) {
  staffOrderDetail.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = `Order #${order.id}`;
  const summary = document.createElement('p');
  summary.className = 'staff-detail-summary';
  summary.textContent = `Customer: ${order.customerName} · Status: ${order.status} · Total: ${formatPrice(order.total)}`;
  staffOrderDetail.append(heading, summary);

  appendSectionHeading(staffOrderDetail, 'Items');
  const items = document.createElement('div');
  items.className = 'staff-detail-items';
  order.items.forEach((item) => {
    const itemRow = document.createElement('p');
    itemRow.textContent = `${item.productName} · ${item.size || 'Default size'} · ${item.color || 'Default color'} · Qty ${item.quantity} · ${formatPrice(Number(item.unitPrice) * Number(item.quantity))}`;
    items.append(itemRow);
  });
  staffOrderDetail.append(items);

  appendSectionHeading(staffOrderDetail, 'Shipping address');
  const address = document.createElement('p');
  address.className = 'staff-address';
  address.textContent = `${order.recipientName} · ${order.recipientPhone}\n${order.shippingAddress}`;
  staffOrderDetail.append(address);

  appendSectionHeading(staffOrderDetail, 'Payment');
  const payments = document.createElement('div');
  payments.className = 'staff-payment-list';
  if (order.payments.length === 0) {
    const noPayments = document.createElement('p');
    noPayments.textContent = 'No payment records.';
    payments.append(noPayments);
  } else {
    order.payments.forEach((payment) => {
      const paymentRow = document.createElement('p');
      paymentRow.textContent = `${payment.method} · ${payment.status} · ${formatPrice(payment.amount)} · Reference: ${payment.referenceNumber || 'None'}`;
      payments.append(paymentRow);
    });
  }
  staffOrderDetail.append(payments);

  appendSectionHeading(staffOrderDetail, 'Status log');
  const statusLog = document.createElement('ol');
  statusLog.className = 'staff-status-log';
  if (order.statusLog.length === 0) {
    const entry = document.createElement('li');
    entry.textContent = 'No status changes recorded.';
    statusLog.append(entry);
  } else {
    order.statusLog.forEach((log) => {
      const entry = document.createElement('li');
      const change = `${log.oldStatus} → ${log.newStatus}`;
      const reason = log.reason ? ` · ${log.reason}` : '';
      entry.textContent = `${formatDate(log.createdAt)} · ${change} · ${log.changedByName}${reason}`;
      statusLog.append(entry);
    });
  }
  staffOrderDetail.append(statusLog);

  const actions = document.createElement('div');
  actions.className = 'staff-order-actions';
  const nextStatus = {
    pending: ['confirmed', 'Confirm'],
    confirmed: ['packed', 'Pack'],
    packed: ['shipped', 'Ship'],
    shipped: ['delivered', 'Mark delivered'],
  }[order.status];
  if (nextStatus) {
    actions.append(createActionButton(
      nextStatus[1],
      (button) => changeStatus(order.id, nextStatus[0], button)
    ));
  }
  if (['pending', 'confirmed', 'packed'].includes(order.status)) {
    actions.append(createActionButton(
      'Cancel order',
      (button) => cancelOrder(order.id, button),
      'cancel-order-button'
    ));
  }
  if (order.payments.some((payment) => (
    ['gcash', 'bank_transfer'].includes(payment.method) && payment.status === 'unpaid'
  ))) {
    actions.append(createActionButton('Mark as paid', (button) => markPaid(order.id, button)));
  }
  if (actions.childElementCount > 0) {
    staffOrderDetail.append(actions);
  }
}

function createActionButton(label, action, className = 'add-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', () => action(button));
  return button;
}

async function runOrderAction(orderId, button, url, options) {
  button.disabled = true;
  setMessage('');
  try {
    await requestJson(url, options);
    await loadOrders();
    await showOrder(orderId);
  } catch (error) {
    setMessage(error.message);
    button.disabled = false;
  }
}

function changeStatus(orderId, status, button) {
  runOrderAction(orderId, button, `/api/staff/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

function cancelOrder(orderId, button) {
  const reason = window.prompt('Enter a reason for cancelling this order:');
  if (reason === null) {
    return;
  }
  if (!reason.trim()) {
    setMessage('A cancellation reason is required.');
    return;
  }
  runOrderAction(
    orderId,
    button,
    `/api/staff/orders/${encodeURIComponent(orderId)}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    }
  );
}

function markPaid(orderId, button) {
  runOrderAction(
    orderId,
    button,
    `/api/staff/orders/${encodeURIComponent(orderId)}/mark-paid`,
    { method: 'POST' }
  );
}

async function loadStock() {
  staffStockMessage.textContent = 'Loading stock...';
  try {
    if (!staffCategoriesLoaded) {
      staffCategories = await requestJson('/api/categories');
      populateStockCategories();
      staffCategoriesLoaded = true;
    }
    if (!staffVariantsLoaded) {
      staffVariants = await requestJson('/api/staff/variants');
      staffVariantsLoaded = true;
    }
    renderStock();
    staffStockMessage.textContent = '';
  } catch (error) {
    staffStockMessage.textContent = error.message;
  }
}

function populateStockCategories() {
  const select = document.getElementById('staff-stock-category');
  staffCategories.forEach((category) => {
    const option = document.createElement('option');
    option.value = String(category.id);
    option.textContent = category.name;
    select.append(option);
  });
}

function renderStock() {
  const search = document.getElementById('staff-stock-search').value.trim().toLocaleLowerCase();
  const categoryId = document.getElementById('staff-stock-category').value;
  const lowOnly = document.getElementById('staff-low-stock-only').checked;
  const categoryNames = new Map(staffCategories.map((category) => [
    category.name,
    String(category.id),
  ]));
  const variants = staffVariants
    .filter((variant) => {
      const matchesName = variant.productName.toLocaleLowerCase().includes(search);
      const matchesCategory = !categoryId || categoryNames.get(variant.categoryName) === categoryId;
      const matchesStock = !lowOnly || Number(variant.stock) < 5;
      return matchesName && matchesCategory && matchesStock;
    })
    .sort((left, right) => (
      Number(left.stock) - Number(right.stock)
      || left.productName.localeCompare(right.productName)
      || Number(left.variantId) - Number(right.variantId)
    ));

  staffVariantsList.replaceChildren();
  stockRowMessages.clear();
  if (variants.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'staff-empty';
    cell.colSpan = 6;
    cell.textContent = 'No variants found';
    row.append(cell);
    staffVariantsList.append(row);
    return;
  }

  variants.forEach((variant) => {
    const { row, messageRow } = createStockRow(variant);
    staffVariantsList.append(row, messageRow);
  });
}

function createStockRow(variant) {
  const row = document.createElement('tr');
  row.dataset.variantId = String(variant.variantId);
  row.append(
    createTextElement('td', '', variant.productName),
    createTextElement('td', '', variant.size || '—'),
    createTextElement('td', '', variant.color || '—')
  );

  const currentStock = document.createElement('td');
  currentStock.className = 'staff-current-stock';
  updateStockCell(currentStock, variant.stock);
  row.append(currentStock);

  const adjustCell = document.createElement('td');
  const adjustControls = document.createElement('div');
  adjustControls.className = 'staff-stock-controls';
  const deltaInput = document.createElement('input');
  deltaInput.type = 'number';
  deltaInput.step = '1';
  deltaInput.className = 'staff-stock-input';
  deltaInput.setAttribute('aria-label', `Add or remove stock for ${variant.productName}`);
  deltaInput.placeholder = '+ / −';
  const adjustButton = createStockButton('Apply', () => {
    adjustStock(variant, deltaInput, adjustButton, row);
  });
  adjustControls.append(deltaInput, adjustButton);
  adjustCell.append(adjustControls);
  row.append(adjustCell);

  const exactCell = document.createElement('td');
  const exactControls = document.createElement('div');
  exactControls.className = 'staff-stock-controls';
  const exactInput = document.createElement('input');
  exactInput.type = 'number';
  exactInput.min = '0';
  exactInput.step = '1';
  exactInput.className = 'staff-stock-input';
  exactInput.setAttribute('aria-label', `Set exact stock for ${variant.productName}`);
  exactInput.placeholder = 'Count';
  const exactButton = createStockButton('Set', () => {
    setExactStock(variant, exactInput, exactButton, row);
  }, 'secondary-button');
  exactControls.append(exactInput, exactButton);
  exactCell.append(exactControls);
  row.append(exactCell);

  const messageRow = document.createElement('tr');
  messageRow.className = 'staff-stock-row-message';
  messageRow.dataset.messageFor = String(variant.variantId);
  messageRow.hidden = true;
  const messageCell = document.createElement('td');
  messageCell.colSpan = 6;
  messageCell.setAttribute('role', 'status');
  messageRow.append(messageCell);
  stockRowMessages.set(String(variant.variantId), { cell: messageCell, row: messageRow });
  return { row, messageRow };
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function createStockButton(label, action, className = 'admin-small-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

function updateStockCell(cell, stock) {
  cell.replaceChildren(createTextElement('span', 'staff-stock-value', String(stock)));
  if (Number(stock) < 5) {
    cell.append(createTextElement('span', 'staff-low-badge', 'Low'));
  }
}

function setStockRowMessage(row, message) {
  const messageRow = stockRowMessages.get(row.dataset.variantId);
  messageRow.cell.textContent = message;
  messageRow.row.hidden = !message;
}

function updateVariantStock(variant, stock, row) {
  variant.stock = Number(stock);
  updateStockCell(row.querySelector('.staff-current-stock'), variant.stock);
}

async function adjustStock(variant, input, button, row) {
  button.disabled = true;
  setStockRowMessage(row, '');
  try {
    const result = await requestJson(
      `/api/staff/variants/${encodeURIComponent(variant.variantId)}/stock-adjust`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: input.valueAsNumber }),
      }
    );
    updateVariantStock(variant, result.stock, row);
    input.value = '';
    setStockRowMessage(row, result.message || 'Stock adjusted.');
  } catch (error) {
    setStockRowMessage(row, error.message);
  } finally {
    button.disabled = false;
  }
}

async function setExactStock(variant, input, button, row) {
  const stock = input.valueAsNumber;
  if (!Number.isInteger(stock) || stock < 0) {
    setStockRowMessage(row, 'Stock must be a non-negative integer.');
    return;
  }
  if (!window.confirm('Set this variant to the exact stock count entered?')) {
    return;
  }

  button.disabled = true;
  setStockRowMessage(row, '');
  try {
    const result = await requestJson(
      `/api/staff/variants/${encodeURIComponent(variant.variantId)}/stock`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock }),
      }
    );
    updateVariantStock(variant, result.stock, row);
    input.value = '';
    setStockRowMessage(row, result.message || 'Stock updated.');
  } catch (error) {
    setStockRowMessage(row, error.message);
  } finally {
    button.disabled = false;
  }
}

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
document.querySelector('[data-staff-logout]').addEventListener('click', (event) => {
  window.logout(event);
});
orderStatusFilter.addEventListener('change', loadOrders);
document.getElementById('staff-stock-search').addEventListener('input', renderStock);
document.getElementById('staff-stock-category').addEventListener('change', renderStock);
document.getElementById('staff-low-stock-only').addEventListener('change', renderStock);
initializeStaffPage();
