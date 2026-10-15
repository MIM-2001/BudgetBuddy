/* =========================================================================
   DERIVED CALCULATIONS
   ========================================================================= */
function monthlyValueOf(income) {
  if (income.freq === 'monthly') return income.amount;
  if (income.freq === 'biweekly') return income.amount * 26 / 12;
  if (income.freq === 'weekly') return income.amount * 52 / 12;
  const months = Math.max(1, Number(income.spread) || 1);
  return income.amount / months;
}

function totalMonthlyIncome() {
  return Store.getState().income.reduce((sum, i) => sum + monthlyValueOf(i), 0);
}

function spentInEnvelope(envId) {
  return Store.getState().expenses
    .filter(x => x.envelopeId === envId)
    .reduce((sum, x) => sum + x.amount, 0);
}

function totalSpent() {
  return Store.getState().expenses.reduce((sum, x) => sum + x.amount, 0);
}

function daysLeftInMonth() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(1, end.getDate() - now.getDate() + 1);
}

function money(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* =========================================================================
   CHART DATA
   ========================================================================= */
const INCOME_TYPE_COLOR_INDEX = { aid: 0, loan: 1, family: 2, job: 3 };

function spendingByCategorySegments() {
  const state = Store.getState();
  const segments = [];
  let otherTotal = 0;
  state.envelopes.forEach(env => {
    const value = spentInEnvelope(env.id);
    if (env.colorIndex < CHART_PALETTE.length) {
      segments.push({ label: env.name, value, color: paletteColor(env.colorIndex) });
    } else {
      otherTotal += value;
    }
  });
  if (otherTotal > 0) segments.push({ label: 'Other', value: otherTotal, color: CHART_OTHER_COLOR });
  return segments;
}

function incomeByTypeSegments() {
  const state = Store.getState();
  const totals = {};
  state.income.forEach(inc => {
    totals[inc.type] = (totals[inc.type] || 0) + monthlyValueOf(inc);
  });
  return Object.keys(tagLabel).map(type => ({
    label: tagLabel[type],
    value: totals[type] || 0,
    color: paletteColor(INCOME_TYPE_COLOR_INDEX[type]),
  }));
}

/* =========================================================================
   RENDER
   ========================================================================= */
const tagLabel = { aid: 'Aid', loan: 'Loan', family: 'Family', job: 'Job' };

function render() {
  const state = Store.getState();
  const monthlyIncome = totalMonthlyIncome();
  const spent = totalSpent();
  const remaining = monthlyIncome - spent;
  const days = daysLeftInMonth();
  const safeToday = remaining / days;

  // Hero
  const heroNum = document.getElementById('heroNumber');
  heroNum.textContent = money(safeToday);
  heroNum.classList.toggle('over', safeToday < 0);
  document.getElementById('heroRemaining').textContent = money(remaining);
  document.getElementById('heroDays').textContent = days;
  const pct = monthlyIncome > 0 ? Math.min(100, (spent / monthlyIncome) * 100) : 0;
  const heroBar = document.getElementById('heroBar');
  heroBar.style.width = pct + '%';
  heroBar.classList.toggle('over', spent > monthlyIncome);

  // Charts
  renderDonut(document.getElementById('categoryChart'), spendingByCategorySegments(), {
    emptyText: 'Log an expense to see this chart.',
    formatValue: money,
  });
  renderDonut(document.getElementById('incomeChart'), incomeByTypeSegments(), {
    emptyText: 'Add an income source to see this chart.',
    formatValue: money,
  });

  // Income list
  const incList = document.getElementById('incomeList');
  incList.innerHTML = '';
  document.getElementById('incomeEmpty').style.display = state.income.length ? 'none' : 'block';
  state.income.forEach(inc => {
    const row = document.createElement('div');
    row.className = 'row';
    const freqLabel = { monthly: 'monthly', biweekly: 'every 2 weeks', weekly: 'every week' };
    const meta = inc.freq === 'lump'
      ? `spread over ${inc.spread} mo · ${money(monthlyValueOf(inc))}/mo`
      : inc.freq === 'monthly'
        ? 'monthly'
        : `${freqLabel[inc.freq]} · ${money(monthlyValueOf(inc))}/mo`;
    row.innerHTML = `
      <span class="row-tag ${inc.type}">${tagLabel[inc.type]}</span>
      <span class="row-name">${inc.name}<div class="row-meta">${meta}</div></span>
      <span class="row-leader"></span>
      <span class="row-amount">${money(inc.amount)}</span>
      <button class="row-del" data-remove-income="${inc.id}" aria-label="Remove">×</button>
    `;
    incList.appendChild(row);
  });

  // Envelope select options (for expense form)
  const expCategory = document.getElementById('expCategory');
  const prevVal = expCategory.value;
  expCategory.innerHTML = state.envelopes.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (prevVal) expCategory.value = prevVal;

  // Envelope list
  const envList = document.getElementById('envList');
  envList.innerHTML = '';
  document.getElementById('envEmpty').style.display = state.envelopes.length ? 'none' : 'block';
  state.envelopes.forEach(env => {
    const envSpent = spentInEnvelope(env.id);
    const envPct = env.amount > 0 ? Math.min(100, (envSpent / env.amount) * 100) : 0;
    const fillClass = envSpent > env.amount ? 'over' : (envPct > 80 ? 'warn' : '');
    const card = document.createElement('div');
    card.className = 'envelope';
    card.innerHTML = `
      <div class="env-top">
        <span class="env-name">${env.name}</span>
        <span class="env-nums"><b>${money(envSpent)}</b> / ${money(env.amount)}</span>
      </div>
      <div class="env-track"><div class="env-fill ${fillClass}" style="width:${envPct}%"></div></div>
      <div class="env-actions">
        <button class="btn-text" data-edit-env="${env.id}">edit</button>
        <button class="btn-text" data-remove-env="${env.id}">remove category</button>
      </div>
    `;
    envList.appendChild(card);
  });

  // Expense list (most recent first)
  const expList = document.getElementById('expList');
  expList.innerHTML = '';
  const sorted = [...state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  document.getElementById('expEmpty').style.display = sorted.length ? 'none' : 'block';
  sorted.slice(0, 25).forEach(x => {
    const env = state.envelopes.find(e => e.id === x.envelopeId);
    const row = document.createElement('div');
    row.className = 'row';
    const thumb = x.receiptThumb ? `<img class="row-thumb" src="${x.receiptThumb}" alt="Receipt">` : '';
    row.innerHTML = `
      ${thumb}
      <span class="row-name">${x.name}<div class="row-meta">${env ? env.name : 'Uncategorized'}</div></span>
      <span class="row-leader"></span>
      <span class="row-amount">${money(x.amount)}</span>
      <span class="row-actions">
        <button class="row-edit" data-edit-exp="${x.id}" aria-label="Edit">✎</button>
        <button class="row-del" data-remove-exp="${x.id}" aria-label="Remove">×</button>
      </span>
    `;
    expList.appendChild(row);
  });
}

/* =========================================================================
   EVENTS
   ========================================================================= */
document.getElementById('incFreq').addEventListener('change', (e) => {
  document.getElementById('spreadField').style.display = e.target.value === 'lump' ? 'block' : 'none';
});
document.getElementById('spreadField').style.display = 'none';

let editingEnvId = null;
let editingExpId = null;
let pendingReceiptThumb = null;

function resetIncomeForm() {
  document.getElementById('incName').value = '';
  document.getElementById('incAmount').value = '';
}

function resetEnvForm() {
  editingEnvId = null;
  document.getElementById('envName').value = '';
  document.getElementById('envAmount').value = '';
}

function setReceiptPreview(thumbUrl) {
  pendingReceiptThumb = thumbUrl;
  const preview = document.getElementById('receiptPreview');
  preview.src = thumbUrl || '';
  preview.hidden = !thumbUrl;
}

function resetExpForm() {
  editingExpId = null;
  document.getElementById('expName').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('receiptInput').value = '';
  document.getElementById('receiptStatus').textContent = '';
  setReceiptPreview(null);
}

// Each save returns true once it has stored something, so the popup knows
// it can close; invalid input returns false and leaves the popup open.
function saveIncome() {
  const name = document.getElementById('incName').value.trim();
  const amount = parseFloat(document.getElementById('incAmount').value);
  if (!name || !amount || amount <= 0) return false;
  Store.addIncome({
    name,
    type: document.getElementById('incType').value,
    amount,
    freq: document.getElementById('incFreq').value,
    spread: document.getElementById('incSpread').value,
  });
  resetIncomeForm();
  return true;
}

function saveEnvelope() {
  const name = document.getElementById('envName').value.trim();
  const amount = parseFloat(document.getElementById('envAmount').value);
  if (!name || !amount || amount <= 0) return false;
  if (editingEnvId) {
    Store.updateEnvelope(editingEnvId, { name, amount });
  } else {
    Store.addEnvelope({ name, amount });
  }
  resetEnvForm();
  return true;
}

function saveExpense() {
  const name = document.getElementById('expName').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const envelopeId = document.getElementById('expCategory').value;
  if (!name || !amount || amount <= 0 || !envelopeId) return false;
  const item = { name, amount, envelopeId, receiptThumb: pendingReceiptThumb };
  if (editingExpId) {
    Store.updateExpense(editingExpId, item);
  } else {
    Store.addExpense(item);
  }
  resetExpForm();
  return true;
}

document.getElementById('scanReceiptBtn').addEventListener('click', () => {
  document.getElementById('receiptInput').click();
});

document.getElementById('receiptInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('receiptStatus');
  try {
    const { thumbnail, guessedAmount } = await scanReceipt(file, {
      onStatus: (msg) => { status.textContent = msg; },
    });
    setReceiptPreview(thumbnail);
    if (guessedAmount) {
      document.getElementById('expAmount').value = guessedAmount.toFixed(2);
      status.textContent = `Guessed $${guessedAmount.toFixed(2)} from the receipt — check it before saving.`;
    } else {
      status.textContent = "Couldn't read an amount — enter it manually.";
    }
  } catch (err) {
    console.error('BudgetBuddy: receipt scan failed', err);
    status.textContent = "Couldn't scan that receipt — enter the amount manually.";
  }
});

document.addEventListener('click', (e) => {
  if (e.target.dataset.removeIncome) { Store.removeIncome(e.target.dataset.removeIncome); render(); }
  if (e.target.dataset.removeEnv) { Store.removeEnvelope(e.target.dataset.removeEnv); render(); }
  if (e.target.dataset.removeExp) { Store.removeExpense(e.target.dataset.removeExp); render(); }

  if (e.target.dataset.editEnv) {
    const env = Store.getState().envelopes.find(x => x.id === e.target.dataset.editEnv);
    if (!env) return;
    editingEnvId = env.id;
    document.getElementById('envName').value = env.name;
    document.getElementById('envAmount').value = env.amount;
    openAddDialog('envelope', 'Edit category');
  }

  if (e.target.dataset.editExp) {
    const exp = Store.getState().expenses.find(x => x.id === e.target.dataset.editExp);
    if (!exp) return;
    editingExpId = exp.id;
    document.getElementById('expName').value = exp.name;
    document.getElementById('expAmount').value = exp.amount;
    document.getElementById('expCategory').value = exp.envelopeId;
    document.getElementById('receiptStatus').textContent = '';
    setReceiptPreview(exp.receiptThumb || null);
    openAddDialog('expense', 'Edit expense');
  }
});

/* =========================================================================
   ADD POPUP
   One popup adds every kind of entry: the "What are you adding?" dropdown
   shows only that kind's fields. Editing a category or an expense reuses
   it with the kind locked.
   ========================================================================= */
const addDialog = document.getElementById('addDialog');
const addType = document.getElementById('addType');
const SAVE_LABELS = { expense: 'Add expense', income: 'Add income source', envelope: 'Add category' };
const SAVERS = { expense: saveExpense, income: saveIncome, envelope: saveEnvelope };
let lastPickedType = null;

// × and a tap on the dimmed backdrop close a popup. The popup's content
// fills the <dialog> box, so a click whose target is the dialog itself
// landed on the backdrop.
function wirePopupClose(dialog, closeBtnId) {
  document.getElementById(closeBtnId).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

function showAddFields() {
  const type = addType.value;
  const editing = addType.disabled; // the kind is locked only while editing
  document.querySelectorAll('[data-add-fields]').forEach(el => {
    el.hidden = el.dataset.addFields !== type;
  });
  document.getElementById('saveAdd').textContent = editing ? 'Save changes' : SAVE_LABELS[type];
  document.getElementById('noCategoryHint').hidden =
    type !== 'expense' || Store.getState().envelopes.length > 0;
}

// Until the user picks a kind themselves, Add walks a new user through
// setup in the page's order: income, then categories, then expenses.
function defaultAddType() {
  const state = Store.getState();
  if (!state.income.length) return 'income';
  if (!state.envelopes.length) return 'envelope';
  return 'expense';
}

function openAddDialog(type, editTitle) {
  addType.value = type;
  addType.disabled = Boolean(editTitle);
  document.getElementById('addTitle').textContent = editTitle || 'Add';
  showAddFields();
  addDialog.showModal();
}

document.getElementById('openAdd').addEventListener('click', () => {
  openAddDialog(lastPickedType || defaultAddType());
});

addType.addEventListener('change', () => {
  lastPickedType = addType.value;
  showAddFields();
});

document.getElementById('switchToCategory').addEventListener('click', () => {
  addType.value = 'envelope';
  showAddFields();
});

document.getElementById('saveAdd').addEventListener('click', () => {
  if (!SAVERS[addType.value]()) return;
  addDialog.close();
  render();
});

wirePopupClose(addDialog, 'closeAdd');

// Closing without saving keeps a half-typed new entry for next time, but
// drops an unsaved edit so the next Add starts blank.
addDialog.addEventListener('close', () => {
  if (editingEnvId) resetEnvForm();
  if (editingExpId) resetExpForm();
});

/* =========================================================================
   ACCOUNT
   The app works signed out (saved on this device). Signing in from the
   Settings popup — or from the reconnect banner, after a reload drops
   the in-memory token — loads the budget from the user's Google Drive.
   ========================================================================= */
const settingsDialog = document.getElementById('settingsDialog');

function syncAccountUI() {
  const connected = Store.isDriveConnected();
  document.getElementById('signInBtn').hidden = connected;
  document.getElementById('signOutBtn').hidden = !connected;
  document.getElementById('accountStatus').textContent = connected
    ? "You're signed in. Your budget saves to your own Google Drive and follows you to any device. Signing out removes it from this screen — it stays safe in your Drive."
    : 'Your budget is only saved on this device. Sign in to back it up to your own Google Drive and use it on any device — anything you\'ve already entered comes with you.';
  document.getElementById('reconnectBanner').hidden = connected || !Store.wasDriveConnected();
  document.getElementById('syncStatus').classList.toggle('synced', connected);
  document.getElementById('syncText').textContent = connected
    ? 'Saved to your Google Drive'
    : 'Saved on this device only';
}

function setSignInStatus(text) {
  document.querySelectorAll('[data-sign-in-status]').forEach(el => { el.textContent = text; });
}

async function handleSignIn() {
  const buttons = document.querySelectorAll('[data-sign-in]');
  buttons.forEach(b => { b.disabled = true; });
  setSignInStatus('Signing in…');
  try {
    const token = await signIn();
    setSignInStatus('Loading your budget…');
    await Store.connectDrive(token);
    setSignInStatus('');
    settingsDialog.close();
  } catch (err) {
    console.error('BudgetBuddy: sign-in failed', err);
    signOut();
    Store.loadDevice();
    setSignInStatus("Couldn't sign in — try again.");
  } finally {
    buttons.forEach(b => { b.disabled = false; });
    syncAccountUI();
    render();
  }
}

document.querySelectorAll('[data-sign-in]').forEach(btn => {
  btn.addEventListener('click', handleSignIn);
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  signOut();
  Store.disconnectDrive();
  setSignInStatus('');
  settingsDialog.close();
  syncAccountUI();
  render();
});

document.getElementById('openSettings').addEventListener('click', () => settingsDialog.showModal());
wirePopupClose(settingsDialog, 'closeSettings');

Store.loadDevice();
syncAccountUI();
render();
