import { useEffect, useState } from "react";
import { dashboardApi } from "@/api/resources";
import { DashboardKPIs } from "@/types";
import { useAuth } from "@/context/AuthContext";

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-slate-500 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    dashboardApi.kpis().then(setKpis);
  }, []);

  if (!kpis) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Dashboard</h1>
        {user && (
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500 capitalize">
              {user.role.replace("_", " ")}
            </p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Vehicles" value={kpis.active_vehicles} />
        <KpiCard label="Available Vehicles" value={kpis.available_vehicles} />
        <KpiCard label="In Maintenance" value={kpis.vehicles_in_maintenance} />
        <KpiCard label="Active Trips" value={kpis.active_trips} />
        <KpiCard label="Pending Trips" value={kpis.pending_trips} />
        <KpiCard label="Drivers On Duty" value={kpis.drivers_on_duty} />
        <KpiCard
          label="Fleet Utilization"
          value={`${kpis.fleet_utilization_pct}%`}
        />
        <KpiCard label="Total Vehicles" value={kpis.total_vehicles} />
      </div>
    </div>
  );
}
