/**
 * RulesPage — list, create, and delete automation rules (US04, US05, US08).
 */
import { useEffect, useState } from "react";
import { Trash2, Plus } from "lucide-react";

const SENSORS = [
  "greenhouse_temperature",
  "entrance_humidity",
  "co2_hall",
  "hydroponic_ph",
  "water_tank_level",
  "corridor_pressure",
  "air_quality_pm25",
  "air_quality_voc",
];
const ACTUATORS = ["cooling_fan", "entrance_humidifier", "hall_ventilation", "habitat_heater"];
const OPERATORS = ["<", "<=", "=", ">", ">="];

const EMPTY_FORM = { sensor_id: SENSORS[0], operator: ">", threshold: "", actuator_id: ACTUATORS[0], action: "ON" };

export default function RulesPage({ apiBase }) {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const fetchRules = async () => {
    const res = await fetch(`${apiBase}/rules`);
    setRules(await res.json());
  };

  useEffect(() => { fetchRules(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.threshold) { setError("Threshold is required"); return; }
    try {
      const res = await fetch(`${apiBase}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, threshold: parseFloat(form.threshold) }),
      });
      if (!res.ok) { setError((await res.json()).detail ?? "Error"); return; }
      setForm(EMPTY_FORM);
      fetchRules();
    } catch {
      setError("Network error");
    }
  };

  const handleDelete = async (id) => {
    await fetch(`${apiBase}/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  return (
    <section>
      <h2>Automation Rules</h2>

      {/* Active rules table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={th}>#</th>
            <th style={th}>Condition</th>
            <th style={th}>Action</th>
            <th style={th}>Created</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: "center", padding: 16, color: "#9ca3af" }}>No rules yet.</td></tr>
          )}
          {rules.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={td}>{r.id}</td>
              <td style={td}>
                IF <strong>{r.sensor_id}</strong> {r.operator} <strong>{r.threshold}</strong>
              </td>
              <td style={td}>
                set <strong>{r.actuator_id}</strong> to <strong>{r.action}</strong>
              </td>
              <td style={td}>{new Date(r.created_at).toLocaleString()}</td>
              <td style={td}>
                <button
                  onClick={() => handleDelete(r.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* New rule form */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, maxWidth: 600 }}>
        <h3 style={{ marginTop: 0 }}>New Rule</h3>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <form onSubmit={handleCreate} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <label>
            IF sensor
            <select value={form.sensor_id} onChange={(e) => setForm({ ...form, sensor_id: e.target.value })} style={sel}>
              {SENSORS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>
            operator
            <select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} style={sel}>
              {OPERATORS.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label>
            value
            <input
              type="number"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              style={{ ...sel, width: 80 }}
              placeholder="e.g. 30"
            />
          </label>
          <label>
            THEN actuator
            <select value={form.actuator_id} onChange={(e) => setForm({ ...form, actuator_id: e.target.value })} style={sel}>
              {ACTUATORS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>
            to
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} style={sel}>
              <option>ON</option>
              <option>OFF</option>
            </select>
          </label>
          <button type="submit" style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px", background: "#3b82f6", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
            <Plus size={14} /> Add Rule
          </button>
        </form>
      </div>
    </section>
  );
}

const th = { textAlign: "left", padding: "8px 12px", fontSize: 13 };
const td = { padding: "8px 12px", fontSize: 13 };
const sel = { display: "block", marginTop: 2, padding: "4px 6px", borderRadius: 4, border: "1px solid #d1d5db" };
