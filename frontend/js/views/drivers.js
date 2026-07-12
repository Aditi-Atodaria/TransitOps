/* ---------------------------------------------------------------------- */
/* views/drivers.js — driver management (Fleet Manager, Safety Officer)    */
/* ---------------------------------------------------------------------- */

const drvPage = { offset: 0, limit: 50, total: 0, includeArchived: false };

async function renderDrivers(main) {
  const qs = new URLSearchParams({ limit: drvPage.limit, offset: drvPage.offset });
  if (drvPage.includeArchived) qs.set("include_archived", "true");
  const { items: drivers, total } = await apiList(`/drivers?${qs}`);
  drvPage.total = total;
  state.cache.drivers = drivers;

  const canManage = can("driver.manage");
  const canIncident = can("driver.incident");

  const actions = canManage
    ? `<button class="btn btn-primary btn-sm" id="add-driver-btn">+ Register driver</button>`
    : "";

  main.innerHTML = `
    ${pageHead("03", "Personnel", "Driver management", actions)}
    ${tableToolbar("drv-table", {
      placeholder: "Search name / license / category…",
      trailingHtml: `<label class="toolbar-check"><input type="checkbox" id="drv-archived" ${drvPage.includeArchived ? "checked" : ""}/> Show archived</label>`,
    })}
    <div class="panel">
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="drv-table">
          <thead><tr>
            <th data-sort="text">Name</th><th data-sort="text">License No.</th><th data-sort="text">Category</th>
            <th data-sort="text">Expiry</th><th class="num" data-sort="num">Safety Score</th>
            <th data-sort="text">Contact</th><th data-sort="text">Status</th><th></th>
          </tr></thead>
          <tbody>
            ${
              drivers.map((d) => `
              <tr class="${d.is_archived ? "row-archived" : ""}">
                <td>${escapeHtml(d.name)}${d.is_archived ? ` ${badge("Archived")}` : ""}</td>
                <td class="mono">${escapeHtml(d.license_number)}</td>
                <td>${escapeHtml(d.license_category)}</td>
                <td class="mono">${d.license_expiry}${d.license_expired ? ` ${badge("Expired")}` : ""}</td>
                <td class="num">${fmtNum(d.safety_score, 0)}</td>
                <td class="mono">${escapeHtml(d.contact_number)}</td>
                <td>${badge(d.status)}</td>
                <td class="row-actions">${driverRowActions(d, canManage, canIncident)}</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="8" class="empty-state">No drivers registered yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
    ${pagerHtml(drvPage)}
  `;

  wirePager(main, drvPage, (o) => { drvPage.offset = o; renderDrivers(main).then(() => enhanceView(main)); });
  main.querySelector("#drv-archived")?.addEventListener("change", (e) => {
    drvPage.includeArchived = e.target.checked;
    drvPage.offset = 0;
    renderDrivers(main).then(() => enhanceView(main));
  });

  if (canManage) {
    main.querySelector("#add-driver-btn")?.addEventListener("click", () => driverModal());
    main.querySelectorAll("[data-edit-driver]").forEach((btn) =>
      btn.addEventListener("click", () => driverModal(drivers.find((d) => d.id == btn.dataset.editDriver))),
    );
    main.querySelectorAll("[data-archive-driver]").forEach((btn) =>
      btn.addEventListener("click", () => archiveDriver(btn.dataset.archiveDriver)),
    );
    main.querySelectorAll("[data-restore-driver]").forEach((btn) =>
      btn.addEventListener("click", () => restoreDriver(btn.dataset.restoreDriver)),
    );
  }
  if (canIncident) {
    main.querySelectorAll("[data-incident]").forEach((btn) =>
      btn.addEventListener("click", () => incidentModal(drivers.find((d) => d.id == btn.dataset.incident))),
    );
  }
}

function driverRowActions(d, canManage, canIncident) {
  const parts = [];
  if (canIncident && !d.is_archived) parts.push(`<button class="btn btn-danger btn-sm" data-incident="${d.id}">Log incident</button>`);
  if (canManage) {
    if (d.is_archived) {
      parts.push(`<button class="btn btn-ghost btn-sm" data-restore-driver="${d.id}">Restore</button>`);
    } else {
      parts.push(`<button class="btn btn-ghost btn-sm" data-edit-driver="${d.id}">Edit</button>`);
      parts.push(`<button class="btn btn-danger btn-sm" data-archive-driver="${d.id}">Archive</button>`);
    }
  }
  return parts.join(" ");
}

async function archiveDriver(id) {
  const d = state.cache.drivers.find((x) => x.id == id);
  if (!confirm(`Archive driver ${d ? d.name : id}? History is preserved.`)) return;
  try {
    await api(`/drivers/${id}`, { method: "DELETE" });
    toast("Driver archived", "success");
    render();
  } catch (err) {
    toast(err.message, "error");
  }
}

async function restoreDriver(id) {
  try {
    await api(`/drivers/${id}/restore`, { method: "POST" });
    toast("Driver restored", "success");
    render();
  } catch (err) {
    toast(err.message, "error");
  }
}

function incidentModal(driver) {
  if (!driver) return;
  openModal({
    title: `Log safety incident — ${driver.name}`,
    submitLabel: "Record & deduct",
    bodyHtml: `
      <p class="text-dim" style="margin:0 0 4px;">Current safety score: <b>${fmtNum(driver.safety_score, 0)}</b></p>
      <div class="field-row">
        <label>Points to deduct <input name="points" type="number" step="any" min="0" value="5" required /></label>
        <label>&nbsp;</label>
      </div>
      <label>Reason <input name="reason" placeholder="Speeding, harsh braking, at-fault collision…" required /></label>
    `,
    onSubmit: async (values) => {
      await api(`/drivers/${driver.id}/incident`, {
        method: "POST",
        body: JSON.stringify({ points: values.points, reason: values.reason.trim() }),
      });
      toast("Incident logged — safety score adjusted", "success");
      render();
    },
  });
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
      ${
        isEdit
          ? `<label>Status
        <select name="status">
          ${["Available", "On Trip", "Off Duty", "Suspended"].map((s) => `<option value="${s}" ${driver.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </label>`
          : ""
      }
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
