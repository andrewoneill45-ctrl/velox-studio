# Start Here — design philosophy

## The central idea
A good cycling training app should behave like a conservative evidence-informed coach, not a formula engine.

The strongest architecture is:

1. **Profile the athlete** — training age/calibre, recent volume, event demands, constraints, injury/illness status.
2. **Model more than FTP** — use a power-duration profile, a practical threshold estimate, high-end aerobic ability, sprint/anaerobic ability, and (for long events) durability/fatigue resistance.
3. **Build consistency first** — most training time is low intensity. Quality sessions are targeted and recoverable.
4. **Progress one stressor at a time** — duration, interval density, intensity, frequency and strength volume are different stressors.
5. **Integrate strength** — heavy lower-body strength has direct cycling evidence and should not be relegated to generic “core”.
6. **Use mobility/yoga for the problems they solve** — range of motion, comfort, balance, relaxation/adherence; evidence for direct cycling performance is limited.
7. **Fuel the work** — demanding sessions and long rides require carbohydrate availability; chronic low energy availability is a health/performance risk.
8. **Monitor trends, not single numbers** — power, HR, RPE, sleep, HRV and subjective fatigue are complementary.
9. **Individualize through response** — adherence, completion quality and adaptation should update the plan.
10. **Know when not to prescribe** — illness, injury and persistent unexplained fatigue need clinical pathways.

## Evidence hierarchy used in this library
- **A:** Direct systematic review/meta-analysis, consensus/position statement, or high-authority guideline.
- **B:** Strong review or controlled trial; may be cycling-specific or highly relevant endurance evidence.
- **C:** Indirect sport evidence, small/limited evidence base, or useful applied hypothesis.

Directness is stored separately because a high-quality study in runners or general adults is not automatically high-quality evidence for trained cyclists.

## What the app should *not* hard-code
- “80/20 is always optimal.”
- “FTP is lactate threshold.”
- “95% of 20-minute power is physiologically exact.”
- “More TSS is better.”
- “HRV green = hard day; HRV red = rest day.”
- “Stretching prevents cycling injuries.”
- “Yoga improves FTP.”
- “Replace every gram of sweat.”
- “Train by predicted menstrual-cycle phase.”
- “10% weekly load increase is a scientific law.”

These are either context-dependent heuristics or claims stronger than the evidence supports.
