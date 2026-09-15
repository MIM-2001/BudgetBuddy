/* =========================================================================
   DATA LAYER
   Every read/write to app state goes through this object. It currently
   persists to localStorage, but the UI code in ui.js never touches
   localStorage directly — it only calls Store.* methods. That means the
   whole storage backend (swap in a real API + database + login later)
   can be replaced by rewriting just this file, with zero changes to
   the rendering/UI code.
   ========================================================================= */
const Store = (() => {
  const KEY = 'budgetbuddy_state_v1';

  function _load() {
    try {
      const raw = localStorage.getItem(KEY);
      const state = raw ? JSON.parse(raw) : { income: [], envelopes: [], expenses: [] };
      if (typeof state.envelopeColorSeq !== 'number') state.envelopeColorSeq = state.envelopes.length;
      return state;
    } catch (e) {
      console.error('BudgetBuddy: failed to load state', e);
      return { income: [], envelopes: [], expenses: [], envelopeColorSeq: 0 };
    }
  }

  function _save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('BudgetBuddy: failed to save state', e);
      return false;
    }
  }

  let state = _load();

  return {
    getState() { return state; },

    addIncome(item) {
      state.income.push({ id: crypto.randomUUID(), ...item });
      _save(state);
    },
    removeIncome(id) {
      state.income = state.income.filter(i => i.id !== id);
      _save(state);
    },

    addEnvelope(item) {
      // colorIndex is assigned once at creation so a category's chart color
      // never shifts when other categories are added or removed later.
      const colorIndex = state.envelopeColorSeq++;
      state.envelopes.push({ id: crypto.randomUUID(), colorIndex, ...item });
      _save(state);
    },
    removeEnvelope(id) {
      state.envelopes = state.envelopes.filter(e => e.id !== id);
      state.expenses = state.expenses.filter(x => x.envelopeId !== id);
      _save(state);
    },

    addExpense(item) {
      state.expenses.push({ id: crypto.randomUUID(), date: new Date().toISOString(), ...item });
      _save(state);
    },
    removeExpense(id) {
      state.expenses = state.expenses.filter(x => x.id !== id);
      _save(state);
    },
  };
})();
