"""
Rules Engine Service
--------------------
- Subscribes to Redis `mars.sensors` channel.
- Evaluates stored IF-THEN rules on each event.
- Triggers actuator POST requests to the simulator when rules match.
- Exposes a REST API for rule CRUD (consumed by the API Gateway).
- Rules are persisted in SQLite via SQLAlchemy.
- Enforces the Safe State Protocol on startup, rule deletion, and sensor loss.
"""
import asyncio
import contextlib
import json
import operator as op
import os
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# ── Config ────────────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080/api")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/rules.db")
HEARTBEAT_TIMEOUT = int(os.getenv("HEARTBEAT_TIMEOUT_SECONDS", "30"))

OPERATORS = {
    "<": op.lt,
    "<=": op.le,
    "=": op.eq,
    ">": op.gt,
    ">=": op.ge,
}

# ── Safe State Protocol ───────────────────────────────────────────────────────
SAFE_STATES = {
    "cooling_fan":        "OFF",  # Prevents energy waste and over-cooling
    "habitat_heater":     "OFF",  # Prevents fire hazards and thermal runaway
    "entrance_humidifier":"OFF",  # Prevents seal icing and condensation
    "hall_ventilation":   "ON",   # Prevents localized CO2 toxicity/stratification
}

# Tracks sensors currently in heartbeat-failure state to avoid log spam
_stale_sensors: set[str] = set()


async def _enforce_safe_state(actuator_id: str, reason: str, client: httpx.AsyncClient):
    """POST the safe state for an actuator and emit a PROTOCOL_ENFORCEMENT log line."""
    state = SAFE_STATES.get(actuator_id)
    if state is None:
        return
    await client.post(
        f"{SIMULATOR_URL}/actuators/{actuator_id}",
        json={"state": state},
    )
    print(
        f"[rules-engine] PROTOCOL_ENFORCEMENT | actuator={actuator_id} "
        f"state={state} reason={reason}"
    )


# ── Database ──────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class Rule(Base):
    __tablename__ = "rules"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sensor_id = Column(String, nullable=False)
    operator = Column(String, nullable=False)
    threshold = Column(Float, nullable=False)
    actuator_id = Column(String, nullable=False)
    action = Column(String, nullable=False)  # ON | OFF
    created_at = Column(String, nullable=False)


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
SessionLocal = sessionmaker(bind=engine)

# ── In-memory rule cache ──────────────────────────────────────────────────────
_rules_cache: list[dict] = []


def _load_rules_cache():
    global _rules_cache
    with SessionLocal() as session:
        rows = session.query(Rule).all()
        _rules_cache = [
            {
                "id": r.id,
                "sensor_id": r.sensor_id,
                "operator": r.operator,
                "threshold": r.threshold,
                "actuator_id": r.actuator_id,
                "action": r.action,
                "created_at": r.created_at,
            }
            for r in rows
        ]


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Mars Rules Engine")


@app.on_event("startup")
async def startup():
    _load_rules_cache()

    # ── Safe State Protocol: STARTUP enforcement ──────────────────────────────
    async with httpx.AsyncClient(timeout=5.0) as client:
        for actuator_id in SAFE_STATES:
            try:
                await _enforce_safe_state(actuator_id, "STARTUP", client)
            except Exception as exc:
                print(f"[rules-engine] Failed to enforce safe state for {actuator_id} at startup: {exc}")

    asyncio.create_task(subscriber_loop())
    asyncio.create_task(heartbeat_monitor())


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Rule CRUD ─────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    sensor_id: str
    operator: str
    threshold: float
    actuator_id: str
    action: str  # ON | OFF


@app.get("/rules")
def list_rules():
    return _rules_cache


@app.post("/rules", status_code=201)
async def create_rule(body: RuleCreate):
    if body.operator not in OPERATORS:
        raise HTTPException(400, f"Invalid operator '{body.operator}'. Use one of {list(OPERATORS)}")
    if body.action not in ("ON", "OFF"):
        raise HTTPException(400, "action must be ON or OFF")

    with SessionLocal() as session:
        rule = Rule(
            sensor_id=body.sensor_id,
            operator=body.operator,
            threshold=body.threshold,
            actuator_id=body.actuator_id,
            action=body.action,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        session.add(rule)
        session.commit()
        session.refresh(rule)
        result = {
            "id": rule.id,
            "sensor_id": rule.sensor_id,
            "operator": rule.operator,
            "threshold": rule.threshold,
            "actuator_id": rule.actuator_id,
            "action": rule.action,
            "created_at": rule.created_at,
        }
    _load_rules_cache()
    # Immediately evaluate the new rule against the current cached sensor value
    await _fire_rule_if_matched(result)
    return result


async def _fire_rule_if_matched(rule: dict):
    """Check the current Redis sensor cache and fire the actuator if the rule matches."""
    try:
        redis = aioredis.from_url(REDIS_URL, decode_responses=True)
        raw = await redis.get(f"sensor:{rule['sensor_id']}")
        await redis.aclose()
        if not raw:
            return
        event = json.loads(raw)
        value = event.get("value")
        if value is None:
            return
        compare = OPERATORS.get(rule["operator"])
        if compare and compare(value, rule["threshold"]):
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{SIMULATOR_URL}/actuators/{rule['actuator_id']}",
                    json={"state": rule["action"]},
                )
            print(
                f"[rules-engine] Rule #{rule['id']} immediately fired: "
                f"{rule['actuator_id']} → {rule['action']}"
            )
    except Exception as exc:
        print(f"[rules-engine] Immediate rule evaluation failed: {exc}")


@app.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int):
    with SessionLocal() as session:
        rule = session.get(Rule, rule_id)
        if not rule:
            raise HTTPException(404, "Rule not found")
        actuator_id = rule.actuator_id
        session.delete(rule)
        session.commit()
    _load_rules_cache()

    # ── Safe State Protocol: DELETE enforcement ───────────────────────────────
    if actuator_id in SAFE_STATES:
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                await _enforce_safe_state(
                    actuator_id,
                    f"RULE_DELETED rule_id={rule_id}",
                    client,
                )
            except Exception as exc:
                print(f"[rules-engine] Failed to enforce safe state for {actuator_id} on delete: {exc}")


# ── Heartbeat monitor (Safe State Protocol: SENSOR LOSS) ─────────────────────

async def heartbeat_monitor():
    """
    Every 10 seconds, check that each sensor referenced by an active rule has
    reported within HEARTBEAT_TIMEOUT seconds. If not, enforce SAFE_STATES for
    all actuators controlled by rules on that sensor and log a CRITICAL alert.
    Logs recovery when a sensor comes back online.
    """
    global _stale_sensors
    while True:
        await asyncio.sleep(10)
        try:
            redis = aioredis.from_url(REDIS_URL, decode_responses=True)
            now = datetime.now(timezone.utc)

            # Build sensor → {actuator_ids} map from active rules
            sensor_actuators: dict[str, set[str]] = {}
            for rule in _rules_cache:
                sensor_actuators.setdefault(rule["sensor_id"], set()).add(rule["actuator_id"])

            currently_stale: set[str] = set()
            for sensor_id in sensor_actuators:
                raw = await redis.get(f"sensor:{sensor_id}")
                if not raw:
                    continue  # No data yet (pre-first-poll) — not a failure
                event = json.loads(raw)
                ingested_at_str = event.get("ingested_at")
                if not ingested_at_str:
                    continue
                ingested_at = datetime.fromisoformat(ingested_at_str)
                if ingested_at.tzinfo is None:
                    ingested_at = ingested_at.replace(tzinfo=timezone.utc)
                if (now - ingested_at).total_seconds() > HEARTBEAT_TIMEOUT:
                    currently_stale.add(sensor_id)

            await redis.aclose()

            newly_stale = currently_stale - _stale_sensors
            recovered = _stale_sensors - currently_stale

            # Enforce safe states for all currently stale sensors;
            # only emit CRITICAL log on the first detection (newly_stale).
            if currently_stale:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    for sensor_id in currently_stale:
                        for actuator_id in sensor_actuators.get(sensor_id, set()):
                            if actuator_id not in SAFE_STATES:
                                continue
                            try:
                                reason = (
                                    f"HEARTBEAT_FAILURE sensor={sensor_id}"
                                    if sensor_id in newly_stale
                                    else f"HEARTBEAT_FAILURE_ONGOING sensor={sensor_id}"
                                )
                                await _enforce_safe_state(actuator_id, reason, client)
                            except Exception as exc:
                                print(
                                    f"[rules-engine] Failed to enforce safe state "
                                    f"for {actuator_id} (sensor={sensor_id}): {exc}"
                                )

            for sensor_id in recovered:
                print(f"[rules-engine] Sensor {sensor_id} recovered from heartbeat failure")

            _stale_sensors = currently_stale

            # Enforce safe states for actuators not covered by any active rule.
            # These have no rule-based or heartbeat trigger, so they must be
            # kept at their safe state unconditionally on every cycle.
            covered_actuators = {
                actuator_id
                for actuators in sensor_actuators.values()
                for actuator_id in actuators
            }
            unguarded = set(SAFE_STATES) - covered_actuators
            if unguarded:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    for actuator_id in unguarded:
                        try:
                            await _enforce_safe_state(actuator_id, "NO_COVERING_RULE", client)
                        except Exception as exc:
                            print(f"[rules-engine] Failed to enforce safe state for unguarded {actuator_id}: {exc}")

        except Exception as exc:
            print(f"[rules-engine] Heartbeat monitor error: {exc}")


# ── Subscriber loop ───────────────────────────────────────────────────────────

async def subscriber_loop():
    """Subscribe to mars.sensors and evaluate rules. Retries on any failure."""
    while True:
        redis_client = None
        pubsub = None
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe("mars.sensors")
            print("[rules-engine] Subscribed to mars.sensors")
            async with httpx.AsyncClient(timeout=5.0) as client:
                while True:
                    message = await pubsub.get_message(
                        ignore_subscribe_messages=True, timeout=1.0
                    )
                    if message and message["type"] == "message":
                        try:
                            event = json.loads(message["data"])
                            await evaluate_rules(event, client)
                        except Exception as exc:
                            print(f"[rules-engine] Error processing event: {exc}")
                    await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            print(f"[rules-engine] Subscriber loop crashed: {exc}. Retrying in 5s...")
            await asyncio.sleep(5)
        finally:
            if pubsub:
                with contextlib.suppress(Exception):
                    await pubsub.unsubscribe("mars.sensors")
                    await pubsub.reset()
            if redis_client:
                with contextlib.suppress(Exception):
                    await redis_client.aclose()


async def evaluate_rules(event: dict, client: httpx.AsyncClient):
    sensor_id = event.get("sensor_id")
    value = event.get("value")
    if value is None:
        return

    for rule in _rules_cache:
        if rule["sensor_id"] != sensor_id:
            continue
        compare = OPERATORS.get(rule["operator"])
        if compare and compare(value, rule["threshold"]):
            try:
                await client.post(
                    f"{SIMULATOR_URL}/actuators/{rule['actuator_id']}",
                    json={"state": rule["action"]},
                )
                print(f"[rules-engine] Rule #{rule['id']} fired: {rule['actuator_id']} → {rule['action']}")
            except Exception as exc:
                print(f"[rules-engine] Failed to actuate {rule['actuator_id']}: {exc}")
