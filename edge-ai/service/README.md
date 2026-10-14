# Leak-model service

Scores a device's recent readings with `../model/results/leak_model.joblib` (create it with
`python ../model/train_leak_model.py ...`; it is not in git).

    pip install -r requirements.txt
    uvicorn app:app --port 8001

Backend: set `LEAK_MODEL_URL=http://localhost:8001` in `backend/.env` and restart. Once a
minute the backend sends each online device's last 12 h of readings to `POST /score` and
raises / clears alerts (`source: "model"`) from the verdict. Unset = feature off.

* Alert only — the model never closes the valve; the 30 L/min rule keeps that job.
* Trained at AquaFlow-loop scale (pump ≈ 3.5 L/min); flows are clamped to 6 L/min.
* Validated on simulated data only (see `../model/results/REPORT.md`).
