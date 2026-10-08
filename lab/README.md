# Factory Flow Lab

One simulator for both parts of **Factory Dynamics** (Operations Management and Lean Production), built on
Hopp & Spearman, *Factory Physics*, ch. 7. It merges the original *Factory Flow Simulation* (`../`) and the
*Labor Flow Simulator* (`../labor/`).

- **Part 1 · Machines**: CONWIP or push release, process times with deterministic, normal, exponential, uniform or
  triangular distributions (mean + CV), parallel machines, process batches, move lots, OEE, finite buffers with
  blocking. Best case, worst case (move lot = w) and practical worst case as references.
- **Part 2 · Manpower**: n workers with speeds and walking time; dedicated workers with a skill matrix, workers tied
  to jobs, bucket brigade, job dropping; automatic machine cycles (one operator tending several machines).

Charts: throughput, lead time and WIP over time, lead-time histogram, Little's law, cumulative entries and exits,
machine states, Gantt of every machine, worker time split, space–time diagram, bucket-brigade take-over points,
TR/LT experiment over w or n. Saved setups (browser), JSON download/upload (also the original simulator's
`line_config.json`), CSV log, installable app that works offline.

## Changes while the line runs

WIP and release rule, number of workers and speeds, skills, walking time, take-over rule, process times,
distributions, machines, batches, move lots, OEE, automatic cycles and buffer sizes change **without restarting**:
operations in progress finish with the old values, removed workers finish their job and leave, removed machines
leave when free, a lower WIP cap or buffer drains by itself. Every change is marked on the time charts and on the
Gantt. "Restart statistics" keeps the line running and starts the averages again, to measure the new situation.
Mode, policy, number of stations, seed and warm-up start a new run.

## Direct links to a scenario

`index.html#<scenario>` loads a scenario, `index.html#<scenario>.run` also starts it.
Part 1: `balanced`, `bottleneck`, `volatility`, `best`, `worst`, `pwc`, `unbal`, `unbalExp`, `push`, `oven`.
Part 2: `slide90`, `slide99`, `pizza2`, `pizza4`, `tend`, `bbSF`, `bbFS`, `bnEnd`, `dropFlood`, `dropCap`, `skills`, `penny`.

## Validation

```
node tests/validate.js
```

178 checks (see `tests/validation-report.txt`): the 97 checks of the Labor Flow Simulator, plus best / worst /
practical worst case, two exponential machines with a buffer of B places (TH = (B+2)/(B+3)), parallel machines,
OEE, batches, the presets of the original simulator (720 and 360 parts/h), machine tending and interference,
skill matrix, stops and warnings, 240 random configurations with every feature (invariants, Little's law), and
changes while running (w, n, speeds, machines, buffers, push/CONWIP) compared with the theory of the new situation,
plus 120 random sequences of live changes.

## Model notes

- Exact event-driven simulation (no time step): with deterministic times the formulas are matched exactly.
- A buffer always has room for a whole batch of the next station and a whole move lot of the previous one.
- Blocking after service: a finished part that finds the next buffer full stays on its machine.
- With workers tied to jobs or a bucket brigade the job travels with the worker: batches, move lots and buffer
  sizes are ignored (the app says so).
- A free worker takes the farthest-downstream job he is trained for; on a tie the nearest worker, then the one idle
  the longest.
- Normal times are limited to CV ≤ 0.3 (truncation bias < 0.1%), uniform to 0.58, symmetric triangular to 0.41.
