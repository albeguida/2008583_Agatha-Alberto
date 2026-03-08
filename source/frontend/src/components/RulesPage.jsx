/**
 * RulesPage — list, create, and delete automation rules (US04, US05, US08).
 * Fully styled to match the Mars Operations Dashboard dark theme.
 */
import { useEffect, useState } from "react";
import { Trash2, Plus, Zap, AlertCircle } from "lucide-react";

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

const SENSOR_LABELS = {
  greenhouse_temperature: "Greenhouse Temp",
  entrance_humidity:      "Entrance Humidity",
  co2_hall:               "CO₂ Hall",
  hydroponic_ph:          "Hydroponic pH",
  water_tank_level:       "Water Tank Level",
  corridor_pressure:      "Corridor Pressure",
  air_quality_pm25:       "Air Quality PM2.5",
  air_quality_voc:        "Air Quality VOC",
};

const ACTUATOR_LABELS = {
  cooling_fan:          "Cooling Fan",
  entrance_humidifier:  "Entrance Humidifier",
  hall_ventilation:     "Hall Ventilation",
  habitat_heater:       "Habitat Heater",
};

const EMPTY_FORM = {
  sensor_id:    SENSORS[0],
  operator:     ">",
  threshold:    "",
  actuator_id:  ACTUATORS[0],
  action:       "ON",
};

// ── Shared select/input style classes ─────────────────────────────────────────
const inputCls =
  "bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-colors";

export default function RulesPage({ apiBase }) {
  const [rules, setRules]   = useState([]);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await fetch(`${apiBase}/rules`);
      setRules(await res.json());
    } catch {
      // silently fail — backend may not be up yet
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.threshold) { setError("Threshold value is required."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, threshold: parseFloat(form.threshold) }),
      });
      if (!res.ok) { setError((await res.json()).detail ?? "Failed to create rule."); return; }
      setForm(EMPTY_FORM);
      fetchRules();
    } catch {
      setError("Network error — could not reach the backend.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    await fetch(`${apiBase}/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  return (
    <section>
      {/* Section header */}
      <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-6">
        Automation Rules
      </h2>

      {/* ── Active rules ───────────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 px-5 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold tracking-widest uppercase text-slate-500">
            <span>#</span>
            <span>Condition</span>
            <span>Action</span>
            <span>Created</span>
            <span></span>
          </div>

          {/* Empty state */}
          {rules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Zap size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No automation rules yet.</p>
              <p className="text-xs mt-1 text-slate-600">Create one below to get started.</p>
            </div>
          )}

          {/* Rule rows */}
          {rules.map((r, idx) => (
            <div
              key={r.id}
              className={`grid grid-cols-[auto_1fr_1fr_auto_auto] gap-4 items-center px-5 py-4 text-sm transition-colors hover:bg-slate-800/30 ${
                idx !== rules.length - 1 ? "border-b border-slate-800/60" : ""
              }`}
            >
              {/* ID */}
              <span className="text-slate-600 font-mono text-xs">{r.id}</span>

              {/* Condition */}
              <span className="text-slate-300">
                IF{" "}
                <span className="text-teal-400 font-semibold">
                  {SENSOR_LABELS[r.sensor_id] ?? r.sensor_id}
                </span>{" "}
                <span className="text-slate-400 font-mono">{r.operator}</span>{" "}
                <span className="text-amber-400 font-semibold">{r.threshold}</span>
              </span>

              {/* Action */}
              <span className="text-slate-300">
                set{" "}
                <span className="text-cyan-400 font-semibold">
                  {ACTUATOR_LABELS[r.actuator_id] ?? r.actuator_id}
                </span>{" "}
                to{" "}
                <span
                  className={`font-bold ${
                    r.action === "ON" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {r.action}
                </span>
              </span>

              {/* Timestamp */}
              <span className="text-slate-600 text-xs whitespace-nowrap">
                {new Date(r.created_at).toLocaleString()}
              </span>

              {/* Delete */}
              <button
                onClick={() => handleDelete(r.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Delete rule"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── New rule form ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-5 flex items-center gap-2">
          <Plus size={15} className="text-teal-400" />
          New Rule
        </h3>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <form onSubmit={handleCreate}>
          {/* Responsive rule builder row */}
          <div className="flex flex-wrap items-end gap-3">

            {/* IF label */}
            <span className="text-slate-500 text-sm font-mono pb-2">IF</span>

            {/* Sensor */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-500 tracking-widest uppercase">Sensor</span>
              <select
                className={inputCls}
                value={form.sensor_id}
                onChange={(e) => setForm({ ...form, sensor_id: e.target.value })}
              >
                {SENSORS.map((s) => (
                  <option key={s} value={s}>{SENSOR_LABELS[s]}</option>
                ))}
              </select>
            </label>

            {/* Operator */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-500 tracking-widest uppercase">Op</span>
              <select
                className={`${inputCls} w-20`}
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
              >
                {OPERATORS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>

            {/* Threshold */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-500 tracking-widest uppercase">Value</span>
              <input
                type="number"
                className={`${inputCls} w-28`}
                placeholder="e.g. 30"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
              />
            </label>

            {/* THEN label */}
            <span className="text-slate-500 text-sm font-mono pb-2">THEN set</span>

            {/* Actuator */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-500 tracking-widest uppercase">Actuator</span>
              <select
                className={inputCls}
                value={form.actuator_id}
                onChange={(e) => setForm({ ...form, actuator_id: e.target.value })}
              >
                {ACTUATORS.map((a) => (
                  <option key={a} value={a}>{ACTUATOR_LABELS[a]}</option>
                ))}
              </select>
            </label>

            {/* to label */}
            <span className="text-slate-500 text-sm font-mono pb-2">to</span>

            {/* Action */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-slate-500 tracking-widest uppercase">State</span>
              <select
                className={`${inputCls} w-20`}
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
              >
                <option value="ON">ON</option>
                <option value="OFF">OFF</option>
              </select>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-sm font-semibold transition-colors mb-0.5"
            >
              <Plus size={15} />
              {loading ? "Adding…" : "Add Rule"}
            </button>
          </div>

          {/* Preview */}
          {form.threshold && (
            <p className="mt-4 text-xs text-slate-500 font-mono bg-slate-800/50 rounded-lg px-4 py-2.5 border border-slate-700/50">
              IF{" "}
              <span className="text-teal-400">{SENSOR_LABELS[form.sensor_id]}</span>{" "}
              <span className="text-slate-300">{form.operator}</span>{" "}
              <span className="text-amber-400">{form.threshold}</span>{" "}
              → set{" "}
              <span className="text-cyan-400">{ACTUATOR_LABELS[form.actuator_id]}</span>{" "}
              to{" "}
              <span className={form.action === "ON" ? "text-emerald-400" : "text-red-400"}>
                {form.action}
              </span>
            </p>
          )}
        </form>
      </div>
    </section>
  );
}