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
         subscribeToPush();
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
  if (select) {
    select.innerHTML = '';
    partners.forEach(({ id, name }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  if (userRole === 'partner') {
    const loggedInUserId = localStorage.getItem('user_id');
    const myRow = partners.find(p => String(p.user_id) === String(loggedInUserId));
    const checkbox = document.getElementById('privacy-visible');
    if (myRow && checkbox) {
      checkbox.checked = Boolean(myRow.is_visible_to_others);
    }
  }
}

async function refreshAll() {
  const tasks = [fetchBalances(), fetchPartners(), loadPnlHistory()];
  if (userRole === 'admin') {
    tasks.push(checkBitgetStatus());
  }
  await Promise.all(tasks);
}

async function checkBitgetStatus() {
  if (userRole !== 'admin') return;
  try {
    const doFetch = () => fetch('/api/exchange/bitget/status', { headers: getAuthHeaders() });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    const data = await response.json();
    const btn = document.getElementById('connect-bitget-btn');
    if (btn) {
      if (data && data.connected) {
        btn.textContent = '✅ Bitget Connected';
      } else {
        btn.textContent = 'Connect Bitget Account';
      }
    }
    const syncBtn = document.getElementById('sync-bitget-btn');
    const syncDateInput = document.getElementById('bitget-sync-from-date');
    if (syncBtn) {
      if (data && data.connected) {
        syncBtn.style.display = 'inline-block';
        if (syncDateInput) syncDateInput.style.display = 'inline-block';
      } else {
        syncBtn.style.display = 'none';
        if (syncDateInput) syncDateInput.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('[checkBitgetStatus] Error:', error);
  }
}

let allPnlEntries = [];

async function loadPnlHistory() {
  console.log('[loadPnlHistory] Requesting /api/balances/pnl-history');
  const doFetch = () => fetch('/api/balances/pnl-history', { headers: getAuthHeaders() });
  let response = await doFetch();
  response = await handleApiResponse(response, doFetch);
  const entries = await response.json();
  console.log('[loadPnlHistory] Received:', entries);
  allPnlEntries = entries;
  renderPnlHistory(entries);
}

function renderPnlHistory(entries) {
  const tbody = document.querySelector('#pnl-history-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.style.display = 'none';
  }

  const entriesByDate = {};
  entries.forEach((entry) => {
    const date = entry.entry_date;
    if (date) {
      if (!entriesByDate[date]) entriesByDate[date] = [];
      entriesByDate[date].push(entry);
    }
  });

  entries.forEach((entry) => {
    const amountNum = Number(entry.amount ?? 0);
    const absAmount = Math.abs(amountNum).toFixed(2);
    const isProfit = amountNum >= 0;
    const typeText = isProfit ? 'Profit' : 'Loss';
    const typeClass = isProfit ? 'profit-text' : 'loss-text';
    const sourceText = entry.source === 'bitget_sync' ? 'Bitget Sync' : 'Manual Entry';
    const date = entry.entry_date ?? '';

    const dateEntries = entriesByDate[date] || [];
    const hasManual = dateEntries.some(e => e.source !== 'bitget_sync');
    const hasSync = dateEntries.some(e => e.source === 'bitget_sync');
    const isAcknowledged = dateEntries.some(e => e.warning_acknowledged === true);
    const isConflict = hasManual && hasSync && !isAcknowledged;

    let warningIndicator = '';
    if (isConflict) {
      const manualEntries = dateEntries.filter(e => e.source !== 'bitget_sync');
      const syncEntries = dateEntries.filter(e => e.source === 'bitget_sync');
      const manualSum = manualEntries.reduce((acc, e) => acc + Number(e.amount || 0), 0);
      const syncSum = syncEntries.reduce((acc, e) => acc + Number(e.amount || 0), 0);
      const formatAmt = (n) => (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);
      const summaryText = `Manual: ${formatAmt(manualSum)} | Bitget Sync: ${formatAmt(syncSum)}`;

      warningIndicator = ` <span title="Multiple entries exist for this date — check for double-counting">⚠️</span> <button class="acknowledge-warning" data-entry-date="${date}">Mark as Reviewed</button><div class="conflict-summary">${summaryText}</div>`;
    }

    const selectCell = userRole === 'admin'
      ? `<td><input type="checkbox" class="pnl-select-checkbox" data-pnl-id="${entry.id}"></td>`
      : '<td></td>';

    const row = document.createElement('tr');
    if (isConflict) {
      row.className = 'duplicate-date-warning';
    }
    row.innerHTML = `
      ${selectCell}
      <td>${date}</td>
      <td>${absAmount}</td>
      <td><span class="${typeClass}">${typeText}</span></td>
      <td>${sourceText}${warningIndicator}</td>
    `;
    tbody.appendChild(row);
  });
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
  if (userRole !== 'partner') {
    document.querySelectorAll('.partner-only').forEach((element) => {
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

const connectBitgetBtn = document.getElementById('connect-bitget-btn');
if (connectBitgetBtn) {
  connectBitgetBtn.addEventListener('click', () => {
    const modal = document.getElementById('bitget-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  });
}

const syncBitgetBtn = document.getElementById('sync-bitget-btn');
if (syncBitgetBtn) {
  syncBitgetBtn.addEventListener('click', async () => {
    setLoading(syncBitgetBtn, 'Syncing...');
    try {
      const dateInput = document.getElementById('bitget-sync-from-date');
      const customStartDate = dateInput ? dateInput.value.trim() : '';
      const bodyData = customStartDate ? { customStartDate } : undefined;

      const doFetch = () => fetch('/api/exchange/bitget/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: bodyData ? JSON.stringify(bodyData) : undefined,
      });
      let response = await doFetch();
      response = await handleApiResponse(response, doFetch);
      const data = await response.json();

      resetButton(syncBitgetBtn);
      const entriesCreated = data.entriesCreated ?? 0;
      showMessage(`Synced ${entriesCreated} new entries`);
      await refreshAll();
      await loadPnlHistory();
    } catch (error) {
      resetButton(syncBitgetBtn);
      showMessage(error.message, 'error');
    }
  });
}

const deleteSelectedBtn = document.getElementById('delete-selected-btn');
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.pnl-select-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.pnlId).filter(Boolean);

    if (ids.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${ids.length} selected P&L entries?`)) {
      return;
    }

    try {
      for (const pnlId of ids) {
        const doFetch = () => fetch(`/api/balances/pnl-history/${pnlId}`, { method: 'DELETE', headers: getAuthHeaders() });
        let response = await doFetch();
        response = await handleApiResponse(response, doFetch);
        await response.json();
      }
      await loadPnlHistory();
      await refreshAll();
      showMessage('Selected entries deleted successfully');
    } catch (error) {
      console.error('Delete selected error:', error);
      showMessage(error.message, 'error');
    }
  });
}

const bitgetCloseBtn = document.getElementById('bitget-close-btn');
if (bitgetCloseBtn) {
  bitgetCloseBtn.addEventListener('click', () => {
    const modal = document.getElementById('bitget-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    const messageArea = document.getElementById('bitget-modal-message');
    if (messageArea) {
      messageArea.textContent = '';
      messageArea.className = '';
    }
  });
}

const bitgetSaveBtn = document.getElementById('bitget-save-btn');
if (bitgetSaveBtn) {
  bitgetSaveBtn.addEventListener('click', async () => {
    const apiKeyInput = document.getElementById('bitget-api-key');
    const secretKeyInput = document.getElementById('bitget-secret-key');
    const passphraseInput = document.getElementById('bitget-passphrase');
    const messageArea = document.getElementById('bitget-modal-message');

    const api_key = apiKeyInput ? apiKeyInput.value.trim() : '';
    const secret_key = secretKeyInput ? secretKeyInput.value.trim() : '';
    const passphrase = passphraseInput ? passphraseInput.value.trim() : '';

    if (messageArea) {
      messageArea.className = '';
      messageArea.textContent = 'Testing connection...';
    }

    try {
      const doConnectFetch = () => fetch('/api/exchange/bitget/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ api_key, secret_key, passphrase }),
      });

      let connectResponse = await doConnectFetch();
      connectResponse = await handleApiResponse(connectResponse, doConnectFetch);
      await connectResponse.json();

      const doTestFetch = () => fetch('/api/exchange/bitget/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });

      let testResponse = await doTestFetch();
      testResponse = await handleApiResponse(testResponse, doTestFetch);
      await testResponse.json();

      if (messageArea) {
        messageArea.className = 'modal-message-success';
        messageArea.textContent = 'Connected successfully!';
      }

      const connectBtn = document.getElementById('connect-bitget-btn');
      if (connectBtn) {
        connectBtn.textContent = '✅ Bitget Connected';
      }

      setTimeout(() => {
        const modal = document.getElementById('bitget-modal');
        if (modal) {
          modal.style.display = 'none';
        }
        if (messageArea) {
          messageArea.textContent = '';
          messageArea.className = '';
        }
      }, 2000);

    } catch (error) {
      if (messageArea) {
        messageArea.className = 'modal-message-error';
        messageArea.textContent = error.message || 'Connection failed';
      }
    }
  });
}

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

const privacyForm = document.getElementById('privacy-form');
if (privacyForm) {
  privacyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInlineErrors();

    const is_visible_to_others = document.getElementById('privacy-visible').checked;
    const submitButton = document.getElementById('privacy-submit');

    setLoading(submitButton);

    try {
      const doFetch = () => fetch('/api/partners/me/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_visible_to_others }),
      });

      let response = await doFetch();
      response = await handleApiResponse(response, doFetch);
      await response.json();

      await refreshAll();
      showMessage('Privacy settings updated successfully');
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      resetButton(submitButton);
    }
  });
}

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

document.querySelector('#pnl-history-table tbody').addEventListener('click', async (event) => {
  const button = event.target.closest('.acknowledge-warning');
  if (!button) return;

  const entryDate = button.dataset.entryDate;
  console.log('Acknowledging warning for date:', entryDate);

  try {
    const doFetch = () => fetch('/api/balances/pnl-history/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ entry_date: entryDate }),
    });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();
    await loadPnlHistory();
  } catch (error) {
    console.error('Acknowledge warning error:', error);
    showMessage(error.message, 'error');
  }
});

document.querySelector('#pnl-history-table tbody').addEventListener('change', (event) => {
  if (!event.target.classList.contains('pnl-select-checkbox')) return;
  const checkedBoxes = document.querySelectorAll('.pnl-select-checkbox:checked');
  const deleteSelectedBtn = document.getElementById('delete-selected-btn');
  if (deleteSelectedBtn) {
    if (checkedBoxes.length > 0) {
      deleteSelectedBtn.style.display = 'inline-block';
    } else {
      deleteSelectedBtn.style.display = 'none';
    }
  }
});

const pnlFilterApplyBtn = document.getElementById('pnl-filter-apply');
if (pnlFilterApplyBtn) {
  pnlFilterApplyBtn.addEventListener('click', () => {
    const fromInput = document.getElementById('pnl-filter-from');
    const toInput = document.getElementById('pnl-filter-to');
    const from = fromInput ? fromInput.value.trim() : '';
    const to = toInput ? toInput.value.trim() : '';

    const filtered = allPnlEntries.filter((entry) => {
      const entryDate = entry.entry_date ? entry.entry_date.split('T')[0] : '';
      if (!entryDate) return false;

      if (from && to) {
        return entryDate >= from && entryDate <= to;
      } else if (!from && to) {
        return entryDate <= to;
      } else if (from && !to) {
        return entryDate >= from;
      } else {
        return true;
      }
    });

    renderPnlHistory(filtered);
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator && 'PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const doFetchKey = () => fetch('/api/push/vapid-public-key', { headers: getAuthHeaders() });
    let keyResponse = await doFetchKey();
    keyResponse = await handleApiResponse(keyResponse, doFetchKey);
    const keyData = await keyResponse.json();
    const publicKey = keyData.publicKey;
    if (!publicKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const doFetchSub = () => fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(subscription),
    });
    let subResponse = await doFetchSub();
    subResponse = await handleApiResponse(subResponse, doFetchSub);
    await subResponse.json();
  } catch (error) {
    console.error('Push subscription error:', error);
  }
}

applyRoleBasedVisibility();
setToday('pnl-date');
setToday('transaction-date');
setToday('partner-deposit-date');
setToday('pnl-filter-to');
subscribeToPush();
refreshAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service worker registered'))
      .catch((err) => console.error('Service worker registration failed:', err));
  });
}
