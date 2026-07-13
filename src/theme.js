// ─── Theme definitions ────────────────────────────────────────────────
// CSS custom properties applied as inline style on the app root; every
// component styles itself against these variables so both themes work.

export const THEMES = {
  dark: {
    "--bg": "#080c14",
    "--card-bg": "rgba(255,255,255,0.035)",
    "--card-bg-hover": "rgba(255,255,255,0.055)",
    "--border": "rgba(255,255,255,0.09)",
    "--text": "#e8eaf0",
    "--label": "#a0a8c0",
    "--muted": "#556070",
    "--accent": "#6ee7b7",
    "--accent2": "#818cf8",
    "--track": "rgba(255,255,255,0.07)",
    "--tooltip-bg": "rgba(10,14,24,0.96)",
    "--input-bg": "rgba(255,255,255,0.05)",
    "--hover-bg": "rgba(255,255,255,0.05)",
    "--option-bg": "#080c14",
    "--option-color": "#e8eaf0",
    "--accent-subtle": "rgba(110,231,183,0.08)",
    "--accent-border-c": "rgba(110,231,183,0.22)",
    "--accent-chip": "rgba(110,231,183,0.11)",
    "--accent-shadow": "rgba(110,231,183,0.18)",
    "--row-alt": "rgba(255,255,255,0.018)",
    "--header-tint": "rgba(110,231,183,0.05)",
    "--grid-line": "rgba(255,255,255,0.04)",
    "--step-bg": "rgba(110,231,183,0.1)",
  },
  light: {
    "--bg": "#f0f4f8",
    "--card-bg": "#ffffff",
    "--card-bg-hover": "#fafbfd",
    "--border": "rgba(0,0,0,0.08)",
    "--text": "#111827",
    "--label": "#374151",
    "--muted": "#6b7280",
    "--accent": "#059669",
    "--accent2": "#4f46e5",
    "--track": "rgba(0,0,0,0.09)",
    "--tooltip-bg": "rgba(255,255,255,0.98)",
    "--input-bg": "rgba(0,0,0,0.025)",
    "--hover-bg": "rgba(0,0,0,0.035)",
    "--option-bg": "#ffffff",
    "--option-color": "#111827",
    "--accent-subtle": "rgba(5,150,105,0.07)",
    "--accent-border-c": "rgba(5,150,105,0.22)",
    "--accent-chip": "rgba(5,150,105,0.09)",
    "--accent-shadow": "rgba(5,150,105,0.18)",
    "--row-alt": "rgba(0,0,0,0.015)",
    "--header-tint": "rgba(5,150,105,0.04)",
    "--grid-line": "rgba(0,0,0,0.06)",
    "--step-bg": "rgba(5,150,105,0.09)",
  },
};

// ─── Semantic color tokens ────────────────────────────────────────────
// Single source of truth for the meaning-carrying colors used across tabs,
// charts, and gradients. JS constants (not CSS vars) so they compose with
// hex-alpha concatenation (`${SEM.oa}55`) and Recharts fills.
export const SEM = {
  oa:      "#4ade80", // CPF Ordinary Account
  sa:      "#818cf8", // CPF Special Account
  ra:      "#a78bfa", // CPF Retirement Account
  ma:      "#f472b6", // CPF MediSave Account
  success: "#34d399",
  warn:    "#fbbf24",
  danger:  "#f87171",
};

// ─── Global stylesheet ────────────────────────────────────────────────
// Injected once by the app root; theme-agnostic (everything var()-based).
export const GLOBAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* Range sliders */
  input[type=range] { -webkit-appearance: none; height: 4px; border-radius: 4px; background: var(--track); outline: none; cursor: pointer; width: 100%; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2.5px solid var(--bg); box-shadow: 0 0 0 1.5px var(--accent), 0 2px 8px var(--accent-shadow); transition: transform 0.15s ease; }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.2); }
  input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 2.5px solid var(--bg); box-shadow: 0 0 0 1.5px var(--accent); }

  /* Tab buttons */
  .tab-btn { padding: 8px 16px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; font-family: inherit; white-space: nowrap; }
  .tab-btn:hover { color: var(--text); background: var(--hover-bg); }
  .tab-btn.active { background: var(--accent-chip); color: var(--accent); box-shadow: 0 0 0 1px var(--accent-border-c), 0 2px 12px var(--accent-shadow); }

  /* Main number inputs */
  .input-field { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1.5px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 15px; font-family: 'DM Mono', monospace; font-weight: 500; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .input-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-shadow); }
  .input-field::placeholder { color: var(--muted); opacity: 0.55; }

  /* PR year chips */
  .pr-chip { display: inline-flex; align-items: center; padding: 7px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s ease; border: 1.5px solid var(--border); background: transparent; color: var(--muted); font-family: inherit; }
  .pr-chip:hover { color: var(--text); border-color: var(--accent-border-c); }
  .pr-chip.selected { background: var(--accent-chip); color: var(--accent); border-color: var(--accent-border-c); box-shadow: 0 0 14px var(--accent-shadow); }

  /* Section titles */
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted); font-weight: 700; margin-bottom: 16px; }

  /* Housing loan / generic inputs */
  .hl-in { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--input-bg); color: var(--text); font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; -webkit-appearance: none; appearance: none; }
  .hl-in:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-shadow); }
  .hl-in::placeholder { color: var(--muted); opacity: 0.55; }
  .hl-in option { background: var(--option-bg); color: var(--option-color); }

  /* Horizontal-scroll wrappers for wide tables: a visible thin scrollbar is
     the affordance that hidden columns exist (default overlay bars hide it) */
  .x-scroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .x-scroll::-webkit-scrollbar { height: 6px; }
  .x-scroll::-webkit-scrollbar-track { background: transparent; }
  .x-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  /* Sidebar scrollbar */
  .sidebar-scroll::-webkit-scrollbar { width: 3px; }
  .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
  .sidebar-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* Advanced toggle */
  .adv-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; background: transparent; border: none; cursor: pointer; padding: 0; font-family: inherit; }
  .adv-toggle:focus-visible { outline: 2px solid var(--accent); border-radius: 4px; }

  /* Hide scrollbar for tab rows */
  .tab-row { scrollbar-width: none; -ms-overflow-style: none; }
  .tab-row::-webkit-scrollbar { display: none; }

  @media (max-width: 800px) {
    .layout-grid { grid-template-columns: 1fr !important; }
    .sidebar-sticky { position: static !important; }
    .sidebar-scroll { max-height: none !important; overflow-y: visible !important; }
  }
  @media (max-width: 480px) {
    .tab-btn { padding: 6px 12px; font-size: 12px; }
    .mobile-h1 { font-size: 22px !important; }
    .mobile-pad { padding: 20px 16px 16px !important; }
    .mobile-inner { padding: 0 12px !important; }
  }
`;
