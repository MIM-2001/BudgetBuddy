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
    row.innerHTML = `
      <span class="row-name">${x.name}<div class="row-meta">${env ? env.name : 'Uncategorized'}</div></span>
      <span class="row-leader"></span>
      <span class="row-amount">${money(x.amount)}</span>
      <button class="row-del" data-remove-exp="${x.id}" aria-label="Remove">×</button>
    `;
    expList.appendChild(row);
  });
}

/* =========================================================================
   EVENTS
   ========================================================================= */
function toggleForm(formId, btnId) {
  const form = document.getElementById(formId);
  document.getElementById(btnId).addEventListener('click', () => {
    form.classList.toggle('open');
  });
}
toggleForm('incomeForm', 'toggleIncomeForm');
toggleForm('envForm', 'toggleEnvForm');
toggleForm('expForm', 'toggleExpForm');

document.getElementById('incFreq').addEventListener('change', (e) => {
  document.getElementById('spreadField').style.display = e.target.value === 'lump' ? 'block' : 'none';
});
document.getElementById('spreadField').style.display = 'none';

document.getElementById('saveIncome').addEventListener('click', () => {
  const name = document.getElementById('incName').value.trim();
  const amount = parseFloat(document.getElementById('incAmount').value);
  if (!name || !amount || amount <= 0) return;
  Store.addIncome({
    name,
    type: document.getElementById('incType').value,
    amount,
    freq: document.getElementById('incFreq').value,
    spread: document.getElementById('incSpread').value,
  });
  document.getElementById('incName').value = '';
  document.getElementById('incAmount').value = '';
  document.getElementById('incomeForm').classList.remove('open');
  render();
});
document.getElementById('cancelIncome').addEventListener('click', () => {
  document.getElementById('incomeForm').classList.remove('open');
});

document.getElementById('saveEnv').addEventListener('click', () => {
  const name = document.getElementById('envName').value.trim();
  const amount = parseFloat(document.getElementById('envAmount').value);
  if (!name || !amount || amount <= 0) return;
  Store.addEnvelope({ name, amount });
  document.getElementById('envName').value = '';
  document.getElementById('envAmount').value = '';
  document.getElementById('envForm').classList.remove('open');
  render();
});
document.getElementById('cancelEnv').addEventListener('click', () => {
  document.getElementById('envForm').classList.remove('open');
});

document.getElementById('saveExp').addEventListener('click', () => {
  const name = document.getElementById('expName').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  const envelopeId = document.getElementById('expCategory').value;
  if (!name || !amount || amount <= 0 || !envelopeId) return;
  Store.addExpense({ name, amount, envelopeId });
  document.getElementById('expName').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expForm').classList.remove('open');
  render();
});
document.getElementById('cancelExp').addEventListener('click', () => {
  document.getElementById('expForm').classList.remove('open');
});

document.addEventListener('click', (e) => {
  if (e.target.dataset.removeIncome) { Store.removeIncome(e.target.dataset.removeIncome); render(); }
  if (e.target.dataset.removeEnv) { Store.removeEnvelope(e.target.dataset.removeEnv); render(); }
  if (e.target.dataset.removeExp) { Store.removeExpense(e.target.dataset.removeExp); render(); }
});

render();
