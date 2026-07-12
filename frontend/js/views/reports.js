/* ---------------------------------------------------------------------- */
/* views/reports.js — analytics (Financial Analyst landing, Fleet Manager)  */
/* Charts (dependency-free inline SVG), CSV export, print-to-PDF.            */
/* ---------------------------------------------------------------------- */

async function renderReports(main) {
  const summary = await api("/reports/summary");

  const trend = (summary.utilization_trend || []).map((d) => ({
    label: d.date.slice(5),
    value: d.completed_trips,
  }));
  const breakdown = summary.cost_breakdown || {};
  const costBars = Object.keys(breakdown).map((k) => ({
    label: k,
    value: breakdown[k],
    display: fmtMoney(breakdown[k]),
  }));
  const roiBars = summary.vehicles
    .slice()
    .sort((a, b) => b.vehicle_roi - a.vehicle_roi)
    .slice(0, 8)
    .map((v) => ({
      label: v.reg_number,
      value: Math.max(0, v.vehicle_roi * 100),
      display: (v.vehicle_roi * 100).toFixed(1) + "%",
    }));

  main.innerHTML = `
    ${pageHead("07", "Analytics", "Reports & analytics", `
      <button class="btn btn-ghost btn-sm" id="export-csv-btn">Export CSV ↓</button>
      <button class="btn btn-ghost btn-sm" id="export-pdf-btn">Export PDF ↓</button>`)}

    <div class="kpi-board" style="grid-template-columns: repeat(auto-fit, minmax(200px,1fr));">
      ${kpiTile(summary.fleet_utilization_pct + "%", "Fleet Utilization")}
    </div>

    <div class="card-grid">
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Fleet utilization trend</div></div>
        <div class="panel-body">${chart.line(trend)}</div>
      </div>
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Cost breakdown by category</div></div>
        <div class="panel-body">${chart.bars(costBars)}</div>
      </div>
    </div>

    <div class="panel" style="margin-top:18px;">
      <div class="panel-header"><div class="panel-title">ROI by vehicle (top 8)</div></div>
      <div class="panel-body">${chart.bars(roiBars)}</div>
    </div>

    <div class="panel" style="margin-top:18px;">
      <div class="panel-header"><div class="panel-title">Per-vehicle performance</div></div>
      ${tableToolbar("report-table", { placeholder: "Search vehicle…" })}
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="report-table">
          <thead><tr>
            <th data-sort="text">Vehicle</th><th class="num" data-sort="num">Trips</th><th class="num" data-sort="num">Distance</th>
            <th class="num" data-sort="num">Fuel Eff. (km/L)</th><th class="num" data-sort="num">Operational Cost</th>
            <th class="num" data-sort="num">Revenue</th><th class="num" data-sort="num">ROI</th>
          </tr></thead>
          <tbody>
            ${
              summary.vehicles.map((v) => `
              <tr>
                <td class="mono">${escapeHtml(v.reg_number)} <span class="text-faint">${escapeHtml(v.name)}</span></td>
                <td class="num">${v.completed_trips}</td>
                <td class="num">${fmtNum(v.total_distance_km, 0)} km</td>
                <td class="num">${fmtNum(v.fuel_efficiency_km_per_l, 2)}</td>
                <td class="num">${fmtMoney(v.operational_cost)}</td>
                <td class="num">${fmtMoney(v.total_revenue)}</td>
                <td class="num">${(v.vehicle_roi * 100).toFixed(1)}%</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="7" class="empty-state">No data yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  main.querySelector("#export-csv-btn").addEventListener("click", exportReportCsv);
  main.querySelector("#export-pdf-btn").addEventListener("click", exportReportPdf);
}

async function exportReportCsv() {
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/reports/export.csv`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transitops_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast("Export failed: " + err.message, "error");
  }
}

/* PDF via the server-rendered print view: fetch (auth'd) then open + print,
   letting the browser's "Save as PDF" do the conversion — no PDF library. */
async function exportReportPdf() {
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/reports/print`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const html = await res.text();
    const win = window.open("", "_blank");
    if (!win) {
      toast("Allow pop-ups to export the PDF", "error");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    toast("Export failed: " + err.message, "error");
  }
}
