"""
Ingestion Service
-----------------
Polls the Mars IoT Simulator REST API every POLL_INTERVAL_SECONDS seconds,
normalises each sensor payload to the `normalized.v1` schema, and publishes
the result to the Redis Pub/Sub channel `mars.sensors`.

Also updates the Redis key `mars.health` with polling status for US10.
"""
import asyncio
import json
import os
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI

# ── Config ────────────────────────────────────────────────────────────────────
SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080/api")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "5"))

SENSORS = [
    "greenhouse_temperature",
    "entrance_humidity",
    "co2_hall",
    "hydroponic_ph",
    "water_tank_level",
    "corridor_pressure",
    "air_quality_pm25",
    "air_quality_voc",
]

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Mars Ingestion Service")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def startup():
    asyncio.create_task(poll_loop())


# ── Normalisation ─────────────────────────────────────────────────────────────

def normalise(sensor_id: str, payload: dict) -> dict:
    """Convert any simulator REST payload to normalized.v1."""
    base = {
        "schema_version": "normalized.v1",
        "sensor_id": sensor_id,
        "captured_at": payload.get("captured_at"),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "status": payload.get("status", "ok"),
    }

    # rest.scalar.v1 — greenhouse_temperature, entrance_humidity, co2_hall, corridor_pressure
    if "value" in payload and "unit" in payload and "metric" in payload:
        base.update({"metric": payload["metric"], "value": payload["value"], "unit": payload["unit"]})

    # rest.chemistry.v1 — hydroponic_ph, air_quality_voc
    elif "measurements" in payload:
        m = payload["measurements"][0]
        base.update({"metric": m["metric"], "value": m["value"], "unit": m["unit"]})

    # rest.level.v1 — water_tank_level
    elif "level_pct" in payload:
        base.update({"metric": "level_pct", "value": payload["level_pct"], "unit": "%"})

    # rest.particulate.v1 — air_quality_pm25
    elif "pm25_ug_m3" in payload:
        base.update({"metric": "pm25", "value": payload["pm25_ug_m3"], "unit": "ug/m3"})

    else:
        raise ValueError(f"Unknown payload schema for sensor {sensor_id}: {payload}")

    return base


# ── Poll loop ─────────────────────────────────────────────────────────────────

async def poll_loop():
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                for sensor_id in SENSORS:
                    try:
                        resp = await client.get(f"{SIMULATOR_URL}/sensors/{sensor_id}")
                        resp.raise_for_status()
                        payload = resp.json()
                        event = normalise(sensor_id, payload)
                        event_json = json.dumps(event)
                        await redis.publish("mars.sensors", event_json)
                        await redis.set(f"sensor:{sensor_id}", event_json)
                    except Exception as exc:
                        print(f"[ingestion] ERROR polling {sensor_id}: {exc}")

                health_payload = json.dumps({"status": "ok", "last_poll": datetime.now(timezone.utc).isoformat()})
                await redis.set("mars.health", health_payload)

            except Exception as exc:
                print(f"[ingestion] FATAL poll error: {exc}")
                error_payload = json.dumps({"status": "error", "last_poll": datetime.now(timezone.utc).isoformat()})
                await redis.set("mars.health", error_payload)

            await asyncio.sleep(POLL_INTERVAL)
