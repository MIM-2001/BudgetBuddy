/* =========================================================================
   FEATURE 1: SMART CALENDAR
   Uses the FullCalendar library (https://fullcalendar.io) to draw the
   month. We just give it a list of "events" and it does the rest.

   Key points:
   - Every expense shows on the day it was logged, in its category's color.
   - Expenses marked "Every month" when they're added (rent, car payment,
     insurance, subscriptions) log themselves on their day each month, and
     show as upcoming "Bill:" events on that day in every month ahead.
   - Other bills that repeat (rent, Spotify...) are spotted on their own
     and show as upcoming "Bill:" events this month and next.
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
  // Expenses marked "Every month" have their own bills (see below), so
  // leave them out here, or they'd show up twice.
  const expenses = Store.getState().expenses.filter(function (expense) {
    return !expense.recurringId && !isRecurringName(expense.name);
  });
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
  // "Every month" expenses whose day hasn't come yet this month
  const thisMonth = monthKey(new Date());
  for (const bill of Store.getState().recurring) {
    if (bill.loggedThrough < thisMonth) unpaid.push(bill);
  }
  return unpaid;
}

/* ---- Expenses marked "Every month" ----
   Each one is saved as a "recurring" item: { name, amount, envelopeId,
   day, loggedThrough }. day is the day of the month it's due, and
   loggedThrough is the last month ('YYYY-MM') it was logged in. The
   expenses it logs carry its id as recurringId. */

/**
 * The date a monthly bill falls on in a given month. A bill due on the
 * 31st falls on the last day of shorter months. Noon, so a time zone
 * change can't push it onto the day before.
 * @param {number} year
 * @param {number} month 0 = January (13 rolls over to next February)
 * @param {number} day 1 to 31
 * @returns {Date}
 */
function dueDateIn(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay), 12);
}

/**
 * @param {string} id a recurringId from an expense
 * @returns {object|null} the recurring item, or null if it was stopped
 */
function findRecurring(id) {
  if (!id) return null;
  return Store.getState().recurring.find(bill => bill.id === id) || null;
}

/**
 * Is there an "Every month" expense with this name?
 * @param {string} name
 * @returns {boolean}
 */
function isRecurringName(name) {
  const lower = name.toLowerCase().trim();
  for (const bill of Store.getState().recurring) {
    if (bill.name.toLowerCase().trim() === lower) return true;
  }
  return false;
}

/**
 * Did the user log this bill themselves in that month? Then it doesn't
 * get logged a second time.
 * @param {object} bill a recurring item
 * @param {string} month 'YYYY-MM'
 * @returns {boolean}
 */
function loggedByHand(bill, month) {
  const name = bill.name.toLowerCase().trim();
  for (const expense of Store.getState().expenses) {
    if (expense.recurringId) continue; // logged by a repeat, not by hand
    const sameName = expense.name.toLowerCase().trim() === name;
    if (sameName && monthKey(new Date(expense.date)) === month) return true;
  }
  return false;
}

/**
 * Logs each "Every month" expense once its day comes, for every month
 * since it was last logged, so a month the app wasn't opened still gets
 * its rent. Called at the start of render(), before any totals.
 */
function logDueRecurring() {
  const today = startOfToday();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  for (const bill of Store.getState().recurring) {
    const parts = String(bill.loggedThrough).split('-');
    const year = Number(parts[0]);
    // 'YYYY-MM' counts months from 1 but Date counts from 0, so this is
    // already the month after the last one logged.
    let month = Number(parts[1]);
    const dates = [];
    let lastMonth = null;

    while (true) {
      const due = dueDateIn(year, month, bill.day);
      if (isNaN(due) || due >= tomorrow) break; // not due yet
      const key = monthKey(due);
      if (!loggedByHand(bill, key)) dates.push(due.toISOString());
      lastMonth = key;
      month++;
    }

    if (lastMonth) Store.logRecurring(bill.id, dates, lastMonth);
  }
}

/**
 * Adds an expense that repeats every month. This month's goes on its day,
 * even if that's later this month; logDueRecurring() adds the rest.
 * Called from saveExpense() in ui.js.
 * @param {object} item { name, amount, envelopeId } from the form
 * @param {number} day the day of the month it's due
 */
function addRecurringExpense(item, day) {
  const now = new Date();
  const due = dueDateIn(now.getFullYear(), now.getMonth(), day);
  const id = Store.addRecurring({ ...item, day: day, loggedThrough: monthKey(now) });
  Store.addExpense({ ...item, date: due.toISOString(), recurringId: id });
}

/**
 * Saves an edited expense and starts, changes or stops its repeat to
 * match the form. Called from saveExpense() in ui.js.
 * @param {string} expenseId
 * @param {object} item { name, amount, envelopeId } from the form
 * @param {number|null} day the day it repeats on, or null for "One time"
 */
function saveExpenseEdit(expenseId, item, day) {
  const expense = Store.getState().expenses.find(x => x.id === expenseId);
  if (!expense) return;
  const bill = findRecurring(expense.recurringId);

  // One time: stop repeating. Months already logged keep their expenses.
  if (day === null) {
    Store.updateExpense(expenseId, item);
    if (bill) Store.removeRecurring(bill.id);
    return;
  }

  // Every month: this expense moves onto that day in its own month
  const old = new Date(expense.date);
  const due = dueDateIn(old.getFullYear(), old.getMonth(), day);
  const changes = { ...item };
  if (due.getDate() !== old.getDate()) changes.date = due.toISOString();

  if (bill) {
    Store.updateRecurring(bill.id, { ...item, day: day });
  } else {
    // Repeats from the month after this one. Any months in between get
    // logged too, unless the user already logged them by hand.
    changes.recurringId = Store.addRecurring({ ...item, day: day, loggedThrough: monthKey(old) });
  }
  Store.updateExpense(expenseId, changes);
}

/**
 * The upcoming days of "Every month" expenses, for FullCalendar. It calls
 * this with the dates on screen each time the user pages to another
 * month, so they show on their day however far ahead the user looks.
 * @param {object} info FullCalendar's { start, end } of the dates on screen
 * @param {function} done hands the events back to FullCalendar
 */
function recurringBillEvents(info, done) {
  const events = [];

  for (const bill of Store.getState().recurring) {
    // If a category chip is selected under "Your spending", only show that one
    if (expenseFilter && bill.envelopeId !== expenseFilter) continue;

    // Every month on screen, from the one the first square is in
    let month = new Date(info.start.getFullYear(), info.start.getMonth(), 1);
    while (month < info.end) {
      const due = dueDateIn(month.getFullYear(), month.getMonth(), bill.day);
      const logged = monthKey(due) <= bill.loggedThrough; // shows as an expense instead
      const onScreen = due >= info.start && due < info.end;
      if (!logged && onScreen) {
        events.push({
          title: 'Bill: ' + bill.name + ' ' + money(bill.amount),
          start: due,
          allDay: true,
          color: '#9e9e9e',
        });
      }
      month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    }
  }

  done(events);
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
  calendar.addEventSource(recurringBillEvents); // asked again for each month paged to
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
