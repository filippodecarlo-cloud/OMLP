/* Validation of the engine against the slides (Factory Dynamics, part 2)
   and Factory Physics §7.2-7.4.   Run:  node tests/validate.js           */
'use strict';
const { LaborLine, FlowLine, theory } = require('../engine.js');

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

// ===========================================================================
// PART 1 - machines without workers (the original Factory Flow Simulation)
// ===========================================================================
function mline(st, opts = {}) {
    return st.map((s, k) => Object.assign({ st: s, m: 1, dist: 'det', cv: 0.5 }, typeof opts === 'function' ? opts(k) : opts));
}
{
    const G = 'I. Part 1: machines, best / worst / practical worst case';
    for (const w of [1, 2, 4, 6, 8]) {
        const r = run({ mode: 'machines', stations: mline([2, 2, 2, 2]), wip: w, warmup: 100 }, 20000).m;
        check(G, `best case w=${w}: TR = min(w/T0, r_b)`, r.TR, Math.min(w / 8, 0.5), 0.003);
        check(G, `best case w=${w}: LT = max(T0, w/r_b)`, r.LT, Math.max(8, w / 0.5), 0.003);
    }
    // worst case (slide 26): parts moved all together -> move lot = w at every station
    for (const w of [2, 4]) {
        const r = run({ mode: 'machines', stations: mline([2, 2, 2, 2], { move: w }), wip: w, warmup: 200 }, 40000).m;
        check(G, `worst case w=${w} (move lot = w): TR = 1/T0`, r.TR, 1 / 8, 0.003);
        check(G, `worst case w=${w} (move lot = w): LT = w·T0`, r.LT, w * 8, 0.003);
    }
    for (const w of [2, 4, 8]) {
        const cfg = { mode: 'machines', stations: mline([2, 2, 2, 2], { dist: 'exp' }), wip: w, warmup: 2000, seed: 21 };
        const r = run(cfg, 600000).m;
        const th = theory(cfg);
        check(G, `PWC (exponential) w=${w}: TR`, r.TR, th.pwc.TR, 0.02);
        check(G, `PWC (exponential) w=${w}: LT`, r.LT, th.pwc.LT, 0.02);
    }
}
{
    const G = 'J. Part 1: capacity (parallel machines, OEE, batches)';
    const par = run({ mode: 'machines', stations: mline([2, 6, 2], k => ({ m: k === 1 ? 3 : 1 })), wip: 10, warmup: 200 }, 20000).m;
    check(G, '3 parallel machines of 6: TR_b = 3/6 = 0.5', par.TR, 0.5, 0.003);
    const oee = run({ mode: 'machines', stations: mline([2, 2, 2], k => ({ oee: k === 1 ? 0.8 : 1 })), wip: 10, warmup: 200 }, 20000).m;
    check(G, 'OEE 0.8 on 2 min: TR_b = 0.8/2 = 0.4', oee.TR, 0.4, 0.003);
    const thO = theory({ mode: 'machines', stations: mline([2, 2, 2], k => ({ oee: k === 1 ? 0.8 : 1 })), wip: 10 });
    check(G, 'theory(): T0 = 2 + 2.5 + 2 = 6.5', thO.T0, 6.5, 1e-9);
    // oven: 4 h for a batch of 2 -> 0.5 parts/h, like the other stations
    const cfgB = { mode: 'machines', stations: mline([2, 4, 2], k => ({ batch: k === 1 ? 2 : 1 })), wip: 6, warmup: 200 };
    const bat = run(cfgB, 20000).m;
    check(G, 'batch of 2 in 4 h: TR_b = 2/4 = 0.5', bat.TR, 0.5, 0.003);
    check(G, 'theory(): batch station capacity = b·m/t = 0.5', theory(cfgB).rate[1], 0.5, 1e-9);
    const bat3 = run({ mode: 'machines', stations: mline([2, 4, 2], k => ({ batch: k === 1 ? 3 : 1 })), wip: 9, warmup: 200 }, 20000).m;
    check(G, 'batch of 3 in 4 h: bottleneck moves to the 2 h stations (0.5)', bat3.TR, 0.5, 0.003);
    // original simulator, "Balanced line" preset: 5 stations of 5 s, buffers 2, WIP 9 -> 720 parts/h
    const bal = run({ mode: 'machines', stations: mline([5, 5, 5, 5, 5]), buffers: [2, 2, 2, 2], wip: 9, warmup: 100 }, 36000).m;
    check(G, 'original "Balanced line" preset: 720 parts/h', bal.TR * 3600, 720, 0.003);
}
{
    const G = 'K. Part 1: finite buffers and blocking';
    // two exponential machines, push, buffer B: TH = (B+2)/(B+3)·mu (birth-death on B+3 states)
    for (const B of [0, 1, 3]) {
        const r = run({ mode: 'machines', stations: mline([1, 1], { dist: 'exp' }), buffers: [B], wip: Infinity, warmup: 1000, seed: 3 + B }, 400000).m;
        check(G, `2 exp. machines, buffer ${B}: TH = ${B + 2}/${B + 3}`, r.TR, (B + 2) / (B + 3), 0.015);
    }
    // deterministic balanced line with no buffers: no loss
    const d0 = run({ mode: 'machines', stations: mline([3, 3, 3]), buffers: [0, 0], wip: Infinity, warmup: 100 }, 9000).m;
    check(G, 'deterministic balanced line, buffers 0, push: TR = 1/3', d0.TR, 1 / 3, 0.003);
    // push with a slow downstream station: finite buffers cap the WIP, unlimited ones flood
    const pf = run({ mode: 'machines', stations: mline([2, 2, 4]), buffers: [2, 2], wip: Infinity, warmup: 200 }, 20000);
    assert(G, `push with buffers 2: WIP stays bounded (${pf.sim.jobs.size} jobs at the end)`, pf.sim.jobs.size <= 2 + 2 + 3);
    check(G, 'push with buffers 2: TR = bottleneck 1/4', pf.m.TR, 0.25, 0.003);
    const fl = new FlowLine({ mode: 'machines', stations: mline([2, 2, 4]), wip: Infinity });
    fl.advanceTo(2000); const a1 = fl.jobs.size; fl.advanceTo(8000); const a2 = fl.jobs.size;
    assert(G, `push with unlimited buffers floods: WIP ${a1} -> ${a2}`, a2 > 2 * a1 && a2 > 100);
    // blocking in the original "Bottleneck (S3)" preset: S2 is blocked part of the time
    const bn = run({ mode: 'machines', stations: [{ st: 4, dist: 'uniform', cv: 0.14, oee: 0.95 }, { st: 4, dist: 'normal', cv: 0.3, oee: 0.9 }, { st: 8, oee: 0.8 }, { st: 4, dist: 'uniform', cv: 0.14, oee: 0.95 }, { st: 4, dist: 'normal', cv: 0.3, oee: 0.9 }],
        buffers: [3, 1, 3, 3], wip: 10, warmup: 1000, seed: 5 }, 200000).m;
    check(G, 'original "Bottleneck (S3)": TR = 0.8/8 s = 360 parts/h', bn.TR * 3600, 360, 0.005);
    assert(G, `...and S2 is blocked behind the 1-place buffer (${(bn.stations[1].blocked * 100).toFixed(1)}% of time)`, bn.stations[1].blocked > 0.05);
    check(G, "Little in the bottleneck preset", bn.littleTRxLT, bn.WIP, 0.01);
}
// ===========================================================================
// EXTENSIONS - machine tending, skill matrix, stops
// ===========================================================================
{
    const G = 'L. Extensions: one worker tends several machines';
    // slide 89, one operator follows 3 parallel machines: load 1 min, automatic cycle 4 min
    const par = mline([1], { auto: 4, m: 3 });
    const one = run({ stations: par, workers: workers(1), policy: 'dropping', wip: 6, warmup: 500 }, 50000).m;
    check(G, '1 worker, 3 machines (1 + 4 min): TR = min(1/1, 3/5) = 0.6', one.TR, 0.6, 0.003);
    check(G, '...the worker is busy 60% of the time', one.laborUtil, 0.6, 0.005);
    const par4 = run({ stations: mline([1], { auto: 4, m: 6 }), workers: workers(1), policy: 'dropping', wip: 8, warmup: 500 }, 50000).m;
    check(G, '1 worker, 6 machines: labor becomes the constraint, TR = 1', par4.TR, 1, 0.003);
    const th1 = theory({ stations: mline([1], { auto: 4, m: 6 }), workers: workers(1), policy: 'dropping', wip: 8 });
    assert(G, 'theory(): binding constraint = labor with 6 machines', th1.binding === 'labor');
    // serial line, one machine per station: machine interference (the next part arrives when the worker is needed upstream)
    const st = mline([1, 1, 1], { auto: 4 });
    const r = run({ stations: st, workers: workers(1), policy: 'dropping', wip: 6, warmup: 500 }, 50000).m;
    const th = theory({ stations: st, workers: workers(1), policy: 'dropping', wip: 6 });
    check(G, 'theory(): labor content per part = 3 min', th.laborContent, 3, 1e-9);
    check(G, 'serial 3 x (1 + 4 min), 1 worker: interference gives a 6 min cycle (TR = 1/6)', r.TR, 1 / 6, 0.005);
    assert(G, `...below the bound min(1/3, 1/5) = 0.2`, r.TR < th.TRmax);
    const r2 = run({ stations: st, workers: workers(3), policy: 'dropping', wip: 6, warmup: 500 }, 50000).m;
    check(G, 'serial, three workers: no interference, TR = 1/5', r2.TR, 0.2, 0.005);
    // tied workers wait for the automatic cycle: TR = n / sum(manual + auto)
    const tied = run({ stations: mline([1, 1, 1], { auto: 4, m: 2 }), workers: workers(2), policy: 'tied', wip: 2, warmup: 500 }, 50000).m;
    check(G, 'tied workers wait for the machine: TR = 2/15', tied.TR, 2 / 15, 0.003);
    check(G, 'theory(): tied formula with automatic cycle', theory({ stations: mline([1, 1, 1], { auto: 4, m: 2 }), workers: workers(2), policy: 'tied', wip: 2 }).tied.TR, 2 / 15, 1e-9);
}
{
    const G = 'M. Extensions: skill matrix (cross-training)';
    const st = mline([5, 5, 5]);
    const skills = [[true, true, false], [false, true, true]];
    const r = run({ stations: st, workers: workers(2), policy: 'zones', skills, wip: 4, warmup: 500 }, 50000, true);
    assert(G, 'workers never work outside their skills (invariants)', r.errs.length === 0);
    const fixed = run({ stations: st, workers: workers(2), policy: 'zones', skills: [[true, true, false], [false, false, true]], wip: 4, warmup: 500 }, 50000).m;
    check(G, 'no cross-training (zones 10 + 5 min): TR = 1/10', fixed.TR, 0.1, 0.01);
    assert(G, `shared middle station: TR ${r.m.TR.toFixed(4)} between 1/10 and the labor bound 2/15`, r.m.TR >= fixed.TR - 1e-9 && r.m.TR <= 2 / 15 + 1e-9);
    const rE = run({ stations: mline([5, 5, 5], { dist: 'exp' }), workers: workers(2), policy: 'zones', skills, wip: 6, warmup: 2000, seed: 3 }, 300000).m;
    const fE = run({ stations: mline([5, 5, 5], { dist: 'exp' }), workers: workers(2), policy: 'zones', skills: [[true, true, false], [false, false, true]], wip: 6, warmup: 2000, seed: 3 }, 300000).m;
    assert(G, `random times: cross-training raises TR (${fE.TR.toFixed(4)} -> ${rE.TR.toFixed(4)})`, rE.TR > fE.TR * 1.05);
    const thNo = theory({ stations: st, workers: workers(2), policy: 'zones', skills: [[true, false, false], [false, false, true]], wip: 4 });
    assert(G, 'theory() warns when no worker can operate a station', thNo.warnings.some(x => /No worker can operate S2/.test(x)));
    const stuck = new FlowLine({ stations: st, workers: workers(2), policy: 'zones', skills: [[true, false, false], [false, false, true]], wip: 4 });
    stuck.advanceTo(500);
    assert(G, 'the engine reports the stop (stalled = true)', stuck.stalled === true);
}
{
    const G = 'N. Stops and warnings';
    const th = theory({ mode: 'machines', stations: mline([2, 4, 2], k => ({ batch: k === 1 ? 3 : 1 })), wip: 2 });
    assert(G, 'w smaller than a batch: warning', th.warnings.some(x => /smaller than the largest batch/.test(x)));
    const s = new FlowLine({ mode: 'machines', stations: mline([2, 4, 2], k => ({ batch: k === 1 ? 3 : 1 })), wip: 2 });
    s.advanceTo(200);
    assert(G, 'w smaller than a batch: the engine reports the stop', s.stalled === true);
    const c = require('../engine.js').normalize({ mode: 'machines', stations: mline([2, 4, 2], k => ({ batch: k === 1 ? 3 : 1, move: k === 0 ? 2 : 1 })), buffers: [0, 0] });
    assert(G, `a buffer holds at least a whole batch / move lot (capacity ${c.buffers[1]})`, c.buffers[1] === 3);
    const t2 = theory({ stations: mline([2, 2], { batch: 2 }), workers: workers(2), policy: 'tied', wip: 4 });
    assert(G, 'batches ignored with tied workers: warning', t2.warnings.some(x => /ignored/.test(x)));
}
{
    const G = 'O. Fuzz on every feature (invariants, no unexplained stop, Little)';
    const rng = require('../engine.js').mulberry32(4242);
    const pols = ['tied', 'bucket', 'dropping', 'zones'];
    const dists = ['det', 'exp', 'normal', 'uniform', 'tri'];
    let runs = 0, fails = 0, littleWorst = 0, littleRuns = 0, lotStops = 0;
    for (let i = 0; i < 240; i++) {
        const N = 2 + Math.floor(rng() * 6), n = 1 + Math.floor(rng() * 6);
        const machines = rng() < 0.4;
        const stations = Array.from({ length: N }, () => ({
            st: 1 + Math.round(rng() * 9), auto: rng() < 0.25 ? Math.round(rng() * 8) : 0, m: 1 + Math.floor(rng() * 3),
            batch: rng() < 0.2 ? 2 + Math.floor(rng() * 2) : 1, move: rng() < 0.15 ? 2 + Math.floor(rng() * 2) : 1,
            oee: rng() < 0.3 ? 0.6 + rng() * 0.4 : 1, dist: dists[Math.floor(rng() * 5)], cv: 0.1 + rng()
        }));
        const buffers = Array.from({ length: N - 1 }, () => rng() < 0.5 ? Math.floor(rng() * 4) : null);
        const cfg = {
            mode: machines ? 'machines' : 'labor', stations, buffers,
            workers: Array.from({ length: n }, () => ({ speed: 0.5 + rng() })), policy: pols[i % 4],
            wip: 3 + Math.floor(rng() * 12), walk: rng() < 0.3 ? Math.round(rng() * 10) / 10 : 0, preempt: rng() < 0.7, warmup: 500, seed: i + 7
        };
        if (cfg.policy === 'zones' && rng() < 0.5) cfg.skills = Array.from({ length: n }, (_, j) => Array.from({ length: N }, (_, k) => k % n === j || rng() < 0.3));
        const th = theory(cfg);
        const stops = th.warnings.some(x => /stops|may stop/.test(x));
        let r;
        try { r = run(cfg, 15000, true); } catch (e) { fails++; results.push({ group: G, name: 'exception ' + e.message + ' ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        runs++;
        if (r.errs.length) { fails++; results.push({ group: G, name: 'invariant: ' + r.errs[0] + ' ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        if (r.sim.stalled && !stops) {
            if (cfg.stations.some(s => s.move > 1) && !th.carry) { lotStops++; continue; }
            fails++; results.push({ group: G, name: 'unexplained stop ' + JSON.stringify(cfg), ok: false, bool: true }); continue;
        }
        if (!stops && !r.sim.stalled && r.m.exits > 300) {
            littleRuns++;
            littleWorst = Math.max(littleWorst, Math.abs(r.m.littleErr));
            const det = cfg.stations.every(s => s.dist === 'det');
            if (r.m.TR > th.TRmax * (det ? 1.01 : 1.08)) { fails++; results.push({ group: G, name: `TR ${r.m.TR} above bound ${th.TRmax} ${JSON.stringify(cfg)}`, ok: false, bool: true }); }
        }
    }
    assert(G, `${runs} random runs with batches, move lots, buffers, automatic cycles, OEE, skills: ${fails} failures (${lotStops} stops caused by incomplete move lots)`, fails === 0);
    assert(G, `Little's law on ${littleRuns} stable runs: worst |WIP - TR·LT|/WIP = ${(littleWorst * 100).toFixed(2)}%`, littleWorst < 0.04);
}

// ===========================================================================
// LIVE CHANGES - update() while the line runs, then resetStats()
// ===========================================================================
function live(cfg, steps, T) {
    // steps: [{t, change(cfg) -> cfg}] ; statistics restart a little after each change
    const sim = new FlowLine(cfg);
    let cur = JSON.parse(JSON.stringify(cfg, (k, v) => v === Infinity ? 'INF' : v), (k, v) => v === 'INF' ? Infinity : v);
    const errs = [];
    for (const st of steps) {
        sim.advanceTo(st.t);
        cur = st.change(cur);
        sim.update(cur);
        errs.push(...sim.checkInvariants());
        sim.advanceTo(st.t + (st.settle || 500));
        sim.resetStats();
    }
    const step = (T - sim.t) / 100;
    for (let i = 0; i < 100; i++) { sim.advanceTo(sim.t + step); errs.push(...sim.checkInvariants()); if (errs.length) break; }
    return { sim, m: sim.metrics(), errs };
}
{
    const G = 'P. Live changes (no restart) + restart of the statistics';
    const pf = (w, o) => Object.assign({ mode: 'machines', stations: mline([2, 2, 2, 2]), wip: w, warmup: 100 }, o || {});
    let r = live(pf(2), [{ t: 1000, change: c => Object.assign(c, { wip: 6 }) }], 8000);
    check(G, 'Penny Fab, w 2 → 6 while running: TR = 0.5', r.m.TR, 0.5, 0.003);
    check(G, 'Penny Fab, w 2 → 6 while running: LT = w/r_b = 12', r.m.LT, 12, 0.003);
    r = live(pf(6), [{ t: 1000, change: c => Object.assign(c, { wip: 2 }) }], 8000);
    check(G, 'Penny Fab, w 6 → 2: the extra jobs drain, TR = 2/8', r.m.TR, 0.25, 0.003);
    assert(G, `...and the WIP settles at 2 (${r.sim.jobs.size}), invariants ok (${r.errs.length})`, r.sim.jobs.size === 2 && r.errs.length === 0);
    const pizza = n => ({ stations: mline([3, 3, 4, 4, 3, 3], { m: 4 }), workers: workers(n), policy: 'tied', wip: 8, warmup: 40 });
    r = live(pizza(2), [{ t: 400, change: c => Object.assign(c, { workers: workers(4) }) }], 6000);
    check(G, 'pizza shop, 2 → 4 workers while running: LT = 40', r.m.LT, 40, 0.003);
    check(G, '...TR = 0.20', r.m.TR, 0.2, 0.003);
    r = live(pizza(4), [{ t: 400, change: c => Object.assign(c, { workers: workers(2) }) }], 6000);
    check(G, 'pizza shop, 4 → 2 workers: they leave after their job, LT = 80', r.m.LT, 80, 0.003);
    assert(G, `...2 workers left (${r.sim.workers.length}), invariants ok (${r.errs.length})`, r.sim.workers.length === 2 && r.errs.length === 0);
    const bb = { stations: mline(new Array(20).fill(1)), workers: workers(3, [0.6, 1.0, 1.4]), policy: 'bucket', wip: Infinity, warmup: 200 };
    r = live(bb, [{ t: 2000, change: c => Object.assign(c, { workers: workers(2, [0.6, 1.0]) }) }], 20000);
    check(G, 'bucket brigade 3 → 2 workers (0.6, 1.0): TR = 1.6/20', r.m.TR, 0.08, 0.01);
    assert(G, `...order kept, invariants ok (${r.errs.length})`, r.errs.length === 0 && r.sim.workers.length === 2);
    r = live(bb, [{ t: 2000, change: c => Object.assign(c, { workers: workers(2, [0.6, 1.0]) }) }, { t: 6000, change: c => Object.assign(c, { workers: workers(3, [0.6, 1.0, 1.4]) }) }], 30000);
    check(G, '...and back to 3 workers: TR = 3/20 again', r.m.TR, 0.15, 0.01);
    const sp = { stations: mline([10, 20, 30, 10, 20], { m: 2 }), workers: workers(2), policy: 'tied', wip: 4, warmup: 200 };
    r = live(sp, [{ t: 1000, change: c => Object.assign(c, { workers: workers(2, [2, 2]) }) }], 20000);
    check(G, 'slide 90 example, speeds 1 → 2 while running: TR = 4/90', r.m.TR, 4 / 90, 0.005);
    const mm = m => ({ mode: 'machines', stations: mline([2, 6, 2], k => ({ m: k === 1 ? m : 1 })), wip: 10, warmup: 100 });
    r = live(mm(1), [{ t: 1000, change: c => { c.stations[1].m = 3; return c; } }], 8000);
    check(G, 'S2 from 1 to 3 machines while running: TR = 0.5', r.m.TR, 0.5, 0.003);
    r = live(mm(3), [{ t: 1000, change: c => { c.stations[1].m = 1; return c; } }], 8000);
    check(G, 'S2 from 3 to 1 machine: the extra machines leave when free, TR = 1/6', r.m.TR, 1 / 6, 0.003);
    assert(G, `...S2 has 1 machine left (${r.sim.machines[1].length})`, r.sim.machines[1].length === 1);
    const two = B => ({ mode: 'machines', stations: mline([1, 1], { dist: 'exp' }), buffers: [B], wip: Infinity, warmup: 1000, seed: 9 });
    r = live(two(3), [{ t: 5000, change: c => Object.assign(c, { buffers: [0] }), settle: 1000 }], 300000);
    check(G, 'two exp. machines, buffer 3 → 0 while running: TH = 2/3', r.m.TR, 2 / 3, 0.015);
    r = live({ mode: 'machines', stations: mline([2, 2, 4]), buffers: [2, 2], wip: 6, warmup: 100 }, [{ t: 1000, change: c => Object.assign(c, { wip: Infinity }) }], 6000);
    check(G, 'CONWIP → push with buffers 2: TR = bottleneck 1/4', r.m.TR, 0.25, 0.003);
    assert(G, `...the buffers cap the WIP (${r.sim.jobs.size} ≤ 7)`, r.sim.jobs.size <= 7 && r.errs.length === 0);
    r = live({ mode: 'machines', stations: mline([2, 2, 4]), wip: Infinity, warmup: 100 }, [{ t: 300, change: c => Object.assign(c, { wip: 3 }), settle: 3000 }], 9000);
    assert(G, `push (flooding) → CONWIP 3: the WIP drains down to 3 (${r.sim.jobs.size})`, r.sim.jobs.size === 3);
    check(G, '...then best case with w = 3: LT = max(T0, w/r_b) = 12', r.m.LT, 12, 0.003);
    // fuzz: random sequences of live changes
    const rng = require('../engine.js').mulberry32(777);
    const pols = ['tied', 'bucket', 'dropping', 'zones'];
    let fails = 0, runs = 0, unfinished = 0;
    for (let i = 0; i < 120; i++) {
        const N = 2 + Math.floor(rng() * 5);
        const machines = rng() < 0.35;
        const mk = () => Array.from({ length: N }, () => ({
            st: 1 + Math.round(rng() * 8), auto: rng() < 0.2 ? Math.round(rng() * 6) : 0, m: 1 + Math.floor(rng() * 3),
            batch: rng() < 0.15 ? 2 : 1, move: 1, oee: rng() < 0.3 ? 0.7 : 1, dist: ['det', 'exp', 'uniform'][Math.floor(rng() * 3)], cv: 0.4
        }));
        const cfg = { mode: machines ? 'machines' : 'labor', stations: mk(), buffers: Array.from({ length: N - 1 }, () => rng() < 0.5 ? Math.floor(rng() * 4) : null),
            workers: workers(1 + Math.floor(rng() * 4)), policy: pols[i % 4], wip: 4 + Math.floor(rng() * 8), walk: rng() < 0.3 ? 0.5 : 0, warmup: 0, seed: i + 1 };
        const steps = [];
        let t = 0, target = cfg.workers.length;
        for (let c = 0; c < 4; c++) {
            t += 200 + rng() * 800;
            const kind = Math.floor(rng() * 7);
            const nn = 1 + Math.floor(rng() * 5);
            if (kind === 1) target = nn;
            steps.push({ t, settle: 10, change: cur => {
                if (kind === 0) cur.wip = rng() < 0.2 ? Infinity : 2 + Math.floor(rng() * 10);
                if (kind === 1) { cur.workers = workers(nn, Array.from({ length: nn }, () => 0.5 + rng())); cur.skills = null; }
                if (kind === 2) cur.stations.forEach(s => { s.m = 1 + Math.floor(rng() * 3); });
                if (kind === 3) cur.buffers = cur.buffers.map(() => rng() < 0.5 ? Math.floor(rng() * 3) : null);
                if (kind === 4) cur.stations.forEach(s => { s.st = 1 + Math.round(rng() * 8); s.dist = ['det', 'exp', 'normal'][Math.floor(rng() * 3)]; });
                if (kind === 5) cur.walk = rng() < 0.5 ? 0 : 0.3;
                if (kind === 6 && cur.policy === 'zones') cur.skills = cur.workers.map(() => cur.stations.map(() => rng() < 0.6));
                return cur;
            } });
        }
        let r2;
        try { r2 = live(cfg, steps, t + 5000); } catch (e) { fails++; results.push({ group: G, name: 'exception ' + e.message + ' ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        runs++;
        if (r2.errs.length) { fails++; results.push({ group: G, name: 'invariant after live changes: ' + r2.errs[0] + ' ' + JSON.stringify(cfg), ok: false, bool: true }); continue; }
        if (!machines && !r2.sim.stalled && r2.sim.workers.length !== target) unfinished++;
    }
    assert(G, `${runs} random runs with 4 live changes each: ${fails} failures`, fails === 0);
    assert(G, `removed workers always leave once free (${unfinished} runs still waiting)`, unfinished === 0);
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
