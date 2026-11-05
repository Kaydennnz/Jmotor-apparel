const checkoutMessage = document.getElementById('checkout-message');
const emptyCart = document.getElementById('empty-cart');
const checkoutContent = document.getElementById('checkout-content');
const checkoutItems = document.getElementById('checkout-items');
const checkoutTotal = document.getElementById('checkout-total');
const checkoutForm = document.getElementById('checkout-form');
const addressFields = document.getElementById('address-fields');
const savedAddress = document.getElementById('saved-address');
const editAddressButton = document.getElementById('edit-address');
const referenceField = document.getElementById('reference-field');
const referenceInput = document.getElementById('reference-number');
const placeOrderButton = document.getElementById('place-order');
let hasSavedAddress = false;
let editingAddress = false;

// Format an amount in Philippine pesos.
function formatPrice(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Redirect to login when a protected API says the session is missing.
function redirectIfUnauthorized(response) {
  if (response.status === 401) {
    window.location.assign('/login.html');
    return true;
  }
  return false;
}

// Load the cart summary and saved shipping address.
async function loadCheckout() {
  checkoutMessage.textContent = 'Loading checkout...';

  try {
    const [cartResponse, addressResponse] = await Promise.all([
      fetch('/api/cart'),
      fetch('/api/address'),
    ]);

    if (redirectIfUnauthorized(cartResponse) || redirectIfUnauthorized(addressResponse)) {
      return;
    }

    const cart = await cartResponse.json();
    const address = await addressResponse.json();
    if (!cartResponse.ok) {
      throw new Error(cart.error || 'Could not load your cart.');
    }
    if (!addressResponse.ok) {
      throw new Error(address.error || 'Could not load your saved address.');
    }

    checkoutMessage.textContent = '';
    if (cart.items.length === 0) {
      emptyCart.hidden = false;
      checkoutContent.hidden = true;
      return;
    }

    emptyCart.hidden = true;
    checkoutContent.hidden = false;
    renderCartSummary(cart);
    showAddress(address);
  } catch (error) {
    checkoutMessage.textContent = error.message;
  }
}

// Render the items returned by the cart API.
function renderCartSummary(cart) {
  checkoutItems.replaceChildren();

  cart.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'checkout-item';

    const details = document.createElement('div');
    const name = document.createElement('p');
    name.className = 'checkout-item-name';
    name.textContent = item.productName;

    const options = document.createElement('p');
    options.className = 'checkout-item-options';
    options.textContent = `${item.size || 'Default size'} · ${item.color || 'Default color'} · Qty ${item.quantity}`;
    details.append(name, options);

    const lineTotal = document.createElement('strong');
    lineTotal.textContent = formatPrice(item.lineTotal);

    row.append(details, lineTotal);
    checkoutItems.append(row);
  });

  checkoutTotal.textContent = formatPrice(cart.total);
}

// Show a saved address or require the customer to enter one.
function showAddress(address) {
  if (!address) {
    hasSavedAddress = false;
    editingAddress = true;
    addressFields.hidden = false;
    setAddressFieldsDisabled(false);
    savedAddress.hidden = true;
    editAddressButton.hidden = true;
    return;
  }

  hasSavedAddress = true;
  editingAddress = false;
  setAddressField('recipientName', address.recipient_name);
  setAddressField('phone', address.recipient_phone);
  setAddressField('street', address.street_address);
  setAddressField('barangay', address.barangay);
  setAddressField('city', address.city);
  setAddressField('province', address.province);
  setAddressField('postalCode', address.postal_code);

  savedAddress.replaceChildren();
  [
    address.recipient_name,
    address.recipient_phone,
    address.street_address,
    address.barangay,
    address.city,
    address.province,
    address.postal_code,
  ].forEach((value) => {
    const line = document.createElement('p');
    line.textContent = value;
    savedAddress.append(line);
  });

  savedAddress.hidden = false;
  addressFields.hidden = true;
  setAddressFieldsDisabled(true);
  editAddressButton.hidden = false;
}

// Keep hidden address inputs out of validation and submitted form data.
function setAddressFieldsDisabled(disabled) {
  addressFields.querySelectorAll('input').forEach((input) => {
    input.disabled = disabled;
  });
}

// Fill one address form input.
function setAddressField(name, value) {
  checkoutForm.elements[name].value = value || '';
}

// Toggle between the saved address and editable address fields.
function toggleAddressEdit() {
  editingAddress = !editingAddress;
  addressFields.hidden = !editingAddress;
  setAddressFieldsDisabled(!editingAddress);
  savedAddress.hidden = editingAddress;
  editAddressButton.textContent = editingAddress ? 'Use saved address' : 'Edit address';
}

// Show the reference field only for GCash and bank transfer.
function updatePaymentFields() {
  const paymentMethod = checkoutForm.elements.paymentMethod.value;
  const needsReference = paymentMethod === 'gcash' || paymentMethod === 'bank transfer';
  referenceField.hidden = !needsReference;
  referenceInput.required = needsReference;
}

// Place an order with the fields accepted by the checkout endpoint.
async function placeOrder(event) {
  event.preventDefault();
  checkoutMessage.textContent = '';
  placeOrderButton.disabled = true;

  const formData = new FormData(checkoutForm);
  const body = {
    paymentMethod: formData.get('paymentMethod'),
  };
  if (body.paymentMethod === 'gcash' || body.paymentMethod === 'bank transfer') {
    body.referenceNumber = formData.get('referenceNumber');
  }
  if (!hasSavedAddress || editingAddress) {
    body.address = {
      recipientName: formData.get('recipientName'),
      phone: formData.get('phone'),
      street: formData.get('street'),
      barangay: formData.get('barangay'),
      city: formData.get('city'),
      province: formData.get('province'),
      postalCode: formData.get('postalCode'),
    };
  }

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();

    if (redirectIfUnauthorized(response)) {
      return;
    }
    if (!response.ok) {
      checkoutMessage.textContent = result.error || result.message || 'Could not place your order.';
      return;
    }

    window.location.assign(`/orders.html?new=${encodeURIComponent(result.orderId)}`);
  } catch (error) {
    checkoutMessage.textContent = 'Could not reach the server. Please try again.';
  } finally {
    placeOrderButton.disabled = false;
  }
}

editAddressButton.addEventListener('click', toggleAddressEdit);
checkoutForm.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
  input.addEventListener('change', updatePaymentFields);
});
checkoutForm.addEventListener('submit', placeOrder);

loadCheckout();
