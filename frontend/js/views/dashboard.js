/* ---------------------------------------------------------------------- */
/* views/dashboard.js — fleet status board (Fleet Manager landing)         */
/* ---------------------------------------------------------------------- */

const dashFilters = { type: "", status: "", region: "" };

async function renderDashboard(main) {
  const qs = new URLSearchParams();
  if (dashFilters.type) qs.set("type", dashFilters.type);
  if (dashFilters.status) qs.set("status", dashFilters.status);
  if (dashFilters.region) qs.set("region", dashFilters.region);
  const kpiQuery = qs.toString() ? `?${qs}` : "";

  const [kpis, facets, vehiclesResp, tripsResp] = await Promise.all([
    api(`/dashboard/kpis${kpiQuery}`),
    api("/dashboard/facets"),
    apiList("/vehicles?limit=0"),
    apiList("/trips?limit=0"),
  ]);
  const vehicles = vehiclesResp.items;
  const trips = tripsResp.items;
  state.cache.vehicles = vehicles;
  state.cache.trips = trips;

  const recentTrips = trips.slice(0, 6);
  const opt = (val, cur) =>
    `<option value="${escapeHtml(val)}" ${val === cur ? "selected" : ""}>${escapeHtml(val || "All")}</option>`;

  main.innerHTML = `
    ${pageHead("01", "Overview", "Fleet status board")}

    <div class="toolbar" id="dash-filters">
      <label class="toolbar-field">Type
        <select id="filter-type">${opt("", dashFilters.type)}${facets.types.map((t) => opt(t, dashFilters.type)).join("")}</select>
      </label>
      <label class="toolbar-field">Status
        <select id="filter-status">${opt("", dashFilters.status)}${facets.statuses.map((s) => opt(s, dashFilters.status)).join("")}</select>
      </label>
      <label class="toolbar-field">Region
        <select id="filter-region">${opt("", dashFilters.region)}${facets.regions.map((r) => opt(r, dashFilters.region)).join("")}</select>
      </label>
      ${dashFilters.type || dashFilters.status || dashFilters.region ? `<button class="btn btn-ghost btn-sm" id="filter-clear">Clear</button>` : ""}
    </div>

    <div class="kpi-board">
      ${kpiTile(kpis.active_vehicles, "Active Vehicles")}
      ${kpiTile(kpis.available_vehicles, "Available")}
      ${kpiTile(kpis.vehicles_in_maintenance, "In Maintenance")}
      ${kpiTile(kpis.active_trips, "Active Trips")}
      ${kpiTile(kpis.pending_trips, "Pending Trips")}
      ${kpiTile(kpis.drivers_on_duty, "Drivers On Duty")}
      ${kpiTile(kpis.fleet_utilization_pct + "%", "Fleet Utilization")}
    </div>

    <div class="card-grid">
      <div class="panel panel-ink">
        <div class="panel-header"><div class="panel-title">Vehicle registry snapshot</div></div>
        <div class="panel-body" style="padding:0;">
          <table class="data-table">
            <thead><tr><th>Reg No.</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              ${
                vehicles.slice(0, 6).map((v) => `
                <tr><td class="mono">${escapeHtml(v.reg_number)}</td><td>${escapeHtml(v.name)}</td><td>${badge(v.status)}</td></tr>
              `).join("") ||
                `<tr data-empty><td colspan="3" class="empty-state">No vehicles match</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><div class="panel-title">Recent trips</div></div>
        <div class="panel-body" style="padding:0;">
          <table class="data-table">
            <thead><tr><th>Route</th><th>Status</th></tr></thead>
            <tbody>
              ${
                recentTrips.map((t) => `
                <tr><td>${escapeHtml(t.source)} &rarr; ${escapeHtml(t.destination)}</td><td>${badge(t.status)}</td></tr>
              `).join("") ||
                `<tr data-empty><td colspan="2" class="empty-state">No trips yet</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const rerun = () => renderDashboard(main).then(() => enhanceView(main));
  main.querySelector("#filter-type").addEventListener("change", (e) => { dashFilters.type = e.target.value; rerun(); });
  main.querySelector("#filter-status").addEventListener("change", (e) => { dashFilters.status = e.target.value; rerun(); });
  main.querySelector("#filter-region").addEventListener("change", (e) => { dashFilters.region = e.target.value; rerun(); });
  main.querySelector("#filter-clear")?.addEventListener("click", () => {
    dashFilters.type = dashFilters.status = dashFilters.region = "";
    rerun();
  });
}

function kpiTile(value, label) {
  return `<div class="kpi-tile"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}
