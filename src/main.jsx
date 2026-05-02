import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { runMigrations } from './lib/migrations.js'

runMigrations();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // updateViaCache: "none" — browser always fetches sw.js fresh, bypassing
    // HTTP cache. This means a new SW is detected on the very next navigation
    // after a deploy, not hours later when the HTTP cache expires.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
