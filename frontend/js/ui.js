/* ---------------------------------------------------------------------- */
/* ui.js — presentation helpers (no server calls live here)                */
/* Toast, modal, formatters, entrance polish, live clock, and the reusable  */
/* table search / column-sort behaviour shared by every data table.         */
/* ---------------------------------------------------------------------- */

/* ---- Toast ---- */
function toast(message, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast toast-${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 3500);
}

/* ---- small formatters / escaping ---- */
function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function badge(status) {
  const slug = String(status).toLowerCase().replace(/\s+/g, "-");
  return `<span class="badge badge-${slug}">${escapeHtml(status)}</span>`;
}

function fmtMoney(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtNum(n, digits = 1) {
  return Number(n || 0).toFixed(digits);
}

/* Editorial page header: mono index eyebrow + big display title + actions */
function pageHead(idx, eyebrow, title, actionsHtml = "") {
  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Index ${idx} / ${escapeHtml(eyebrow)}</div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
      </div>
      ${actionsHtml ? `<div class="page-head-actions">${actionsHtml}</div>` : ""}
    </header>`;
}

/* ---- Modal ---- */
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
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector("#modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = backdrop.querySelector("#modal-error");
    errEl.textContent = "";
    const formData = new FormData(e.target);
    const values = Object.fromEntries(formData.entries());
    try {
      await onSubmit(values, backdrop);
      close();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  return { close, el: backdrop };
}

/* ---- Reusable table toolbar markup ----
   Renders a search box (and optional trailing controls) bound to a table id. */
function tableToolbar(tableId, { placeholder = "Search…", trailingHtml = "" } = {}) {
  return `
    <div class="toolbar">
      <input class="table-search" type="search" data-target="${tableId}"
             placeholder="${escapeHtml(placeholder)}" aria-label="Search table" />
      <span class="spacer"></span>
      ${trailingHtml}
    </div>`;
}

/* ---- Pagination control ----
   `pageState` is { offset, limit, total }. Renders "x–y of N" with Prev/Next.
   Buttons carry data-page="prev|next"; wirePager() binds them to onGo(newOffset). */
function pagerHtml(pageState) {
  const { offset, limit, total } = pageState;
  if (total <= limit && offset === 0) return "";
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const prevDisabled = offset <= 0 ? "disabled" : "";
  const nextDisabled = offset + limit >= total ? "disabled" : "";
  return `
    <div class="pager">
      <span class="pager-info">${from}–${to} of ${total}</span>
      <button class="btn btn-ghost btn-sm" data-page="prev" ${prevDisabled}>← Prev</button>
      <button class="btn btn-ghost btn-sm" data-page="next" ${nextDisabled}>Next →</button>
    </div>`;
}

function wirePager(scope, pageState, onGo) {
  const prev = scope.querySelector('[data-page="prev"]');
  const next = scope.querySelector('[data-page="next"]');
  if (prev) prev.addEventListener("click", () => onGo(Math.max(0, pageState.offset - pageState.limit)));
  if (next) next.addEventListener("click", () => onGo(pageState.offset + pageState.limit));
}

/* ---- Post-render polish + table controls ---- */
function enhanceView(main) {
  main.classList.add("view");
  main.style.animation = "none";
  void main.offsetWidth;
  main.style.animation = "";

  main.querySelectorAll(".data-table tbody tr").forEach((tr, i) => {
    tr.style.animationDelay = Math.min(i * 35, 500) + "ms";
  });

  main.querySelectorAll(".kpi-tile").forEach((tile, i) => {
    tile.style.animationDelay = i * 55 + "ms";
    const el = tile.querySelector(".kpi-value");
    if (el && !el.dataset.counted) {
      el.dataset.counted = "1";
      countUp(el);
    }
  });

  wireTableControls(main);
}

/* Search + sort for any table marked `.data-table` with a bound search box
   and `<th data-sort="text|num">` headers. Purely client-side over rendered rows. */
function wireTableControls(scope) {
  // search boxes
  scope.querySelectorAll("input.table-search[data-target]").forEach((input) => {
    const table = scope.querySelector(`#${input.dataset.target}`);
    if (!table) return;
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      table.querySelectorAll("tbody tr").forEach((tr) => {
        if (tr.dataset.empty) return;
        const match = !q || tr.textContent.toLowerCase().includes(q);
        tr.style.display = match ? "" : "none";
      });
    });
  });

  // sortable headers
  scope.querySelectorAll("table.data-table th[data-sort]").forEach((th) => {
    th.style.cursor = "pointer";
    th.title = "Click to sort";
    th.addEventListener("click", () => sortByColumn(th));
  });
}

function sortByColumn(th) {
  const table = th.closest("table");
  const tbody = table.querySelector("tbody");
  const headers = Array.from(th.parentNode.children);
  const colIndex = headers.indexOf(th);
  const type = th.dataset.sort;
  const asc = th.dataset.dir !== "asc";
  headers.forEach((h) => delete h.dataset.dir);
  th.dataset.dir = asc ? "asc" : "desc";

  const rows = Array.from(tbody.querySelectorAll("tr")).filter((r) => !r.dataset.empty);
  rows.sort((a, b) => {
    const av = cellValue(a.children[colIndex], type);
    const bv = cellValue(b.children[colIndex], type);
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
  rows.forEach((r) => tbody.appendChild(r));
}

function cellValue(cell, type) {
  const text = cell ? cell.textContent.trim() : "";
  if (type === "num") {
    const n = parseFloat(text.replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : -Infinity;
  }
  return text.toLowerCase();
}

/* Animate a number from 0 to its target, preserving any suffix like % or km */
function countUp(el) {
  const raw = el.textContent.trim();
  const match = raw.match(/^([\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return;
  const target = parseFloat(match[1].replace(/,/g, ""));
  if (!isFinite(target)) return;
  const suffix = match[2] || "";
  const decimals = (match[1].split(".")[1] || "").length;
  const duration = 650;
  const start = performance.now();
  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = target * eased;
    el.textContent =
      val.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }) + suffix;
    if (p < 1) requestAnimationFrame(frame);
    else
      el.textContent =
        target.toLocaleString("en-IN", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) + suffix;
  }
  requestAnimationFrame(frame);
}

/* Live clock in the topbar */
function startClock() {
  const el = document.getElementById("topbar-clock");
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  tick();
  clearInterval(startClock._t);
  startClock._t = setInterval(tick, 1000);
}

/* Ripple feedback on any button click */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn");
  if (!btn) return;
  btn.classList.remove("rippling");
  void btn.offsetWidth;
  btn.classList.add("rippling");
});

/* ---- Lightweight dependency-free SVG charts (Section D bonus) ---- */
const chart = {
  /* line chart from [{label,value}] */
  line(data, { width = 520, height = 160, pad = 24 } = {}) {
    if (!data.length) return `<div class="empty-state">No data</div>`;
    const max = Math.max(1, ...data.map((d) => d.value));
    const stepX = (width - pad * 2) / Math.max(1, data.length - 1);
    const y = (v) => height - pad - (v / max) * (height - pad * 2);
    const pts = data.map((d, i) => [pad + i * stepX, y(d.value)]);
    const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${path} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pad},${height - pad} Z`;
    const dots = pts
      .map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="var(--ember-rust)"/>`)
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" class="mini-chart" preserveAspectRatio="none" role="img">
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="var(--line)" />
      <path d="${area}" fill="var(--ember-rust)" opacity="0.08" />
      <path d="${path}" fill="none" stroke="var(--ember-rust)" stroke-width="1.5" />
      ${dots}
    </svg>`;
  },
  /* horizontal bar chart from [{label,value}] */
  bars(data, { width = 520, barH = 22, gap = 10, pad = 4 } = {}) {
    if (!data.length) return `<div class="empty-state">No data</div>`;
    const max = Math.max(1, ...data.map((d) => d.value));
    const labelW = 120;
    const height = data.length * (barH + gap) + pad * 2;
    const rows = data
      .map((d, i) => {
        const y = pad + i * (barH + gap);
        const w = ((width - labelW - 60) * d.value) / max;
        return `
        <text x="0" y="${y + barH / 2 + 4}" class="chart-label">${escapeHtml(d.label)}</text>
        <rect x="${labelW}" y="${y}" width="${Math.max(1, w).toFixed(1)}" height="${barH}" rx="4" fill="var(--ember-rust)" opacity="0.75"/>
        <text x="${labelW + w + 6}" y="${y + barH / 2 + 4}" class="chart-val">${d.display ?? d.value}</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${width} ${height}" class="mini-chart" role="img">${rows}</svg>`;
  },
};
