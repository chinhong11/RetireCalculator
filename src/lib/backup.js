// ─── Export / Backup helpers ──────────────────────────────────────────

export const LS_KEYS = ["_schema_version","active_tab","cpf_oa_start","cpf_sa_start","cpf_ma_start","cpf_ceiling_growth","hl_props_v1","hl_selid_v1","stocks_v1","crypto_v1","mystocks_v1","stocks_prices_v1","crypto_prices_v1","mystocks_prices_v1","goals_v1","epf_per_start","epf_sej_start","epf_flek_start","fd_v1","epf_wage","epf_age","epf_retire_age","epf_increment","epf_dividend","fx_usd_sgd","fx_myr_sgd","sav_income","sav_other","sav_expenses_v1","fire_monthly_exp","fire_rate","fire_incl_epf","fire_incl_cash"];

export function downloadBlob(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = v => { const s = String(v ?? ""); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

export function printTable(title, sections) {
  const win = window.open("", "_blank");
  const body = sections.map(({ heading, headers, rows }) => `
    ${heading ? `<h2>${heading}</h2>` : ""}
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(row => `<tr>${row.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `).join("\n");
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:system-ui,sans-serif;padding:24px;color:#111;font-size:13px}
    h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin:20px 0 8px;color:#374151;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    .meta{font-size:12px;color:#6b7280;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;margin-bottom:8px}
    th{background:#f3f4f6;padding:7px 10px;text-align:left;border:1px solid #d1d5db;font-weight:600}
    td{padding:6px 10px;border:1px solid #e5e7eb;white-space:nowrap}
    .print-btn{padding:8px 16px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:16px;font-size:13px}
    @media print{.print-btn{display:none}}
  </style></head><body>
    <h1>${title}</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    ${body}
  </body></html>`);
  win.document.close();
}

export function exportBackup() {
  const data = {};
  LS_KEYS.forEach(k => {
    try { const v = localStorage.getItem(k); if (v !== null) data[k] = JSON.parse(v); } catch { try { data[k] = localStorage.getItem(k); } catch {} }
  });
  downloadBlob(`retire-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
}

export function importBackup(file, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      LS_KEYS.forEach(k => {
        if (k in data) try { localStorage.setItem(k, JSON.stringify(data[k])); } catch {}
      });
      onDone(true);
    } catch { onDone(false); }
  };
  reader.readAsText(file);
}
