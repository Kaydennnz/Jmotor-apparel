const cartItems = document.getElementById('cart-items');
const cartMessage = document.getElementById('cart-message');
const cartSummary = document.getElementById('cart-summary');
const cartTotal = document.getElementById('cart-total');

// Format a price in Philippine pesos.
function formatPrice(price) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Load the signed-in user's cart.
async function loadCart() {
  cartItems.replaceChildren();
  cartMessage.textContent = 'Loading cart...';

  try {
    const response = await fetch('/api/cart');
    const result = await response.json();

    if (response.status === 401) {
      window.location.assign('/login.html');
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Could not load your cart.');
    }

    cartMessage.textContent = '';
    cartSummary.hidden = result.items.length === 0;
    cartTotal.textContent = formatPrice(result.total);

    if (result.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-message';
      empty.textContent = 'Your cart is empty.';
      cartItems.append(empty);
      return;
    }

    result.items.forEach((item) => {
      cartItems.append(createCartItem(item));
    });
  } catch (error) {
    cartSummary.hidden = true;
    cartMessage.textContent = error.message;
  }
}

// Build one cart row using safe text nodes.
function createCartItem(item) {
  const row = document.createElement('article');
  row.className = 'cart-item';

  const details = document.createElement('div');
  details.className = 'cart-item-details';

  const name = document.createElement('h2');
  name.className = 'cart-item-name';
  name.textContent = item.productName;

  const options = document.createElement('p');
  options.className = 'cart-item-options';
  options.textContent = [
    item.size || 'Default size',
    item.color || 'Default color',
  ].join(' · ');

  const unitPrice = document.createElement('p');
  unitPrice.className = 'cart-item-unit-price';
  unitPrice.textContent = `${formatPrice(item.unitPrice)} each`;
  details.append(name, options, unitPrice);

  const quantityLabel = document.createElement('label');
  quantityLabel.className = 'cart-quantity-label';
  quantityLabel.textContent = 'Qty';
  const quantityInput = document.createElement('input');
  quantityInput.className = 'cart-quantity-input';
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.max = '99';
  quantityInput.step = '1';
  quantityInput.value = item.quantity;
  quantityInput.setAttribute('aria-label', `Quantity for ${item.productName}`);
  quantityLabel.append(quantityInput);

  const lineTotal = document.createElement('p');
  lineTotal.className = 'cart-line-total';
  lineTotal.textContent = formatPrice(item.lineTotal);

  const removeButton = document.createElement('button');
  removeButton.className = 'cart-remove-button';
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => removeItem(item.variantId, removeButton));

  quantityInput.addEventListener('change', () => {
    updateQuantity(item.variantId, quantityInput);
  });

  row.append(details, quantityLabel, lineTotal, removeButton);
  return row;
}

// Save the changed quantity and then refresh the cart.
async function updateQuantity(variantId, input) {
  const quantity = Number(input.value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    await loadCart();
    cartMessage.textContent = 'Quantity must be a whole number from 1 to 99.';
    return;
  }

  let errorMessage = '';
  input.disabled = true;
  try {
    const response = await fetch(`/api/cart/items/${encodeURIComponent(variantId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    const result = await response.json();

    if (response.status === 401) {
      window.location.assign('/login.html');
      return;
    }

    if (!response.ok) {
      errorMessage = result.error || result.message || 'Could not update this quantity.';
    }
  } catch (error) {
    errorMessage = 'Could not reach the server. Please try again.';
  }

  await loadCart();
  if (errorMessage) {
    cartMessage.textContent = errorMessage;
  }
}

// Remove a variant from the cart.
async function removeItem(variantId, button) {
  button.disabled = true;
  let errorMessage = '';
  try {
    const response = await fetch(`/api/cart/items/${encodeURIComponent(variantId)}`, {
      method: 'DELETE',
    });
    const result = await response.json();

    if (response.status === 401) {
      window.location.assign('/login.html');
      return;
    }

    if (!response.ok) {
      errorMessage = result.error || result.message || 'Could not remove this item.';
    }
  } catch (error) {
    errorMessage = 'Could not reach the server. Please try again.';
  }

  await loadCart();
  if (errorMessage) {
    cartMessage.textContent = errorMessage;
  }
}

loadCart();
