const API_BASE = window.TRANSITOPS_API_BASE || "http://localhost:8000/api";

const state = {
  token: localStorage.getItem("transitops_token") || null,
  user: JSON.parse(localStorage.getItem("transitops_user") || "null"),
  tab: "dashboard",
  cache: { vehicles: [], drivers: [], trips: [], maintenance: [], fuelLogs: [], expenses: [] },
};

/* ---------------------------------------------------------------------- */
/* API helper                                                             */
/* ---------------------------------------------------------------------- */

async function api(path, options = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    options.headers || {}
  );
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/* ---------------------------------------------------------------------- */
/* Toast                                                                  */
/* ---------------------------------------------------------------------- */

function toast(message, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast toast-${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
}

/* ---------------------------------------------------------------------- */
/* Auth                                                                   */
/* ---------------------------------------------------------------------- */

function persistSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("transitops_token", token);
  localStorage.setItem("transitops_user", JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("transitops_token");
  localStorage.removeItem("transitops_user");
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("user-name").textContent = state.user.name;
  document.getElementById("user-role").textContent = state.user.role.replace(/_/g, " ");
  setTab("dashboard");
}

function showLogin() {
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.textContent = "";
  try {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    persistSession(data.token, data.user);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const role = document.getElementById("reg-role").value;
  const errEl = document.getElementById("register-error");
  errEl.textContent = "";
  try {
    const data = await api("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password, role }) });
    persistSession(data.token, data.user);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.querySelectorAll(".login-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".login-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const mode = btn.dataset.mode;
    document.getElementById("login-form").classList.toggle("hidden", mode !== "login");
    document.getElementById("register-form").classList.toggle("hidden", mode !== "register");
  });
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  showLogin();
});

/* ---------------------------------------------------------------------- */
/* Tabs                                                                    */
/* ---------------------------------------------------------------------- */

document.getElementById("tabnav").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  setTab(btn.dataset.tab);
});

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  render();
}

async function render() {
  const main = document.getElementById("main-content");
  main.innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    switch (state.tab) {
      case "dashboard": return renderDashboard(main);
      case "vehicles": return renderVehicles(main);
      case "drivers": return renderDrivers(main);
      case "trips": return renderTrips(main);
      case "maintenance": return renderMaintenance(main);
      case "fuel": return renderFuel(main);
      case "reports": return renderReports(main);
    }
  } catch (err) {
    main.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
  }
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function badge(status) {
  const slug = status.toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge badge-${slug}">${escapeHtml(status)}</span>`;
}

function fmtMoney(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtNum(n, digits = 1) {
  return Number(n || 0).toFixed(digits);
}

function openModal({ title, bodyHtml, onSubmit, submitLabel = "Save" }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(title)}</div>
        <button class="modal-close">&times;</button>
      </div>
      <form id="modal-form">
        <div class="modal-body">${bodyHtml}<div class="modal-error" id="modal-error"></div></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${escapeHtml(submitLabel)}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector("#modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = backdrop.querySelector("#modal-error");
    errEl.textContent = "";
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData.entries());
    try {
      await onSubmit(values);
      close();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  return { close, el: backdrop };
}

/* ---------------------------------------------------------------------- */
/* Dashboard                                                               */
/* ---------------------------------------------------------------------- */

async function renderDashboard(main) {
  const [kpis, vehicles, trips] = await Promise.all([
    api("/dashboard/kpis"),
    api("/vehicles"),
    api("/trips"),
  ]);
  state.cache.vehicles = vehicles;
  state.cache.trips = trips;

  const recentTrips = trips.slice(0, 6);

  main.innerHTML = `
    <h2 class="section-title">Fleet status board</h2>
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
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Vehicle registry snapshot</div></div>
        <div class="panel-body" style="padding:0;">
          <table class="data-table">
            <thead><tr><th>Reg No.</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              ${vehicles.slice(0, 6).map(v => `
                <tr><td class="mono">${escapeHtml(v.reg_number)}</td><td>${escapeHtml(v.name)}</td><td>${badge(v.status)}</td></tr>
              `).join("") || `<tr><td colspan="3" class="empty-state">No vehicles yet</td></tr>`}
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
              ${recentTrips.map(t => `
                <tr><td>${escapeHtml(t.source)} &rarr; ${escapeHtml(t.destination)}</td><td>${badge(t.status)}</td></tr>
              `).join("") || `<tr><td colspan="2" class="empty-state">No trips yet</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function kpiTile(value, label) {
  return `<div class="kpi-tile"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}

/* ---------------------------------------------------------------------- */
/* Vehicles                                                                */
/* ---------------------------------------------------------------------- */

async function renderVehicles(main) {
  const vehicles = await api("/vehicles");
  state.cache.vehicles = vehicles;
  const canManage = ["fleet_manager"].includes(state.user.role);

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Vehicle registry</h2>
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-vehicle-btn">+ Register vehicle</button>` : ""}
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table">
          <thead><tr>
            <th>Reg No.</th><th>Name</th><th>Type</th><th class="num">Max Load</th>
            <th class="num">Odometer</th><th>Region</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${vehicles.map(v => `
              <tr>
                <td class="mono">${escapeHtml(v.reg_number)}</td>
                <td>${escapeHtml(v.name)}</td>
                <td>${escapeHtml(v.type)}</td>
                <td class="num">${fmtNum(v.max_load_kg, 0)} kg</td>
                <td class="num">${fmtNum(v.odometer_km, 0)} km</td>
                <td>${escapeHtml(v.region || "—")}</td>
                <td>${badge(v.status)}</td>
                <td>${canManage ? `<button class="btn btn-ghost btn-sm" data-edit-vehicle="${v.id}">Edit</button>` : ""}</td>
              </tr>
            `).join("") || `<tr><td colspan="8" class="empty-state">No vehicles registered yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (canManage) {
    document.getElementById("add-vehicle-btn")?.addEventListener("click", () => vehicleModal());
    main.querySelectorAll("[data-edit-vehicle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = vehicles.find(v => v.id == btn.dataset.editVehicle);
        vehicleModal(v);
      });
    });
  }
}

function vehicleModal(vehicle = null) {
  const isEdit = !!vehicle;
  openModal({
    title: isEdit ? `Edit vehicle ${vehicle.reg_number}` : "Register vehicle",
    submitLabel: isEdit ? "Save changes" : "Register",
    bodyHtml: `
      <label>Registration number
        <input name="reg_number" value="${escapeHtml(vehicle?.reg_number || "")}" required />
      </label>
      <div class="field-row">
        <label>Name / Model <input name="name" value="${escapeHtml(vehicle?.name || "")}" required /></label>
        <label>Type <input name="type" placeholder="Van / Truck" value="${escapeHtml(vehicle?.type || "")}" required /></label>
      </div>
      <div class="field-row">
        <label>Max load (kg) <input name="max_load_kg" type="number" step="any" value="${vehicle?.max_load_kg ?? ""}" required /></label>
        <label>Odometer (km) <input name="odometer_km" type="number" step="any" value="${vehicle?.odometer_km ?? 0}" /></label>
      </div>
      <div class="field-row">
        <label>Acquisition cost (₹) <input name="acquisition_cost" type="number" step="any" value="${vehicle?.acquisition_cost ?? 0}" /></label>
        <label>Region <input name="region" value="${escapeHtml(vehicle?.region || "")}" /></label>
      </div>
      ${isEdit ? `<label>Status
        <select name="status">
          ${["Available","On Trip","In Shop","Retired"].map(s => `<option value="${s}" ${vehicle.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </label>` : ""}
    `,
    onSubmit: async (values) => {
      const payload = {
        reg_number: values.reg_number.trim(),
        name: values.name.trim(),
        type: values.type.trim(),
        max_load_kg: values.max_load_kg,
        odometer_km: values.odometer_km,
        acquisition_cost: values.acquisition_cost,
        region: values.region.trim(),
      };
      if (isEdit) {
        payload.status = values.status;
        await api(`/vehicles/${vehicle.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/vehicles", { method: "POST", body: JSON.stringify(payload) });
      }
      toast(isEdit ? "Vehicle updated" : "Vehicle registered", "success");
      render();
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Drivers                                                                  */
/* ---------------------------------------------------------------------- */

async function renderDrivers(main) {
  const drivers = await api("/drivers");
  state.cache.drivers = drivers;
  const canManage = ["fleet_manager", "safety_officer"].includes(state.user.role);

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Driver management</h2>
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-driver-btn">+ Register driver</button>` : ""}
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>License No.</th><th>Category</th><th>Expiry</th>
            <th class="num">Safety Score</th><th>Contact</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${drivers.map(d => `
              <tr>
                <td>${escapeHtml(d.name)}</td>
                <td class="mono">${escapeHtml(d.license_number)}</td>
                <td>${escapeHtml(d.license_category)}</td>
                <td class="mono">${d.license_expiry}${d.license_expired ? ` ${badge("Expired")}` : ""}</td>
                <td class="num">${fmtNum(d.safety_score, 0)}</td>
                <td class="mono">${escapeHtml(d.contact_number)}</td>
                <td>${badge(d.status)}</td>
                <td>${canManage ? `<button class="btn btn-ghost btn-sm" data-edit-driver="${d.id}">Edit</button>` : ""}</td>
              </tr>
            `).join("") || `<tr><td colspan="8" class="empty-state">No drivers registered yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (canManage) {
    document.getElementById("add-driver-btn")?.addEventListener("click", () => driverModal());
    main.querySelectorAll("[data-edit-driver]").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = drivers.find(d => d.id == btn.dataset.editDriver);
        driverModal(d);
      });
    });
  }
}

function driverModal(driver = null) {
  const isEdit = !!driver;
  openModal({
    title: isEdit ? `Edit driver — ${driver.name}` : "Register driver",
    submitLabel: isEdit ? "Save changes" : "Register",
    bodyHtml: `
      <label>Full name <input name="name" value="${escapeHtml(driver?.name || "")}" required /></label>
      <div class="field-row">
        <label>License number <input name="license_number" value="${escapeHtml(driver?.license_number || "")}" required /></label>
        <label>License category <input name="license_category" placeholder="LMV / HMV" value="${escapeHtml(driver?.license_category || "")}" required /></label>
      </div>
      <div class="field-row">
        <label>License expiry <input name="license_expiry" type="date" value="${driver?.license_expiry || ""}" required /></label>
        <label>Contact number <input name="contact_number" value="${escapeHtml(driver?.contact_number || "")}" required /></label>
      </div>
      <label>Safety score (0-100) <input name="safety_score" type="number" step="any" value="${driver?.safety_score ?? 100}" /></label>
      ${isEdit ? `<label>Status
        <select name="status">
          ${["Available","On Trip","Off Duty","Suspended"].map(s => `<option value="${s}" ${driver.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </label>` : ""}
    `,
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim(),
        license_number: values.license_number.trim(),
        license_category: values.license_category.trim(),
        license_expiry: values.license_expiry,
        contact_number: values.contact_number.trim(),
        safety_score: values.safety_score,
      };
      if (isEdit) {
        payload.status = values.status;
        await api(`/drivers/${driver.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/drivers", { method: "POST", body: JSON.stringify(payload) });
      }
      toast(isEdit ? "Driver updated" : "Driver registered", "success");
      render();
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Trips                                                                   */
/* ---------------------------------------------------------------------- */

async function renderTrips(main) {
  const [trips, vehicles, drivers] = await Promise.all([
    api("/trips"), api("/vehicles?dispatchable=true"), api("/drivers?dispatchable=true"),
  ]);
  state.cache.trips = trips;

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Trip management</h2>
      <button class="btn btn-primary btn-sm" id="add-trip-btn">+ Create trip</button>
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table">
          <thead><tr>
            <th>Route</th><th>Vehicle</th><th>Driver</th><th class="num">Cargo</th>
            <th class="num">Distance</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${trips.map(t => `
              <tr>
                <td>${escapeHtml(t.source)} &rarr; ${escapeHtml(t.destination)}</td>
                <td class="mono">${escapeHtml(t.vehicle_reg || "—")}</td>
                <td>${escapeHtml(t.driver_name || "—")}</td>
                <td class="num">${fmtNum(t.cargo_weight_kg, 0)} kg</td>
                <td class="num">${t.actual_distance_km != null ? fmtNum(t.actual_distance_km,0) : fmtNum(t.planned_distance_km,0)} km</td>
                <td>${badge(t.status)}</td>
                <td>${tripActions(t)}</td>
              </tr>
            `).join("") || `<tr><td colspan="7" class="empty-state">No trips yet. Create one to get started.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("add-trip-btn").addEventListener("click", () => tripModal(vehicles, drivers));

  main.querySelectorAll("[data-dispatch]").forEach(btn => btn.addEventListener("click", () => tripAction(btn.dataset.dispatch, "dispatch")));
  main.querySelectorAll("[data-cancel]").forEach(btn => btn.addEventListener("click", () => tripAction(btn.dataset.cancel, "cancel")));
  main.querySelectorAll("[data-complete]").forEach(btn => btn.addEventListener("click", () => {
    const trip = trips.find(t => t.id == btn.dataset.complete);
    completeTripModal(trip);
  }));
}

function tripActions(t) {
  if (t.status === "Draft") {
    return `<button class="btn btn-sm btn-primary" data-dispatch="${t.id}">Dispatch</button>
            <button class="btn btn-sm btn-danger" data-cancel="${t.id}">Cancel</button>`;
  }
  if (t.status === "Dispatched") {
    return `<button class="btn btn-sm btn-primary" data-complete="${t.id}">Complete</button>
            <button class="btn btn-sm btn-danger" data-cancel="${t.id}">Cancel</button>`;
  }
  return "";
}

async function tripAction(tripId, action) {
  try {
    await api(`/trips/${tripId}/${action}`, { method: "POST" });
    toast(`Trip ${action}ed`, "success");
    render();
  } catch (err) {
    toast(err.message, "error");
  }
}

function tripModal(vehicles, drivers) {
  if (!vehicles.length || !drivers.length) {
    toast("No dispatchable vehicles or drivers available right now", "error");
  }
  openModal({
    title: "Create trip",
    submitLabel: "Create (Draft)",
    bodyHtml: `
      <div class="field-row">
        <label>Source <input name="source" required /></label>
        <label>Destination <input name="destination" required /></label>
      </div>
      <div class="field-row">
        <label>Vehicle
          <select name="vehicle_id" required>
            <option value="">Select vehicle…</option>
            ${vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)} (max ${v.max_load_kg}kg)</option>`).join("")}
          </select>
        </label>
        <label>Driver
          <select name="driver_id" required>
            <option value="">Select driver…</option>
            ${drivers.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="field-row">
        <label>Cargo weight (kg) <input name="cargo_weight_kg" type="number" step="any" required /></label>
        <label>Planned distance (km) <input name="planned_distance_km" type="number" step="any" required /></label>
      </div>
      <label>Expected revenue (₹) <input name="revenue" type="number" step="any" value="0" /></label>
    `,
    onSubmit: async (values) => {
      await api("/trips", {
        method: "POST",
        body: JSON.stringify({
          source: values.source.trim(),
          destination: values.destination.trim(),
          vehicle_id: values.vehicle_id,
          driver_id: values.driver_id,
          cargo_weight_kg: values.cargo_weight_kg,
          planned_distance_km: values.planned_distance_km,
          revenue: values.revenue || 0,
        }),
      });
      toast("Trip created as Draft", "success");
      render();
    },
  });
}

function completeTripModal(trip) {
  const vehicle = state.cache.vehicles.find(v => v.id === trip.vehicle_id);
  openModal({
    title: `Complete trip — ${trip.source} → ${trip.destination}`,
    submitLabel: "Mark completed",
    bodyHtml: `
      <label>Final odometer reading (km)
        <input name="final_odometer_km" type="number" step="any" value="${vehicle ? vehicle.odometer_km + trip.planned_distance_km : ""}" required />
      </label>
      <div class="field-row">
        <label>Fuel consumed (L) <input name="fuel_consumed_l" type="number" step="any" required /></label>
        <label>Fuel cost (₹) <input name="fuel_cost" type="number" step="any" value="0" /></label>
      </div>
    `,
    onSubmit: async (values) => {
      await api(`/trips/${trip.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          final_odometer_km: values.final_odometer_km,
          fuel_consumed_l: values.fuel_consumed_l,
          fuel_cost: values.fuel_cost || 0,
        }),
      });
      toast("Trip completed", "success");
      render();
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Maintenance                                                             */
/* ---------------------------------------------------------------------- */

async function renderMaintenance(main) {
  const [logs, vehicles] = await Promise.all([api("/maintenance"), api("/vehicles")]);
  const canManage = state.user.role === "fleet_manager";
  const eligibleVehicles = vehicles.filter(v => v.status !== "On Trip" && v.status !== "Retired");

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Maintenance</h2>
      ${canManage ? `<button class="btn btn-primary btn-sm" id="add-maint-btn">+ Log maintenance</button>` : ""}
    </div>
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>Vehicle</th><th>Description</th><th class="num">Cost</th><th>Status</th><th>Opened</th><th></th></tr></thead>
          <tbody>
            ${logs.map(m => `
              <tr>
                <td class="mono">${escapeHtml(m.vehicle_reg || "—")}</td>
                <td>${escapeHtml(m.description)}</td>
                <td class="num">${fmtMoney(m.cost)}</td>
                <td>${badge(m.status)}</td>
                <td class="mono text-dim">${m.created_at.slice(0,10)}</td>
                <td>${canManage && m.status === "Open" ? `<button class="btn btn-sm btn-primary" data-close-maint="${m.id}">Close</button>` : ""}</td>
              </tr>
            `).join("") || `<tr><td colspan="6" class="empty-state">No maintenance records yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (canManage) {
    document.getElementById("add-maint-btn")?.addEventListener("click", () => maintenanceModal(eligibleVehicles));
    main.querySelectorAll("[data-close-maint]").forEach(btn => {
      btn.addEventListener("click", () => closeMaintenanceModal(btn.dataset.closeMaint));
    });
  }
}

function maintenanceModal(vehicles) {
  openModal({
    title: "Log maintenance",
    submitLabel: "Start maintenance",
    bodyHtml: `
      <label>Vehicle
        <select name="vehicle_id" required>
          <option value="">Select vehicle…</option>
          ${vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <label>Description <input name="description" placeholder="Oil change, brake service…" required /></label>
      <label>Estimated cost (₹) <input name="cost" type="number" step="any" value="0" /></label>
    `,
    onSubmit: async (values) => {
      await api("/maintenance", {
        method: "POST",
        body: JSON.stringify({ vehicle_id: values.vehicle_id, description: values.description.trim(), cost: values.cost || 0 }),
      });
      toast("Maintenance started — vehicle moved to In Shop", "success");
      render();
    },
  });
}

function closeMaintenanceModal(logId) {
  openModal({
    title: "Close maintenance record",
    submitLabel: "Close & release vehicle",
    bodyHtml: `<label>Final cost (₹) <input name="cost" type="number" step="any" placeholder="Leave blank to keep estimate" /></label>`,
    onSubmit: async (values) => {
      const body = {};
      if (values.cost) body.cost = values.cost;
      await api(`/maintenance/${logId}/close`, { method: "POST", body: JSON.stringify(body) });
      toast("Maintenance closed — vehicle available again", "success");
      render();
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Fuel & Expenses                                                         */
/* ---------------------------------------------------------------------- */

async function renderFuel(main) {
  const [fuelLogs, expenses, vehicles] = await Promise.all([
    api("/fuel-logs"), api("/expenses"), api("/vehicles"),
  ]);
  const canManage = ["fleet_manager", "driver", "financial_analyst"].includes(state.user.role);

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Fuel &amp; expenses</h2>
      <div>
        <button class="btn btn-ghost btn-sm" id="add-fuel-btn">+ Fuel log</button>
        <button class="btn btn-primary btn-sm" id="add-expense-btn">+ Expense</button>
      </div>
    </div>
    <div class="card-grid">
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Fuel logs</div></div>
        <div class="panel-body" style="padding:0;">
          <table class="data-table">
            <thead><tr><th>Vehicle</th><th class="num">Liters</th><th class="num">Cost</th><th>Date</th></tr></thead>
            <tbody>
              ${fuelLogs.map(f => `
                <tr><td class="mono">${escapeHtml(f.vehicle_reg)}</td><td class="num">${fmtNum(f.liters,1)}</td><td class="num">${fmtMoney(f.cost)}</td><td class="mono text-dim">${f.date}</td></tr>
              `).join("") || `<tr><td colspan="4" class="empty-state">No fuel logs yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Other expenses</div></div>
        <div class="panel-body" style="padding:0;">
          <table class="data-table">
            <thead><tr><th>Vehicle</th><th>Category</th><th class="num">Amount</th><th>Date</th></tr></thead>
            <tbody>
              ${expenses.map(e => `
                <tr><td class="mono">${escapeHtml(e.vehicle_reg)}</td><td>${escapeHtml(e.category)}</td><td class="num">${fmtMoney(e.amount)}</td><td class="mono text-dim">${e.date}</td></tr>
              `).join("") || `<tr><td colspan="4" class="empty-state">No expenses logged yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById("add-fuel-btn")?.addEventListener("click", () => fuelModal(vehicles));
  document.getElementById("add-expense-btn")?.addEventListener("click", () => expenseModal(vehicles));
}

function fuelModal(vehicles) {
  openModal({
    title: "Add fuel log",
    bodyHtml: `
      <label>Vehicle
        <select name="vehicle_id" required>
          <option value="">Select vehicle…</option>
          ${vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <div class="field-row">
        <label>Liters <input name="liters" type="number" step="any" required /></label>
        <label>Cost (₹) <input name="cost" type="number" step="any" required /></label>
      </div>
      <label>Date <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" /></label>
    `,
    onSubmit: async (values) => {
      await api("/fuel-logs", { method: "POST", body: JSON.stringify(values) });
      toast("Fuel log added", "success");
      render();
    },
  });
}

function expenseModal(vehicles) {
  openModal({
    title: "Add expense",
    bodyHtml: `
      <label>Vehicle
        <select name="vehicle_id" required>
          <option value="">Select vehicle…</option>
          ${vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <div class="field-row">
        <label>Category <input name="category" placeholder="Toll, permit, fine…" required /></label>
        <label>Amount (₹) <input name="amount" type="number" step="any" required /></label>
      </div>
      <label>Description <input name="description" placeholder="Optional notes" /></label>
      <label>Date <input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" /></label>
    `,
    onSubmit: async (values) => {
      await api("/expenses", { method: "POST", body: JSON.stringify(values) });
      toast("Expense recorded", "success");
      render();
    },
  });
}

/* ---------------------------------------------------------------------- */
/* Reports                                                                  */
/* ---------------------------------------------------------------------- */

async function renderReports(main) {
  const summary = await api("/reports/summary");

  main.innerHTML = `
    <div class="flex-between" style="margin-bottom:16px;">
      <h2 class="section-title" style="margin:0;">Reports &amp; analytics</h2>
      <a class="btn btn-ghost btn-sm" id="export-csv-btn" href="#">Export CSV</a>
    </div>
    <div class="kpi-board" style="grid-template-columns: repeat(auto-fit, minmax(200px,1fr));">
      ${kpiTile(summary.fleet_utilization_pct + "%", "Fleet Utilization")}
    </div>
    <div class="panel">
      <div class="panel-header"><div class="panel-title">Per-vehicle performance</div></div>
      <div class="panel-body" style="padding:0;">
        <table class="data-table">
          <thead><tr>
            <th>Vehicle</th><th class="num">Trips</th><th class="num">Distance</th>
            <th class="num">Fuel Eff. (km/L)</th><th class="num">Operational Cost</th>
            <th class="num">Revenue</th><th class="num">ROI</th>
          </tr></thead>
          <tbody>
            ${summary.vehicles.map(v => `
              <tr>
                <td class="mono">${escapeHtml(v.reg_number)} <span class="text-faint">${escapeHtml(v.name)}</span></td>
                <td class="num">${v.completed_trips}</td>
                <td class="num">${fmtNum(v.total_distance_km,0)} km</td>
                <td class="num">${fmtNum(v.fuel_efficiency_km_per_l,2)}</td>
                <td class="num">${fmtMoney(v.operational_cost)}</td>
                <td class="num">${fmtMoney(v.total_revenue)}</td>
                <td class="num">${(v.vehicle_roi * 100).toFixed(1)}%</td>
              </tr>
            `).join("") || `<tr><td colspan="7" class="empty-state">No data yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById("export-csv-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/reports/export.csv`, { headers: { Authorization: `Bearer ${state.token}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "transitops_report.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast("Export failed: " + err.message, "error");
    }
  });
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                     */
/* ---------------------------------------------------------------------- */

(async function boot() {
  if (state.token && state.user) {
    try {
      await api("/auth/me");
      showApp();
      return;
    } catch (e) {
      clearSession();
    }
  }
  showLogin();
})();
