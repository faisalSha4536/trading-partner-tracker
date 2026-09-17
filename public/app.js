const accessToken = localStorage.getItem('access_token');
if (!accessToken) {
  window.location.href = '/login.html';
  throw new Error('Redirecting to login');
}

const userRole = localStorage.getItem('user_role');

function getAuthHeaders() {
  return { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') };
}

async function handleApiResponse(response, retryFn) {
  if (response.status !== 401) {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Request failed: ${response.statusText}`);
    }
    return response;
  }

  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_id');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login.html';
    throw new Error('Session expired');
  }

  try {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (refreshResponse.status === 200) {
      const sessionData = await refreshResponse.json();
      if (sessionData && sessionData.access_token && sessionData.refresh_token) {
        localStorage.setItem('access_token', sessionData.access_token);
        localStorage.setItem('refresh_token', sessionData.refresh_token);
        if (typeof retryFn === 'function') {
          return await retryFn();
        }
      }
    }
  } catch (error) {
    // Fall through to redirect
  }

  localStorage.removeItem('access_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_id');
  localStorage.removeItem('refresh_token');
  window.location.href = '/login.html';
  throw new Error('Session expired');
}

async function fetchBalances() {
  console.log('[fetchBalances] Requesting /api/balances');
  const doFetch = () => fetch('/api/balances', { headers: getAuthHeaders() });
  let response = await doFetch();
  response = await handleApiResponse(response, doFetch);
  const balances = await response.json();
  console.log('[fetchBalances] Received:', balances);
  renderBalances(balances);
}

function renderBalances(balances) {
  console.log('[renderBalances] Raw balances before render:', JSON.parse(JSON.stringify(balances)));
  const tbody = document.querySelector('#balance-table tbody');
  tbody.innerHTML = '';

  balances.forEach(({ partner_id, user_id, name, total_deposited, current_balance, ratio }) => {
    const depositedValue = Number(total_deposited ?? 0);
    const balanceValue = Number(current_balance ?? 0);
    const ratioValue = Number(ratio ?? 0);
    const loggedInUserId = localStorage.getItem('user_id');
    const isOwnRow = String(user_id || '') === String(loggedInUserId || '');
    const removeCell = userRole === 'admin' && !isOwnRow
      ? `<td><button class="remove-partner" data-partner-id="${partner_id}">Remove</button></td>`
      : '<td></td>';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${name ?? 'Unknown'}</td>
      <td>${depositedValue.toFixed(2)}</td>
      <td>${balanceValue.toFixed(2)}</td>
      <td>${(ratioValue * 100).toFixed(2)}%</td>
      ${removeCell}
    `;
    tbody.appendChild(row);
  });
}

async function fetchPartners() {
  const doFetch = () => fetch('/api/partners', { headers: getAuthHeaders() });
  let response = await doFetch();
  response = await handleApiResponse(response, doFetch);
  const partners = await response.json();
  const select = document.getElementById('transaction-partner');
  select.innerHTML = '';

  partners.forEach(({ id, name }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = name;
    select.appendChild(option);
  });
}

async function refreshAll() {
  await Promise.all([fetchBalances(), fetchPartners()]);
}

function setToday(inputId) {
  const input = document.getElementById(inputId);
  input.value = new Date().toISOString().split('T')[0];
}

function showMessage(text, type = 'success') {
  const area = document.getElementById('message-area');
  const message = document.createElement('div');
  message.className = `message message-${type}`;
  message.textContent = text;
  area.appendChild(message);
  setTimeout(() => message.remove(), type === 'success' ? 2000 : 3000);
}

function setLoading(button, loadingText = 'Saving...') {
  button.dataset.originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
}

function resetButton(button) {
  button.disabled = false;
  button.textContent = button.dataset.originalText;
}

function showInlineError(elementId, text) {
  const element = document.getElementById(elementId);
  element.textContent = text;
  element.style.display = 'block';
}

function clearInlineErrors() {
  document.querySelectorAll('.inline-error').forEach((element) => {
    element.textContent = '';
    element.style.display = 'none';
  });
}

function validateAmount(value, fieldName) {
  const amount = parseFloat(value);
  if (Number.isNaN(amount) || amount <= 0) {
    return `${fieldName} must be greater than 0`;
  }
  return null;
}

function applyRoleBasedVisibility() {
  if (userRole !== 'admin') {
    document.querySelectorAll('.admin-only').forEach((element) => {
      element.style.display = 'none';
    });
  }
}

document.getElementById('logout-button').addEventListener('click', () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_id');
  window.location.href = '/login.html';
});

document.getElementById('pnl-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearInlineErrors();

  const type = document.getElementById('pnl-type').value;
  const amountValue = document.getElementById('pnl-amount').value;
  const entry_date = document.getElementById('pnl-date').value;
  const submitButton = document.getElementById('pnl-submit');

  if (!entry_date) {
    showInlineError('pnl-form-error', 'Please select a date');
    return;
  }

  const amountError = validateAmount(amountValue, 'Amount');
  if (amountError) {
    showInlineError('pnl-form-error', amountError);
    return;
  }

  let amount = parseFloat(amountValue);
  if (type === 'loss') {
    amount = -amount;
  }

  setLoading(submitButton);

  try {
    const doFetch = () => fetch('/api/ledger/pnl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ amount, entry_date }),
    });

    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();

    event.target.reset();
    setToday('pnl-date');
    await refreshAll();
    showMessage('P&L logged successfully');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    resetButton(submitButton);
  }
});

document.getElementById('transaction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearInlineErrors();

  const partner_id = document.getElementById('transaction-partner').value;
  const type = document.getElementById('transaction-type').value;
  const amountValue = document.getElementById('transaction-amount').value;
  const entry_date = document.getElementById('transaction-date').value;
  const submitButton = document.getElementById('transaction-submit');

  if (!partner_id) {
    showInlineError('transaction-form-error', 'Please select a partner');
    return;
  }

  if (!entry_date) {
    showInlineError('transaction-form-error', 'Please select a date');
    return;
  }

  const amountError = validateAmount(amountValue, 'Amount');
  if (amountError) {
    showInlineError('transaction-form-error', amountError);
    return;
  }

  const amount = parseFloat(amountValue);

  setLoading(submitButton);

  try {
    const doFetch = () => fetch(`/api/ledger/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ partner_id, amount, entry_date }),
    });

    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();

    event.target.reset();
    setToday('transaction-date');
    await refreshAll();
    showMessage(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} logged successfully`);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    resetButton(submitButton);
  }
});

document.getElementById('partner-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearInlineErrors();

  const name = document.getElementById('partner-name').value.trim();
  const email = document.getElementById('partner-email').value.trim();
  const password = document.getElementById('partner-password').value;
  const depositAmountValue = document.getElementById('partner-deposit-amount').value;
  const entry_date = document.getElementById('partner-deposit-date').value;
  const submitButton = document.getElementById('partner-submit');

  if (!name) {
    showInlineError('partner-form-error', 'Please enter a name');
    return;
  }

  if (!email) {
    showInlineError('partner-form-error', 'Please enter an email');
    return;
  }

  if (!password) {
    showInlineError('partner-form-error', 'Please enter a password');
    return;
  }

  const depositAmount = depositAmountValue ? parseFloat(depositAmountValue) : 0;

  if (depositAmount > 0 && !entry_date) {
    showInlineError('partner-form-error', 'Please select a date for the initial deposit');
    return;
  }

  setLoading(submitButton);

  try {
    console.log('[Add Partner] Creating partner:', name);
    const doFetch = () => fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ name, email, password }),
    });

    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    const partner = await response.json();
    console.log('[Add Partner] Created partner with id:', partner.id);

    if (depositAmount > 0) {
      console.log('[Add Partner] Posting initial deposit:', { partner_id: partner.id, amount: depositAmount, entry_date });
      const doFetchDeposit = () => fetch('/api/ledger/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ partner_id: partner.id, amount: depositAmount, entry_date }),
      });

      let depositResponse = await doFetchDeposit();
      depositResponse = await handleApiResponse(depositResponse, doFetchDeposit);
      await depositResponse.json();
    }

    console.log('[Add Partner] Refreshing balances and dropdown');
    event.target.reset();
    setToday('partner-deposit-date');
    await refreshAll();
    console.log('[Add Partner] Refresh complete');
    showMessage('Partner added');
  } catch (error) {
    console.error('[Add Partner] Error:', error);
    showMessage(error.message, 'error');
  } finally {
    resetButton(submitButton);
  }
});

document.querySelector('#balance-table tbody').addEventListener('click', async (event) => {
  const button = event.target.closest('.remove-partner');
  if (!button) return;

  const partnerId = button.dataset.partnerId;
  console.log('Removing partner:', partnerId);

  try {
    const doFetch = () => fetch(`/api/partners/${partnerId}`, { method: 'DELETE', headers: getAuthHeaders() });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();
    await refreshAll();
  } catch (error) {
    console.error('Remove partner error:', error);
  }
});

applyRoleBasedVisibility();
setToday('pnl-date');
setToday('transaction-date');
setToday('partner-deposit-date');
refreshAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service worker registered'))
      .catch((err) => console.error('Service worker registration failed:', err));
  });
}
