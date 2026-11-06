const adminMessage = document.getElementById('admin-message');
const adminApp = document.getElementById('admin-app');
const adminProducts = document.getElementById('admin-products');
const adminStaffList = document.getElementById('admin-staff-list');
const adminReports = document.getElementById('admin-reports');
const productDialog = document.getElementById('product-dialog');
const productForm = document.getElementById('product-form');
const variantDialog = document.getElementById('variant-dialog');
const variantForm = document.getElementById('variant-form');

let categories = [];
let editingProductId = null;
let editingVariantId = null;
let variantProductId = null;

function setMessage(message) {
  adminMessage.textContent = message;
}

function formatPrice(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function jsonOptions(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function initializeAdminPage() {
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
    if (user.role !== 'admin') {
      setMessage('Access denied');
      return;
    }

    adminApp.hidden = false;
    categories = await requestJson('/api/categories');
    populateCategoryOptions();
    await loadProducts();
  } catch (error) {
    setMessage(error.message);
  }
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
  });
}

async function loadProducts() {
  const products = await requestJson('/api/admin/products');
  renderProducts(products);
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function renderProducts(products) {
  adminProducts.replaceChildren();
  if (products.length === 0) {
    adminProducts.append(createTextElement('p', 'admin-empty', 'No products found.'));
    return;
  }
  products.forEach((product) => adminProducts.append(createProductCard(product)));
}

function createProductCard(product) {
  const card = document.createElement('article');
  card.className = 'admin-card admin-product-card';
  const heading = document.createElement('div');
  heading.className = 'admin-product-heading';
  const title = document.createElement('div');
  title.append(
    createTextElement('h3', '', product.name),
    createTextElement('p', 'admin-muted', `${product.category.name} · ${product.active ? 'Active' : 'Inactive'}`)
  );
  const actions = document.createElement('div');
  actions.className = 'admin-card-actions';
  actions.append(
    createButton('Edit', () => openProductDialog(product)),
    createButton('Add variant', () => openVariantDialog(product.id))
  );
  heading.append(title, actions);
  card.append(heading);

  if (product.description) {
    card.append(createTextElement('p', 'admin-description', product.description));
  }
  const variantsHeading = createTextElement('h4', 'admin-subheading', 'Variants');
  card.append(variantsHeading);
  if (product.variants.length === 0) {
    card.append(createTextElement('p', 'admin-muted', 'No variants.'));
  } else {
    const list = document.createElement('div');
    list.className = 'admin-variant-list';
    product.variants.forEach((variant) => {
      const row = document.createElement('div');
      row.className = 'admin-variant-item';
      const description = createTextElement(
        'p',
        '',
        `#${variant.id} · ${variant.size || 'Default size'} · ${variant.color || 'Default color'} · ${formatPrice(variant.price)} · Stock ${variant.stock}`
      );
      row.append(description, createButton('Edit variant', () => openVariantDialog(product.id, variant)));
      list.append(row);
    });
    card.append(list);
  }
  return card;
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

  const remove = createButton('Remove row', () => row.remove(), 'admin-remove-button');
  remove.hidden = document.querySelectorAll('.admin-variant-row').length === 0;
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
  const price = row.querySelector('[name="price"]').valueAsNumber;
  const stock = row.querySelector('[name="stock"]').valueAsNumber;
  return {
    size: row.querySelector('[name="size"]').value || null,
    color: row.querySelector('[name="color"]').value || null,
    price,
    stock,
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
    adminStaffList.append(createTextElement('p', 'admin-empty', 'No staff accounts.'));
    return;
  }
  const list = document.createElement('div');
  list.className = 'admin-staff-table';
  staff.forEach((user) => {
    const row = document.createElement('div');
    row.className = 'admin-staff-row';
    row.append(
      createTextElement('strong', '', user.displayName),
      createTextElement('span', '', user.phone),
      createTextElement('span', 'admin-role', user.role)
    );
    list.append(row);
  });
  adminStaffList.append(list);
}

async function createStaff(event) {
  event.preventDefault();
  const submitButton = staffForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setMessage('');
  try {
    const body = {
      phone: staffForm.elements.phone.value.trim(),
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

async function loadReports() {
  const report = await requestJson('/api/admin/reports');
  adminReports.replaceChildren();
  const salesCard = document.createElement('section');
  salesCard.className = 'admin-card admin-sales-card';
  salesCard.append(
    createTextElement('h2', '', 'Total sales'),
    createTextElement('p', 'admin-sales-total', formatPrice(report.totalSales))
  );

  const grid = document.createElement('div');
  grid.className = 'admin-report-grid';
  const countsCard = document.createElement('section');
  countsCard.className = 'admin-card';
  countsCard.append(createTextElement('h2', '', 'Orders by status'));
  const counts = document.createElement('dl');
  counts.className = 'admin-count-list';
  report.orderCounts.forEach((entry) => {
    counts.append(
      createTextElement('dt', '', entry.status),
      createTextElement('dd', '', String(entry.count))
    );
  });
  countsCard.append(counts);

  const stockCard = document.createElement('section');
  stockCard.className = 'admin-card';
  stockCard.append(createTextElement('h2', '', 'Low-stock variants'));
  if (report.lowStockVariants.length === 0) {
    stockCard.append(createTextElement('p', 'admin-empty', 'No variants have stock below 5.'));
  } else {
    const list = document.createElement('div');
    list.className = 'admin-low-stock-list';
    report.lowStockVariants.forEach((variant) => {
      list.append(createTextElement(
        'p',
        '',
        `#${variant.id} · ${variant.productName} · ${variant.size || 'Default size'} · ${variant.color || 'Default color'} · Stock ${variant.stock}`
      ));
    });
    stockCard.append(list);
  }

  grid.append(countsCard, stockCard);
  adminReports.append(salesCard, grid);
}

async function loadTab(tabName) {
  setMessage(`Loading ${tabName}...`);
  try {
    if (tabName === 'Products') {
      await loadProducts();
    } else if (tabName === 'Staff') {
      await loadStaff();
    } else {
      await loadReports();
    }
    setMessage('');
  } catch (error) {
    setMessage(error.message);
  }
}

function selectTab(tabName) {
  ['Products', 'Staff', 'Reports'].forEach((name) => {
    const key = name.toLowerCase();
    const selected = name === tabName;
    document.getElementById(`tab-${key}`).classList.toggle('is-active', selected);
    document.getElementById(`tab-${key}`).setAttribute('aria-selected', String(selected));
    document.getElementById(`panel-${key}`).hidden = !selected;
  });
  loadTab(tabName);
}

const staffForm = document.getElementById('staff-form');

document.querySelectorAll('.admin-tab').forEach((button) => {
  button.addEventListener('click', () => {
    selectTab(button.textContent);
  });
});
document.getElementById('add-product-button').addEventListener('click', () => openProductDialog());
document.getElementById('add-variant-row').addEventListener('click', () => addVariantRow());
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
productForm.addEventListener('submit', saveProduct);
variantForm.addEventListener('submit', saveVariant);
staffForm.addEventListener('submit', createStaff);

initializeAdminPage();
