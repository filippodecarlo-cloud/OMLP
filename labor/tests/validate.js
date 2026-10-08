/* Validation of the engine against the slides (Factory Dynamics, part 2)
   and Factory Physics §7.2-7.4.   Run:  node tests/validate.js           */
'use strict';
const { LaborLine, theory } = require('../engine.js');

const results = [];
function rel(a, b) { return Math.abs(a - b) / Math.max(1e-12, Math.abs(b)); }
function check(group, name, measured, expected, tol, note = '') {
    const ok = rel(measured, expected) <= tol;
    results.push({ group, name, measured, expected, tol, ok, note });
}
function assert(group, name, cond, note = '') { results.push({ group, name, ok: !!cond, note, bool: true }); }

function line(st, m, dist = 'det', cv = 0.5) {
    return st.map((s, k) => ({ st: s, m: Array.isArray(m) ? m[k] : m, dist, cv }));
}
function workers(n, speeds) { return Array.from({ length: n }, (_, j) => ({ speed: speeds ? speeds[j] : 1 })); }
function run(cfg, T, check = false) {
    const sim = new LaborLine(cfg);
    if (!check) { sim.advanceTo(T); return { sim, m: sim.metrics() }; }
    const errs = [];
    const step = T / 400;
    for (let t = step; t <= T + 1e-9; t += step) {
        sim.advanceTo(t);
        const e = sim.checkInvariants();
        if (e.length) { errs.push(...e.slice(0, 3)); break; }
    }
    return { sim, m: sim.metrics(), errs };
}

// ---------------------------------------------------------------------------
// A. Slides 90-96: 5 stations 10',20',30',10',20', WIP = 4, n = 2 (full capacity)
// ---------------------------------------------------------------------------
{
    const G = 'A. Slide 90-96 example (tied, ample machines)';
    const cfg = { stations: line([10, 20, 30, 10, 20], 2), workers: workers(2), policy: 'tied', wip: 4, warmup: 900 };
    const { m } = run(cfg, 90000);
    check(G, 'TR = n/VAT = 2/90 [pcs/min]', m.TR, 2 / 90, 0.002);
    check(G, 'LT_wip = (w/n)·VAT = 180 min', m.LT, 180, 0.002);
    check(G, 'LT_worker = VAT = 90 min', m.LTline, 90, 0.002);
    check(G, 'LT_queue = (w-n)/n·VAT = 90 min', m.LTqueue, 90, 0.002);
    check(G, "Little: WIP = TR·LT", m.littleTRxLT, m.WIP, 0.005);
    const th = theory(cfg);
    check(G, 'theory(): TR_b = 2/30 (2 machines)', th.TRb, 2 / 30, 1e-9);
    assert(G, 'binding constraint = labor (n/VAT < TR_b)', th.binding === 'labor');
}
{
    const G = 'A. Slide 90-96 example (tied, ample machines)';
    // slide 91: new job released only when a worker is free -> WIP = n, no queue
    const cfg = { stations: line([10, 20, 30, 10, 20], 2), workers: workers(2), policy: 'tied', wip: Infinity, warmup: 900 };
    const { m } = run(cfg, 90000);
    check(G, 'slide 91, no queue: LT = VAT = 90', m.LT, 90, 0.002);
    check(G, 'slide 91, no queue: WIP = n = 2', m.WIP, 2, 0.005);
    // slide 94: w < n -> TR = w/VAT, LT = VAT
    const cfg2 = { stations: line([10, 20, 30, 10, 20], 3), workers: workers(3), policy: 'tied', wip: 2, warmup: 900 };
    const r2 = run(cfg2, 90000).m;
    check(G, 'slide 94, w=2 < n=3: TR = w/VAT', r2.TR, 2 / 90, 0.002);
    check(G, 'slide 94, w=2 < n=3: LT = VAT', r2.LT, 90, 0.002);
    // slide 92: WIP = 7, n = 3 -> LT_wip = 7/3 VAT, LT_queue = 4/3 VAT
    const cfg3 = { stations: line([10, 20, 30, 10, 20], 3), workers: workers(3), policy: 'tied', wip: 7, warmup: 900 };
    const r3 = run(cfg3, 90000).m;
    check(G, 'slide 92, w=7, n=3: LT_wip = 2.33·VAT', r3.LT, 7 / 3 * 90, 0.002);
    check(G, 'slide 92, w=7, n=3: LT_queue = 1.33·VAT', r3.LTqueue, 4 / 3 * 90, 0.003);
}

// ---------------------------------------------------------------------------
// B. Slides 97-98: take-away pizza shop, 8 customers
// ---------------------------------------------------------------------------
{
    const G = 'B. Slide 97-98 pizza shop';
    const st = [3, 3, 4, 4, 3, 3];
    const r2 = run({ stations: line(st, 2), workers: workers(2), policy: 'tied', wip: 8, warmup: 200 }, 20000).m;
    check(G, 'n=2: TR = 2/20 = 0.10 pcs/min', r2.TR, 0.10, 0.003);
    check(G, 'n=2: LT_wip = 8/2·20 = 80 min', r2.LT, 80, 0.003);
    check(G, 'n=2: LT_queue = 60 min', r2.LTqueue, 60, 0.003);
    const r4 = run({ stations: line(st, 4), workers: workers(4), policy: 'tied', wip: 8, warmup: 200 }, 20000).m;
    check(G, 'n=4: TR = 0.20 pcs/min', r4.TR, 0.20, 0.003);
    check(G, 'n=4: LT_wip = 40 min (-50%)', r4.LT, 40, 0.003);
    const th = theory({ stations: line(st, 1), workers: workers(2), wip: 8 });
    check(G, 'PWC(w=8) with TR_b=0.25: TR = 0.17', th.pwc.TR, 8 / (5 + 7) * 0.25, 1e-9);
    check(G, 'PWC(w=8): LT = 48 min', th.pwc.LT, 48, 1e-9);
}

// ---------------------------------------------------------------------------
// C. Random process times, full capacity: TH = n/T0 still holds (FP §7.4.1)
// ---------------------------------------------------------------------------
{
    const G = 'C. Random times, ample machines (FP §7.4.1)';
    for (const dist of ['exp', 'normal', 'uniform']) {
        const cfg = { stations: line([10, 20, 30, 10, 20], 3, dist, 0.3), workers: workers(3), policy: 'tied', wip: 7, warmup: 2000, seed: 7 };
        const { m } = run(cfg, 400000);
        check(G, `${dist}: TR = n/VAT`, m.TR, 3 / 90, 0.02);
        check(G, `${dist}: LT_wip = w/n·VAT`, m.LT, 7 / 3 * 90, 0.02);
        check(G, `${dist}: Little WIP = TR·LT`, m.littleTRxLT, m.WIP, 0.01);
    }
}

// ---------------------------------------------------------------------------
// D. Limited capacity (one machine per station): TR <= min(n/VAT, TR_b)
// ---------------------------------------------------------------------------
{
    const G = 'D. Limited capacity, TR <= min(n/VAT, TR_b)';
    for (const pol of ['tied', 'bucket', 'dropping', 'zones']) {
        for (const n of [1, 2, 3, 5, 8]) {
            const cfg = { stations: line([10, 20, 30, 10, 20], 1), workers: workers(n), policy: pol, wip: Math.max(n, 6), warmup: 2000 };
            const { m } = run(cfg, 60000);
            const th = theory(cfg);
            assert(G, `${pol} n=${n}: TR=${m.TR.toFixed(4)} <= ${th.TRmax.toFixed(4)}`, m.TR <= th.TRmax * 1.003);
        }
    }
    // n large, labor not binding: the machine bottleneck (30') rules
    const big = run({ stations: line([10, 20, 30, 10, 20], 1), workers: workers(6), policy: 'dropping', wip: 10, warmup: 2000 }, 60000).m;
    check(G, 'dropping n=6, w=10: TR -> TR_b = 1/30', big.TR, 1 / 30, 0.01);
    // n = 1: a single worker walks the whole line: TR = 1/VAT for every policy
    for (const pol of ['tied', 'bucket', 'dropping', 'zones']) {
        const r = run({ stations: line([10, 20, 30, 10, 20], 1), workers: workers(1), policy: pol, wip: 3, warmup: 900 }, 45000).m;
        check(G, `${pol} n=1: TR = 1/VAT`, r.TR, 1 / 90, 0.003);
    }
}

// ---------------------------------------------------------------------------
// E. Dedicated workers = classic CONWIP line (part 1 of the chapter, Penny Fab)
// ---------------------------------------------------------------------------
{
    const G = 'E. Dedicated workers, Penny Fab (FP §7.2)';
    for (const w of [1, 2, 3, 4, 6, 8]) {
        const r = run({ stations: line([2, 2, 2, 2], 1), workers: workers(4), policy: 'zones', wip: w, warmup: 100 }, 20000).m;
        check(G, `best case w=${w}: TR = min(w/T0, r_b)`, r.TR, Math.min(w / 8, 0.5), 0.003);
        check(G, `best case w=${w}: LT = max(T0, w/r_b)`, r.LT, Math.max(8, w / 0.5), 0.003);
    }
    for (const w of [2, 4, 8]) {
        const cfg = { stations: line([2, 2, 2, 2], 1, 'exp'), workers: workers(4), policy: 'zones', wip: w, warmup: 2000, seed: 11 };
        const r = run(cfg, 600000).m;
        const th = theory(cfg);
        check(G, `PWC (exponential) w=${w}: TR = w/(W0+w-1)·r_b`, r.TR, th.pwc.TR, 0.02);
        check(G, `PWC (exponential) w=${w}: LT = T0+(w-1)/r_b`, r.LT, th.pwc.LT, 0.02);
    }
    // worst case: the same line with the "batch moves" is not modelled; check zones split
    const { computeZones } = require('../engine.js');
    const z = computeZones(line([10, 20, 30, 10, 20], 1), 2);
    assert(G, `zones for n=2 on 10,20,30,10,20 = ${JSON.stringify(z)} (max load 60)`, JSON.stringify(z) === '[[0,2],[3,4]]' || JSON.stringify(z) === '[[0,1],[2,4]]');
}

// ---------------------------------------------------------------------------
// F. Bucket brigade: Bartholdi & Eisenstein (slowest -> fastest)
// ---------------------------------------------------------------------------
{
    const G = 'F. Bucket brigade (Bartholdi & Eisenstein)';
    const st = new Array(20).fill(1);              // fine-grained line, VAT = 20
    const speeds = [0.6, 1.0, 1.4];
    const sf = run({ stations: line(st, 1), workers: workers(3, speeds), policy: 'bucket', wip: Infinity, warmup: 2000 }, 40000);
    const fs = run({ stations: line(st, 1), workers: workers(3, speeds.slice().reverse()), policy: 'bucket', wip: Infinity, warmup: 2000 }, 40000);
    const thSF = theory({ stations: line(st, 1), workers: workers(3, speeds) });
    check(G, 'slow->fast: TR -> sum(v)/VAT = 3/20', sf.m.TR, thSF.TRlabor, 0.01);
    assert(G, `slow->fast: no blocking (blocked share ${(Math.max(...sf.m.workers.map(w => w.blocked)) * 100).toFixed(2)}%)`, sf.m.workers.every(w => w.blocked < 0.005));
    assert(G, `fast->slow is worse: TR ${fs.m.TR.toFixed(4)} < ${sf.m.TR.toFixed(4)}`, fs.m.TR < sf.m.TR * 0.97);
    // handoff points converge to the B&E fixed point
    for (let j = 1; j < 3; j++) {
        const h = sf.sim.handoffs.filter(e => e.j === j && e.t > 30000).map(e => e.wp);
        const avg = h.reduce((a, b) => a + b, 0) / h.length;
        const spread = Math.max(...h) - Math.min(...h);
        check(G, `slow->fast: W${j + 1} takes over at work content ${thSF.bbHandoff[j].toFixed(2)}`, avg, thSF.bbHandoff[j], 0.03);
        assert(G, `slow->fast: W${j + 1} handoff point is stable (spread ${spread.toFixed(3)})`, spread < 0.05);
    }
    // equal speeds, ample machines -> every worker always busy -> TR = n/VAT
    const eq = run({ stations: line([10, 20, 30, 10, 20], 3), workers: workers(3), policy: 'bucket', wip: Infinity, warmup: 900 }, 45000).m;
    check(G, 'equal speeds, ample machines: TR = n/VAT', eq.TR, 3 / 90, 0.003);
    // equal speeds: bucket brigade is logically identical to tied workers (FP §7.4.2, slide 102)
    for (const dist of ['det', 'exp']) {
        const c0 = { stations: line([10, 20, 30, 10, 20], 1, dist), workers: workers(3), wip: 5, warmup: 2000, seed: 9 };
        const a = run(Object.assign({}, c0, { policy: 'tied' }), 200000).m;
        const b = run(Object.assign({}, c0, { policy: 'bucket' }), 200000).m;
        check(G, `equal speeds (${dist}): bucket TR == tied TR (only worker identity changes)`, b.TR, a.TR, 1e-9);
        check(G, `equal speeds (${dist}): bucket LT == tied LT`, b.LT, a.LT, 1e-9);
    }
    // walking time: the reset is not free
    const wk = run({ stations: line(st, 1), workers: workers(3, speeds), policy: 'bucket', wip: Infinity, walk: 0.1, warmup: 2000 }, 40000).m;
    assert(G, `walk time 0.1/station lowers TR (${wk.TR.toFixed(4)} < ${sf.m.TR.toFixed(4)})`, wk.TR < sf.m.TR);
    // no preemption (handoff only between operations): still works
    const np = run({ stations: line(st, 1), workers: workers(3, speeds), policy: 'bucket', wip: Infinity, preempt: false, warmup: 2000 }, 40000).m;
    assert(G, `handoff only between operations: TR ${np.TR.toFixed(4)} <= with preemption`, np.TR <= sf.m.TR * 1.001 && np.TR > 0.5 * sf.m.TR);
}

// ---------------------------------------------------------------------------
// G. Bottleneck at the end of the line (slide 104) and job dropping (105-106)
// ---------------------------------------------------------------------------
{
    const G = 'G. Bottleneck at the end, job dropping (slides 104-106)';
    const st = [4, 4, 4, 4, 12];                   // VAT = 28, TR_b = 1/12
    const tied = run({ stations: line(st, 1), workers: workers(3), policy: 'tied', wip: Infinity, warmup: 1000 }, 50000).m;
    const blockedShare = tied.workers.reduce((a, w) => a + w.blocked, 0) / 3;
    assert(G, `tied, bottleneck at end: workers wait a lot (blocked ${(blockedShare * 100).toFixed(1)}%)`, blockedShare > 0.2);
    // no cap: WIP floods (grows with time)
    const sim = new LaborLine({ stations: line(st, 1), workers: workers(3), policy: 'dropping', wip: Infinity });
    sim.advanceTo(2000); const w1 = sim.jobs.size;
    sim.advanceTo(8000); const w2 = sim.jobs.size;
    assert(G, `dropping without cap floods: WIP ${w1} at t=2000 -> ${w2} at t=8000`, w2 > w1 * 2 && w2 > 50);
    // with a CONWIP cap: max TR, short LT
    const cap = run({ stations: line(st, 1), workers: workers(3), policy: 'dropping', wip: 5, warmup: 1000 }, 50000).m;
    check(G, 'dropping with cap w=5: TR = TR_b = 1/12', cap.TR, 1 / 12, 0.01);
    check(G, 'tied, bottleneck at end: TR = TR_b anyway (machine-bound)', tied.TR, 1 / 12, 0.01);
    // random times: tied workers get blocked; dropping + CONWIP keeps them busy (FP §7.4.3)
    const stE = [4, 4, 4, 4, 12];
    const rt = run({ stations: line(stE, 1, 'exp'), workers: workers(2), policy: 'tied', wip: Infinity, warmup: 2000, seed: 5 }, 300000).m;
    const rd3 = run({ stations: line(stE, 1, 'exp'), workers: workers(2), policy: 'dropping', wip: 3, warmup: 2000, seed: 5 }, 300000).m;
    const rd8 = run({ stations: line(stE, 1, 'exp'), workers: workers(2), policy: 'dropping', wip: 8, warmup: 2000, seed: 5 }, 300000).m;
    assert(G, `exp times, n=2: dropping (w=8) TR ${rd8.TR.toFixed(4)} > tied ${rt.TR.toFixed(4)} by >10%`, rd8.TR > rt.TR * 1.10);
    assert(G, `exp times: labor utilization dropping ${(rd8.laborUtil * 100).toFixed(0)}% > tied ${(rt.laborUtil * 100).toFixed(0)}%`, rd8.laborUtil > rt.laborUtil + 0.1);
    assert(G, `exp times: TR -> n/VAT = ${(2 / 28).toFixed(4)} as the cap grows (w=3: ${rd3.TR.toFixed(4)}, w=8: ${rd8.TR.toFixed(4)})`, rd3.TR < rd8.TR && rd8.TR <= 2 / 28 * 1.01 && rd8.TR > 2 / 28 * 0.95);
    assert(G, `exp times: ...paid with lead time, LT(w=8) ${rd8.LT.toFixed(1)} > LT(w=3) ${rd3.LT.toFixed(1)} (Little)`, rd8.LT > rd3.LT * 1.5);
}

// ---------------------------------------------------------------------------
// H. Little's law and invariants for every policy, random configurations
// ---------------------------------------------------------------------------
{
    const G = 'H. Little + invariants (random fuzz)';
    const rng = require('../engine.js').mulberry32(2026);
    const pols = ['tied', 'bucket', 'dropping', 'zones'];
    const dists = ['det', 'exp', 'normal', 'uniform'];
    let fails = 0, littleWorst = 0, runs = 0, stuck = 0;
    for (let i = 0; i < 160; i++) {
        const N = 2 + Math.floor(rng() * 7), n = 1 + Math.floor(rng() * 7);
        const st = Array.from({ length: N }, () => 1 + Math.round(rng() * 9));
        const m = Array.from({ length: N }, () => 1 + Math.floor(rng() * 3));
        const cfg = {
            stations: st.map((s, k) => ({ st: s, m: m[k], dist: dists[Math.floor(rng() * 4)], cv: 0.2 + rng() })),
            workers: Array.from({ length: n }, () => ({ speed: 0.5 + rng() })),
            policy: pols[i % 4], wip: rng() < 0.3 ? Infinity : 1 + Math.floor(rng() * 12),
            walk: rng() < 0.4 ? Math.round(rng() * 10) / 10 : 0, preempt: rng() < 0.7, warmup: 500, seed: i + 1
        };
        if ((cfg.policy === 'dropping' || cfg.policy === 'zones') && !isFinite(cfg.wip)) cfg.wip = 1 + Math.floor(rng() * 12);  // avoid flooding in Little test
        let r;
        try { r = run(cfg, 20000, true); } catch (e) { fails++; results.push({ group: G, name: 'exception ' + e.message + ' ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        runs++;
        if (r.errs.length) { fails++; results.push({ group: G, name: 'invariant: ' + r.errs[0] + ' cfg ' + JSON.stringify(cfg), ok: false, bool: true }); }
        if (r.m.exits < 20) { stuck++; results.push({ group: G, name: 'too few exits (deadlock?) ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        littleWorst = Math.max(littleWorst, Math.abs(r.m.littleErr));
        const det = cfg.stations.every(s => s.dist === 'det');
        if (r.m.TR > theory(cfg).TRmax * (det ? 1.005 : 1.06)) { fails++; results.push({ group: G, name: `TR above min(Σv/VAT,TR_b) ${r.m.TR} cfg ${JSON.stringify(cfg)}`, ok: false, bool: true }); }
    }
    assert(G, `${runs} random runs: invariants hold, no deadlock, TR <= min(Σv/VAT, TR_b·v) (${fails} failures, ${stuck} stuck)`, fails === 0 && stuck === 0);
    assert(G, `Little's law |WIP - TR·LT|/WIP worst = ${(littleWorst * 100).toFixed(2)}% (< 3%, finite horizon)`, littleWorst < 0.03);
}

// ---------------------------------------------------------------------------
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
let lastG = '', nOk = 0;
for (const r of results) {
    if (r.group !== lastG) { console.log('\n' + r.group); lastG = r.group; }
    if (r.ok) nOk++;
    const tag = r.ok ? 'PASS' : 'FAIL';
    if (r.bool) console.log(`  ${tag}  ${r.name}`);
    else console.log(`  ${tag}  ${pad(r.name, 52)} sim ${r.measured.toFixed(4)}  theory ${r.expected.toFixed(4)}  (err ${(rel(r.measured, r.expected) * 100).toFixed(2)}%, tol ${(r.tol * 100).toFixed(1)}%)`);
}
console.log(`\n${nOk}/${results.length} checks passed`);
process.exitCode = nOk === results.length ? 0 : 1;
