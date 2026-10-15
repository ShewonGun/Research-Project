# Leak-model service

Scores a device's recent readings with `../leak_detection/results/leak_model.joblib` (create it with
`python ../leak_detection/train_leak_model.py ...`; it is not in git).

    pip install -r requirements.txt
    uvicorn app:app --port 8001

Backend: set `LEAK_MODEL_URL=http://localhost:8001` in `backend/.env` and restart. Once a
minute the backend sends each online device's last 12 h of readings to `POST /score` and
raises / clears alerts (`source: "model"`) from the verdict. Unset = feature off.

* Alert only — the model never closes the valve; the 30 L/min rule keeps that job.
* Trained at AquaFlow-loop scale (pump ≈ 3.5 L/min); flows are clamped to 6 L/min.
* Validated on simulated data only (see `../leak_detection/results/REPORT.md`).

## Usage forecast

`POST /forecast` (used by the backend's `GET /api/forecast?device=<id>`): the next 7 days of litres with
an 80 % range, from the household's own last 14 days of daily totals. Uses
`../usage_forecast/results_patterned/forecast_model.joblib` (`python ../usage_forecast/train_forecast.py --daily-csv
data/patterned_daily.csv` creates it; not in git). With 7+ of the last 14 days present it uses the model
(offline days are filled with the household's median); with 3-6 it falls back to the plain average;
fewer than 3 days -> no forecast. Restart the service after pulling to enable it.

The backend adds, by billing mode, a prepaid run-out date (balance vs forecast, capped by plan expiry) or a
postpaid bill estimate (open cycle so far + forecast to a 30-day cycle end, priced with the active tariff).
