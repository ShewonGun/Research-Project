# AquaFlow leak detection — results
30 simulated households (SIMDEUM + loop sensor model), 180 injected anomalies. 6-fold cross-validation by household: every household is tested once by a model that never saw it. Values are mean ± standard deviation across folds; delays are medians in minutes. Alarm false-alarm budget when tuning: 0.1/day per alarm.
## Detectors compared
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| Random Forest | 99% ± 2% | 92% ± 4% | 0.19 ± 0.03 | 9 | 17 | 119/120 leaks, 55/60 bursts |
| Gradient boosting | 100% ± 0% | 93% ± 8% | 0.21 ± 0.10 | 9 | 20 | 120/120 leaks, 56/60 bursts |
| Isolation Forest (no labels) | 92% ± 7% | 75% ± 10% | 0.16 ± 0.04 | 59 | 33 | 111/120 leaks, 45/60 bursts |
| Current backend rules | 0% ± 0% | 0% ± 0% | 0.00 ± 0.00 | – | – | 0/120 leaks, 0/60 bursts |

## Ablation (Gradient boosting)
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| all features | 100% ± 0% | 93% ± 8% | 0.21 ± 0.10 | 9 | 20 | 120/120 leaks, 56/60 bursts |
| without time of day | 100% ± 0% | 93% ± 8% | 0.23 ± 0.08 | 9 | 19 | 120/120 leaks, 56/60 bursts |
| without time & flow level | 100% ± 0% | 83% ± 10% | 0.17 ± 0.06 | 12 | 20 | 120/120 leaks, 50/60 bursts |
| without house baseline | 100% ± 0% | 93% ± 8% | 0.18 ± 0.10 | 8 | 17 | 120/120 leaks, 56/60 bursts |

## By anomaly shape
```
              caught  total  median_delay_min  recall
type                                                 
burst             56     60              20.5    0.93
cistern_leak      39     39              20.0    1.00
growing_leak      39     39               7.0    1.00
steady_leak       42     42               9.0    1.00
```

## False alarms per day by routine
{"day": 0.213, "night_shift": 0.2}

## False alarms per day by household type
{"family": 0.21, "one_person": 0.21, "two_person": 0.214}

## Final model on other data
- **original single-household dataset**: micro-leaks 3/3, bursts 2/2, false alarms/day 0.05

Final alarm settings (threshold, minutes): {"micro_leak": [0.95, 3], "burst": [0.3, 15]}
