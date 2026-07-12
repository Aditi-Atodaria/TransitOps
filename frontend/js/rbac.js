/* ---------------------------------------------------------------------- */
/* rbac.js — role-aware navigation & action permissions                    */
/* Single source of truth for "what can this role see / do", mirroring the  */
/* backend @require_role checks. The 403 is the last line of defense; this   */
/* keeps forbidden nav tabs and action buttons UX-invisible.                */
/* ---------------------------------------------------------------------- */

/* Nav tabs, in display order. `roles` lists which roles may open the tab.
   `label` may vary per role (e.g. Driver sees "My Trips"). */
const NAV = [
  { tab: "dashboard",   label: "Dashboard",        roles: ["fleet_manager", "financial_analyst"] },
  { tab: "vehicles",    label: "Vehicles",         roles: ["fleet_manager"] },
  { tab: "drivers",     label: "Drivers",          roles: ["fleet_manager", "safety_officer"] },
  { tab: "compliance",  label: "Compliance",       roles: ["fleet_manager", "safety_officer"] },
  { tab: "trips",       label: "Trips",            roles: ["fleet_manager", "driver"],
    labelByRole: { driver: "My Trips" } },
  { tab: "maintenance", label: "Maintenance",      roles: ["fleet_manager"] },
  { tab: "fuel",        label: "Fuel & Expenses",  roles: ["fleet_manager", "driver", "financial_analyst"] },
  { tab: "reports",     label: "Reports",          roles: ["fleet_manager", "financial_analyst"] },
];

/* Where each role lands on login. */
const DEFAULT_TAB = {
  fleet_manager: "dashboard",
  driver: "trips",
  safety_officer: "compliance",
  financial_analyst: "reports",
};

/* Action permissions — keyed slug -> roles allowed. Mirrors backend routes. */
const PERMISSIONS = {
  "vehicle.manage":   ["fleet_manager"],
  "vehicle.archive":  ["fleet_manager"],
  "driver.manage":    ["fleet_manager", "safety_officer"],
  "driver.incident":  ["safety_officer", "fleet_manager"],
  "trip.manage":      ["fleet_manager", "driver"],
  "maintenance.manage": ["fleet_manager"],
  "fuel.log":         ["fleet_manager", "driver"],
  "expense.manage":   ["fleet_manager", "financial_analyst"],
  "document.manage":  ["fleet_manager"],
};

function currentRole() {
  return state.user ? state.user.role : null;
}

/* True if the current user's role may perform `perm`. */
function can(perm) {
  const roles = PERMISSIONS[perm] || [];
  return roles.includes(currentRole());
}

/* True if the current role may open `tab`. */
function canViewTab(tab) {
  const entry = NAV.find((n) => n.tab === tab);
  return !!entry && entry.roles.includes(currentRole());
}

function navForRole() {
  const role = currentRole();
  return NAV.filter((n) => n.roles.includes(role)).map((n) => ({
    tab: n.tab,
    label: (n.labelByRole && n.labelByRole[role]) || n.label,
  }));
}

function defaultTabForRole() {
  const role = currentRole();
  const preferred = DEFAULT_TAB[role];
  if (preferred && canViewTab(preferred)) return preferred;
  const nav = navForRole();
  return nav.length ? nav[0].tab : null;
}
