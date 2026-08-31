# Intensity-zone framework

## Internal engine: physiological domains
| Domain | Physiological anchor | RPE | Talk test | Typical purpose |
|---|---|---:|---|---|
| Low | Below LT1/VT1 | 1–3 | Full conversation | Aerobic volume/recovery |
| Heavy | LT1 to LT2/CP/MMSS region | 4–6 | Phrases | Tempo/threshold development |
| Severe | Above LT2/CP | 7–9 | Few words | VO2 / high aerobic power |
| Sprint | Maximal/near-maximal | 10 | — | Neuromuscular/anaerobic power |

## Optional familiar FTP display zones
These are heuristics for UI compatibility, not exact physiological boundaries:
- Recovery: <55% FTP
- Endurance: 56–75%
- Tempo: 76–90%
- Threshold: 91–105%
- VO2: 106–120%
- Anaerobic: 121–150%
- Neuromuscular: >150% / maximal

### Implementation warning
If the athlete has measured/estimated LT1, CP or lactate/ventilatory thresholds, those should override generic percentages. Power targets for short intervals should also be informed by the power-duration curve, not FTP percentage alone.
