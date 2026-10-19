# Train the AquaFlow models in Google Colab — from scratch

One notebook, `AquaFlow_Train_All.ipynb`, trains all three models with the repository's own scripts:

| | Model | Data | File it makes |
|---|---|---|---|
| A | Leak / burst detector | 100 simulated households calibrated to real NWSDB usage, with injected leaks | `leak_detection/results_calibrated_100/leak_model.joblib` |
| B | Monthly forecast (study) | 106 real NWSDB households' bills | report + `seasonality.csv` (no model file; C uses the seasonality) |
| C | Daily usage forecast | 100 calibrated households + measured seasonality | `usage_forecast/results_calibrated_100/forecast_model.joblib` |

Total time on free Colab: roughly **1–1.5 hours** (A is most of it). You don't need to upload anything:
the notebook downloads the code from GitHub, and the NWSDB data is already in the repository.

## 1. Open the notebook in Colab

1. Go to <https://colab.research.google.com> and sign in with your Google account.
2. **File → Open notebook → GitHub** tab.
3. Paste `https://github.com/ShewonGun/Research-Project`, press Enter, choose the branch
   `claude/vibrant-cori-jjo5gr` (or `main` after merging) and click
   `edge-ai/colab/AquaFlow_Train_All.ipynb`.
   *(Alternative: download the `.ipynb` from GitHub and use **File → Upload notebook**.)*
4. **File → Save a copy in Drive**, so your runs and edits are kept.

Use the normal CPU runtime. A GPU doesn't help these models.

## 2. Check the settings (first code cell)

| Setting | Default | Change it when |
|---|---|---|
| `BRANCH` | `claude/vibrant-cori-jjo5gr` | after merging the PR → `"main"` |
| `TRAIN_LEAK` / `TRAIN_MONTHLY` / `TRAIN_DAILY` | `True` | you only want some of the models |
| `DAILY_DATA` | `"repo"` | `"generate"` to regenerate the daily data too (+1–2 h, ~1.5 GB) |
| `RUN_COMPARISONS` | `True` | `False` to skip comparing the daily forecast with the current model |
| `N_HOUSEHOLDS` | `100` | lower (e.g. 30) for a quick trial run; results will be weaker |

## 3. Run it

1. **Runtime → Run all** (Ctrl+F9).
2. Allow Google Drive access when asked (choose your account, tick all boxes, *Continue*).
3. Leave the tab open. Progress is printed, e.g. `out_calibrated_100: 46/100 households, 18 min`.

What each section does:

| Section | Time | What you should see |
|---|---|---|
| 2. Drive and code | 1 min | `Code: /content/Research-Project | commit …` |
| 3. Python environment | 2–3 min | `python 3.11 … numpy 1.26.4 | pandas 2.1.4 | scikit-learn 1.9.1 | joblib 1.6.0` |
| A1. Leak data | 30–50 min | household counter going up to 100, then `saved → …/out_calibrated_100.zip` |
| A2. Leak training | 20–40 min | cross-validation results, `Saved model, report and charts`, then the report and charts |
| B. Monthly NWSDB | 2 min | the monthly report (errors vs simple rules, seasonality) |
| C. Daily forecast | 3–5 min | metrics table (`gbm` vs `mean7` / `week`), 7-day totals, comparison table |
| 5. Check | 1 min | `leak model OK` and `forecast model OK` |
| 6. Save | 1 min | `Saved → /content/drive/MyDrive/aquaflow/models_<date-time>` |

**If Colab disconnects** (free sessions stop after inactivity or ~12 h): reconnect and **Run all** again.
The generated leak data is restored from `MyDrive/aquaflow/out_calibrated_100.zip`, so it continues from
training instead of generating again. To force fresh data, delete that zip from Drive first.

## 4. Read the results

Expected results (from my run of the same steps; yours will be very close, not identical):

* **Leak model:** in the cross-validation, all injected micro-leaks and about 90 % of bursts caught, about
  0.1 false alarms per day; the current backend rules miss most micro-leaks.
  Report: `leak_detection/results_calibrated_100/REPORT.md`.
* **Monthly NWSDB forecast:** gradient boosting about 18 % error (WAPE) vs about 20 % for the best simple rule.
* **Daily forecast:** model MAE about 65 L/day vs about 77 for the 7-day average; 80 % range covers about 80 %.

## 5. Use the new models on your PC

1. In Drive open `MyDrive/aquaflow/`, right-click the newest `models_<date-time>.zip` → **Download**.
2. Unzip it. Inside are `leak_detection/…` and `usage_forecast/…` folders. Copy the two model files to the
   same places in your project:
   * `leak_detection\results_calibrated_100\leak_model.joblib` → `Research-Project\edge-ai\leak_detection\results_calibrated_100\`
   * `usage_forecast\results_calibrated_100\forecast_model.joblib` → `Research-Project\edge-ai\usage_forecast\results_calibrated_100\`

   Copy over the reports and charts too if you want the new numbers in your slides.
3. Make sure the service's Python has the same library versions, once, in `edge-ai\service` with the venv active:
   ```powershell
   pip install "numpy==1.26.4" "pandas==2.1.4" "scikit-learn==1.9.1" "joblib==1.6.0"
   ```
4. Start the service with the new models:
   ```powershell
   cd <your path>\Research-Project\edge-ai\service
   .\.venv\Scripts\Activate.ps1
   $env:LEAK_MODEL_PATH="..\leak_detection\results_calibrated_100\leak_model.joblib"
   $env:FORECAST_MODEL_PATH="..\usage_forecast\results_calibrated_100\forecast_model.joblib"
   $env:FORECAST_USE_CALENDAR="0"
   uvicorn app:app --port 8001
   ```
5. Check <http://localhost:8001/health>: both models should show `true`.

Keep the previous model files (rename them, e.g. `leak_model_old.joblib`) until you have checked the new ones.

## Problems

| Message | Fix |
|---|---|
| `RuntimeError: generator failed …` | The last lines of that part's log are printed above it. Run all again; if it repeats, send me the output. |
| `uv: command not found` / install errors | Runtime → **Disconnect and delete runtime**, then Run all. |
| Drive asks again / `Mountpoint must not already contain files` | Runtime → Restart session, Run all. |
| `PCG64 BitGenerator` or `incompatible dtype` on your PC | Step 5.3: the PC's versions differ from Colab's. |
| Colab "You are not using a GPU" notice | Ignore it. |
