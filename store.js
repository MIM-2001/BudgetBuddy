/* =========================================================================
   DATA LAYER
   Every read/write to app state goes through this object. It has two
   backends:

   - Signed out: state lives in localStorage on this device only, so the
     app is usable straight away without an account.
   - Signed in: state lives in a single hidden JSON file in the user's own
     Google Drive (the "appDataFolder" — a space only this app can see,
     invisible in the user's normal Drive UI), tied to their Google
     account rather than to one browser. On connecting, anything entered
     while signed out is folded into that file and cleared from the
     device.

   The UI code in ui.js never talks to localStorage or the Drive API
   directly — it only calls Store.* methods — so the storage backend
   could be swapped again later by rewriting just this file.

   Store.loadDevice() (or Store.connectDrive(token)) must run before any
   other method is used. Every mutation after that updates the in-memory
   state immediately (so the UI feels instant) and then saves to the
   active backend — synchronously for localStorage, in the background
   for Drive.
   ========================================================================= */
const Store = (() => {
  const FILE_NAME = 'budgetbuddy_state.json';
  const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
  const DEVICE_KEY = 'budgetbuddy_device_state_v1';
  // Remembers that this device was signed in (never the token itself), so a
  // reload — which drops the in-memory token — can offer a one-tap reconnect.
  const LINKED_KEY = 'budgetbuddy_drive_linked';
  // 'light' or 'dark'; unset follows the phone's own setting. Kept per device
  // rather than in the budget so the right theme paints before anything
  // loads — the inline script in index.html's <head> reads this same key.
  const THEME_KEY = 'budgetbuddy_theme';
  const PROFILE_FIELDS = ['name', 'username', 'email', 'photo'];

  let state = _normalize({});
  let _accessToken = null;
  let _fileId = null;

  function _normalize(loaded) {
    const profile = loaded.profile || {};
    return {
      // photo is a small JPEG data URL, so it travels inside this same file
      profile: {
        name: '', username: '', email: '', photo: '',
        ...profile,
        alerts: { goalMet: false, recurring: false, ...profile.alerts },
      },
      income: loaded.income || [],
      envelopes: loaded.envelopes || [],
      expenses: loaded.expenses || [],
      envelopeColorSeq: typeof loaded.envelopeColorSeq === 'number'
        ? loaded.envelopeColorSeq
        : (loaded.envelopes ? loaded.envelopes.length : 0),
    };
  }

  function _isEmpty(s) {
    return !PROFILE_FIELDS.some(k => s.profile[k])
      && !s.income.length && !s.envelopes.length && !s.expenses.length;
  }

  function _loadDeviceState() {
    try {
      const raw = localStorage.getItem(DEVICE_KEY);
      return _normalize(raw ? JSON.parse(raw) : {});
    } catch (e) {
      console.error('BudgetBuddy: failed to load device state', e);
      return _normalize({});
    }
  }

  function _saveDeviceState() {
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('BudgetBuddy: failed to save device state', e);
    }
  }

  // Appends signed-out entries to the account's state. Ids are UUIDs so
  // nothing collides; device categories get the next free color slots so
  // the account's existing category colors don't shift. The account keeps
  // its own profile; anything set while signed out only fills blank fields.
  function _mergeInto(account, device) {
    PROFILE_FIELDS.forEach(k => {
      if (!account.profile[k]) account.profile[k] = device.profile[k];
    });
    device.envelopes.forEach(env => {
      account.envelopes.push({ ...env, colorIndex: account.envelopeColorSeq++ });
    });
    account.income.push(...device.income);
    account.expenses.push(...device.expenses);
    return account;
  }

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
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
    const data = await res.json();
    return data.id;
  }

  async function _updateFile(fileId, body) {
    const res = await fetch(`${UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
  }

  async function _writeDrive() {
    if (_fileId) {
      await _updateFile(_fileId, state);
    } else {
      _fileId = await _createFile(state);
    }
  }

  async function _save() {
    if (!_accessToken) {
      _saveDeviceState();
      return;
    }
    try {
      await _writeDrive();
    } catch (e) {
      console.error('BudgetBuddy: failed to save to Drive', e);
    }
  }

  return {
    getState() { return state; },

    isDriveConnected() { return !!_accessToken; },

    // True if this device signed in and never signed out, the user
    // expects their Drive budget but a reload dropped the token.
    wasDriveConnected() {
      try { return localStorage.getItem(LINKED_KEY) === '1'; } catch (e) { return false; }
    },

    loadDevice() {
      _accessToken = null;
      _fileId = null;
      state = _loadDeviceState();
    },

    async connectDrive(accessToken) {
      _accessToken = accessToken;
      _fileId = await _findFileId();
      const account = _normalize(_fileId ? await _downloadFile(_fileId) : {});
      const device = _loadDeviceState();
      state = _mergeInto(account, device);
      if (!_isEmpty(device)) {
        // Only clear the device copy once Drive has it — a failed upload
        // throws here and leaves the signed-out entries untouched.
        await _writeDrive();
        localStorage.removeItem(DEVICE_KEY);
      }
      localStorage.setItem(LINKED_KEY, '1');
    },

    disconnectDrive() {
      localStorage.removeItem(LINKED_KEY);
      this.loadDevice();
    },

    updateProfile(fields) {
      state.profile = { ...state.profile, ...fields };
      _save();
    },

    getTheme() {
      try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
    },
    setTheme(theme) {
      try {
        if (theme === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, theme);
      } catch (e) {
        console.error('BudgetBuddy: failed to save theme', e);
      }
    },

    addIncome(item) {
      state.income.push({ id: crypto.randomUUID(), ...item });
      _save();
    },
    removeIncome(id) {
      state.income = state.income.filter(i => i.id !== id);
      _save();
    },
    updateIncome(id, item) {
      state.income = state.income.map(i => i.id === id ? { ...i, ...item } : i);
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
