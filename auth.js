/* =========================================================================
   GOOGLE SIGN-IN
   Wraps Google Identity Services' OAuth2 token client. The requested
   scope (drive.appdata) only ever grants access to files this app
   itself creates in a hidden folder in the user's Drive — it can never
   see any of the user's real Drive files. The access token lives only
   in memory (a module-level variable); nothing here touches
   localStorage or cookies, and signing out (or closing the tab) drops
   it entirely.
   ========================================================================= */
const GOOGLE_CLIENT_ID = '221976850994-r99lai97tsatoqk2qvn7mlm75md7j4j9.apps.googleusercontent.com';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let _accessToken = null;
let _tokenClient = null;
let _resolveSignIn = null;
let _rejectSignIn = null;

function getAccessToken() {
  return _accessToken;
}

function _ensureTokenClient() {
  if (_tokenClient) return;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (response) => {
      if (response.error) {
        if (_rejectSignIn) _rejectSignIn(new Error(response.error));
      } else {
        _accessToken = response.access_token;
        if (_resolveSignIn) _resolveSignIn(_accessToken);
      }
      _resolveSignIn = null;
      _rejectSignIn = null;
    },
  });
}

function signIn() {
  _ensureTokenClient();
  return new Promise((resolve, reject) => {
    _resolveSignIn = resolve;
    _rejectSignIn = reject;
    _tokenClient.requestAccessToken();
  });
}

function signOut() {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken, () => {});
  }
  _accessToken = null;
}
