/* ---------------------------------------------------------------------- */
/* views/trips.js — trip dispatch (Fleet Manager) / "My Trips" (Driver)    */
/* ---------------------------------------------------------------------- */

const tripPage = { offset: 0, limit: 50, total: 0 };

async function renderTrips(main) {
  const role = currentRole();
  const isDriver = role === "driver";
  const canManage = can("trip.manage");

  // Fleet Manager sees the full paginated dispatch board. Driver gets a
  // "My Trips" view scoped to trips assigned to them (matched by name, since
  // the User↔Driver link isn't modelled) — small set, so unpaginated.
  let trips;
  if (isDriver) {
    const resp = await apiList("/trips?limit=0");
    trips = resp.items.filter((t) => t.driver_name && t.driver_name === state.user.name);
    tripPage.total = trips.length;
  } else {
    const resp = await apiList(`/trips?limit=${tripPage.limit}&offset=${tripPage.offset}`);
    trips = resp.items;
    tripPage.total = resp.total;
  }
  state.cache.trips = trips;

  // dispatch pools (exclude retired/in-shop vehicles, suspended/expired/on-trip drivers)
  const [vehResp, drvResp] = canManage
    ? await Promise.all([apiList("/vehicles?dispatchable=true&limit=0"), api("/drivers?dispatchable=true")])
    : [{ items: [] }, []];
  const vehicles = vehResp.items;
  const drivers = Array.isArray(drvResp) ? drvResp : drvResp.items || [];

  const title = isDriver ? "My trips" : "Trip management";
  const actions = canManage ? `<button class="btn btn-primary btn-sm" id="add-trip-btn">+ Create trip</button>` : "";

  main.innerHTML = `
    ${pageHead("04", "Dispatch", title, actions)}
    ${tableToolbar("trip-table", { placeholder: "Search route / vehicle / driver…" })}
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="trip-table">
          <thead><tr>
            <th data-sort="text">Route</th><th data-sort="text">Vehicle</th><th data-sort="text">Driver</th>
            <th class="num" data-sort="num">Cargo</th><th class="num" data-sort="num">Distance</th>
            <th data-sort="text">Status</th><th></th>
          </tr></thead>
          <tbody>
            ${
              trips.map((t) => `
              <tr>
                <td>${escapeHtml(t.source)} &rarr; ${escapeHtml(t.destination)}</td>
                <td class="mono">${escapeHtml(t.vehicle_reg || "—")}</td>
                <td>${escapeHtml(t.driver_name || "—")}</td>
                <td class="num">${fmtNum(t.cargo_weight_kg, 0)} kg</td>
                <td class="num">${t.actual_distance_km != null ? fmtNum(t.actual_distance_km, 0) : fmtNum(t.planned_distance_km, 0)} km</td>
                <td>${badge(t.status)}</td>
                <td class="row-actions">${canManage ? tripActions(t) : ""}</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="7" class="empty-state">${isDriver ? "No trips assigned to you yet." : "No trips yet. Create one to get started."}</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
    ${isDriver ? "" : pagerHtml(tripPage)}
  `;

  if (!isDriver) {
    wirePager(main, tripPage, (o) => { tripPage.offset = o; renderTrips(main).then(() => enhanceView(main)); });
  }

  if (canManage) {
    main.querySelector("#add-trip-btn")?.addEventListener("click", () => tripModal(vehicles, drivers));
    main.querySelectorAll("[data-dispatch]").forEach((btn) =>
      btn.addEventListener("click", () => tripAction(btn.dataset.dispatch, "dispatch")),
    );
    main.querySelectorAll("[data-cancel]").forEach((btn) =>
      btn.addEventListener("click", () => tripAction(btn.dataset.cancel, "cancel")),
    );
    main.querySelectorAll("[data-complete]").forEach((btn) =>
      btn.addEventListener("click", () => completeTripModal(trips.find((t) => t.id == btn.dataset.complete))),
    );
  }
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
            ${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)} (max ${v.max_load_kg}kg)</option>`).join("")}
          </select>
        </label>
        <label>Driver
          <select name="driver_id" required>
            <option value="">Select driver…</option>
            ${drivers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}
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
  const vehicle = state.cache.vehicles.find((v) => v.id === trip.vehicle_id);
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
