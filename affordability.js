/* =========================================================================
   FEATURE 2: CAN I AFFORD THIS?

   Key points:
   - Safe to spend = money left this month
                   - bills that haven't been paid yet (from calendar.js)
                   - a 10% emergency buffer
   - Gives one of three answers:
       "Yes"           the price fits with room to spare
       "It's tight"    it fits, but uses most of what's safe to spend,
                       or it's more than what's left in that category
       "Not yet"       it costs more than what's safe to spend
   - "Not yet" comes with a simple savings plan (4 or 8 weeks) and a
     button to start a challenge in the user's biggest spending category.
   - Always shows the math, so the user can see why.
   ========================================================================= */

const BUFFER_PERCENT = 0.10; // keep 10% of monthly income as an emergency buffer
const TIGHT_PERCENT = 0.80;  // using 80% or more of safe-to-spend counts as "tight"

/**
 * Adds up the bills that still have to come out this month.
 * @returns {number} dollars
 */
function totalUnpaidBills() {
  let total = 0;
  for (const bill of unpaidBillsThisMonth()) {
    total += bill.amount;
  }
  return total;
}

/**
 * Works out how much the user can safely spend right now.
 * @returns {object} { left, bills, buffer, safe } all in dollars
 */
function getSafeToSpend() {
  const income = totalMonthlyIncome();
  const left = income - totalSpent();      // what's left this month
  const bills = totalUnpaidBills();        // bills still coming
  const buffer = income * BUFFER_PERCENT;  // emergency money we don't touch

  let safe = left - bills - buffer;
  if (safe < 0) safe = 0;

  return { left: left, bills: bills, buffer: buffer, safe: safe };
}

/**
 * Decides if the user can afford something.
 * @param {number} price how much it costs
 * @param {string} envelopeId the category it would come out of ('' for any)
 * @returns {string} 'yes', 'tight' or 'no'
 */
function checkAffordability(price, envelopeId) {
  const numbers = getSafeToSpend();

  if (price > numbers.safe) {
    return 'no';
  }

  // Would it use up most of what's safe to spend?
  if (price >= numbers.safe * TIGHT_PERCENT) {
    return 'tight';
  }

  // Is there enough left in the category they picked?
  if (envelopeId) {
    const envelope = envelopeById(envelopeId);
    const leftInCategory = envelope.amount - spentInEnvelope(envelopeId);
    if (price > leftInCategory) {
      return 'tight';
    }
  }

  return 'yes';
}

/**
 * Shows the answer, the math behind it, and a plan if they can't afford it.
 * @param {number} price
 * @param {string} envelopeId
 */
function showAffordResult(price, envelopeId) {
  const resultBox = document.getElementById('affordResult');
  const answer = checkAffordability(price, envelopeId);
  const numbers = getSafeToSpend();

  let html = '';

  if (answer === 'yes') {
    html += '<div class="afford yes">Yes, you can afford it!</div>';
    html += '<div class="row-meta">You\'ll still have ' + money(numbers.safe - price) + ' safe to spend.</div>';
  }

  if (answer === 'tight') {
    html += '<div class="afford tight">You can, but it\'s tight.</div>';
    if (envelopeId) {
      const envelope = envelopeById(envelopeId);
      const leftInCategory = envelope.amount - spentInEnvelope(envelopeId);
      html += '<div class="row-meta">You have ' + money(leftInCategory) + ' left in ' + envelope.name + '.</div>';
    }
  }

  if (answer === 'no') {
    const shortBy = price - numbers.safe;
    html += '<div class="afford no">Not yet. You\'re ' + money(shortBy) + ' short.</div>';
    html += '<div class="row-meta">Save ' + money(shortBy / 4) + ' a week to buy it in 4 weeks, '
      + 'or ' + money(shortBy / 8) + ' a week to buy it in 8 weeks.</div>';

    // Offer a challenge to help them save (from challenges.js)
    const ideas = suggestChallenges();
    if (ideas.length > 0) {
      const categoryName = envelopeById(ideas[0].envelopeId).name;
      html += '<button class="btn-text" data-start-challenge="' + ideas[0].envelopeId + '">'
        + 'Start a ' + categoryName + ' challenge to save faster</button>';
    }
  }

  // Show the math every time
  html += '<div class="row-meta">'
    + 'Left this month ' + money(numbers.left)
    + ' − bills coming ' + money(numbers.bills)
    + ' − buffer ' + money(numbers.buffer)
    + ' = <b>' + money(numbers.safe) + ' safe to spend</b></div>';

  resultBox.innerHTML = html;
}

/**
 * Fills the category dropdown with the user's categories.
 * Called from renderFeatures() so new categories show up right away.
 */
function renderAffordCategories() {
  const select = document.getElementById('affordCategory');
  if (!select) return;

  const selected = select.value; // remember what was picked
  let options = '<option value="">Any category</option>';
  for (const envelope of Store.getState().envelopes) {
    options += '<option value="' + envelope.id + '">' + envelope.name + '</option>';
  }
  select.innerHTML = options;
  select.value = selected;
}

/* ---- "Check" button ---- */
document.getElementById('affordCheck').addEventListener('click', function () {
  const price = parseFloat(document.getElementById('affordPrice').value);
  const envelopeId = document.getElementById('affordCategory').value;

  if (!price || price <= 0) {
    document.getElementById('affordResult').innerHTML = '<div class="row-meta">Enter a price first.</div>';
    return;
  }

  showAffordResult(price, envelopeId);
});

/* ---- Popup: the "Can I afford this?" button in the hero opens it ---- */
const affordDialog = document.getElementById('affordDialog');

document.getElementById('openAfford').addEventListener('click', function () {
  // start fresh each time, so an old answer never shows for new numbers
  document.getElementById('affordPrice').value = '';
  document.getElementById('affordResult').innerHTML = '';
  affordDialog.showModal();
  document.getElementById('affordPrice').focus(); // opens the number keyboard
});

// The keyboard's Go key checks too
document.getElementById('affordPrice').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('affordCheck').click();
});

wirePopupClose(affordDialog, 'closeAfford');
