"""
API Gateway (BFF – Backend for Frontend)
-----------------------------------------
- GET  /sensors          → latest state of all sensors from Redis cache
- GET  /sensors/{id}     → latest state of a single sensor
- WS   /ws/sensors       → WebSocket stream of normalized.v1 events (US09)
- GET  /actuators        → current actuator states from simulator
- POST /actuators/{name} → manual actuator override (US07)
- GET  /rules            → proxied to rules-engine
- POST /rules            → proxied to rules-engine
- DELETE /rules/{id}     → proxied to rules-engine
- GET  /health           → ingestion connectivity status (US10)
"""
import asyncio
import json
import os
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
RULES_ENGINE_URL = os.getenv("RULES_ENGINE_URL", "http://rules-engine:8001")
SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080/api")
# Derive the simulator base URL (strip trailing /api) for the /health probe
SIMULATOR_BASE_URL = SIMULATOR_URL.rstrip("/").rsplit("/api", 1)[0]

# Max age in seconds before ingestion is considered stale (2× poll interval)
HEALTH_STALE_THRESHOLD = int(os.getenv("HEALTH_STALE_THRESHOLD_SECONDS", "15"))

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
app = FastAPI(title="Mars API Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connected WebSocket clients
_ws_clients: set[WebSocket] = set()


@app.on_event("startup")
async def startup():
    asyncio.create_task(redis_broadcast_loop())


# ── Sensors ───────────────────────────────────────────────────────────────────

@app.get("/sensors")
async def get_all_sensors():
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    result = {}
    for sensor_id in SENSORS:
        raw = await redis.get(f"sensor:{sensor_id}")
        result[sensor_id] = json.loads(raw) if raw else None
    await redis.aclose()
    return result


@app.get("/sensors/{sensor_id}")
async def get_sensor(sensor_id: str):
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    raw = await redis.get(f"sensor:{sensor_id}")
    await redis.aclose()
    if not raw:
        raise HTTPException(404, f"No data yet for sensor '{sensor_id}'")
    return json.loads(raw)


# ── WebSocket (US09) ──────────────────────────────────────────────────────────

@app.websocket("/ws/sensors")
async def ws_sensors(websocket: WebSocket):
    await websocket.accept()
    _ws_clients.add(websocket)
    try:
        while True:
            await asyncio.sleep(30)  # keep-alive; data pushed by broadcast loop
    except WebSocketDisconnect:
        _ws_clients.discard(websocket)


async def redis_broadcast_loop():
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis.pubsub()
    await pubsub.subscribe("mars.sensors")
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        data = message["data"]
        dead = set()
        for ws in list(_ws_clients):
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        _ws_clients.difference_update(dead)


# ── Actuators ─────────────────────────────────────────────────────────────────

class ActuatorCommand(BaseModel):
    state: str  # ON | OFF


@app.get("/actuators")
async def get_actuators():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{SIMULATOR_URL}/actuators")
        resp.raise_for_status()
        return resp.json()


@app.post("/actuators/{name}")
async def set_actuator(name: str, body: ActuatorCommand):
    if body.state not in ("ON", "OFF"):
        raise HTTPException(400, "state must be ON or OFF")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{SIMULATOR_URL}/actuators/{name}", json={"state": body.state})
        resp.raise_for_status()
        return resp.json()


# ── Rules (proxy to rules-engine) ────────────────────────────────────────────

@app.get("/rules")
async def list_rules():
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"{RULES_ENGINE_URL}/rules")
        resp.raise_for_status()
        return resp.json()


@app.post("/rules", status_code=201)
async def create_rule(body: dict):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{RULES_ENGINE_URL}/rules", json=body)
        resp.raise_for_status()
        return resp.json()


@app.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int):
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.delete(f"{RULES_ENGINE_URL}/rules/{rule_id}")
        resp.raise_for_status()


# ── Health / connectivity (US10) ──────────────────────────────────────────────

@app.get("/health")
async def health():
    """
    Returns a unified connectivity report for US10.

    Checks:
    1. Direct HTTP probe to the simulator's /health endpoint.
    2. Ingestion polling status from Redis `mars.health` key,
       including a staleness check (age > HEALTH_STALE_THRESHOLD seconds).

    Overall `status` values:
    - "ok"       — simulator reachable AND ingestion is polling on schedule
    - "degraded" — one component is unknown (e.g., first startup, no data yet)
    - "error"    — simulator unreachable OR ingestion has stopped / is stale
    """
    now = datetime.now(timezone.utc)
    result: dict = {
        "status": "degraded",
        "simulator": "unknown",
        "ingestion": "unknown",
        "last_poll": None,
    }

    # 1. Direct probe to simulator ─────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{SIMULATOR_BASE_URL}/health")
        result["simulator"] = "ok" if resp.status_code == 200 else "error"
    except Exception:
        result["simulator"] = "error"

    # 2. Ingestion health from Redis + staleness check ─────────────────────────
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        raw = await redis_client.get("mars.health")
    finally:
        await redis_client.aclose()

    if raw:
        health_data = json.loads(raw)
        last_poll_str = health_data.get("last_poll")
        result["last_poll"] = last_poll_str
        if last_poll_str:
            last_poll_dt = datetime.fromisoformat(last_poll_str)
            # Make naive datetime timezone-aware if needed
            if last_poll_dt.tzinfo is None:
                last_poll_dt = last_poll_dt.replace(tzinfo=timezone.utc)
            age = (now - last_poll_dt).total_seconds()
            if age > HEALTH_STALE_THRESHOLD:
                result["ingestion"] = "stale"
            else:
                result["ingestion"] = health_data.get("status", "unknown")
        else:
            result["ingestion"] = health_data.get("status", "unknown")

    # 3. Compute overall status ────────────────────────────────────────────────
    if result["simulator"] == "ok" and result["ingestion"] == "ok":
        result["status"] = "ok"
    elif result["simulator"] == "error" or result["ingestion"] in ("error", "stale"):
        result["status"] = "error"
    # else: stays "degraded" (unknown / first startup)

    return result
