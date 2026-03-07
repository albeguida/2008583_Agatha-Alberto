/**
 * SensorGrid — displays the latest reading for all 8 sensors (US01, US02, US03).
 * Beautiful card design wired to real API data via sensors prop.
 */

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const Thermometer = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>
  </svg>
);
const Droplets = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/>
    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>
  </svg>
);
const Wind = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
    <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
    <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
  </svg>
);
const Beaker = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4.5 3h15"/>
    <path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/>
    <path d="M6 14h12"/>
  </svg>
);
const Waves = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
    <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
    <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
  </svg>
);
const Gauge = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m12 14 4-4"/>
    <path d="M3.34 19a10 10 0 1 1 17.32 0"/>
  </svg>
);
const CloudFog = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
    <path d="M16 17H7"/>
    <path d="M17 21H9"/>
  </svg>
);
const Flame = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>
);

// ── Sensor metadata ────────────────────────────────────────────────────────────
const SENSOR_CONFIG = {
  greenhouse_temperature: { label: "Greenhouse Temp",   Icon: Thermometer, min: 15,  max: 40   },
  entrance_humidity:      { label: "Entrance Humidity", Icon: Droplets,    min: 0,   max: 100  },
  co2_hall:               { label: "CO₂ Hall",          Icon: Wind,        min: 300, max: 1200 },
  hydroponic_ph:          { label: "Hydroponic pH",     Icon: Beaker,      min: 4,   max: 10   },
  water_tank_level:       { label: "Water Tank Level",  Icon: Waves,       min: 0,   max: 100  },
  corridor_pressure:      { label: "Corridor Pressure", Icon: Gauge,       min: 90,  max: 110  },
  air_quality_pm25:       { label: "Air Quality PM2.5", Icon: CloudFog,    min: 0,   max: 100  },
  air_quality_voc:        { label: "Air Quality VOC",   Icon: Flame,       min: 0,   max: 500  },
};

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  const id = `sg${color.replace("#", "")}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      <polygon fill={`url(#${id})`} points={`0,100 ${points} 100,100`} />
    </svg>
  );
}

// ── Rolling history store (module-level, persists across renders) ─────────────
const historyStore = {};

// ── Single sensor card ────────────────────────────────────────────────────────
function SensorCard({ sensorId, data }) {
  const config = SENSOR_CONFIG[sensorId];
  if (!config) return null;
  const { label, Icon, min, max } = config;

  const isWarning = data?.status === "warning";

  const colors = isWarning
    ? { border: "border-amber-500/30",   bg: "bg-amber-500/10",   text: "text-amber-400",   glow: "bg-amber-500",   bar: "bg-amber-500",   chart: "#fbbf24" }
    : { border: "border-emerald-500/30", bg: "bg-emerald-500/10", text: "text-emerald-400", glow: "bg-emerald-500", bar: "bg-emerald-500", chart: "#34d399" };

  // Update rolling history
  if (data?.value !== undefined) {
    if (!historyStore[sensorId]) historyStore[sensorId] = [];
    const last = historyStore[sensorId].at(-1);
    if (last !== data.value) {
      historyStore[sensorId].push(data.value);
      if (historyStore[sensorId].length > 20) historyStore[sensorId].shift();
    }
  }
  const history = historyStore[sensorId] ?? [];

  const progress = data
    ? Math.min(100, Math.max(0, ((data.value - min) / (max - min)) * 100))
    : 0;

  return (
    <div className={`relative overflow-hidden rounded-xl border ${colors.border} ${colors.bg} backdrop-blur-sm p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20`}>
      {/* Background glow */}
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-20 ${colors.glow}`} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg ${colors.bg} border ${colors.border}`}>
          <Icon className={colors.text} />
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isWarning ? "bg-amber-400" : "bg-emerald-400"} animate-pulse`} />
          {isWarning ? "Warning" : "Normal"}
        </div>
      </div>

      {/* Value */}
      <div className="mb-4">
        <p className="text-sm text-slate-400 mb-1">{label}</p>
        {data ? (
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold tracking-tight ${colors.text}`}>
              {typeof data.value === "number" ? data.value.toFixed(2) : data.value}
            </span>
            <span className="text-sm text-slate-500">{data.unit}</span>
          </div>
        ) : (
          <span className="text-slate-500 text-sm animate-pulse">Awaiting data…</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="h-10">
        <Sparkline data={history.length >= 2 ? history : null} color={colors.chart} />
      </div>

      {/* Timestamp */}
      {data && (
        <p className="text-xs text-slate-500 mt-2">
          {new Date(data.captured_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────
export default function SensorGrid({ sensors }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-slate-500 mb-4">
        Sensors
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.keys(SENSOR_CONFIG).map((id) => (
          <SensorCard key={id} sensorId={id} data={sensors[id] ?? null} />
        ))}
      </div>
    </section>
  );
}