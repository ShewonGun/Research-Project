# Leak-model service

Scores a device's recent readings with `../leak_detection/results/leak_model.joblib` (create it with
`python ../leak_detection/train_leak_model.py ...`; it is not in git).

    pip install -r requirements.txt
    uvicorn app:app --port 8001

Backend: set `LEAK_MODEL_URL=http://localhost:8001` in `backend/.env` and restart. Once a
minute the backend sends each online device's last 12 h of readings to `POST /score` and
raises / clears alerts (`source: "model"`) from the verdict. Unset = feature off.

* Alert only by default. **Opt-in shut-off:** add `MODEL_AUTO_SHUTOFF=true` to `backend/.env` (and restart the
  backend) and a confident burst verdict also closes the provider valve. It needs the burst alarm active (flow
  non-stop for ~20 min), a score of at least `MODEL_SHUTOFF_MIN_SCORE` (default 0.7) and the pump still running
  now (latest reading >= 2 L/min and under 2 minutes old). Such an alert is never auto-resolved: someone must mark
  the leak fixed, after which the supply can be restored (the existing safety lock applies). Without the setting
  the 30 L/min rule is the only automatic shut-off, and it cannot fire on the loop's ~3.5 L/min pump.
* **Opt-in micro-leak response:** `MODEL_LEAK_ACTION=throttle` reduces the provider gate to
  `MODEL_LEAK_THROTTLE_PERCENT` (default 30 %) when the model raises a micro-leak alert; `MODEL_LEAK_ACTION=close`
  shuts it. Either needs a score of at least `MODEL_LEAK_MIN_SCORE` (default 0.8) and water still flowing now
  (latest reading > 0.05 L/min, under 2 minutes old). Like a burst shut-off, the alert is never auto-resolved: mark
  the leak fixed, then restore the supply (admin Alerts → Reopen). Unset / `off` = alert only (default).
* Trained at AquaFlow-loop scale (pump ≈ 3.5 L/min); flows are clamped to 6 L/min.
* Validated on simulated data only (see `../leak_detection/results/REPORT.md`).

## Usage forecast

`POST /forecast` (used by the backend's `GET /api/forecast?device=<id>`): the next 7 days of litres with
an 80 % range, from the household's own last 14 days of daily totals. Uses
`../usage_forecast/results_patterned/forecast_model.joblib` (`python ../usage_forecast/train_forecast.py --daily-csv
data/patterned_daily.csv` creates it; not in git). With 7+ of the last 14 days present it uses the model
(offline days are filled with the household's median); with 3-6 it falls back to the plain average;
fewer than 3 days -> no forecast. Restart the service after pulling to enable it.

**Weather and holidays.** Each forecast also uses the target days' weather (Open-Meteo: max temperature, rainfall)
and Sri Lankan public holidays (`holidays` package + `usage_forecast/data/holidays_override.csv` for gazette
corrections). The service refreshes its weather cache every 3 hours in the background and never waits on the
network during a request; with no weather it quietly uses the model without calendar inputs. Needs
`../usage_forecast/results_weather/forecast_model_calendar.joblib`
(`python ../usage_forecast/train_forecast.py --daily-csv data/patterned_weather_daily.csv --calendar`).
**The calendar model's reaction to heat / rain / holidays was learned from ASSUMED effect sizes** (the simulated
households don't respond to weather), so retrain it on real usage history before trusting those adjustments;
set `FORECAST_USE_CALENDAR=0` to ignore weather and holidays in the forecast numbers. Location:
`FORECAST_LAT` / `FORECAST_LON` (default Colombo).

The backend adds, by billing mode, a prepaid run-out date (balance vs forecast, capped by plan expiry) or a
postpaid bill estimate (open cycle so far + forecast to a 30-day cycle end, priced with the active tariff).
