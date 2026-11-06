const staffMessage = document.getElementById('staff-message');
const staffApp = document.getElementById('staff-app');
const orderStatusFilter = document.getElementById('order-status-filter');
const staffOrdersList = document.getElementById('staff-orders-list');
const staffOrderDetail = document.getElementById('staff-order-detail');
const staffStockForm = document.getElementById('staff-stock-form');

let selectedOrderId = null;

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
      window.location.assign('/login.html');
    }
    throw new Error(result.error || result.message || 'The request could not be completed.');
  }
  return result;
}

async function initializeStaffPage() {
  try {
    const response = await fetch('/api/auth/me');
    if (response.status === 401) {
      window.location.assign('/login.html');
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

    staffApp.hidden = false;
    await loadOrders();
  } catch (error) {
    setMessage(error.message);
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

staffStockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const variantId = staffStockForm.elements.variantId.value;
  const stockValue = staffStockForm.elements.stock.value;
  const stock = Number(stockValue);
  if (!/^[1-9]\d*$/.test(variantId) || !Number.isInteger(stock) || stock < 0) {
    setMessage('Enter a valid variant ID and a non-negative whole-number stock value.');
    return;
  }

  const button = staffStockForm.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage('');
  try {
    const result = await requestJson(
      `/api/staff/variants/${encodeURIComponent(variantId)}/stock`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock }),
      }
    );
    setMessage(result.message || 'Stock updated.');
    await loadOrders();
    if (selectedOrderId !== null) {
      await showOrder(selectedOrderId);
    }
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
});

orderStatusFilter.addEventListener('change', loadOrders);
initializeStaffPage();
