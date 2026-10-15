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
   EXPENSE HISTORY
   Expenses are listed by month, newest first, with a label per day. Only
   the current month starts open, so the list stays short however much is
   logged; the category chips narrow it to one category.
   ========================================================================= */
let expenseFilter = null; // an envelope id, or null for every category
const openMonths = new Set([monthKey(new Date())]);

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function dayLabel(date) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function expenseRow(x, envelopes) {
  const env = envelopes.find(e => e.id === x.envelopeId);
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.editExp = x.id;
  // Expenses scanned before the receipt scanner was removed keep their photo.
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
  return row;
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
    row.dataset.editIncome = inc.id;
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
      <span class="row-actions">
        <button class="row-edit" data-edit-income="${inc.id}" aria-label="Edit">✎</button>
        <button class="row-del" data-remove-income="${inc.id}" aria-label="Remove">×</button>
      </span>
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
    card.dataset.editEnv = env.id;
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

  // Category filter chips (a filter needs at least two categories to choose from)
  if (expenseFilter && !state.envelopes.some(e => e.id === expenseFilter)) expenseFilter = null;
  const filters = document.getElementById('expFilters');
  filters.hidden = state.envelopes.length < 2 || !state.expenses.length;
  filters.innerHTML = [{ id: '', name: 'All' }, ...state.envelopes].map(env => `
    <button class="chip" data-exp-filter="${env.id}" aria-pressed="${(expenseFilter || '') === env.id}">${env.name}</button>
  `).join('');

  // Expense history: months newest first; open months list their days
  const expList = document.getElementById('expList');
  expList.innerHTML = '';
  document.getElementById('expEmpty').style.display = state.expenses.length ? 'none' : 'block';
  const shown = state.expenses
    .filter(x => !expenseFilter || x.envelopeId === expenseFilter)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (state.expenses.length && !shown.length) {
    expList.innerHTML = '<div class="empty">No expenses in this category yet.</div>';
  }
  const months = new Map();
  shown.forEach(x => {
    const key = monthKey(new Date(x.date));
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(x);
  });
  months.forEach((items, key) => {
    const open = openMonths.has(key);
    const total = items.reduce((sum, x) => sum + x.amount, 0);
    const head = document.createElement('button');
    head.className = 'month-head';
    head.dataset.month = key;
    head.setAttribute('aria-expanded', String(open));
    head.innerHTML = `
      <span class="month-name">${monthLabel(new Date(items[0].date))}</span>
      <span class="month-count">${items.length} ${items.length === 1 ? 'expense' : 'expenses'}</span>
      <span class="month-total">${money(total)}</span>
      <span class="month-chevron" aria-hidden="true">›</span>
    `;
    expList.appendChild(head);
    if (!open) return;
    let lastDay = '';
    items.forEach(x => {
      const day = dayLabel(new Date(x.date));
      if (day !== lastDay) {
        const dayHead = document.createElement('div');
        dayHead.className = 'day-head';
        dayHead.textContent = day;
        expList.appendChild(dayHead);
        lastDay = day;
      }
      expList.appendChild(expenseRow(x, state.envelopes));
    });
  });
}

/* =========================================================================
   EVENTS
   ========================================================================= */
// "Spread over (months)" only applies to lump sums.
function syncSpreadField() {
  document.getElementById('spreadField').style.display =
    document.getElementById('incFreq').value === 'lump' ? 'block' : 'none';
}
document.getElementById('incFreq').addEventListener('change', syncSpreadField);
syncSpreadField();

let editingIncomeId = null;
let editingEnvId = null;
let editingExpId = null;

function resetIncomeForm() {
  editingIncomeId = null;
  document.getElementById('incName').value = '';
  document.getElementById('incAmount').value = '';
  document.getElementById('incType').value = 'aid';
  document.getElementById('incFreq').value = 'monthly';
  document.getElementById('incSpread').value = '4';
  syncSpreadField();
}

function resetEnvForm() {
  editingEnvId = null;
  document.getElementById('envName').value = '';
  document.getElementById('envAmount').value = '';
}

function resetExpForm() {
  editingExpId = null;
  document.getElementById('expName').value = '';
  document.getElementById('expAmount').value = '';
}

// Each save returns true once it has stored something, so the popup knows
// it can close; invalid input returns false and leaves the popup open.
function saveIncome() {
  const name = document.getElementById('incName').value.trim();
  const amount = parseFloat(document.getElementById('incAmount').value);
  if (!name || !amount || amount <= 0) return false;
  const item = {
    name,
    type: document.getElementById('incType').value,
    amount,
    freq: document.getElementById('incFreq').value,
    spread: document.getElementById('incSpread').value,
  };
  if (editingIncomeId) {
    Store.updateIncome(editingIncomeId, item);
  } else {
    Store.addIncome(item);
  }
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
  const item = { name, amount, envelopeId };
  if (editingExpId) {
    Store.updateExpense(editingExpId, item);
  } else {
    Store.addExpense(item);
  }
  resetExpForm();
  return true;
}

function editIncome(id) {
  const inc = Store.getState().income.find(x => x.id === id);
  if (!inc) return;
  editingIncomeId = inc.id;
  document.getElementById('incName').value = inc.name;
  document.getElementById('incType').value = inc.type;
  document.getElementById('incAmount').value = inc.amount;
  document.getElementById('incFreq').value = inc.freq;
  document.getElementById('incSpread').value = inc.spread || 4;
  syncSpreadField();
  openAddDialog('income', 'Edit income source');
}

function editEnvelope(id) {
  const env = Store.getState().envelopes.find(x => x.id === id);
  if (!env) return;
  editingEnvId = env.id;
  document.getElementById('envName').value = env.name;
  document.getElementById('envAmount').value = env.amount;
  openAddDialog('envelope', 'Edit category');
}

function editExpense(id) {
  const exp = Store.getState().expenses.find(x => x.id === id);
  if (!exp) return;
  editingExpId = exp.id;
  document.getElementById('expName').value = exp.name;
  document.getElementById('expAmount').value = exp.amount;
  document.getElementById('expCategory').value = exp.envelopeId;
  openAddDialog('expense', 'Edit expense');
}

// Month headers open and close, chips filter the expense history, and
// tapping anywhere on an income row, category card or expense row opens it
// for editing; its remove button deletes it instead.
document.addEventListener('click', (e) => {
  const month = e.target.closest('[data-month]');
  if (month) {
    const key = month.dataset.month;
    if (openMonths.has(key)) openMonths.delete(key);
    else openMonths.add(key);
    render();
    return;
  }
  const chip = e.target.closest('[data-exp-filter]');
  if (chip) {
    expenseFilter = chip.dataset.expFilter || null;
    render();
    return;
  }
  const remove = e.target.closest('[data-remove-income], [data-remove-env], [data-remove-exp]');
  if (remove) {
    const { removeIncome, removeEnv, removeExp } = remove.dataset;
    if (removeIncome) Store.removeIncome(removeIncome);
    if (removeEnv) Store.removeEnvelope(removeEnv);
    if (removeExp) Store.removeExpense(removeExp);
    render();
    return;
  }
  const item = e.target.closest('[data-edit-income], [data-edit-env], [data-edit-exp]');
  if (!item) return;
  const { editIncome: incomeId, editEnv: envId, editExp: expId } = item.dataset;
  if (incomeId) editIncome(incomeId);
  if (envId) editEnvelope(envId);
  if (expId) editExpense(expId);
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
  if (editingIncomeId) resetIncomeForm();
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
