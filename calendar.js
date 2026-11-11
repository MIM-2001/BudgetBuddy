/* =========================================================================
   FEATURE 1: SMART CALENDAR
   Uses the FullCalendar library (https://fullcalendar.io) to draw the
   month. We just give it a list of "events" and it does the rest.

   Key points:
   - Every expense shows on the day it was logged, in its category's color.
   - Bills that repeat every month (rent, Spotify...) show as upcoming
     "Bill:" events on the days they're due.
   - When the user types an expense name, we guess the category for them.
   - When they save an expense, we remember the category they picked so
     the guess is right next time.
   - affordability.js uses unpaidBillsThisMonth() from this file.
   ========================================================================= */

let calendar = null; // the FullCalendar object, created the first time we draw

// Store names that usually belong to a category.
// The key is a word we look for in the user's own category names.
const categoryWords = {
  food: ['chipotle', 'mcdonalds', 'starbucks', 'taco bell', 'pizza', 'doordash', 'panda'],
  grocer: ['trader joe', 'vons', 'ralphs', 'costco', 'walmart', 'sprouts'],
  gas: ['shell', 'chevron', 'arco'],
  rent: ['rent'],
  subscription: ['netflix', 'spotify', 'hulu', 'disney'],
  school: ['bookstore', 'textbook', 'chegg', 'csusm'],
};

/**
 * Guesses the category (envelope) for an expense from its name.
 * First checks what the user picked before for this store,
 * then checks our list of store names.
 * @param {string} expenseName what the user typed, e.g. "Chipotle"
 * @returns {string|null} the envelope id, or null if we can't tell
 */
function guessCategory(expenseName) {
  const name = expenseName.toLowerCase().trim();
  const state = Store.getState();

  // 1. Did the user already teach us this store?
  const firstWord = name.split(' ')[0];
  if (state.categoryRules[firstWord]) {
    return state.categoryRules[firstWord];
  }

  // 2. Is it a store from our list?
  for (const word in categoryWords) {
    for (const store of categoryWords[word]) {
      if (name.includes(store)) {
        // Find the user's category with that word in its name
        for (const envelope of state.envelopes) {
          if (envelope.name.toLowerCase().includes(word)) {
            return envelope.id;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Saves the category the user picked, so next time we guess it right.
 * Called from saveExpense() in ui.js.
 * @param {string} expenseName
 * @param {string} envelopeId
 */
function learnCategory(expenseName, envelopeId) {
  const firstWord = expenseName.toLowerCase().trim().split(' ')[0];
  Store.setCategoryRule(firstWord, envelopeId);
}

/**
 * Finds bills that repeat every month.
 * Rule: the same name shows up in at least 2 different months,
 * and only once in each month (so weekly Chipotle runs don't count).
 * @returns {Array} bills like { name, amount, day, envelopeId }
 */
function findRecurringBills() {
  const expenses = Store.getState().expenses;
  const bills = [];

  for (const expense of expenses) {
    const name = expense.name.toLowerCase().trim();

    // Skip it if we already added this bill
    let alreadyAdded = false;
    for (const bill of bills) {
      if (bill.name.toLowerCase() === name) alreadyAdded = true;
    }
    if (alreadyAdded) continue;

    // Count how many times it shows up, and in how many different months
    let count = 0;
    const months = [];
    for (const other of expenses) {
      if (other.name.toLowerCase().trim() === name) {
        count++;
        const month = monthKey(new Date(other.date));
        if (!months.includes(month)) months.push(month);
      }
    }

    if (months.length >= 2 && count === months.length) {
      bills.push({
        name: expense.name,
        amount: expense.amount,
        day: new Date(expense.date).getDate(),
        envelopeId: expense.envelopeId,
      });
    }
  }

  return bills;
}

/**
 * Checks if a bill has already been logged this month.
 * @param {object} bill one bill from findRecurringBills()
 * @returns {boolean} true if it's been paid this month
 */
function isPaidThisMonth(bill) {
  const thisMonth = monthKey(new Date());
  for (const expense of Store.getState().expenses) {
    const sameName = expense.name.toLowerCase().trim() === bill.name.toLowerCase();
    if (sameName && monthKey(new Date(expense.date)) === thisMonth) return true;
  }
  return false;
}

/**
 * Bills that haven't been paid yet this month.
 * Used by affordability.js to work out what's safe to spend.
 * @returns {Array} bills from findRecurringBills()
 */
function unpaidBillsThisMonth() {
  const unpaid = [];
  for (const bill of findRecurringBills()) {
    if (!isPaidThisMonth(bill)) unpaid.push(bill);
  }
  return unpaid;
}

/**
 * Turns our expenses and bills into the "events" FullCalendar needs.
 * Each event has a title, a date and a color.
 * @returns {Array} FullCalendar events
 */
function buildCalendarEvents() {
  const events = [];

  // Every expense, in its category color.
  // If a category chip is selected under "Your spending", only show that one.
  for (const expense of Store.getState().expenses) {
    if (expenseFilter && expense.envelopeId !== expenseFilter) continue;
    events.push({
      title: expense.name + ' ' + money(expense.amount),
      start: new Date(expense.date),
      allDay: true,
      color: envelopeColor(expense.envelopeId),
    });
  }

  // Upcoming bills for this month and next month, in gray
  const today = new Date();
  for (const bill of findRecurringBills()) {
    for (let i = 0; i < 2; i++) {
      // A bill due on the 31st falls on the last day of shorter months
      // (otherwise new Date() rolls it over into the next month).
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const day = Math.min(bill.day, daysInMonth(firstOfMonth));
      const dueDate = new Date(today.getFullYear(), today.getMonth() + i, day);
      const isThisMonth = i === 0;

      // This month: only show it if it's still coming and not paid yet
      if (isThisMonth && (dueDate < startOfToday() || isPaidThisMonth(bill))) continue;

      events.push({
        title: 'Bill: ' + bill.name + ' ~' + money(bill.amount),
        start: dueDate,
        allDay: true,
        color: '#9e9e9e',
      });
    }
  }

  return events;
}

/**
 * Draws the calendar. The first time, it creates the FullCalendar object;
 * after that it just swaps in the new list of events.
 * Called from renderFeatures() every time the app re-renders.
 */
function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  // If the FullCalendar script didn't load (offline), skip the calendar
  // instead of breaking the rest of the page.
  if (typeof FullCalendar === 'undefined') return;

  if (calendar === null) {
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      dayMaxEvents: 3, // show "+2 more" when a day has a lot
      headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
    });
    calendar.render();
  }

  // Remove the old event list before adding the new one. (removeAllEvents()
  // would leave an empty source behind on every render.)
  calendar.getEventSources().forEach(source => source.remove());
  calendar.addEventSource(buildCalendarEvents());
}

/* ---- Auto-pick the category while typing an expense ---- */
const expNameInput = document.getElementById('expName');
const expCategorySelect = document.getElementById('expCategory');
let userPickedCategory = false; // stop guessing once the user picks one themselves

expNameInput.addEventListener('input', function () {
  if (userPickedCategory) return;
  const guess = guessCategory(expNameInput.value);
  if (guess) expCategorySelect.value = guess;
});

expCategorySelect.addEventListener('change', function () {
  userPickedCategory = true;
});

document.getElementById('addDialog').addEventListener('close', function () {
  userPickedCategory = false;
});
