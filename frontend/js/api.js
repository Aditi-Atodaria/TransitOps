/* ---------------------------------------------------------------------- */
/* api.js — the backend-facing layer                                       */
/* Session state + the single fetch helper used by every view. Kept free    */
/* of any DOM/UI code so the "talk to the server" concern lives on its own.  */
/* ---------------------------------------------------------------------- */

const state = {
  token: localStorage.getItem("transitops_token") || null,
  user: JSON.parse(localStorage.getItem("transitops_user") || "null"),
  tab: null,
  cache: {
    vehicles: [],
    drivers: [],
    trips: [],
    maintenance: [],
    fuelLogs: [],
    expenses: [],
  },
};

/* Core request: walks the candidate bases, returns { data, res }. */
async function apiRaw(path, options = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    options.headers || {},
  );
  if (options.body instanceof FormData) delete headers["Content-Type"];
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  let lastError = null;
  for (const base of API_BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        /* no body */
      }
      if (!res.ok) {
        if (res.status === 404) {
          lastError = new Error(`Route not found at ${base}${path}`);
          continue;
        }
        throw new Error((data && data.error) || `Request failed (${res.status})`);
      }
      return { data, res, base };
    } catch (err) {
      if (err && (err.name === "TypeError" || /fetch/i.test(err.message))) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw (
    lastError ||
    new Error(
      "Unable to reach the TransitOps API. Make sure the backend is running on port 8000.",
    )
  );
}

/* Returns the parsed JSON body directly (the common case). */
async function api(path, options = {}) {
  const { data } = await apiRaw(path, options);
  return data;
}

/* For paginated list endpoints: returns { items, total } where total comes
   from the X-Total-Count response header (falls back to items.length). */
async function apiList(path, options = {}) {
  const { data, res } = await apiRaw(path, options);
  const items = Array.isArray(data) ? data : [];
  const header = res.headers.get("X-Total-Count");
  const total = header != null ? parseInt(header, 10) : items.length;
  return { items, total: isFinite(total) ? total : items.length };
}

/* Resolve the base actually reachable (used by raw fetch e.g. file download). */
async function apiBase() {
  const { base } = await apiRaw("/health");
  return base;
}

/* ---------------------------------------------------------------------- */
/* Session persistence                                                     */
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
