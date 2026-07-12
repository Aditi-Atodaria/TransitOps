/* ---------------------------------------------------------------------- */
/* views/vehicles.js — vehicle registry (Fleet Manager)                    */
/* Search / sort / pagination, soft-delete (archive), and document mgmt.    */
/* ---------------------------------------------------------------------- */

const vehPage = { offset: 0, limit: 50, total: 0, includeArchived: false };

async function renderVehicles(main) {
  const qs = new URLSearchParams({ limit: vehPage.limit, offset: vehPage.offset });
  if (vehPage.includeArchived) qs.set("include_archived", "true");
  const { items: vehicles, total } = await apiList(`/vehicles?${qs}`);
  vehPage.total = total;
  state.cache.vehicles = vehicles;
  const canManage = can("vehicle.manage");

  const actions = canManage
    ? `<button class="btn btn-primary btn-sm" id="add-vehicle-btn">+ Register vehicle</button>`
    : "";

  main.innerHTML = `
    ${pageHead("02", "Registry", "Vehicle registry", actions)}
    ${tableToolbar("veh-table", {
      placeholder: "Search reg / name / type / region…",
      trailingHtml: `<label class="toolbar-check"><input type="checkbox" id="veh-archived" ${vehPage.includeArchived ? "checked" : ""}/> Show archived</label>`,
    })}
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="veh-table">
          <thead><tr>
            <th data-sort="text">Reg No.</th><th data-sort="text">Name</th><th data-sort="text">Type</th>
            <th class="num" data-sort="num">Max Load</th><th class="num" data-sort="num">Odometer</th>
            <th data-sort="text">Region</th><th data-sort="text">Status</th><th></th>
          </tr></thead>
          <tbody>
            ${
              vehicles.map((v) => `
              <tr class="${v.is_archived ? "row-archived" : ""}">
                <td class="mono">${escapeHtml(v.reg_number)}</td>
                <td>${escapeHtml(v.name)}${v.is_archived ? ` ${badge("Archived")}` : ""}</td>
                <td>${escapeHtml(v.type)}</td>
                <td class="num">${fmtNum(v.max_load_kg, 0)} kg</td>
                <td class="num">${fmtNum(v.odometer_km, 0)} km</td>
                <td>${escapeHtml(v.region || "—")}</td>
                <td>${badge(v.status)}</td>
                <td class="row-actions">${vehicleRowActions(v, canManage)}</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="8" class="empty-state">No vehicles registered yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
    ${pagerHtml(vehPage)}
  `;

  wirePager(main, vehPage, (o) => { vehPage.offset = o; renderVehicles(main).then(() => enhanceView(main)); });
  main.querySelector("#veh-archived")?.addEventListener("change", (e) => {
    vehPage.includeArchived = e.target.checked;
    vehPage.offset = 0;
    renderVehicles(main).then(() => enhanceView(main));
  });

  main.querySelectorAll("[data-docs-vehicle]").forEach((btn) =>
    btn.addEventListener("click", () => documentsModal(vehicles.find((v) => v.id == btn.dataset.docsVehicle))),
  );

  if (canManage) {
    main.querySelector("#add-vehicle-btn")?.addEventListener("click", () => vehicleModal());
    main.querySelectorAll("[data-edit-vehicle]").forEach((btn) =>
      btn.addEventListener("click", () => vehicleModal(vehicles.find((v) => v.id == btn.dataset.editVehicle))),
    );
    main.querySelectorAll("[data-archive-vehicle]").forEach((btn) =>
      btn.addEventListener("click", () => archiveVehicle(btn.dataset.archiveVehicle)),
    );
    main.querySelectorAll("[data-restore-vehicle]").forEach((btn) =>
      btn.addEventListener("click", () => restoreVehicle(btn.dataset.restoreVehicle)),
    );
  }
}

function vehicleRowActions(v, canManage) {
  const docs = `<button class="btn btn-ghost btn-sm" data-docs-vehicle="${v.id}">Docs</button>`;
  if (!canManage) return docs;
  if (v.is_archived) {
    return `${docs}<button class="btn btn-ghost btn-sm" data-restore-vehicle="${v.id}">Restore</button>`;
  }
  return `${docs}
    <button class="btn btn-ghost btn-sm" data-edit-vehicle="${v.id}">Edit</button>
    <button class="btn btn-danger btn-sm" data-archive-vehicle="${v.id}">Archive</button>`;
}

async function archiveVehicle(id) {
  const v = state.cache.vehicles.find((x) => x.id == id);
  if (!confirm(`Archive vehicle ${v ? v.reg_number : id}? It will be hidden from dispatch but history is preserved.`)) return;
  try {
    await api(`/vehicles/${id}`, { method: "DELETE" });
    toast("Vehicle archived", "success");
    render();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function restoreVehicle(id) {
  try {
    await api(`/vehicles/${id}/restore`, { method: "POST" });
    toast("Vehicle restored", "success");
    render();
  } catch (err) {
    toast(err.message, "error");
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
      ${
        isEdit
          ? `<label>Status
        <select name="status">
          ${["Available", "On Trip", "In Shop", "Retired"].map((s) => `<option value="${s}" ${vehicle.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </label>`
          : ""
      }
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

/* ---- Vehicle document management (upload / list / delete) ---- */
async function documentsModal(vehicle) {
  if (!vehicle) return;
  const canManage = can("document.manage");
  const { close, el } = openModal({
    title: `Documents — ${vehicle.reg_number}`,
    submitLabel: "Close",
    bodyHtml: `<div id="docs-list" class="docs-list"><div class="loading-label">Loading…</div></div>`,
    onSubmit: async () => {},
  });
  // repurpose the footer submit as a plain close
  el.querySelector('#modal-form button[type="submit"]').addEventListener("click", (e) => {
    e.preventDefault();
    close();
  });

  const listEl = el.querySelector("#docs-list");

  async function refresh() {
    const docs = await api(`/vehicles/${vehicle.id}/documents`);
    listEl.innerHTML = `
      ${
        docs.length
          ? `<table class="data-table"><thead><tr><th>Type</th><th>File</th><th>Expiry</th><th></th></tr></thead><tbody>
        ${docs.map((d) => `
          <tr>
            <td>${escapeHtml(d.doc_type)}</td>
            <td>${escapeHtml(d.file_name)}</td>
            <td class="mono">${d.expiry_date || "—"}${d.is_expired ? ` ${badge("Expired")}` : ""}</td>
            <td class="row-actions">
              <button class="btn btn-ghost btn-sm" data-dl="${d.id}">Download</button>
              ${canManage ? `<button class="btn btn-danger btn-sm" data-del-doc="${d.id}">Delete</button>` : ""}
            </td>
          </tr>`).join("")}
        </tbody></table>`
          : `<div class="empty-state">No documents uploaded.</div>`
      }
      ${
        canManage
          ? `<form id="doc-upload" class="doc-upload">
        <div class="field-row">
          <label>Type
            <select name="doc_type">
              ${["Registration", "Insurance", "Permit", "Pollution Certificate", "Other"].map((t) => `<option>${t}</option>`).join("")}
            </select>
          </label>
          <label>Expiry (optional) <input name="expiry_date" type="date" /></label>
        </div>
        <label>File (PDF/JPG/PNG, ≤5 MB) <input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" required /></label>
        <div class="modal-error" id="doc-err"></div>
        <button type="submit" class="btn btn-primary btn-sm">Upload document</button>
      </form>`
          : ""
      }
    `;

    listEl.querySelectorAll("[data-dl]").forEach((btn) =>
      btn.addEventListener("click", () => downloadDocument(btn.dataset.dl)),
    );
    listEl.querySelectorAll("[data-del-doc]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this document?")) return;
        await api(`/documents/${btn.dataset.delDoc}`, { method: "DELETE" });
        toast("Document deleted", "success");
        refresh();
      }),
    );

    const form = listEl.querySelector("#doc-upload");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = listEl.querySelector("#doc-err");
        errEl.textContent = "";
        const fd = new FormData(form);
        try {
          await api(`/vehicles/${vehicle.id}/documents`, { method: "POST", body: fd });
          toast("Document uploaded", "success");
          refresh();
        } catch (err) {
          errEl.textContent = err.message;
        }
      });
    }
  }
  refresh();
}

async function downloadDocument(id) {
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/documents/${id}/download`, {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const nameMatch = cd.match(/filename="?([^"]+)"?/);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nameMatch ? nameMatch[1] : `document-${id}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message, "error");
  }
}
