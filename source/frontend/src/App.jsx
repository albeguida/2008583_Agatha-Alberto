/**
 * Mars Operations Dashboard – Root App
 */
import { useEffect, useState } from "react";
import { Activity, Wifi, WifiOff, LayoutDashboard, Sliders } from "lucide-react";
import SensorGrid from "./components/SensorGrid";
import ActuatorPanel from "./components/ActuatorPanel";
import RulesPage from "./components/RulesPage";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/sensors";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sensors, setSensors] = useState({});
  const [connected, setConnected] = useState(false);
  const [simStatus, setSimStatus] = useState("unknown");

  useEffect(() => {
    let ws;
    let reconnectTimer;
    function connect() {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        setSensors((prev) => ({ ...prev, [event.sensor_id]: event }));
      };
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => { clearTimeout(reconnectTimer); ws?.close(); };
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sensorsRes, healthRes] = await Promise.all([
          fetch(`${API_BASE}/sensors`),
          fetch(`${API_BASE}/health`),
        ]);
        const sensorsData = await sensorsRes.json();
        setSensors((prev) => ({ ...prev, ...sensorsData }));
        const health = await healthRes.json();
        setSimStatus(health.status ?? "unknown");
      } catch {
        setSimStatus("error");
      }
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const simColor =
    simStatus === "ok" ? "text-emerald-400" :
    simStatus === "error" ? "text-red-400" :
    "text-amber-400";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 tracking-tight">
              Mars Operations Dashboard
            </h1>
            <p className="text-slate-500 text-sm mt-1 tracking-widest uppercase">
              Habitat Control System · SpaceY 2036
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connected ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi size={14} /> Connected
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <WifiOff size={14} /> Reconnecting…
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 text-sm">
              <Activity size={14} />
              Simulator: <span className={`font-bold ${simColor}`}>{simStatus.toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Nav */}
        <nav className="flex gap-1 mb-8 border-b border-slate-800">
          <button
            onClick={() => setPage("dashboard")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold tracking-widest uppercase transition-colors border-b-2 -mb-px ${
              page === "dashboard"
                ? "text-teal-400 border-teal-400"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button
            onClick={() => setPage("rules")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold tracking-widest uppercase transition-colors border-b-2 -mb-px ${
              page === "rules"
                ? "text-teal-400 border-teal-400"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <Sliders size={14} /> Automation Rules
          </button>
        </nav>

        {/* Pages */}
        {page === "dashboard" && (
          <>
            <SensorGrid sensors={sensors} />
            <ActuatorPanel apiBase={API_BASE} />
          </>
        )}
        {page === "rules" && <RulesPage apiBase={API_BASE} />}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-slate-600">
          <p>Mars Operations Dashboard · SpaceY 2036</p>
          <p>All systems nominal</p>
        </footer>
      </div>
    </div>
  );
}