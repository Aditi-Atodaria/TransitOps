/* ---------------------------------------------------------------------- */
/* views/maintenance.js — service records (Fleet Manager)                  */
/* ---------------------------------------------------------------------- */

const maintPage = { offset: 0, limit: 50, total: 0 };

async function renderMaintenance(main) {
  const [{ items: logs, total }, vehResp] = await Promise.all([
    apiList(`/maintenance?limit=${maintPage.limit}&offset=${maintPage.offset}`),
    apiList("/vehicles?limit=0"),
  ]);
  maintPage.total = total;
  const vehicles = vehResp.items;
  const canManage = can("maintenance.manage");
  const eligibleVehicles = vehicles.filter((v) => v.status !== "On Trip" && v.status !== "Retired" && !v.is_archived);

  const actions = canManage ? `<button class="btn btn-primary btn-sm" id="add-maint-btn">+ Log maintenance</button>` : "";

  main.innerHTML = `
    ${pageHead("05", "Service", "Maintenance", actions)}
    ${tableToolbar("maint-table", { placeholder: "Search vehicle / description…" })}
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="maint-table">
          <thead><tr>
            <th data-sort="text">Vehicle</th><th data-sort="text">Description</th>
            <th class="num" data-sort="num">Cost</th><th data-sort="text">Status</th>
            <th data-sort="text">Opened</th><th></th>
          </tr></thead>
          <tbody>
            ${
              logs.map((m) => `
              <tr>
                <td class="mono">${escapeHtml(m.vehicle_reg || "—")}</td>
                <td>${escapeHtml(m.description)}</td>
                <td class="num">${fmtMoney(m.cost)}</td>
                <td>${badge(m.status)}</td>
                <td class="mono text-dim">${m.created_at.slice(0, 10)}</td>
                <td class="row-actions">${canManage && m.status === "Open" ? `<button class="btn btn-sm btn-primary" data-close-maint="${m.id}">Close</button>` : ""}</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="6" class="empty-state">No maintenance records yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
    ${pagerHtml(maintPage)}
  `;

  wirePager(main, maintPage, (o) => { maintPage.offset = o; renderMaintenance(main).then(() => enhanceView(main)); });

  if (canManage) {
    main.querySelector("#add-maint-btn")?.addEventListener("click", () => maintenanceModal(eligibleVehicles));
    main.querySelectorAll("[data-close-maint]").forEach((btn) =>
      btn.addEventListener("click", () => closeMaintenanceModal(btn.dataset.closeMaint)),
    );
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
          ${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <label>Description <input name="description" placeholder="Oil change, brake service…" required /></label>
      <label>Estimated cost (₹) <input name="cost" type="number" step="any" value="0" /></label>
    `,
    onSubmit: async (values) => {
      await api("/maintenance", {
        method: "POST",
        body: JSON.stringify({
          vehicle_id: values.vehicle_id,
          description: values.description.trim(),
          cost: values.cost || 0,
        }),
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
