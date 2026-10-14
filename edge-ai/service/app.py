"""
AquaFlow leak-model service — scores a device's recent readings with the trained model.

  POST /score   {"readings": [{"timestamp", "flowRate", "volume"}, ...]}   (last ~12 h)
  GET  /health

Returns, per alarm (micro_leak, burst): the latest score, the saved threshold / persistence
and whether the alarm is active now. Uses the same feature code and alarm rule as training
(leakdetect.py), on COMPLETE minutes only (the minute still in progress is dropped).

The model was trained at AquaFlow-loop scale (pump ≈ 3.5 L/min), so flows are clamped to
MAX_LPM before scoring.

Run (from edge-ai/service):  uvicorn app:app --port 8001
Env: LEAK_MODEL_PATH (default ../model/results/leak_model.joblib)
"""
import os
import sys
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "model"))
import leakdetect as ld  # noqa: E402

MODEL_PATH = os.environ.get("LEAK_MODEL_PATH", str(HERE.parent / "model" / "results" / "leak_model.joblib"))
MAX_LPM = 6.0          # loop scale: anything above is a sensor glitch / out of the model's range
LATCH_MIN = 10         # an alarm stays "active" this long after it last fired (a leaking cistern
                       # only looks like a leak in bursts, with quiet minutes in between)
MIN_MINUTES = 30       # not enough history → no verdict
STALE_MIN = 3          # newest reading older than this → device is offline, no verdict

saved = joblib.load(MODEL_PATH)
app = FastAPI(title="AquaFlow leak model")


class Reading(BaseModel):
    timestamp: str
    flowRate: float
    volume: float = 0.0


class ScoreRequest(BaseModel):
    readings: list[Reading]
    now: str | None = None   # testing only: replay history as if this were the current time


@app.get("/health")
def health():
    return {"ok": True, "model": saved["model_type"], "alarms": saved["alarms"]}


@app.post("/score")
def score(req: ScoreRequest):
    if len(req.readings) < 10:
        return {"ready": False, "reason": "not enough readings"}
    r = pd.DataFrame([x.model_dump() for x in req.readings])
    r["timestamp"] = pd.to_datetime(r["timestamp"], utc=True, format="mixed")
    r = r.sort_values("timestamp").reset_index(drop=True)
    r["flowRate"] = r["flowRate"].clip(0, MAX_LPM)
    newest = r["timestamp"].iloc[-1]

    df = ld.readings_to_minutes(r)
    df = df.iloc[:-1]                                    # drop the minute still in progress
    if len(df) < MIN_MINUTES:
        return {"ready": False, "reason": "not enough history"}
    now = pd.Timestamp(req.now, tz="UTC") if req.now else pd.Timestamp.now(tz="UTC")
    if (now - newest) > pd.Timedelta(minutes=STALE_MIN):
        return {"ready": False, "reason": "device silent"}

    X = ld.make_features(df)[saved["features"]]
    sc = ld.class_scores(saved["model"], X)
    out = {"ready": True, "asOf": df.index[-1].isoformat()}
    for name, (thr, persist) in saved["alarms"].items():
        s = sc[name]
        out[name] = {"score": round(float(s.iloc[-1]), 3), "threshold": thr, "persist": persist,
                     "active": bool(ld.alarms(s, thr, persist).iloc[-LATCH_MIN:].any())}
    return out
