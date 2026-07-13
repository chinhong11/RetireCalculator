export const TABS = [
  ["summary",    "🌐 Summary"],
  ["projection", "📈 Growth Chart"],
  ["table",      "📋 Year-by-Year"],
  ["housing",    "🏠 Housing Loan"],
  ["mystocks",   "🇲🇾 MY Stocks"],
  ["stocks",     "📊 US Stocks"],
  ["crypto",     "🪙 Crypto"],
  ["epf",        "🇲🇾 EPF"],
  ["fd",         "🏦 Fixed Deposits"],
  ["savings",    "💵 Savings Rate"],
  ["fire",       "🔥 FIRE"],
  ["networth",   "💰 Net Worth"],
];

const CPF_TABS   = TABS.slice(0, 3);
const ASSET_TABS = TABS.slice(3);

/** Two-row scrollable tab bar with roving-tabindex keyboard navigation. */
export function TabBar({ activeTab, setActiveTab }) {
  const TabButton = ([id, label]) => (
    <button key={id} role="tab" aria-selected={activeTab === id}
      aria-controls={`tabpanel-${id}`} id={`tab-${id}`}
      tabIndex={activeTab === id ? 0 : -1}
      className={`tab-btn ${activeTab === id ? "active" : ""}`}
      onClick={() => setActiveTab(id)}>{label}</button>
  );

  return (
    <div role="tablist" aria-label="Calculator sections"
      onKeyDown={(e) => {
        const ids = TABS.map(([id]) => id);
        const cur = ids.indexOf(activeTab);
        if (e.key === "ArrowRight") { e.preventDefault(); setActiveTab(ids[(cur + 1) % ids.length]); }
        if (e.key === "ArrowLeft")  { e.preventDefault(); setActiveTab(ids[(cur - 1 + ids.length) % ids.length]); }
        if (e.key === "Home")       { e.preventDefault(); setActiveTab(ids[0]); }
        if (e.key === "End")        { e.preventDefault(); setActiveTab(ids[ids.length - 1]); }
      }}
    >
      {/* Row 1: CPF tabs */}
      <div className="tab-row" style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {CPF_TABS.map(TabButton)}
      </div>

      {/* Divider */}
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 2px" }}>
        <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted)", whiteSpace: "nowrap" }}>
          Assets &amp; Planning · optional
        </span>
        <div style={{ height: 1, flex: 1, background: "var(--border)" }} />
      </div>

      {/* Row 2: Asset tabs */}
      <div className="tab-row" style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2, marginBottom: 6 }}>
        {ASSET_TABS.map(TabButton)}
      </div>
    </div>
  );
}
