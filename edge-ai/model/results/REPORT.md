# AquaFlow leak detection — results
30 simulated households (SIMDEUM + loop sensor model), 180 injected anomalies. 6-fold cross-validation by household: every household is tested once by a model that never saw it. Values are mean ± standard deviation across folds; delays are medians in minutes. Alarm false-alarm budget when tuning: 0.1/day per alarm.
## Detectors compared
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| Random Forest | 100% ± 0% | 92% ± 8% | 0.21 ± 0.05 | 10 | 18 | 120/120 leaks, 55/60 bursts |
| Gradient boosting | 100% ± 0% | 93% ± 8% | 0.25 ± 0.08 | 11 | 20 | 120/120 leaks, 56/60 bursts |
| Isolation Forest (no labels) | 92% ± 7% | 75% ± 10% | 0.16 ± 0.04 | 59 | 33 | 111/120 leaks, 45/60 bursts |
| Current backend rules | 0% ± 0% | 0% ± 0% | 0.00 ± 0.00 | – | – | 0/120 leaks, 0/60 bursts |

## Ablation (Gradient boosting)
| detector | micro_leak_recall | burst_recall | false_alarms_per_day | micro_leak_delay_min | burst_delay_min | caught_total |
|---|---|---|---|---|---|---|
| all features | 100% ± 0% | 93% ± 8% | 0.25 ± 0.08 | 11 | 20 | 120/120 leaks, 56/60 bursts |
| without time of day | 100% ± 0% | 90% ± 9% | 0.23 ± 0.08 | 10 | 18 | 120/120 leaks, 54/60 bursts |
| without time & flow level | 100% ± 0% | 83% ± 10% | 0.17 ± 0.06 | 12 | 20 | 120/120 leaks, 50/60 bursts |
| without house baseline | 100% ± 0% | 93% ± 8% | 0.18 ± 0.09 | 8 | 18 | 120/120 leaks, 56/60 bursts |

## By anomaly shape
```
              caught  total  median_delay_min  recall
type                                                 
burst             56     60              19.5    0.93
cistern_leak      39     39              21.0    1.00
growing_leak      39     39               8.0    1.00
steady_leak       42     42              10.0    1.00
```

## False alarms per day by routine
{"day": 0.246, "night_shift": 0.248}

## False alarms per day by household type
{"family": 0.324, "one_person": 0.2, "two_person": 0.214}

## Final model on other data
- **original single-household dataset**: micro-leaks 3/3, bursts 2/2, false alarms/day 0.00

Final alarm settings (threshold, minutes): {"micro_leak": [0.7, 2], "burst": [0.9, 5]}
