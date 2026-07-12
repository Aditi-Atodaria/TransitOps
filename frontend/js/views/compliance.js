/* ---------------------------------------------------------------------- */
/* views/compliance.js — Compliance Alerts (Safety Officer landing)        */
/* Licenses (and vehicle documents) expiring within a window, soonest-first. */
/* ---------------------------------------------------------------------- */

const complianceState = { within: 30 };

async function renderCompliance(main) {
  const data = await api(`/compliance/alerts?within=${complianceState.within}`);
  const licenses = data.license_alerts || [];
  const docs = data.document_alerts || [];

  const urgency = (days) => {
    if (days < 0) return badge("Expired");
    if (days <= 7) return `<span class="badge badge-expired">${days}d left</span>`;
    return `<span class="text-dim">${days}d left</span>`;
  };

  main.innerHTML = `
    ${pageHead("08", "Compliance", "Compliance alerts", `
      <label class="toolbar-field">Window
        <select id="within-select">
          ${[7, 15, 30, 60, 90].map((n) => `<option value="${n}" ${n === complianceState.within ? "selected" : ""}>${n} days</option>`).join("")}
        </select>
      </label>`)}

    <div class="kpi-board" style="grid-template-columns: repeat(auto-fit, minmax(180px,1fr));">
      ${kpiTile(licenses.filter((l) => l.expired).length, "Expired licenses")}
      ${kpiTile(licenses.filter((l) => !l.expired).length, "Licenses expiring")}
      ${kpiTile(docs.length, "Documents expiring")}
    </div>

    <div class="panel">
      <div class="panel-header"><div class="panel-title">Driver licenses — expiring soonest first</div></div>
      ${tableToolbar("lic-table", { placeholder: "Search driver / license…" })}
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="lic-table">
          <thead><tr>
            <th data-sort="text">Driver</th><th data-sort="text">License No.</th>
            <th data-sort="text">Expiry</th><th class="num" data-sort="num">Days</th>
            <th class="num" data-sort="num">Safety</th><th></th>
          </tr></thead>
          <tbody>
            ${
              licenses.map((l) => `
              <tr class="${l.expired ? "row-danger" : ""}">
                <td>${escapeHtml(l.driver_name)}</td>
                <td class="mono">${escapeHtml(l.license_number)}</td>
                <td class="mono">${l.license_expiry}</td>
                <td class="num">${urgency(l.days_left)}</td>
                <td class="num">${fmtNum(l.safety_score, 0)}</td>
                <td class="row-actions"><button class="btn btn-ghost btn-sm" data-remind="${l.driver_id}">Send reminder</button></td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="6" class="empty-state">No licenses expiring in this window. 👍</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="margin-top:18px;">
      <div class="panel-header"><div class="panel-title">Vehicle documents — expiring</div></div>
      <div class="panel-body" style="padding:0;">
        <table class="data-table" id="doc-table">
          <thead><tr><th>Vehicle</th><th>Type</th><th>File</th><th>Expiry</th><th class="num">Days</th></tr></thead>
          <tbody>
            ${
              docs.map((d) => `
              <tr class="${d.expired ? "row-danger" : ""}">
                <td class="mono">${escapeHtml(d.vehicle_reg || "—")}</td>
                <td>${escapeHtml(d.doc_type)}</td>
                <td>${escapeHtml(d.file_name)}</td>
                <td class="mono">${d.expiry_date}</td>
                <td class="num">${urgency(d.days_left)}</td>
              </tr>
            `).join("") ||
              `<tr data-empty><td colspan="5" class="empty-state">No vehicle documents expiring.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  main.querySelector("#within-select").addEventListener("change", (e) => {
    complianceState.within = parseInt(e.target.value, 10);
    renderCompliance(main).then(() => enhanceView(main));
  });

  // "Send reminder" is a documented stub on the backend (send_expiry_reminder);
  // it does not fabricate an email — it records intent server-side.
  main.querySelectorAll("[data-remind]").forEach((btn) =>
    btn.addEventListener("click", () =>
      toast("Reminder queued (stub — wire send_expiry_reminder() to a real mail provider)", "info"),
    ),
  );
}
