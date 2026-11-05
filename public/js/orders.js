const ordersList = document.getElementById('orders-list');
const ordersMessage = document.getElementById('orders-message');
const orderDetail = document.getElementById('order-detail');
const newOrderBanner = document.getElementById('new-order-banner');

// Format an amount in Philippine pesos.
function formatPrice(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Format the order date for display.
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

// Redirect to login when a protected API says the session is missing.
function redirectIfUnauthorized(response) {
  if (response.status === 401) {
    window.location.assign('/login.html');
    return true;
  }
  return false;
}

// Load the signed-in user's order history.
async function loadOrders() {
  ordersMessage.textContent = 'Loading orders...';

  const newOrderId = new URLSearchParams(window.location.search).get('new');
  if (newOrderId && /^[1-9]\d*$/.test(newOrderId)) {
    newOrderBanner.textContent = `Order #${newOrderId} placed`;
    newOrderBanner.hidden = false;
  }

  try {
    const response = await fetch('/api/orders');
    if (redirectIfUnauthorized(response)) {
      return;
    }

    const orders = await response.json();
    if (!response.ok) {
      throw new Error(orders.error || orders.message || 'Could not load your orders.');
    }

    ordersMessage.textContent = '';
    ordersList.replaceChildren();

    if (orders.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-message';
      empty.textContent = 'You have no orders yet.';
      ordersList.append(empty);
      return;
    }

    orders.forEach((order) => {
      ordersList.append(createOrderButton(order));
    });
  } catch (error) {
    ordersMessage.textContent = error.message;
  }
}

// Create an order summary button from the order list response.
function createOrderButton(order) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'order-list-item';
  button.setAttribute('aria-label', `Order ${order.id}, ${order.status}`);
  button.addEventListener('click', () => showOrder(order.id));

  const heading = document.createElement('span');
  heading.className = 'order-list-heading';
  heading.textContent = `Order #${order.id}`;

  const date = document.createElement('span');
  date.className = 'order-list-date';
  date.textContent = formatDate(order.created_at);

  const status = document.createElement('span');
  status.className = 'order-list-status';
  status.textContent = order.status;

  const payment = document.createElement('span');
  payment.className = 'order-list-payment';
  payment.textContent = `${order.paymentMethod || 'Payment'} · ${order.paymentStatus || 'Unknown'}`;

  const total = document.createElement('strong');
  total.textContent = formatPrice(order.total);

  button.append(heading, date, status, payment, total);
  return button;
}

// Load one order and show its address and purchased items.
async function showOrder(orderId) {
  ordersMessage.textContent = '';
  orderDetail.hidden = true;

  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
    if (redirectIfUnauthorized(response)) {
      return;
    }

    const order = await response.json();
    if (!response.ok) {
      throw new Error(order.error || order.message || 'Could not load this order.');
    }

    renderOrderDetail(order);
    orderDetail.hidden = false;
  } catch (error) {
    ordersMessage.textContent = error.message;
  }
}

// Render the order details with text nodes only.
function renderOrderDetail(order) {
  orderDetail.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = `Order #${order.id}`;

  const status = document.createElement('p');
  status.className = 'order-detail-status';
  status.textContent = `Status: ${order.status}`;

  const addressHeading = document.createElement('h3');
  addressHeading.textContent = 'Shipping address';

  const address = document.createElement('p');
  address.className = 'order-detail-address';
  address.textContent = `${order.recipientName} · ${order.recipientPhone}\n${order.shippingAddress}`;

  const itemsHeading = document.createElement('h3');
  itemsHeading.textContent = 'Items';

  const items = document.createElement('div');
  items.className = 'order-detail-items';
  order.items.forEach((item) => {
    items.append(createOrderDetailItem(item));
  });

  const total = document.createElement('p');
  total.className = 'order-detail-total';
  total.textContent = `Total: ${formatPrice(order.total)}`;

  orderDetail.append(heading, status, addressHeading, address, itemsHeading, items, total);

  if (order.status === 'pending' || order.status === 'confirmed') {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cancel-order-button';
    cancelButton.textContent = 'Cancel order';
    cancelButton.addEventListener('click', () => cancelOrder(order.id, cancelButton));
    orderDetail.append(cancelButton);
  }
}

// Create one purchased item row from the order detail response.
function createOrderDetailItem(item) {
  const row = document.createElement('div');
  row.className = 'order-detail-item';

  const description = document.createElement('p');
  description.textContent = `${item.productName} · ${item.size || 'Default size'} · ${item.color || 'Default color'} · Qty ${item.quantity}`;

  const subtotal = document.createElement('strong');
  subtotal.textContent = formatPrice(Number(item.unitPrice) * Number(item.quantity));
  row.append(description, subtotal);
  return row;
}

// Cancel a pending or confirmed order after asking for confirmation.
async function cancelOrder(orderId, button) {
  if (!window.confirm(`Cancel order #${orderId}?`)) {
    return;
  }

  button.disabled = true;
  ordersMessage.textContent = '';
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
    });
    const result = await response.json();

    if (redirectIfUnauthorized(response)) {
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || result.message || 'Could not cancel this order.');
    }

    await loadOrders();
    await showOrder(orderId);
  } catch (error) {
    ordersMessage.textContent = error.message;
    button.disabled = false;
  }
}

loadOrders();
