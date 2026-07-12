import { useEffect, useState, FormEvent } from "react";
import { vehiclesApi } from "@/api/resources";
import { Vehicle } from "@/types";

const statusColors: Record<string, string> = {
  Available: "bg-green-100 text-green-800",
  "On Trip": "bg-blue-100 text-blue-800",
  "In Shop": "bg-yellow-100 text-yellow-800",
  Retired: "bg-slate-100 text-slate-800",
};

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    registration_number: "",
    name_model: "",
    type: "",
    max_load_capacity: 0,
    odometer: 0,
    acquisition_cost: 0,
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await vehiclesApi.list();
    setVehicles(data);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await vehiclesApi.create(form);
      setShowForm(false);
      setForm({ registration_number: "", name_model: "", type: "", max_load_capacity: 0, odometer: 0, acquisition_cost: 0 });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vehicle");
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Vehicles</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
        >
          {showForm ? "Cancel" : "+ Register Vehicle"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-2 gap-3">
          {error && <p className="col-span-2 text-red-600 text-sm">{error}</p>}
          <input placeholder="Registration Number" value={form.registration_number}
            onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
            className="border rounded px-3 py-2" required />
          <input placeholder="Name/Model" value={form.name_model}
            onChange={(e) => setForm({ ...form, name_model: e.target.value })}
            className="border rounded px-3 py-2" required />
          <input placeholder="Type (Van/Truck/...)" value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="border rounded px-3 py-2" required />
          <input type="number" placeholder="Max Load Capacity (kg)" value={form.max_load_capacity || ""}
            onChange={(e) => setForm({ ...form, max_load_capacity: Number(e.target.value) })}
            className="border rounded px-3 py-2" required />
          <input type="number" placeholder="Odometer" value={form.odometer || ""}
            onChange={(e) => setForm({ ...form, odometer: Number(e.target.value) })}
            className="border rounded px-3 py-2" />
          <input type="number" placeholder="Acquisition Cost" value={form.acquisition_cost || ""}
            onChange={(e) => setForm({ ...form, acquisition_cost: Number(e.target.value) })}
            className="border rounded px-3 py-2" />
          <button type="submit" className="col-span-2 bg-blue-600 text-white rounded-md py-2 font-medium hover:bg-blue-700">
            Register
          </button>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Reg. Number</th>
              <th className="px-4 py-2">Model</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Capacity (kg)</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="px-4 py-2 font-medium">{v.registration_number}</td>
                <td className="px-4 py-2">{v.name_model}</td>
                <td className="px-4 py-2">{v.type}</td>
                <td className="px-4 py-2">{v.max_load_capacity}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[v.status] || ""}`}>
                    {v.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
