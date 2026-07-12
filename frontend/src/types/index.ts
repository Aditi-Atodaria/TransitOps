// Keep these in sync with backend/app/schemas.py manually.
// Whoever changes a Pydantic schema updates this file in the same commit.

export interface User {
  id: number;
  name: string;
  email: string;
  role: "FleetManager" | "Driver" | "SafetyOfficer" | "FinancialAnalyst";
  status: string;
}

export interface Vehicle {
  id: number;
  registration_number: string;
  name_model: string;
  type: string;
  max_load_capacity: number;
  odometer: number;
  acquisition_cost: number;
  status: "Available" | "On Trip" | "In Shop" | "Retired";
}

export interface Driver {
  id: number;
  name: string;
  license_number: string;
  license_category?: string;
  license_expiry_date: string; // ISO date
  contact_number?: string;
  safety_score: number;
  status: "Available" | "On Trip" | "Off Duty" | "Suspended";
}

export interface Trip {
  id: number;
  source: string;
  destination: string;
  vehicle_id: number;
  driver_id: number;
  cargo_weight: number;
  planned_distance: number;
  actual_distance: number | null;
  fuel_consumed: number | null;
  status: "Draft" | "Dispatched" | "Completed" | "Cancelled";
  created_at: string;
}

export interface MaintenanceLog {
  id: number;
  vehicle_id: number;
  description: string;
  cost: number;
  status: "Active" | "Closed";
  created_at: string;
  closed_at: string | null;
}

export interface DashboardKPIs {
  active_vehicles: number;
  available_vehicles: number;
  vehicles_in_maintenance: number;
  active_trips: number;
  pending_trips: number;
  drivers_on_duty: number;
  fleet_utilization_pct: number;
  total_vehicles: number;
}
