/* ---------------------------------------------------------------------- */
/* app.js — shell orchestration: auth, role-aware nav, routing, boot        */
/* Loaded last. Wires the login/register forms, builds the nav for the      */
/* current role, routes tab clicks, and dispatches to the view renderers.   */
/* ---------------------------------------------------------------------- */

/* ---- Auth screen transitions ---- */
function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("user-name").textContent = state.user.name;
  document.getElementById("user-role").textContent = state.user.role.replace(/_/g, " ");
  buildNav();
  startClock();
  setTab(defaultTabForRole());
}

function showLogin() {
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
}

/* Build the tab bar for the current role (conditional visibility, not just
   403 on click). */
function buildNav() {
  const nav = document.getElementById("tabnav");
  nav.innerHTML = navForRole()
    .map((n) => `<button class="tab-btn" data-tab="${n.tab}">${escapeHtml(n.label)}</button>`)
    .join("");
}

/* ---- Login / register forms ---- */
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

document.querySelectorAll(".demo-hint-row").forEach((row) => {
  row.title = "Click to fill login";
  row.addEventListener("click", () => {
    const email = row.querySelector("b")?.textContent.trim();
    if (!email) return;
    document.querySelector('.login-tab[data-mode="login"]').click();
    document.getElementById("login-email").value = email;
    document.getElementById("login-password").value = "password123";
    document.getElementById("login-password").focus();
  });
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  showLogin();
});

/* ---- Tab routing ---- */
document.getElementById("tabnav").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  setTab(btn.dataset.tab);
});

function setTab(tab) {
  // guard: never route to a tab this role can't see
  if (!tab || !canViewTab(tab)) tab = defaultTabForRole();
  state.tab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  render();
}

const VIEW_RENDERERS = {
  dashboard: renderDashboard,
  vehicles: renderVehicles,
  drivers: renderDrivers,
  compliance: renderCompliance,
  trips: renderTrips,
  maintenance: renderMaintenance,
  fuel: renderFuel,
  reports: renderReports,
};

async function render() {
  const main = document.getElementById("main-content");
  const label = (navForRole().find((n) => n.tab === state.tab) || {}).label || state.tab;
  main.innerHTML = `<div class="loading-wrap"><div class="spinner"></div><div class="loading-label">Loading ${escapeHtml(label)}</div></div>`;
  const renderer = VIEW_RENDERERS[state.tab];
  if (!renderer) {
    main.innerHTML = `<div class="empty-state">Unknown view.</div>`;
    return;
  }
  try {
    await renderer(main);
    enhanceView(main);
  } catch (err) {
    main.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
  }
}

/* ---- Boot ---- */
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
