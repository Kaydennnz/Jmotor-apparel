const categoryFilters = document.getElementById('category-filters');
const productGrid = document.getElementById('product-grid');
const productCount = document.getElementById('product-count');
const productDialog = document.getElementById('product-dialog');
const closeDialog = document.getElementById('close-dialog');
const sizePicker = document.getElementById('size-picker');
const colorPicker = document.getElementById('color-picker');
const variantPrice = document.getElementById('variant-price');
const variantStock = document.getElementById('variant-stock');
const defaultVariantValue = '__default_variant__';
const pickerPlaceholder = '__select_variant__';

let selectedCategory = '';
let currentVariants = [];

// Format a price in Philippine pesos.
function formatPrice(price) {
  return `₱${Number(price).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Load categories and create their filter buttons.
async function loadCategories() {
  const response = await fetch('/api/categories');
  if (!response.ok) {
    throw new Error('Could not load categories.');
  }

  const categories = await response.json();
  categoryFilters.replaceChildren();
  addCategoryButton('All', '');

  categories.forEach((category) => {
    addCategoryButton(category.name, String(category.id));
  });
}

// Add one category filter button to the page.
function addCategoryButton(name, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-button';
  button.textContent = name;
  button.dataset.categoryId = id;
  button.setAttribute('aria-pressed', String(selectedCategory === id));
  button.addEventListener('click', () => {
    selectedCategory = id;
    updateCategoryButtons();
    loadProducts().catch(showError);
  });
  categoryFilters.append(button);
}

// Update which category filter is selected.
function updateCategoryButtons() {
  categoryFilters.querySelectorAll('.filter-button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.categoryId === selectedCategory));
  });
}

// Load products for the selected category.
async function loadProducts() {
  productGrid.replaceChildren();
  productCount.textContent = 'Loading products...';

  const query = selectedCategory
    ? `?category=${encodeURIComponent(selectedCategory)}`
    : '';
  const response = await fetch(`/api/products${query}`);
  if (!response.ok) {
    throw new Error('Could not load products.');
  }

  const products = await response.json();
  productGrid.replaceChildren();
  productCount.textContent = `${products.length} ${products.length === 1 ? 'item' : 'items'}`;

  if (products.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-message';
    emptyMessage.textContent = 'No products in this category yet.';
    productGrid.append(emptyMessage);
    return;
  }

  products.forEach((product) => {
    productGrid.append(createProductCard(product));
  });
}

// Build a product card using text-only DOM content.
function createProductCard(product) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'product-card';
  card.addEventListener('click', () => {
    showProduct(product.id).catch(showError);
  });

  const category = document.createElement('span');
  category.className = 'product-category';
  category.textContent = product.categoryName;

  const name = document.createElement('h3');
  name.className = 'product-name';
  name.textContent = product.name;

  const price = document.createElement('p');
  price.className = 'product-price';
  price.textContent = product.fromPrice === null
    ? 'Price unavailable'
    : `From ${formatPrice(product.fromPrice)}`;

  card.append(category, name, price);
  return card;
}

// Fetch and show the selected product and its variants.
async function showProduct(productId) {
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? 'Product not found.' : 'Could not load this product.');
  }

  const product = await response.json();
  document.getElementById('detail-category').textContent = product.categoryName;
  document.getElementById('detail-name').textContent = product.name;
  document.getElementById('detail-description').textContent = product.description || '';

  currentVariants = product.variants;
  fillPicker(sizePicker, getUniqueValues(currentVariants, 'size'), 'Select a size');
  fillPicker(colorPicker, getUniqueValues(currentVariants, 'color'), 'Select a color');

  const initialVariant = currentVariants.find((variant) => variant.stock > 0) || currentVariants[0];
  if (initialVariant) {
    sizePicker.value = pickerValue(initialVariant.size);
    colorPicker.value = pickerValue(initialVariant.color);
  }

  updateVariantOptions();
  updateVariantDetails();

  if (!productDialog.open) {
    productDialog.showModal();
  }
}

// Get unique non-empty size or color values for a picker.
function getUniqueValues(variants, key) {
  return [...new Set(variants.map((variant) => pickerValue(variant[key])))];
}

// Use a visible label for variants whose size or color is not specified.
function pickerValue(value) {
  return value === null ? defaultVariantValue : String(value);
}

// Fill a size or color picker with safe text labels.
function fillPicker(picker, values, placeholder) {
  picker.replaceChildren();
  const prompt = document.createElement('option');
  prompt.value = pickerPlaceholder;
  prompt.textContent = placeholder;
  prompt.disabled = true;
  prompt.selected = true;
  picker.append(prompt);

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.dataset.label = value === defaultVariantValue || value === '' ? 'Default' : value;
    option.textContent = option.dataset.label;
    picker.append(option);
  });
}

// Disable picker choices that have no matching in-stock variant.
function updateVariantOptions() {
  updatePickerOptions(sizePicker, 'size');
  updatePickerOptions(colorPicker, 'color');
}

// Disable sizes or colors that have no matching in-stock variant.
function updatePickerOptions(picker, key) {
  Array.from(picker.options).forEach((option) => {
    if (option.value === pickerPlaceholder) {
      return;
    }

    const available = currentVariants.some((variant) => (
      pickerValue(variant[key]) === option.value
      && variant.stock > 0
    ));
    option.disabled = !available;
    option.textContent = available ? option.dataset.label : `${option.dataset.label} — Out of stock`;
  });
}

// Show the exact price and stock for the selected variant.
function updateVariantDetails() {
  const variant = currentVariants.find((item) => (
    pickerValue(item.size) === sizePicker.value
    && pickerValue(item.color) === colorPicker.value
  ));

  variantPrice.textContent = variant ? formatPrice(variant.price) : '';
  variantStock.classList.remove('out-of-stock');

  if (!variant) {
    variantStock.textContent = 'Choose an available size and color.';
  } else if (variant.stock === 0) {
    variantStock.textContent = 'Out of stock';
    variantStock.classList.add('out-of-stock');
  } else {
    variantStock.textContent = `${variant.stock} in stock`;
  }
}

// Show a readable error if the catalog API cannot be reached.
function showError(error) {
  productGrid.replaceChildren();
  productCount.textContent = '';
  const message = document.createElement('p');
  message.className = 'empty-message';
  message.textContent = error.message;
  productGrid.append(message);
}

sizePicker.addEventListener('change', () => {
  updateVariantOptions();
  updateVariantDetails();
});

colorPicker.addEventListener('change', () => {
  updateVariantOptions();
  updateVariantDetails();
});

closeDialog.addEventListener('click', () => productDialog.close());

loadCategories()
  .then(loadProducts)
  .catch(showError);
