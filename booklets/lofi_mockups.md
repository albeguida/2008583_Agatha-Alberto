# Lo-Fi UI Mockups

## Page 1: Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Mars Operations Dashboard          [● CONNECTED]  [● Simulator: OK]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SENSORS                                                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ Greenhouse   │ │ Water Tank   │ │ CO₂ Hall     │ │ Corridor     │      │
│  │ Temperature  │ │ Level        │ │              │ │ Pressure     │      │
│  │              │ │              │ │              │ │              │      │
│  │   22.4 °C    │ │   68.3 %     │ │  850 ppm     │ │  101.2 kPa  │      │
│  │              │ │   340 L      │ │              │ │              │      │
│  │  [status:ok] │ │ [status:ok]  │ │[status:warn] │ │ [status:ok]  │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ Entrance     │ │ Hydroponic   │ │ Air Quality  │ │ Air Quality  │      │
│  │ Humidity     │ │ pH           │ │ PM2.5        │ │ VOC          │      │
│  │              │ │              │ │              │ │              │      │
│  │   45.1 %     │ │    6.8 pH    │ │  12 ug/m³    │ │  0.3 ppm     │      │
│  │              │ │              │ │              │ │              │      │
│  │ [status:ok]  │ │ [status:ok]  │ │ [status:ok]  │ │ [status:ok]  │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│                                                                             │
│  ACTUATORS                                                                  │
│  ┌─────────────────────┐ ┌─────────────────────┐                           │
│  │ Cooling Fan         │ │ Entrance Humidifier  │                           │
│  │ State: OFF          │ │ State: ON            │                           │
│  │         [Turn ON]   │ │         [Turn OFF]   │                           │
│  └─────────────────────┘ └─────────────────────┘                           │
│  ┌─────────────────────┐ ┌─────────────────────┐                           │
│  │ Hall Ventilation    │ │ Habitat Heater       │                           │
│  │ State: OFF          │ │ State: OFF           │                           │
│  │         [Turn ON]   │ │         [Turn ON]    │                           │
│  └─────────────────────┘ └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
  Nav: [Dashboard]  [Rules]
```

---

## Page 2: Rules Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Mars Operations Dashboard          [● CONNECTED]  [● Simulator: OK]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AUTOMATION RULES                                            [+ New Rule]  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  #   Condition                                  Action       Delete │    │
│  │  ─── ──────────────────────────────────────── ──────────── ─────── │    │
│  │  1   IF greenhouse_temperature > 30            cooling_fan ON  [✕]  │    │
│  │  2   IF co2_hall >= 1000                       hall_ventilation ON [✕] │ │
│  │  3   IF entrance_humidity < 30                 entrance_humidifier ON [✕]│
│  │  4   IF water_tank_level <= 20                 (alert only)    [✕]  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  NEW RULE                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  IF  [greenhouse_temperature ▼]  [> ▼]  [___30___]                 │    │
│  │  THEN set  [cooling_fan ▼]  to  [ON ▼]                             │    │
│  │                                               [Cancel]  [Add Rule] │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
  Nav: [Dashboard]  [Rules]
```

---

## Connectivity Badge States

```
[● CONNECTED]     ← green dot, polling OK (last poll < 10 s ago)
[● DEGRADED]      ← yellow dot, last poll between 10–30 s ago
[✕ DISCONNECTED]  ← red dot, last poll > 30 s ago or error
```
