# TransitOps — MVP

A working MVP of the TransitOps smart transport operations platform: vehicle registry, driver management, trip dispatch with full business-rule enforcement, maintenance workflow, fuel/expense tracking, a KPI dashboard, and per-vehicle reports (fuel efficiency, operational cost, ROI).

**Stack used for this MVP** (simplified from the full spec to ship fast): Flask + SQLAlchemy + SQLite on the backend, and a dependency-free HTML/CSS/JS frontend (no build step) instead of React/Vite — same idea your team used for the qualifier, so it runs anywhere Python 3 is installed with zero npm setup.

## What's included

- **Auth** — email/password with JWT, 4 roles (Fleet Manager, Driver, Safety Officer, Financial Analyst) and role-gated actions
- **Vehicle Registry** — CRUD, unique reg numbers, status lifecycle (Available / On Trip / In Shop / Retired)
- **Driver Management** — CRUD, license expiry tracking, status lifecycle (Available / On Trip / Off Duty / Suspended)
- **Trip Management** — Draft → Dispatched → Completed / Cancelled, with every mandatory rule enforced server-side:
  - cargo weight can't exceed vehicle max load
  - retired/in-shop vehicles and suspended/expired-license drivers can't be dispatched
  - a vehicle or driver already `On Trip` can't be double-booked
  - dispatch/complete/cancel automatically flip vehicle & driver status
- **Maintenance** — opening a record auto-sets the vehicle to `In Shop` (hidden from dispatch); closing it restores `Available` (unless retired)
- **Fuel & Expense logs** — per-vehicle, feeds the cost reports
- **Dashboard** — live KPI board (active/available/in-maintenance vehicles, active/pending trips, drivers on duty, fleet utilization %)
- **Reports** — fuel efficiency (km/L), operational cost, revenue, ROI per vehicle, plus CSV export

## Project structure

```
transitops/
  backend/
    app.py            # Flask app + all API routes + business rules
    models.py          # SQLAlchemy models
    auth.py             # JWT helpers
    seed.py              # demo data (4 users, 4 vehicles, 4 drivers)
    requirements.txt
  frontend/
    index.html
    app.js              # all UI logic, calls the API with fetch
    styles.css
```

## Running it

**Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
python seed.py        # creates transitops.db with demo users/vehicles/drivers
python app.py          # runs on http://localhost:8000
```

**Frontend** (separate terminal, no build step)
```bash
cd frontend
python -m http.server 5173
```
Open `http://localhost:5173`. It talks to the API at `http://localhost:8000/api` by default — change `API_BASE` at the top of `app.js` (or set `window.TRANSITOPS_API_BASE` before the script loads) if you deploy the backend elsewhere.

**Demo logins** (password for all: `password123`)
| Email | Role |
|---|---|
| manager@transitops.dev | Fleet Manager |
| safety@transitops.dev | Safety Officer |
| finance@transitops.dev | Financial Analyst |
| driver@transitops.dev | Driver |

## What's deliberately cut for the MVP (vs. the full README spec)

- Frontend is plain HTML/CSS/JS instead of React/Vite/TS/Tailwind/shadcn — same functionality, zero build tooling, faster to demo and easier for teammates to jump into mid-hackathon.
- SQLite instead of Postgres (spec says both; SQLite needs no setup).
- PDF export, email reminders for expiring licenses, and dark mode are left as the bonus items they were in the spec — CSV export and license-expiry *flags* are in, the rest is easy to bolt on if you have time left.
- No pagination/search/sort yet on the tables — fine for a demo-sized dataset, first thing to add if judges load-test it.

## Business rules — where they live

All rule enforcement is server-side in `backend/app.py`, mainly in `dispatch_trip()`, `complete_trip()`, `create_maintenance()`, and `close_maintenance()` — that's the part worth walking through if a judge asks "show me where you prevent double-booking."
