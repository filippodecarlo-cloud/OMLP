# Labor Flow Simulator

Companion of the *Factory Flow Simulation* (https://filippodecarlo-cloud.github.io/OMLP/) for the second part of
**Factory Dynamics**: manpower-constrained lines (Factory Physics, §7.4).

Choose the number of workers, their speeds, the walking time and the movement policy:

| Policy | Slides | Rule |
|---|---|---|
| Dedicated workers (fixed zones) | part 1, 89 | each worker serves a fixed zone; n = N gives the classic line |
| Workers tied to jobs (rabbit chase) | 91–99 | a worker follows one job from S1 to the end, then walks back |
| Bucket brigade | 101–104, 107 | the last worker walks back and takes over the job of his predecessor |
| Job dropping | 105–106 | a free worker takes the farthest-downstream job; with or without a CONWIP cap |

## Files

- `index.html`, `styles.css`, `app.js`: user interface (Chart.js 4.4.1 from cdnjs)
- `engine.js`: exact event-driven simulation engine, no DOM (also runs in Node)
- `tests/validate.js`: checks the engine against the slides and Factory Physics; `tests/validation-report.txt` is the last run

## Publish next to the original simulator

Copy the folder into the OMLP repository as `labor/`, so it is served at
`https://filippodecarlo-cloud.github.io/OMLP/labor/` (the "Factory Flow Sim" link in the header points to `../`).
It also works offline by opening `index.html` in a browser (Chart.js needs an internet connection).

## Direct links to a scenario (for the slides)

`index.html#<scenario>` loads a scenario, `index.html#<scenario>.run` also starts it:
`slide90`, `slide99`, `pizza2`, `pizza4`, `bbSF`, `bbFS`, `bnEnd`, `dropFlood`, `dropCap`, `penny`.

## Validation

```
node tests/validate.js
```

97 checks, all passing: slide 90–96 example (TR = 2/90, LT = 180 = 90 + 90), slide 92 (w = 7, n = 3 → 2.33·VAT),
slide 94 (w < n), pizza shop (80 → 40 min), TH = n/T0 with random times, TR ≤ min(n/VAT, TR_b),
Penny Fab best case and practical worst case (exponential), Bartholdi–Eisenstein take-over points, bucket brigade ≡ tied
workers with equal speeds, job dropping with and without a cap, Little's law and invariants on 160 random configurations.

## Model assumptions

- An operation needs one worker and one machine for its whole duration; a worker with speed v does ST in ST/v.
- WIP counts all jobs in the system, queue before S1 included; LT goes from entry to exit.
- Buffers between stations are unlimited: blocking comes from busy machines and from the workers.
- Normal times are limited to CV ≤ 0.3 (truncation bias < 0.1%); uniform to CV ≤ 0.57; exponential has CV = 1.
