/* =====================================================================
   Factory Flow Lab - Factory Challenge (e-bike cell)
   Scenario, rules, events, deterministic scoring of a shift, team codes.
   Uses FlowEngine (engine.js). Works in the browser (window.FlowChallenge)
   and in Node (require).
   ---------------------------------------------------------------------
   A team plan is a timeline of decisions: [{t: 0, d}, {t: 120, d}, ...]
   (t = minutes from the start of the shift, only 0 and the event times).
   runShift() replays it on the engine with the scenario seed, so the
   leaderboard can recompute every team's result from its code.
   ===================================================================== */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
    else root.FlowChallenge = factory(root.FlowEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
    'use strict';

    const EBIKE = {
        id: 'ebike',
        title: 'E-bike Cell Challenge',
        unit: 'min',
        shift: { start: '08:00', length: 480 },
        seed: 2026,
        walk: 0.2,
        stations: [
            { key: 'S1', name: 'Frame prep', st: 6, auto: 0, m: 1, batch: 1, oee: 1, dist: 'uniform', cv: 0.3 },
            { key: 'S2', name: 'Welding robot', st: 1, auto: 4, m: 1, batch: 1, oee: 0.85, dist: 'uniform', cv: 0.3 },
            { key: 'S3', name: 'Paint booth', st: 7, auto: 0, m: 1, batch: 1, oee: 1, dist: 'uniform', cv: 0.3 },
            { key: 'S4', name: 'Assembly', st: 12, auto: 0, m: 2, batch: 1, oee: 1, dist: 'uniform', cv: 0.3 },
            { key: 'S5', name: 'Test bench', st: 2, auto: 3, m: 1, batch: 1, oee: 1, dist: 'uniform', cv: 0.3 }
        ],
        // the team: speed and stations each person is already trained for
        crew: [
            { name: 'Anna', speed: 1.3, skills: [true, true, false, false, false], note: 'senior, welding expert' },
            { name: 'Bruno', speed: 1.0, skills: [false, false, true, true, false], note: 'painter and assembler' },
            { name: 'Carla', speed: 0.7, skills: [false, false, false, true, true], note: 'new hire' }
        ],
        temps: [
            { name: 'Dario', speed: 1.0, skills: [false, false, false, true, false], cost: 300, note: 'temp worker, assembler' },
            { name: 'Elena', speed: 1.2, skills: [true, false, false, true, false], cost: 420, note: 'experienced temp' }
        ],
        // investments, cost per shift (leasing / service)
        items: [
            { id: 'robot2', label: 'Second welding robot (S2: 2 machines)', cost: 300 },
            { id: 'booth2', label: 'Second paint booth (S3: 2 machines)', cost: 300 },
            { id: 'bench1', label: 'Second frame bench (S1: 2 machines)', cost: 150 },
            { id: 'tester2', label: 'Second test bench (S5: 2 machines)', cost: 150 },
            { id: 'tpmRobot', label: 'TPM on the robot (S2: OEE 0.85 → 0.95)', cost: 150 },
            { id: 'jig', label: 'Painting jig (S3: 7 → 6 min)', cost: 200 },
            { id: 'stdWork', label: 'Standard work in assembly (S4: 12 → 10 min, CV 0.3 → 0.1)', cost: 250 }
        ],
        economics: {
            demand: 50,            // bikes ordered for the shift
            promise: 120,          // promised lead time [min], from release to finished bike
            margin: 300,           // € per bike delivered (only up to the demand)
            missing: 150,          // € penalty per bike not delivered
            late: 60,              // € penalty per bike with LT above the promise
            wage: 240,             // € per shift for each of Anna, Bruno, Carla (paid also if sick)
            training: 60,          // € per new skill (one worker, one station)
            wipCost: 3,            // € per bike per hour in the system
            emergency: 2           // price multiplier for decisions taken during the shift
        },
        events: [
            { t: 120, id: 'sick', clock: '10:00', title: 'Carla is sick', text: 'Carla goes home at 10:00 and does not come back. She finishes the bike in her hands first.' },
            { t: 240, id: 'robot', clock: '12:00', title: 'Robot fault', text: 'From 12:00 the welding robot loses 20 points of OEE until the end of the shift.' },
            { t: 360, id: 'rush', clock: '14:00', title: 'Rush order', text: 'From 14:00 the customer wants every bike within 60 min of its release (late penalty as before).' }
        ]
    };
    const SCENARIOS = { ebike: EBIKE };

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function clock(scn, t) {
        const [h, m] = scn.shift.start.split(':').map(Number);
        const tot = Math.round(h * 60 + m + t);
        return String(Math.floor(tot / 60) % 24).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
    }
    const person = (scn, name) => scn.crew.find(p => p.name === name) || scn.temps.find(p => p.name === name);

    // the plan a team starts from: dedicated zones, what is already there
    function baseDecision(scn) {
        const skills = {};
        scn.crew.forEach(p => { skills[p.name] = p.skills.slice(); });
        return { policy: 'zones', order: scn.crew.map(p => p.name), hires: [], skills, wip: 10, buy: {}, preempt: true };
    }
    // policies where every worker must be able to do every station
    const FULL_FLEX = { tied: true, bucket: true, dropping: true };

    // state of the shift at time t (which events already happened)
    function stateAt(scn, t, practice) {
        const s = { sick: [], robotLoss: 0, promise: scn.economics.promise };
        if (practice) return s;                       // practice shift: a normal day, no events
        scn.events.forEach(e => {
            if (t + 1e-9 < e.t) return;
            if (e.id === 'sick') s.sick.push('Carla');
            if (e.id === 'robot') s.robotLoss = 0.2;
            if (e.id === 'rush') s.promise = 60;
        });
        return s;
    }

    function stationsFor(scn, d, st) {
        const S = clone(scn.stations);
        const b = d.buy || {};
        if (b.robot2) S[1].m = 2;
        if (b.tpmRobot) S[1].oee = 0.95;
        S[1].oee = +(S[1].oee - st.robotLoss).toFixed(4);
        if (b.booth2) S[2].m = 2;
        if (b.jig) S[2].st = 6;
        if (b.bench1) S[0].m = 2;
        if (b.tester2) S[4].m = 2;
        if (b.stdWork) { S[3].st = 10; S[3].cv = 0.1; }
        return S.map(x => ({ st: x.st, auto: x.auto, m: x.m, batch: x.batch, move: 1, oee: x.oee, dist: x.dist, cv: x.cv }));
    }

    // people working (team order; hires taken during the shift go at the end of the order)
    function workersFor(scn, d, st) {
        const names = d.order.concat(d.hires.filter(h => !d.order.includes(h))).filter(n => !st.sick.includes(n));
        return names.map(n => ({ name: n, speed: person(scn, n).speed }));
    }

    function engineConfig(scn, d, st) {
        const workers = workersFor(scn, d, st);
        const skills = workers.map(w => (d.skills[w.name] || person(scn, w.name).skills).slice());
        return {
            mode: 'labor', policy: d.policy, stations: stationsFor(scn, d, st), workers, skills,
            wip: d.wip > 0 ? d.wip : Infinity, walk: scn.walk, preempt: d.preempt !== false, warmup: 0, seed: scn.seed,
            traceLimit: 3000, stateLimit: 3000
        };
    }

    // skills each person must have: everything with a full-flexibility policy
    function requiredSkills(scn, d, name) {
        const own = (d.skills[name] || person(scn, name).skills);
        return FULL_FLEX[d.policy] ? own.map(() => true) : own;
    }

    // cost of the decision d taken at time t, on top of the previous decision prev (null at the start)
    function costOf(scn, d, prev, t) {
        const ec = scn.economics, mult = t > 0 ? ec.emergency : 1;
        const lines = [];
        const b = d.buy || {}, pb = (prev && prev.buy) || {};
        scn.items.forEach(it => { if (b[it.id] && !pb[it.id]) lines.push({ what: it.label, cost: it.cost * mult }); });
        const ph = prev ? prev.hires : [];
        d.hires.filter(h => !ph.includes(h)).forEach(h => lines.push({ what: 'Temp worker ' + h, cost: person(scn, h).cost * mult }));
        const people = [...new Set(d.order.concat(d.hires))];
        let newSkills = 0;
        people.forEach(n => {
            const base = person(scn, n).skills;
            const before = prev && (prev.order.includes(n) || prev.hires.includes(n)) ? requiredSkills(scn, prev, n) : base;
            const now = requiredSkills(scn, d, n);
            now.forEach((v, k) => { if (v && !before[k]) newSkills++; });
        });
        if (newSkills) lines.push({ what: `Training: ${newSkills} new skill${newSkills > 1 ? 's' : ''}`, cost: newSkills * ec.training * mult });
        return lines;
    }

    // keep only what may change during the shift: purchases and hires can be added, skills added, WIP cap changed
    function sanitize(scn, d, prev) {
        const out = clone(d);
        if (!prev) {
            if (!E.POLICIES[out.policy]) out.policy = 'zones';
            const crew = scn.crew.map(p => p.name);
            out.order = (out.order || []).filter(n => person(scn, n));
            crew.forEach(n => { if (!out.order.includes(n)) out.order.push(n); });
            out.hires = (out.hires || []).filter(n => scn.temps.some(p => p.name === n));
            out.order = out.order.filter(n => crew.includes(n) || out.hires.includes(n));
            out.hires.forEach(n => { if (!out.order.includes(n)) out.order.push(n); });
        } else {
            out.policy = prev.policy; out.order = prev.order.slice(); out.preempt = prev.preempt;
            out.hires = prev.hires.concat((out.hires || []).filter(n => !prev.hires.includes(n) && scn.temps.some(p => p.name === n)));
            const pb = prev.buy || {};
            out.buy = Object.assign({}, pb, out.buy || {});
            Object.keys(pb).forEach(k => { if (pb[k]) out.buy[k] = true; });
            Object.keys(prev.skills).forEach(n => { out.skills[n] = (out.skills[n] || prev.skills[n]).map((v, k) => v || prev.skills[n][k]); });
        }
        out.skills = out.skills || {};
        out.order.concat(out.hires).forEach(n => { if (!out.skills[n]) out.skills[n] = person(scn, n).skills.slice(); });
        Object.keys(out.skills).forEach(n => {
            const base = person(scn, n) ? person(scn, n).skills : null;
            if (base) out.skills[n] = out.skills[n].map((v, k) => !!v || base[k]);
        });
        out.wip = out.wip > 0 ? Math.round(Math.min(out.wip, 200)) : 0;
        out.buy = out.buy || {};
        return out;
    }

    function normalizeTimeline(scn, timeline) {
        const times = [0].concat(scn.events.map(e => e.t));
        const tl = [];
        let prev = null;
        for (const t of times) {
            const step = timeline.find(x => Math.abs(x.t - t) < 1e-6);
            const d = sanitize(scn, step ? step.d : (prev || baseDecision(scn)), prev);
            tl.push({ t, d });
            prev = d;
        }
        return tl;
    }

    // which workers can operate which stations: no one on a station stops the line
    function warnings(scn, d) {
        const w = [];
        if (d.policy === 'zones') {
            const people = d.order.concat(d.hires);
            scn.stations.forEach((s, k) => { if (!people.some(n => (d.skills[n] || person(scn, n).skills)[k])) w.push(`No one can work at ${s.key} ${s.name}: the line stops there.`); });
        }
        return w;
    }

    // Simulates the shift of a plan; returns the account and the engine (for charts)
    function runShift(scnOrId, timeline, opts) {
        const scn = typeof scnOrId === 'string' ? SCENARIOS[scnOrId] : scnOrId;
        const practice = !!(opts && opts.practice);
        const tl = practice ? [{ t: 0, d: sanitize(scn, (timeline && timeline[0] ? timeline[0].d : baseDecision(scn)), null) }]
            : normalizeTimeline(scn, timeline || [{ t: 0, d: baseDecision(scn) }]);
        const ec = scn.economics, T = scn.shift.length;
        const sim = new E.FlowLine(engineConfig(scn, tl[0].d, stateAt(scn, 0, practice)));
        const exits = [];
        const drain = () => { for (const e of sim.exitLog.splice(0)) exits.push(e); sim.entryLog.length = 0; };
        const costs = [];
        costOf(scn, tl[0].d, null, 0).forEach(c => costs.push(Object.assign({ t: 0 }, c)));
        for (let i = 1; i < tl.length; i++) {
            sim.advanceTo(tl[i].t); drain();
            costOf(scn, tl[i].d, tl[i - 1].d, tl[i].t).forEach(c => costs.push(Object.assign({ t: tl[i].t }, c)));
            sim.update(engineConfig(scn, tl[i].d, stateAt(scn, tl[i].t)));
        }
        sim.advanceTo(T); drain();
        const m = sim.metrics();
        const promiseAt = t => stateAt(scn, t - 1e-9, practice).promise;
        const delivered = exits.length;
        const late = exits.filter(e => e.lt > promiseAt(e.t) + 1e-9).length;
        const paid = Math.min(delivered, ec.demand);
        const wages = scn.crew.length * ec.wage;
        const wipHours = m.WIP * T / 60;
        const invest = costs.reduce((a, c) => a + c.cost, 0);
        const account = {
            revenue: paid * ec.margin,
            wages: -wages,
            investments: -invest,
            wip: -Math.round(wipHours * ec.wipCost),
            late: -late * ec.late,
            missing: -Math.max(0, ec.demand - delivered) * ec.missing
        };
        const profit = Object.values(account).reduce((a, b) => a + b, 0);
        const lts = exits.map(e => e.lt);
        const result = {
            profit, account, costs, delivered, late, onTime: delivered ? (delivered - late) / delivered : 0,
            demand: ec.demand, avgWIP: m.WIP, avgLT: lts.length ? lts.reduce((a, b) => a + b, 0) / lts.length : 0,
            laborUtil: m.laborUtil, blocked: m.workers.length ? m.workers.reduce((a, w) => a + w.blocked, 0) / m.workers.length : 0,
            stalled: sim.stalled, warnings: warnings(scn, tl[0].d), timeline: tl, practice,
            byEvent: scn.events.map(e => ({ id: e.id, upTo: exits.filter(x => x.t <= e.t).length }))
        };
        return opts && opts.withSim ? { result, sim, exits } : result;
    }

    // awards, for the leaderboard
    const AWARDS = [
        { id: 'profit', label: 'Best profit', pick: r => r.profit, best: 'max' },
        { id: 'lean', label: 'Lean master (lowest average WIP, demand met)', pick: r => r.delivered >= r.demand ? r.avgWIP : Infinity, best: 'min' },
        { id: 'ontime', label: 'Best service (on-time share)', pick: r => r.onTime * 1000 + r.delivered / 1000, best: 'max' },
        { id: 'crisis', label: 'Crisis manager (bikes after 10:00)', pick: r => r.delivered - r.byEvent[0].upTo, best: 'max' }
    ];

    // team codes: base64url of a compact JSON
    function b64encode(str) {
        const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str) : Buffer.from(str, 'utf8');
        let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
        const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function b64decode(code) {
        const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
        const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString('utf8');
    }
    function compactDecision(d) {
        const skills = {};
        Object.keys(d.skills).forEach(n => { skills[n] = d.skills[n].map(v => v ? 1 : 0).join(''); });
        return { p: d.policy, o: d.order, h: d.hires, s: skills, w: d.wip, b: Object.keys(d.buy).filter(k => d.buy[k]), x: d.preempt === false ? 0 : 1 };
    }
    function expandDecision(c) {
        const skills = {};
        Object.keys(c.s || {}).forEach(n => { skills[n] = c.s[n].split('').map(v => v === '1'); });
        const buy = {}; (c.b || []).forEach(k => { buy[k] = true; });
        return { policy: c.p, order: c.o || [], hires: c.h || [], skills, wip: c.w, buy, preempt: c.x !== 0 };
    }
    function encode(team, scnId, timeline, result) {
        // only the moments when the plan changes (the rest is carried over when decoding)
        const steps = [];
        timeline.forEach((x, i) => {
            const c = compactDecision(x.d);
            if (i === 0 || JSON.stringify(c) !== JSON.stringify(steps[steps.length - 1].d)) steps.push({ t: x.t, d: c });
        });
        const obj = { v: 1, sc: scnId, team: String(team || '').slice(0, 40), tl: steps,
            r: result ? Math.round(result.profit) : null };
        return 'FC1.' + b64encode(JSON.stringify(obj));
    }
    function decode(code) {
        const c = String(code || '').trim().replace(/\s+/g, '');
        if (!c.startsWith('FC1.')) throw new Error('not a Factory Challenge code');
        const obj = JSON.parse(b64decode(c.slice(4)));
        if (!SCENARIOS[obj.sc]) throw new Error('unknown scenario ' + obj.sc);
        return { team: obj.team, scenario: obj.sc, claimed: obj.r, timeline: obj.tl.map(x => ({ t: x.t, d: expandDecision(x.d) })) };
    }

    return { SCENARIOS, baseDecision, runShift, costOf, sanitize, normalizeTimeline, engineConfig, stateAt, warnings, clock, person, AWARDS, encode, decode, FULL_FLEX };
});
