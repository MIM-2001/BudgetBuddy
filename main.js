// Starts the app. Loaded last, so every other script's functions exist
// by the time the first render() runs.
Store.loadDevice();
syncAccountUI();
render();
