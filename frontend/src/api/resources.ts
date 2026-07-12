import { apiRequest } from "./client";
import { Vehicle, Driver, Trip, DashboardKPIs } from "@/types";

export const vehiclesApi = {
  list: () => apiRequest<Vehicle[]>("/vehicles/"),
  create: (data: Omit<Vehicle, "id" | "status">) =>
    apiRequest<Vehicle>("/vehicles/", { method: "POST", body: data }),
};

export const driversApi = {
  list: () => apiRequest<Driver[]>("/drivers/"),
  create: (data: Omit<Driver, "id" | "status">) =>
    apiRequest<Driver>("/drivers/", { method: "POST", body: data }),
};

export const tripsApi = {
  list: () => apiRequest<Trip[]>("/trips/"),
  create: (data: { source: string; destination: string; vehicle_id: number; driver_id: number; cargo_weight: number; planned_distance: number }) =>
    apiRequest<Trip>("/trips/", { method: "POST", body: data }),
  dispatch: (tripId: number) => apiRequest<Trip>(`/trips/${tripId}/dispatch`, { method: "POST" }),
  complete: (tripId: number, actual_distance: number, fuel_consumed: number) =>
    apiRequest<Trip>(`/trips/${tripId}/complete`, { method: "POST", body: { actual_distance, fuel_consumed } }),
  cancel: (tripId: number) => apiRequest<Trip>(`/trips/${tripId}/cancel`, { method: "POST" }),
};

export const dashboardApi = {
  kpis: () => apiRequest<DashboardKPIs>("/dashboard/kpis"),
};
