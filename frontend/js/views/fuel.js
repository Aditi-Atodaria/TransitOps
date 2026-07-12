/* ---------------------------------------------------------------------- */
/* views/fuel.js — fuel logs & expenses ledger                             */
/* Fuel logging: Fleet Manager / Driver. Expenses: Fleet Manager / Analyst. */
/* ---------------------------------------------------------------------- */

async function renderFuel(main) {
  const [{ items: fuelLogs }, { items: expenses }, vehResp] = await Promise.all([
    apiList("/fuel-logs?limit=0"),
    apiList("/expenses?limit=0"),
    apiList("/vehicles?limit=0"),
  ]);
  const vehicles = vehResp.items;
  const canFuel = can("fuel.log");
  const canExpense = can("expense.manage");

  const actions = [
    canFuel ? `<button class="btn btn-ghost btn-sm" id="add-fuel-btn">+ Fuel log</button>` : "",
    canExpense ? `<button class="btn btn-primary btn-sm" id="add-expense-btn">+ Expense</button>` : "",
  ].join(" ");

  main.innerHTML = `
    ${pageHead("06", "Ledger", "Fuel & expenses", actions)}
    <div class="card-grid">
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Fuel logs</div></div>
        ${tableToolbar("fuel-table", { placeholder: "Search fuel logs…" })}
        <div class="panel-body" style="padding:0;">
          <table class="data-table" id="fuel-table">
            <thead><tr><th data-sort="text">Vehicle</th><th class="num" data-sort="num">Liters</th><th class="num" data-sort="num">Cost</th><th data-sort="text">Date</th></tr></thead>
            <tbody>
              ${
                fuelLogs.map((f) => `
                <tr><td class="mono">${escapeHtml(f.vehicle_reg)}</td><td class="num">${fmtNum(f.liters, 1)}</td><td class="num">${fmtMoney(f.cost)}</td><td class="mono text-dim">${f.date}</td></tr>
              `).join("") ||
                `<tr data-empty><td colspan="4" class="empty-state">No fuel logs yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div class="panel-title">Other expenses</div></div>
        ${tableToolbar("exp-table", { placeholder: "Search expenses…" })}
        <div class="panel-body" style="padding:0;">
          <table class="data-table" id="exp-table">
            <thead><tr><th data-sort="text">Vehicle</th><th data-sort="text">Category</th><th class="num" data-sort="num">Amount</th><th data-sort="text">Date</th></tr></thead>
            <tbody>
              ${
                expenses.map((e) => `
                <tr><td class="mono">${escapeHtml(e.vehicle_reg)}</td><td>${escapeHtml(e.category)}</td><td class="num">${fmtMoney(e.amount)}</td><td class="mono text-dim">${e.date}</td></tr>
              `).join("") ||
                `<tr data-empty><td colspan="4" class="empty-state">No expenses logged yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  if (canFuel) main.querySelector("#add-fuel-btn")?.addEventListener("click", () => fuelModal(vehicles));
  if (canExpense) main.querySelector("#add-expense-btn")?.addEventListener("click", () => expenseModal(vehicles));
}

function fuelModal(vehicles) {
  openModal({
    title: "Add fuel log",
    bodyHtml: `
      <label>Vehicle
        <select name="vehicle_id" required>
          <option value="">Select vehicle…</option>
          ${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <div class="field-row">
        <label>Liters <input name="liters" type="number" step="any" required /></label>
        <label>Cost (₹) <input name="cost" type="number" step="any" required /></label>
      </div>
      <label>Date <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
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
          ${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.reg_number)} — ${escapeHtml(v.name)}</option>`).join("")}
        </select>
      </label>
      <div class="field-row">
        <label>Category <input name="category" placeholder="Toll, permit, fine…" required /></label>
        <label>Amount (₹) <input name="amount" type="number" step="any" required /></label>
      </div>
      <label>Description <input name="description" placeholder="Optional notes" /></label>
      <label>Date <input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
    `,
    onSubmit: async (values) => {
      await api("/expenses", { method: "POST", body: JSON.stringify(values) });
      toast("Expense recorded", "success");
      render();
    },
  });
}
