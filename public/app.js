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
  const thead = document.querySelector('#balance-table thead tr');
  const tbody = document.querySelector('#balance-table tbody');
  const isAdmin = userRole === 'admin';
  const colCount = isAdmin ? 7 : 5;

  thead.innerHTML = `
    <th>Name</th>
    <th>Deposited</th>
    <th>Current Balance</th>
    <th>Ratio</th>
    ${isAdmin ? '<th>Margin %</th><th>Margin Owed</th>' : ''}
    <th></th>
  `;
  tbody.innerHTML = '';

  if (balances.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="${colCount}" class="empty-state">No partners added yet — click 'Add Partner' to get started.</td>`;
    tbody.appendChild(row);
    return;
  }

  balances.forEach(({ partner_id, user_id, name, total_deposited, current_balance, ratio, margin_percentage, margin_amount }) => {
    const depositedValue = Number(total_deposited ?? 0);
    const balanceValue = Number(current_balance ?? 0);
    const ratioValue = Number(ratio ?? 0);
    const marginValue = Number(margin_percentage ?? 0);
    const marginAmountValue = Number(margin_amount ?? 0);
    const loggedInUserId = localStorage.getItem('user_id');
    const isAdmin = String(userRole || '').toLowerCase() === 'admin';
    const isOwnRow = String(user_id || '') === String(loggedInUserId || '');
    const removeCell = isAdmin && !isOwnRow
      ? `<td data-label="Actions"><button class="remove-partner btn-danger" data-partner-id="${partner_id}">Remove</button></td>`
      : '<td data-label="Actions"></td>';
    const marginCell = isAdmin
      ? (isOwnRow
          ? `<td data-label="Margin %"><span class="margin-cell-content">${marginValue.toFixed(1)}%</span></td>`
          : `<td data-label="Margin %"><span class="margin-cell-content">${marginValue.toFixed(1)}% <button type="button" class="edit-margin-btn link-button" data-partner-id="${partner_id}" data-margin="${marginValue}">Edit</button></span></td>`)
      : '';
    const marginOwedCell = isAdmin
      ? (isOwnRow || !margin_amount || marginAmountValue === 0
          ? `<td data-label="Margin Owed">—</td>`
          : `<td data-label="Margin Owed">${marginAmountValue.toFixed(2)}</td>`)
      : '';

    const row = document.createElement('tr');
    row.innerHTML = `
     <td class="card-summary" data-label="Name">
       <span>${name ?? 'Unknown'}</span>
       <span class="mobile-card-extra">
         <span>$${balanceValue.toFixed(2)}</span>
         <span class="card-expand-icon">▾</span>
       </span>
     </td>
      <td data-label="Deposited">${depositedValue.toFixed(2)}</td>
      <td data-label="Current Balance">${balanceValue.toFixed(2)}</td>
      <td data-label="Ratio">${(ratioValue * 100).toFixed(2)}%</td>
      ${marginCell}
      ${marginOwedCell}
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
    const checkbox = document.getElementById('visibility-checkbox');
    if (myRow && checkbox) {
      checkbox.checked = Boolean(myRow.is_visible_to_others);
    }
  }
}

async function refreshAll() {
  const tasks = [fetchBalances(), fetchPartners(), loadPnlHistory()];
  if (userRole === 'admin') {
    tasks.push(checkBitgetStatus(), loadTransactionLog());
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
    const statusText = document.getElementById('bitget-status-text');
    if (btn) {
      if (data && data.connected) {
        if (data.is_valid === false) {
          btn.textContent = 'Reconnect';
          btn.dataset.connected = 'false';
        } else {
          btn.textContent = 'Disconnect';
          btn.dataset.connected = 'true';
        }
      } else {
        btn.textContent = 'Connect';
        btn.dataset.connected = 'false';
      }
    }
    if (statusText) {
      if (data && data.connected) {
        if (data.is_valid === false) {
          statusText.textContent = 'Connection Invalid — Reconnect Required';
          statusText.classList.add('loss-text');
          statusText.classList.remove('connected');
        } else {
          statusText.textContent = 'Connected';
          statusText.classList.add('connected');
          statusText.classList.remove('loss-text');
        }
      } else {
        statusText.textContent = 'Not Connected';
        statusText.classList.remove('connected');
        statusText.classList.remove('loss-text');
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

async function loadTransactionLog() {
  console.log('[loadTransactionLog] Requesting /api/balances/transaction-log');
  const doFetch = () => fetch('/api/balances/transaction-log', { headers: getAuthHeaders() });
  let response = await doFetch();
  response = await handleApiResponse(response, doFetch);
  const entries = await response.json();
  console.log('[loadTransactionLog] Received:', entries);
  renderTransactionLog(entries);
}

function renderTransactionLog(entries) {
  const thead = document.querySelector('#transaction-log-table thead tr');
  if (thead) {
    thead.innerHTML = `
      <th>Date</th>
      <th>Partner</th>
      <th>Type</th>
      <th>Amount</th>
    `;
  }
  const tbody = document.querySelector('#transaction-log-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (entries.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="4" class="empty-state">No transactions logged yet.</td>`;
    tbody.appendChild(row);
    return;
  }

  entries.forEach(({ entry_date, entry_type, amount, partners }) => {
    const dateStr = entry_date ? entry_date.split('T')[0] : '';
    const partnerName = partners?.name ?? 'Unknown';
    const typeStr = entry_type ? entry_type.charAt(0).toUpperCase() + entry_type.slice(1) : '';
    const amountValue = Number(amount ?? 0);

    const row = document.createElement('tr');
    row.innerHTML = `
     <td class="card-summary" data-label="Date">
       <span>${dateStr}</span>
       <span class="mobile-card-extra">
         <span>$${amountValue.toFixed(2)}</span>
         <span class="card-expand-icon">▾</span>
       </span>
     </td>
      <td data-label="Partner">${partnerName}</td>
      <td data-label="Type">${typeStr}</td>
      <td data-label="Amount">${amountValue.toFixed(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

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
  const thead = document.querySelector('#pnl-history-table thead tr');
  if (thead) {
    thead.innerHTML = `
      <th>Date</th>
      <th>Amount</th>
      <th>Type</th>
      <th>Logged By</th>
    `;
  }
  const tbody = document.querySelector('#pnl-history-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (entries.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="4" class="empty-state">No profit or loss entries yet — add one manually or sync from Bitget.</td>`;
    tbody.appendChild(row);
    return;
  }

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

      const acknowledgeButton = userRole === 'admin'
        ? ` <button class="acknowledge-warning" data-entry-date="${date}">Mark as Reviewed</button>`
        : '';

      warningIndicator = ` <span title="Multiple entries exist for this date — check for double-counting">⚠️</span>${acknowledgeButton}<div class="conflict-summary">${summaryText}</div>`;
    }

    const selectCheckboxHtml = String(userRole || '').toLowerCase() === 'admin'
      ? `<input type="checkbox" class="pnl-select-checkbox" data-pnl-id="${entry.id}" onclick="event.stopPropagation();" style="margin-right: 8px;">`
      : '';

    const row = document.createElement('tr');
    if (isConflict) {
      row.className = 'duplicate-date-warning';
    }
     row.innerHTML = `
       <td class="card-summary" data-label="Date">
         <div style="display:flex; align-items:center;">
           ${selectCheckboxHtml}
           <span>${date}</span>
         </div>
         <span class="mobile-card-extra">
           <span class="${typeClass}">$${absAmount}</span>
           <span class="card-expand-icon">▾</span>
         </span>
       </td>
      <td data-label="Amount">${absAmount}</td>
      <td data-label="Type"><span class="${typeClass}">${typeText}</span></td>
      <td data-label="Logged By">${sourceText}${warningIndicator}</td>
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

function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
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
  console.log(localStorage.getItem('user_role'));
  const privacyCheckboxRow = document.getElementById('privacy-checkbox-row');
  if (privacyCheckboxRow) {
    privacyCheckboxRow.style.display = userRole === 'partner' ? 'block' : 'none';
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
  connectBitgetBtn.addEventListener('click', async () => {
    if (connectBitgetBtn.textContent === 'Disconnect' || connectBitgetBtn.dataset.connected === 'true') {
      if (!window.confirm("Disconnect your exchange account? Auto-sync will stop working until reconnected.")) {
        return;
      }
      try {
        const doFetch = () => fetch('/api/exchange/bitget/disconnect', {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        let response = await doFetch();
        response = await handleApiResponse(response, doFetch);
        await response.json();

        connectBitgetBtn.textContent = 'Connect';
        connectBitgetBtn.dataset.connected = 'false';
        const statusText = document.getElementById('bitget-status-text');
        if (statusText) {
          statusText.textContent = 'Not Connected';
          statusText.classList.remove('connected');
        }
        const syncBtn = document.getElementById('sync-bitget-btn');
        const syncDateInput = document.getElementById('bitget-sync-from-date');
        if (syncBtn) syncBtn.style.display = 'none';
        if (syncDateInput) syncDateInput.style.display = 'none';

        showMessage('Exchange disconnected successfully');
      } catch (error) {
        console.error('Disconnect error:', error);
        showMessage(error.message, 'error');
      }
    } else {
      const modal = document.getElementById('bitget-modal');
      if (modal) {
        modal.style.display = 'flex';
      }
    }
  });
}

const syncBitgetBtn = document.getElementById('sync-bitget-btn');
if (syncBitgetBtn) {
  syncBitgetBtn.addEventListener('click', async () => {
    setButtonLoading(syncBitgetBtn, true, 'Syncing...');
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
    console.log('Status data received:', data);

      if (data.synced === false) {
        throw new Error(data.reason || 'No exchange connected');
      }

      const entriesCreated = data.entriesCreated ?? 0;
      showMessage(`Synced ${entriesCreated} new entries`);
      await refreshAll();
      await loadPnlHistory();
    } catch (error) {
      const rawMessage = error.message || 'Sync failed';
      const isConnectionError = /no credentials|not enabled|no exchange|credentials not found|not connected|unauthorized|sync not enabled/i.test(rawMessage);
      const isAuthError = /40009|Invalid ACCESS-SIGN|Invalid API|ACCESS-SIGN|API[-\s]?key|signature|unauthorized|401|403|invalid|revoked|expired/i.test(rawMessage);
      if (isConnectionError) {
        showMessage('No exchange connected — go to Settings to connect an exchange account.', 'error');
      } else if (isAuthError) {
        showMessage('Bitget sync failed — your API credentials may have been changed or revoked. Please reconnect your account in Settings.', 'error');
      } else {
        showMessage(rawMessage, 'error');
      }
    } finally {
      setButtonLoading(syncBitgetBtn, false);
    }
  });
}

document.querySelector('#balance-table tbody').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.classList.contains('margin-input')) {
    event.preventDefault();
    const input = event.target;
    const td = input.closest('td');
    const saveButton = td.querySelector('.save-margin-btn');
    if (saveButton) {
      saveButton.click();
    }
  }
});

const deleteSelectedBtn = document.getElementById('delete-selected-btn');
if (deleteSelectedBtn) {
  deleteSelectedBtn.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.pnl-select-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.dataset.pnlId).filter(Boolean);

    if (ids.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${ids.length} selected P&L entries?`)) {
      return;
    }

    setButtonLoading(deleteSelectedBtn, true, 'Deleting...');

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
    } finally {
      setButtonLoading(deleteSelectedBtn, false);
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
      const statusText = document.getElementById('bitget-status-text');
      if (connectBtn) {
        connectBtn.textContent = 'Disconnect';
        connectBtn.dataset.connected = 'true';
      }
      if (statusText) {
        statusText.textContent = 'Connected';
        statusText.classList.add('connected');
      }
      await checkBitgetStatus();

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

  setButtonLoading(submitButton, true, 'Logging...');

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
    document.getElementById('add-pnl-modal').classList.remove('open');
    showMessage('P&L logged successfully');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setButtonLoading(submitButton, false);
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

  setButtonLoading(submitButton, true, 'Saving...');

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
    document.getElementById('add-balance-modal').classList.remove('open');
    showMessage(`${type === 'deposit' ? 'Deposit' : 'Withdrawal'} logged successfully`);
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    setButtonLoading(submitButton, false);
  }
});

document.getElementById('partner-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearInlineErrors();
  const addPartnerError = document.getElementById('add-partner-error');
  if (addPartnerError) {
    addPartnerError.textContent = '';
    addPartnerError.style.display = 'none';
  }

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
  const marginValue = document.getElementById('new-partner-margin').value;
  const margin_percentage = marginValue !== '' ? parseFloat(marginValue) : 0;

  if (Number.isNaN(margin_percentage) || margin_percentage < 0 || margin_percentage > 100) {
    showInlineError('partner-form-error', 'Margin percentage must be between 0 and 100');
    return;
  }

  if (depositAmount > 0 && !entry_date) {
    showInlineError('partner-form-error', 'Please select a date for the initial deposit');
    return;
  }

  setButtonLoading(submitButton, true, 'Adding...');

  try {
    console.log('[Add Partner] Creating partner:', name);
    const doFetch = () => fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ name, email, password, margin_percentage }),
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
    document.getElementById('add-partner-modal').classList.remove('open');
    console.log('[Add Partner] Refresh complete');
    showMessage('Partner added');
  } catch (error) {
    console.error('[Add Partner] Error:', error);
    const addPartnerError = document.getElementById('add-partner-error');
    if (addPartnerError) {
      addPartnerError.textContent = error.message;
      addPartnerError.style.display = 'block';
    }
    showMessage(error.message, 'error');
  } finally {
    setButtonLoading(submitButton, false);
  }
});

const visibilityCheckbox = document.getElementById('visibility-checkbox');
if (visibilityCheckbox) {
  visibilityCheckbox.addEventListener('change', async (event) => {
    const messageEl = document.getElementById('privacy-notif-message');
    const is_visible_to_others = event.target.checked;

    try {
      const doFetch = () => fetch('/api/partners/me/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_visible_to_others }),
      });

      let response = await doFetch();
      response = await handleApiResponse(response, doFetch);
      await response.json();

      if (messageEl) {
        messageEl.textContent = 'Privacy setting updated';
        messageEl.style.color = 'var(--profit)';
      }
      await refreshAll();
    } catch (error) {
      if (messageEl) {
        messageEl.textContent = error.message;
        messageEl.style.color = 'var(--loss)';
      }
    }
  });
}

const notificationsCheckbox = document.getElementById('notifications-checkbox');
if (notificationsCheckbox) {
  notificationsCheckbox.checked = Notification.permission === 'granted';

  notificationsCheckbox.addEventListener('change', async () => {
    const messageEl = document.getElementById('privacy-notif-message');
    if (notificationsCheckbox.checked) {
      if (Notification.permission !== 'granted') {
        await subscribeToPush();
      }
      if (messageEl) {
        messageEl.textContent = 'Push notifications enabled';
        messageEl.style.color = 'var(--profit)';
      }
    } else {
      if (messageEl) {
        messageEl.textContent = 'To disable notifications, remove permission for this site in your browser or phone settings.';
        messageEl.style.color = 'var(--text-muted)';
      }
    }
  });
}

document.querySelector('#balance-table tbody').addEventListener('click', async (event) => {
  const summary = event.target.closest('.card-summary');
  if (summary) {
    const tr = summary.closest('tr');
    if (tr) {
      tr.classList.toggle('expanded');
    }
    return;
  }

  const editButton = event.target.closest('.edit-margin-btn') || event.target.closest('.edit-margin');
  if (editButton) {
    const partnerId = editButton.dataset.partnerId;
    const currentValue = editButton.dataset.margin;
    const td = editButton.closest('td');
    if (!td) return;

    td.innerHTML = `
      <div style="display: flex; gap: 4px; align-items: center;">
        <input type="number" class="margin-input" min="0" max="100" step="0.1" value="${currentValue}" style="width: 80px; padding: 4px 8px; font-size: 13px; margin: 0;">
        <button type="button" class="save-margin-btn btn-secondary" data-partner-id="${partnerId}" style="padding: 4px 8px; font-size: 13px; margin: 0;" title="Save">✓</button>
      </div>
    `;
    const input = td.querySelector('.margin-input');
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  const saveButton = event.target.closest('.save-margin-btn');
  if (saveButton) {
    const partnerId = saveButton.dataset.partnerId;
    const td = saveButton.closest('td');
    const input = td.querySelector('.margin-input');
    if (!input) return;

    const newValue = input.value;
    const margin_percentage = parseFloat(newValue);
    if (Number.isNaN(margin_percentage) || margin_percentage < 0 || margin_percentage > 100) {
      showMessage('Margin percentage must be between 0 and 100', 'error');
      return;
    }

    setButtonLoading(saveButton, true, '...');

    try {
      const doFetch = () => fetch(`/api/partners/${partnerId}/margin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ margin_percentage }),
      });
      let response = await doFetch();
      response = await handleApiResponse(response, doFetch);
      const responseData = await response.json();
      console.log('[PATCH /api/partners/:id/margin] Response:', responseData);
      await refreshAll();
    } catch (error) {
      console.error('Edit margin error:', error);
      showMessage(error.message, 'error');
    } finally {
      setButtonLoading(saveButton, false);
    }
    return;
  }

  const button = event.target.closest('.remove-partner');
  if (!button) return;

  const partnerId = button.dataset.partnerId;
  console.log('Removing partner:', partnerId);

  if (!window.confirm("Are you sure you want to remove this partner? This cannot be undone.")) return;

  setButtonLoading(button, true, 'Removing...');

  try {
    const doFetch = () => fetch(`/api/partners/${partnerId}`, { method: 'DELETE', headers: getAuthHeaders() });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();
    await refreshAll();
  } catch (error) {
    console.error('Remove partner error:', error);
  } finally {
    setButtonLoading(button, false);
  }
});

const transactionLogTbody = document.querySelector('#transaction-log-table tbody');
if (transactionLogTbody) {
  transactionLogTbody.addEventListener('click', (event) => {
    const summary = event.target.closest('.card-summary');
    if (summary) {
      const tr = summary.closest('tr');
      if (tr) {
        tr.classList.toggle('expanded');
      }
    }
  });
}

document.querySelector('#pnl-history-table tbody').addEventListener('click', async (event) => {
  const summary = event.target.closest('.card-summary');
  if (summary) {
    const tr = summary.closest('tr');
    if (tr) {
      tr.classList.toggle('expanded');
    }
    return;
  }

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
refreshAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service worker registered'))
      .catch((err) => console.error('Service worker registration failed:', err));
  });
}

function moveSidebarHighlight(activeButton) {
  const highlight = document.getElementById('sidebar-highlight');
  const sidebar = document.getElementById('desktop-sidebar');
  if (!highlight || !sidebar || !activeButton) return;
  const sidebarRect = sidebar.getBoundingClientRect();
  const btnRect = activeButton.getBoundingClientRect();
  const offsetTop = btnRect.top - sidebarRect.top;
  highlight.style.height = btnRect.height + 'px';
  highlight.style.transform = `translateY(${offsetTop}px)`;
}

document.querySelectorAll('.nav-item, .sidebar-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');

    document.querySelectorAll('[data-tab]').forEach((section) => {
      section.style.display = section.id === targetId ? 'block' : 'none';
    });

    document.querySelectorAll('.nav-item, .sidebar-item').forEach((navBtn) => {
      navBtn.classList.remove('active');
    });

    document.querySelectorAll(`[data-target="${targetId}"]`).forEach((matchingBtn) => {
      matchingBtn.classList.add('active');
    });

    const activeSidebarBtn = document.querySelector(`.sidebar-item[data-target="${targetId}"]`);
    if (activeSidebarBtn) {
      moveSidebarHighlight(activeSidebarBtn);
    }

    if (targetId === 'tab-transactions') {
      loadTransactionLog();
    }
  });
});

const initialActiveSidebar = document.querySelector('.sidebar-item.active');
if (initialActiveSidebar) {
  moveSidebarHighlight(initialActiveSidebar);
}

async function loadUserName() {
  const input = document.getElementById('edit-name-input');
  if (!input) return;
  try {
    const doFetch = () => fetch('/api/partners', { headers: getAuthHeaders() });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    const partners = await response.json();
    const loggedInUserId = localStorage.getItem('user_id');
    const myRow = partners.find(p => String(p.user_id) === String(loggedInUserId));
    if (myRow) {
      input.value = myRow.name || '';
    }
  } catch (error) {
    console.error('[loadUserName] Error:', error);
  }
}

loadUserName();

document.getElementById('save-name-btn').addEventListener('click', async () => {
  const button = document.getElementById('save-name-btn');
  const messageEl = document.getElementById('edit-name-message');
  const nameInput = document.getElementById('edit-name-input');
  const name = nameInput ? nameInput.value.trim() : '';

  if (!name) {
    if (messageEl) {
      messageEl.textContent = 'Name is required';
      messageEl.style.color = 'var(--loss)';
    }
    return;
  }

  setButtonLoading(button, true, 'Saving...');

  try {
    const doFetch = () => fetch('/api/partners/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ name }),
    });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();

    if (messageEl) {
      messageEl.textContent = 'Name updated';
      messageEl.style.color = 'var(--profit)';
    }
    await refreshAll();
  } catch (error) {
    if (messageEl) {
      messageEl.textContent = error.message;
      messageEl.style.color = 'var(--loss)';
    }
  } finally {
    setButtonLoading(button, false);
  }
});

document.getElementById('change-password-btn').addEventListener('click', async () => {
  const button = document.getElementById('change-password-btn');
  const messageEl = document.getElementById('change-password-message');
  const currentPasswordInput = document.getElementById('current-password-input');
  const newPasswordInput = document.getElementById('new-password-input');
  const current_password = currentPasswordInput ? currentPasswordInput.value : '';
  const new_password = newPasswordInput ? newPasswordInput.value : '';

  if (!current_password || !new_password) {
    if (messageEl) {
      messageEl.textContent = 'Current and new password are required';
      messageEl.style.color = 'var(--loss)';
    }
    return;
  }

  setButtonLoading(button, true, 'Updating...');

  try {
    const doFetch = () => fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ current_password, new_password }),
    });
    let response = await doFetch();
    response = await handleApiResponse(response, doFetch);
    await response.json();

    if (messageEl) {
      messageEl.textContent = 'Password updated';
      messageEl.style.color = 'var(--profit)';
    }
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
  } catch (error) {
    if (messageEl) {
      messageEl.textContent = error.message;
      messageEl.style.color = 'var(--loss)';
    }
  } finally {
    setButtonLoading(button, false);
  }
});

document.getElementById('open-add-partner-btn').addEventListener('click', () => {
  console.log('Add Partner button clicked');
  const modal = document.getElementById('add-partner-modal');
  console.log('Modal element found:', modal);
  modal.classList.add('open');
});

document.getElementById('open-add-balance-btn').addEventListener('click', () => {
  console.log('Add Balance button clicked');
  const modal = document.getElementById('add-balance-modal');
  console.log('Modal element found:', modal);
  modal.classList.add('open');
});

document.getElementById('open-add-pnl-btn').addEventListener('click', () => {
  document.getElementById('add-pnl-modal').classList.add('open');
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.classList.remove('open');
    }
  });
});
