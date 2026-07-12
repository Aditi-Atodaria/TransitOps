# TransitOps — Smart Transport Operations Platform

An end-to-end transport operations platform that digitizes vehicle, driver, dispatch, maintenance, and expense management while enforcing business rules and providing operational insights.

Built for an 8-hour hackathon to replace spreadsheet- and logbook-based fleet management with a centralized, rule-enforced system.

---

## Problem Statement

Many logistics companies still rely on spreadsheets and manual logbooks to manage transport operations. This leads to:

- Scheduling conflicts
- Underutilized vehicles
- Missed maintenance
- Expired driver licenses going unnoticed
- Inaccurate expense tracking
- Poor operational visibility

**TransitOps** centralizes the complete lifecycle of transport operations — from vehicle registration and driver management to dispatching, maintenance, fuel logging, and analytics.

---

## Target Users

| Role | Responsibilities |
|---|---|
| **Fleet Manager** | Oversees fleet assets, maintenance, vehicle lifecycle, and operational efficiency |
| **Driver** | Creates trips, assigns vehicles and drivers, monitors active deliveries |
| **Safety Officer** | Ensures driver compliance, tracks license validity, monitors safety scores |
| **Financial Analyst** | Reviews operational expenses, fuel consumption, maintenance costs, and profitability |

---

## Features

### Authentication
- Secure email/password login
- Role-Based Access Control (RBAC)
- Only authenticated users can access the application

### Dashboard
- KPIs: Active Vehicles, Available Vehicles, Vehicles in Maintenance, Active Trips, Pending Trips, Drivers On Duty, Fleet Utilization (%)
- Filters by vehicle type, status, and region

### Vehicle Registry
- Master list of vehicles: Registration Number (unique), Vehicle Name/Model, Type, Maximum Load Capacity, Odometer, Acquisition Cost, Status
- Status values: `Available`, `On Trip`, `In Shop`, `Retired`

### Driver Management
- Driver profiles: Name, License Number, License Category, License Expiry Date, Contact Number, Safety Score, Status
- Status values: `Available`, `On Trip`, `Off Duty`, `Suspended`

### Trip Management
- Create trips: source, destination, available vehicle, available driver, cargo weight, planned distance
- Trip lifecycle: `Draft` → `Dispatched` → `Completed` → `Cancelled`

### Maintenance
- Create maintenance records for vehicles
- Adding a vehicle to an active maintenance log automatically switches its status to `In Shop`, removing it from the driver's selection pool

### Fuel & Expense Management
- Record fuel logs (liters, cost, date) and other expenses (tolls, maintenance, etc.)
- Automatically computes total operational cost (Fuel + Maintenance) per vehicle

### Reports & Analytics
- Fuel Efficiency (Distance / Fuel)
- Fleet Utilization
- Operational Cost
- Vehicle ROI: `(Revenue - (Maintenance + Fuel)) / Acquisition Cost`
- CSV export (PDF export optional)

---

## Mandatory Business Rules

- Vehicle registration number must be unique
- Retired or In Shop vehicles must never appear in the dispatch selection
- Drivers with expired licenses or Suspended status cannot be assigned to trips
- A driver or vehicle already marked On Trip cannot be assigned to another trip
- Cargo Weight must not exceed the vehicle's maximum load capacity
- Dispatching a trip automatically changes both vehicle and driver status to `On Trip`
- Completing a trip automatically changes both vehicle and driver status back to `Available`
- Cancelling a dispatched trip restores the vehicle and driver to `Available`
- Creating an active maintenance record automatically changes vehicle status to `In Shop`
- Closing maintenance restores the vehicle to `Available` (unless retired)

---

## Example Workflow

1. Register a vehicle `Van-05` with a maximum capacity of 500 kg. Status = `Available`.
2. Register driver `Alex` with a valid driving license.
3. Create a trip with Cargo Weight = 450 kg.
4. System validates 450 kg ≤ 500 kg and allows dispatch.
5. Vehicle and Driver status automatically become `On Trip`.
6. Complete the trip by entering the final odometer and fuel consumed.
7. System marks both Vehicle and Driver as `Available`.
8. Create a maintenance record (e.g., Oil Change). Vehicle status automatically becomes `In Shop` and is hidden from dispatch.
9. Reports update operational cost and fuel efficiency based on the latest trip and fuel log.

---

## Database Entities

- Users
- Roles
- Vehicles
- Drivers
- Trips
- Maintenance Logs
- Fuel Logs
- Expenses

---

## Tech Stack

**Frontend:** React + Vite + TypeScript, Tailwind CSS, shadcn/ui
**Backend:** Flask (Python) 
**Database:** SQLite
**ORM:** SQLModel / SQLAlchemy 2.0 
**Auth:** JWT-based authentication with RBAC middleware
**Charts:** Recharts
**Export:** CSV (built-in), PDF via ReportLab/WeasyPrint (optional)

---

## Mandatory Deliverables

- [x] Responsive web interface
- [x] Authentication with RBAC
- [x] CRUD for Vehicles and Drivers
- [x] Trip Management with validations
- [x] Automatic status transitions
- [x] Maintenance workflow
- [x] Fuel & Expense tracking
- [x] Dashboard with KPIs
- [x] Charts and visual analytics

## Bonus Features

- [ ] PDF export
- [ ] Email reminders for expiring licenses
- [ ] Vehicle document management
- [ ] Search, filters, and sorting
- [ ] Dark mode

---

## Getting Started

### Prerequisites
- Python 3.11+ (or Node.js 18+)
- PostgreSQL 14+

### Backend Setup
```bash
# Clone the repository
git clone <repo-url>
cd transitops/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, etc.

# Run migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd transitops/frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173` (frontend) and `http://localhost:8000` (backend API docs at `/docs`).

---

## License

Built for hackathon purposes.
