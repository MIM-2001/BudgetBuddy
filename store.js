/* =========================================================================
   DATA LAYER
   Every read/write to app state goes through this object. It persists
   to a single hidden JSON file in the signed-in user's own Google
   Drive (the "appDataFolder" — a space only this app can see, invisible
   in the user's normal Drive UI), tied to their Google account rather
   than to one browser. The UI code in ui.js never talks to the Drive
   API directly — it only calls Store.* methods — so the storage backend
   could be swapped again later (e.g. for a real multi-provider database)
   by rewriting just this file.

   Store.init(accessToken) must resolve before any other method is used;
   it loads (or creates) that file and populates in-memory state from it.
   Every mutation after that updates the in-memory state immediately
   (so the UI feels instant) and fires off an async save to Drive in the
   background.
   ========================================================================= */
const Store = (() => {
  const FILE_NAME = 'budgetbuddy_state.json';
  const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

  let state = { income: [], envelopes: [], expenses: [], envelopeColorSeq: 0 };
  let _accessToken = null;
  let _fileId = null;

  function _authHeaders(extra) {
    return { Authorization: `Bearer ${_accessToken}`, ...extra };
  }

  async function _findFileId() {
    const query = encodeURIComponent(`name='${FILE_NAME}'`);
    const url = `${FILES_URL}?spaces=appDataFolder&fields=files(id)&q=${query}`;
    const res = await fetch(url, { headers: _authHeaders() });
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  async function _downloadFile(fileId) {
    const res = await fetch(`${FILES_URL}/${fileId}?alt=media`, { headers: _authHeaders() });
    return res.json();
  }

  async function _createFile(body) {
    const metadata = { name: FILE_NAME, parents: ['appDataFolder'] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(body)], { type: 'application/json' }));
    const res = await fetch(`${UPLOAD_URL}?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: _authHeaders(),
      body: form,
    });
    const data = await res.json();
    return data.id;
  }

  async function _updateFile(fileId, body) {
    await fetch(`${UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  }

  async function _save() {
    try {
      if (_fileId) {
        await _updateFile(_fileId, state);
      } else {
        _fileId = await _createFile(state);
      }
    } catch (e) {
      console.error('BudgetBuddy: failed to save to Drive', e);
    }
  }

  return {
    getState() { return state; },

    async init(accessToken) {
      _accessToken = accessToken;
      _fileId = await _findFileId();
      const loaded = _fileId ? await _downloadFile(_fileId) : {};
      state = {
        income: loaded.income || [],
        envelopes: loaded.envelopes || [],
        expenses: loaded.expenses || [],
        envelopeColorSeq: typeof loaded.envelopeColorSeq === 'number'
          ? loaded.envelopeColorSeq
          : (loaded.envelopes ? loaded.envelopes.length : 0),
      };
    },

    addIncome(item) {
      state.income.push({ id: crypto.randomUUID(), ...item });
      _save();
    },
    removeIncome(id) {
      state.income = state.income.filter(i => i.id !== id);
      _save();
    },

    addEnvelope(item) {
      // colorIndex is assigned once at creation so a category's chart color
      // never shifts when other categories are added or removed later.
      const colorIndex = state.envelopeColorSeq++;
      state.envelopes.push({ id: crypto.randomUUID(), colorIndex, ...item });
      _save();
    },
    removeEnvelope(id) {
      state.envelopes = state.envelopes.filter(e => e.id !== id);
      state.expenses = state.expenses.filter(x => x.envelopeId !== id);
      _save();
    },
    updateEnvelope(id, item) {
      state.envelopes = state.envelopes.map(e => e.id === id ? { ...e, ...item } : e);
      _save();
    },

    addExpense(item) {
      state.expenses.push({ id: crypto.randomUUID(), date: new Date().toISOString(), ...item });
      _save();
    },
    removeExpense(id) {
      state.expenses = state.expenses.filter(x => x.id !== id);
      _save();
    },
    updateExpense(id, item) {
      state.expenses = state.expenses.map(x => x.id === id ? { ...x, ...item } : x);
      _save();
    },
  };
})();
