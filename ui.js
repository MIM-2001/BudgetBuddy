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

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Budgets reset each calendar month: every total counts only this month's
// expenses. Earlier months stay in the expense history.
function expensesThisMonth() {
  const current = monthKey(new Date());
  return Store.getState().expenses.filter(x => monthKey(new Date(x.date)) === current);
}

function spentInEnvelope(envId) {
  return expensesThisMonth()
    .filter(x => x.envelopeId === envId)
    .reduce((sum, x) => sum + x.amount, 0);
}

function totalSpent() {
  return expensesThisMonth().reduce((sum, x) => sum + x.amount, 0);
}

function daysLeftInMonth() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(1, end.getDate() - now.getDate() + 1);
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// What's left this month once spending and the bills still to come are
// taken out (totalUnpaidBills is in affordability.js). The hero uses this.
function moneyLeftThisMonth() {
  return totalMonthlyIncome() - totalSpent() - totalUnpaidBills();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Total spent in one category between two dates (both included)
function spentBetween(envelopeId, from, to) {
  return Store.getState().expenses
    .filter(x => x.envelopeId === envelopeId)
    .filter(x => new Date(x.date) >= from && new Date(x.date) <= to)
    .reduce((sum, x) => sum + x.amount, 0);
}

function money(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* =========================================================================
   CHART DATA
   ========================================================================= */
const INCOME_TYPE_COLOR_INDEX = { aid: 0, loan: 1, family: 2, job: 3 };

function envelopeById(envelopeId) {
  return Store.getState().envelopes.find(e => e.id === envelopeId);
}

// A category's chart color, so the calendar matches the spending chart
function envelopeColor(envelopeId) {
  const env = envelopeById(envelopeId);
  return env ? paletteColor(env.colorIndex) : CHART_OTHER_COLOR;
}

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

// Income, the budget and each month of expenses fold into one summary row.
// Only the current month starts open, so the page stays short.
const openFolds = new Set([`month:${monthKey(new Date())}`]);

// A tappable summary row that opens or closes the list under it.
function foldHead(key, name, count, total) {
  const head = document.createElement('button');
  head.className = 'fold-head';
  head.dataset.fold = key;
  head.setAttribute('aria-expanded', String(openFolds.has(key)));
  head.innerHTML = `
    <span class="fold-name">${name}</span>
    <span class="fold-count">${count}</span>
    <span class="fold-total">${total}</span>
    <span class="fold-chevron" aria-hidden="true">›</span>
  `;
  return head;
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
  const bills = totalUnpaidBills();
  const remaining = moneyLeftThisMonth();
  const days = daysLeftInMonth();
  const safeToday = remaining / days;

  // Hero
  const heroNum = document.getElementById('heroNumber');
  heroNum.textContent = money(safeToday);
  heroNum.classList.toggle('over', safeToday < 0);
  document.getElementById('heroRemaining').textContent = money(remaining);
  document.getElementById('heroDays').textContent = days;
  document.getElementById('heroBills').textContent = money(bills);
  document.getElementById('heroBillsWrap').hidden = bills <= 0;
  // money set aside for bills counts as used, same as money spent
  const used = spent + bills;
  const pct = monthlyIncome > 0 ? Math.min(100, (used / monthlyIncome) * 100) : 0;
  const heroBar = document.getElementById('heroBar');
  heroBar.style.width = pct + '%';
  heroBar.classList.toggle('over', used > monthlyIncome);

  // Charts
  renderDonut(document.getElementById('categoryChart'), spendingByCategorySegments(), {
    emptyText: state.expenses.length ? 'Nothing spent yet this month.' : 'Log an expense to see this chart.',
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
  if (state.income.length) {
    const n = state.income.length;
    incList.appendChild(foldHead('income', `${n} ${n === 1 ? 'source' : 'sources'}`, '', `${money(monthlyIncome)}/mo`));
  }
  if (openFolds.has('income')) state.income.forEach(inc => {
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
  if (state.envelopes.length) {
    const n = state.envelopes.length;
    const budgeted = state.envelopes.reduce((sum, e) => sum + e.amount, 0);
    // spent / budgeted this month, the same format as each category's own row
    envList.appendChild(foldHead('budget', `${n} ${n === 1 ? 'category' : 'categories'}`, '',
      `${money(spent)} / ${money(budgeted)}`));
  }
  if (openFolds.has('budget')) state.envelopes.forEach(env => {
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
    const total = items.reduce((sum, x) => sum + x.amount, 0);
    const n = items.length;
    expList.appendChild(foldHead(`month:${key}`, monthLabel(new Date(items[0].date)),
      `${n} ${n === 1 ? 'expense' : 'expenses'}`, money(total)));
    if (!openFolds.has(`month:${key}`)) return;
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

  renderFeatures();
}

// The feature sections, each drawn by its own file
function renderFeatures() {
  renderCalendar();         // calendar.js
  renderAffordCategories(); // affordability.js
  updateChallenges();       // challenges.js: mark finished ones won or lost
  renderChallenges();       // challenges.js
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
  learnCategory(name, envelopeId); // calendar.js: guess this category next time
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

// Summary rows open and close, chips filter the expense history, and
// tapping anywhere on an income row, category card or expense row opens it
// for editing; its remove button deletes it instead.
document.addEventListener('click', (e) => {
  const fold = e.target.closest('[data-fold]');
  if (fold) {
    const key = fold.dataset.fold;
    if (openFolds.has(key)) openFolds.delete(key);
    else openFolds.add(key);
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
   PROFILE
   The avatar at the bottom left opens the Profile page. Photo, name,
   username and email are a draft until "Save changes" (closing drops it);
   the theme applies as soon as it's picked. All of it but the theme is
   saved with the budget, so it follows the user to Drive.
   ========================================================================= */
const profileDialog = document.getElementById('profileDialog');
const saveProfileBtn = document.getElementById('saveProfile');
const photoInput = document.getElementById('photoInput');
const profileInputs = {
  name: document.getElementById('profileName'),
  username: document.getElementById('profileUsername'),
  email: document.getElementById('profileEmail'),
};
const FIELD_ERRORS = { username: 'usernameError', email: 'emailError' };
const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;
const PHOTO_SIZE = 160; // px square: about 10 KB as a JPEG, shown at up to 80px

let draftPhoto = '';
let profileJustSaved = false;

const PERSON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="9" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>';

// Runs of spaces collapse, so "  Gio   C " saves as "Gio C".
function cleanName(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// First letter of the first and last words: "Gio" → "G", "Gio C" → "GC".
// Array.from keeps an emoji whole instead of splitting it in half.
function initials(text) {
  const words = text.split(' ');
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toUpperCase();
}

// The photo if there is one, else initials from the name (or the
// username), else a plain person icon.
function renderAvatar(el, profile) {
  const label = profile.name || profile.username;
  el.classList.toggle('avatar-empty', !profile.photo && !label);
  if (profile.photo) {
    const img = document.createElement('img');
    img.src = profile.photo;
    img.alt = '';
    el.replaceChildren(img);
  } else if (label) {
    el.textContent = initials(label);
  } else {
    el.innerHTML = PERSON_ICON;
  }
}

function renderBarAvatar() {
  renderAvatar(document.getElementById('barAvatar'), Store.getState().profile);
}

// Signed in, the header greets the user by first name (or username, if
// there's no name) in place of the app name.
function renderGreeting() {
  const { name, username } = Store.getState().profile;
  const signedIn = Store.isDriveConnected();
  const who = name.split(' ')[0] || username;
  const wordmark = document.getElementById('wordmark');
  wordmark.classList.toggle('greeting', signedIn);
  wordmark.textContent = !signedIn ? 'BudgetBuddy'
    : who ? `Welcome back, ${who}` : 'Welcome back!';
}

function readProfileForm() {
  return {
    name: cleanName(profileInputs.name.value),
    username: profileInputs.username.value.trim(),
    email: profileInputs.email.value.trim(),
    photo: draftPhoto,
  };
}

// The big avatar previews the draft, and Save only lights up once
// something differs from what's saved.
function syncProfileForm() {
  const draft = readProfileForm();
  const saved = Store.getState().profile;
  const changed = Object.keys(draft).some(k => draft[k] !== saved[k]);
  if (changed) profileJustSaved = false;
  renderAvatar(document.getElementById('profileAvatar'), draft);
  document.getElementById('removePhoto').hidden = !draft.photo;
  saveProfileBtn.disabled = !changed;
  saveProfileBtn.textContent = profileJustSaved ? 'Saved ✓' : 'Save changes';
}

function setFieldError(id, text) {
  document.getElementById(id).textContent = text;
}

// Shows what's wrong under each field; true when the draft can be saved.
function validateProfile(draft) {
  const usernameOk = !draft.username || USERNAME_PATTERN.test(draft.username);
  const emailOk = !draft.email || profileInputs.email.checkValidity();
  setFieldError('usernameError', usernameOk ? '' : 'Use 3–30 letters, numbers, periods or underscores.');
  setFieldError('emailError', emailOk ? '' : 'Enter an email like you@example.com.');
  return usernameOk && emailOk;
}

function saveProfile() {
  if (saveProfileBtn.disabled) return;
  const draft = readProfileForm();
  if (!validateProfile(draft)) return;
  Store.updateProfile(draft);
  profileJustSaved = true;
  renderBarAvatar();
  renderGreeting();
  syncProfileForm();
}

// Center-crops to a square and shrinks it, so a full-size phone photo
// becomes a small JPEG that fits in the budget file.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black
      ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
      ctx.drawImage(img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, PHOTO_SIZE, PHOTO_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('BudgetBuddy: not a readable image'));
    };
    img.src = url;
  });
}

document.getElementById('pickPhoto').addEventListener('click', () => photoInput.click());

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = ''; // so picking the same file again still fires
  if (!file) return;
  setFieldError('photoError', '');
  try {
    draftPhoto = await shrinkPhoto(file);
  } catch (err) {
    console.error(err);
    setFieldError('photoError', "Couldn't use that picture. Try a different one.");
  }
  syncProfileForm();
});

document.getElementById('removePhoto').addEventListener('click', () => {
  draftPhoto = '';
  syncProfileForm();
});

// Enter moves down the fields and saves from the last one. preventDefault
// keeps that same key press from also "clicking" whatever has focus next.
const profileFieldOrder = [profileInputs.name, profileInputs.username, profileInputs.email];
Object.entries(profileInputs).forEach(([key, input]) => {
  input.addEventListener('input', () => {
    if (FIELD_ERRORS[key]) setFieldError(FIELD_ERRORS[key], '');
    syncProfileForm();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = profileFieldOrder[profileFieldOrder.indexOf(input) + 1];
    if (next) next.focus();
    else saveProfile();
  });
});
saveProfileBtn.addEventListener('click', saveProfile);

// Light and Dark stamp data-theme on <html>; System removes it, so the
// stylesheet's prefers-color-scheme rules follow the phone.
function syncThemeUI() {
  const theme = Store.getTheme();
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.checked = radio.value === theme;
  });
}

document.getElementById('themeChoice').addEventListener('change', (e) => {
  const theme = e.target.value;
  Store.setTheme(theme);
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
});

// Every open starts from what's saved, so closing without saving drops
// the draft.
function openProfile() {
  const saved = Store.getState().profile;
  Object.entries(profileInputs).forEach(([key, input]) => { input.value = saved[key]; });
  draftPhoto = saved.photo;
  profileJustSaved = false;
  ['photoError', 'usernameError', 'emailError'].forEach(id => setFieldError(id, ''));
  syncProfileForm();
  syncThemeUI();
  profileDialog.showModal();
  profileDialog.scrollTop = 0;
}

document.getElementById('openProfile').addEventListener('click', openProfile);
wirePopupClose(profileDialog, 'closeProfile');

/* =========================================================================
   ACCOUNT
   The app works signed out (saved on this device). Signing in from the
   Profile popup — or from the reconnect banner, after a reload drops
   the in-memory token — loads the budget from the user's Google Drive.
   ========================================================================= */
function syncAccountUI() {
  renderBarAvatar();
  renderGreeting();
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
    profileDialog.close();
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
  profileDialog.close();
  syncAccountUI();
  render();
});
