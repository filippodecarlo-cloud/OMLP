/* =====================================================================
   Factory Flow Lab - simulation engine (no DOM)
   Factory Dynamics: part 1 (machines) and part 2 (manpower)
   Reference: Hopp & Spearman, Factory Physics, ch. 7 (§7.2-7.4)
   ---------------------------------------------------------------------
   Exact next-event simulation of a serial line with
     - N stations; station k has m_k machines, a manual time ST_k (needs a
       worker in labor mode), an automatic cycle AUTO_k (the machine runs
       alone), an OEE_k (times are divided by it), a process batch b_k
       (parts processed together) and a move lot T_k (parts moved together
       to the next station)
     - buffers between stations with capacity B_k (0 = direct transfer,
       Infinity = unlimited); a finished part that finds the buffer full
       stays on its machine, which is blocked (blocking after service)
     - two modes
         machines : no workers, every machine runs on its own (part 1)
         labor    : n workers with speed v_j and one movement policy
                    zones    dedicated workers (zones or skill matrix)
                    tied     workers tied to jobs (rabbit chase)
                    bucket   bucket brigade (Bartholdi & Eisenstein)
                    dropping job dropping, farthest-downstream job first
     - WIP control: CONWIP cap w (jobs in the system, input queue included)
       or no cap (push: a new job starts whenever the first station can)
   Works in the browser (window.FlowEngine) and in Node (require).
   ===================================================================== */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FlowEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EPS = 1e-7;
    const MAX_CV = { det: 0, exp: 1, normal: 0.3, uniform: 1 / Math.sqrt(3), tri: 1 / Math.sqrt(6) };

    const POLICIES = {
        zones: {
            label: 'Dedicated workers (zones / skill matrix)',
            short: 'Zones',
            rule: 'Each worker can work only at the stations of his skill matrix (by default a zone of consecutive stations balanced on work content). A free worker takes the farthest-downstream job waiting at one of his stations. With one worker per station it is the classic line of part 1.'
        },
        tied: {
            label: 'Workers tied to jobs (rabbit chase)',
            short: 'Tied',
            rule: 'A worker picks a new job at the first station and follows it through all the stations, then walks back to the start. If the next machine is busy he is blocked and keeps the job (and the machine). Logically a CONWIP line where the cards are the workers.'
        },
        bucket: {
            label: 'Bucket brigade',
            short: 'Bucket',
            rule: 'Workers keep their order (no overtaking) and carry the job forward. When the last worker finishes, he walks back and takes over the job of his predecessor, who does the same, ... until the first worker starts a new job. Blocking is still possible.'
        },
        dropping: {
            label: 'Job dropping (farthest downstream)',
            short: 'Dropping',
            rule: 'Workers are not tied to jobs: after each operation the job is left in the buffer, and a free worker always takes the farthest-downstream job that has a free machine. Without a WIP cap it floods the line; with a CONWIP cap it works well.'
        }
    };

    // how new jobs enter the line
    const RELEASES = {
        conwip: 'CONWIP: w jobs always in the system',
        free: 'No cap: S1 starts a new job whenever it can',
        push: 'Push: jobs released at a fixed rate',
        kanban: 'Kanban: cards between the stations',
        dbr: 'Drum-Buffer-Rope: release tied to the bottleneck'
    };

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // manual work content per part at station k (what a worker has to do)
    function laborLoad(s) { return s.st / (s.oee * s.batch); }

    // Split the stations into contiguous zones, one per worker, minimizing the
    // largest work content of a zone. If n > N, extra workers go to the most
    // loaded stations (zone = single station).
    function computeZones(stations, n) {
        const N = stations.length;
        const load = stations.map(s => laborLoad(Object.assign({ oee: 1, batch: 1 }, s)));
        if (n >= N) {
            const count = new Array(N).fill(1);
            for (let e = 0; e < n - N; e++) {
                let best = 0;
                for (let k = 1; k < N; k++) if (load[k] / count[k] > load[best] / count[best] + EPS) best = k;
                count[best]++;
            }
            const zones = [];
            for (let k = 0; k < N; k++) for (let c = 0; c < count[k]; c++) zones.push([k, k]);
            return zones;
        }
        const pre = [0];
        for (let k = 0; k < N; k++) pre.push(pre[k] + load[k]);
        const best = Array.from({ length: N + 1 }, () => new Array(n + 1).fill(Infinity));
        const cut = Array.from({ length: N + 1 }, () => new Array(n + 1).fill(0));
        best[0][0] = 0;
        for (let i = 1; i <= N; i++) {
            for (let j = 1; j <= Math.min(i, n); j++) {
                for (let p = j - 1; p < i; p++) {
                    const v = Math.max(best[p][j - 1], pre[i] - pre[p]);
                    if (v < best[i][j] - EPS) { best[i][j] = v; cut[i][j] = p; }
                }
            }
        }
        const zones = [];
        let i = N;
        for (let j = n; j >= 1; j--) { const p = cut[i][j]; zones.unshift([p, i - 1]); i = p; }
        return zones;
    }
    function zonesToSkills(zones, N) {
        return zones.map(z => Array.from({ length: N }, (_, k) => k >= z[0] && k <= z[1]));
    }

    function normalize(cfg) {
        const c = Object.assign({ mode: 'labor', policy: 'tied', wip: Infinity, walk: 0, preempt: true, warmup: 0, seed: 1, traceLimit: 4000, stateLimit: 3000 }, cfg);
        if (c.mode !== 'machines') c.mode = 'labor';
        if (!POLICIES[c.policy]) c.policy = 'tied';
        const N = cfg.stations.length;
        c.carry = c.mode === 'labor' && (c.policy === 'tied' || c.policy === 'bucket');   // workers carry the jobs
        c.stations = cfg.stations.map(s => {
            const dist = MAX_CV[s.dist] !== undefined ? s.dist : 'det';
            let cv = s.cv == null ? 0.5 : Math.max(0, +s.cv);
            cv = dist === 'exp' ? 1 : Math.min(cv, MAX_CV[dist]);
            const m = Math.max(1, s.m | 0);
            // OEE: one value for the station, or one per machine
            const oees = (Array.isArray(s.oee) ? s.oee : [s.oee == null ? 1 : s.oee]).map(x => Math.min(1, Math.max(0.01, x == null || x === '' ? 1 : +x || 1)));
            while (oees.length < m) oees.push(oees[oees.length - 1]);
            oees.length = m;
            return {
                st: Math.max(0, +s.st || 0), auto: Math.max(0, +s.auto || 0), m,
                batch: c.carry ? 1 : Math.max(1, s.batch | 0 || 1), move: c.carry ? 1 : Math.max(1, s.move | 0 || 1),
                oee: oees.reduce((a, b) => a + b, 0) / m, oees, dist, cv
            };
        });
        c.stations.forEach(s => { if (s.st + s.auto <= 0) s.st = 1e-3; });
        // buffers[k] = capacity of the buffer before station k (k >= 1)
        const b = cfg.buffers || [];
        c.buffers = [Infinity];
        for (let k = 1; k < N; k++) {
            let cap = b[k - 1] == null ? Infinity : +b[k - 1];
            if (!(cap >= 0)) cap = Infinity;
            if (c.carry) cap = Infinity;
            // a buffer must hold a whole move lot (from upstream) and a whole process batch (for downstream)
            if (isFinite(cap)) cap = Math.max(Math.floor(cap), c.stations[k - 1].move > 1 ? c.stations[k - 1].move : 0, c.stations[k].batch > 1 ? c.stations[k].batch : 0);
            c.buffers.push(cap);
        }
        c.workers = c.mode === 'machines' ? [] : (cfg.workers || [{ speed: 1 }]).map(w => ({ speed: Math.max(0.05, +w.speed || 1), name: w.name || null }));
        const n = c.workers.length;
        if (c.mode === 'labor') {
            let skills = null;
            if (c.policy === 'zones' && Array.isArray(cfg.skills) && cfg.skills.length === n && cfg.skills.every(r => Array.isArray(r) && r.length === N)) skills = cfg.skills.map(r => r.map(Boolean));
            if (c.policy === 'zones' && !skills) skills = zonesToSkills(computeZones(c.stations, n), N);
            if (c.policy !== 'zones') skills = c.workers.map(() => new Array(N).fill(true));
            c.skills = skills;
        } else c.skills = [];
        if (!(c.wip > 0)) c.wip = Infinity;
        c.wip = isFinite(c.wip) ? Math.max(1, Math.round(c.wip)) : Infinity;
        const rel = cfg.release || {};
        let rm = rel.mode || (isFinite(c.wip) ? 'conwip' : 'free');
        if (!RELEASES[rm]) rm = 'conwip';
        if (rm === 'conwip' && !isFinite(c.wip)) rm = 'free';
        if (rm !== 'conwip') c.wip = Infinity;
        const rates = c.stations.map(x => x.m * x.batch * x.oee / (x.st + x.auto));
        const rb = Math.min(...rates);
        const drum = Number.isInteger(rel.drum) && rel.drum >= 0 && rel.drum < N ? rel.drum : rates.indexOf(rb);
        const upTime = c.stations.slice(0, drum + 1).reduce((a, x) => a + (x.st + x.auto) / x.oee / x.batch, 0);
        c.release = {
            mode: rm,
            rate: +rel.rate > 0 ? +rel.rate : 0.9 * rb,
            arrivals: rel.arrivals === 'exp' ? 'exp' : 'det',
            cards: c.stations.map((x, k) => Math.max(x.batch, Math.round(+(rel.cards || [])[k] || x.m * x.batch + 1))),
            drum, drumAuto: !(Number.isInteger(rel.drum) && rel.drum >= 0 && rel.drum < N),
            rope: Math.max(1, Math.round(+rel.rope || Math.max(2, Math.ceil(1.5 * rb * upTime))))
        };
        c.stagger = !!cfg.stagger;
        return c;
    }

    // Closed-form references from the slides / Factory Physics
    function theory(cfgIn) {
        const c = normalize(cfgIn);
        const S = c.stations, N = S.length, labor = c.mode === 'labor';
        const n = c.workers.length;
        const speeds = c.workers.map(w => w.speed);
        const vSum = speeds.reduce((a, b) => a + b, 0);
        const equalSpeeds = n > 0 && speeds.every(v => Math.abs(v - speeds[0]) < 1e-9);
        const vMax = n ? Math.max(...speeds) : 1;
        const vRef = labor ? (equalSpeeds ? speeds[0] : vMax) : 1;
        const te = S.map(s => (s.st + s.auto) / s.oee);                      // time of one operation (one batch)
        const T0 = te.reduce((a, b, k) => a + b / S[k].batch, 0);            // raw process time per part (VAT)
        const rate = S.map((s, k) => s.m * s.batch / te[k]);                 // station capacity [parts/time]
        const TRb = Math.min(...rate);
        const bottleneck = rate.indexOf(TRb);
        const TRbEff = Math.min(...S.map(s => s.m * s.batch / ((s.st / vRef + s.auto) / s.oee)));
        const WIPc = TRb * T0;
        const laborContent = c.carry ? T0 : S.reduce((a, s) => a + laborLoad(s), 0);
        const TRlabor = labor ? vSum / laborContent : Infinity;
        const TRmax = Math.min(TRlabor, TRbEff);
        const capped = isFinite(c.wip);
        const w = capped ? c.wip : (labor ? n : null);
        const onePiece = S.every(s => s.batch === 1 && s.move === 1);
        const ample = S.every(s => s.m >= n);
        const deterministic = S.every(s => s.dist === 'det');
        const out = {
            mode: c.mode, policy: c.policy, carry: c.carry, N, n, VAT: T0, T0, te, rate, TRb, TRbEff, bottleneck, WIPc,
            laborContent, TRlabor, TRmax, vSum, vMax, equalSpeeds, ample, deterministic, onePiece, walk: c.walk, capped, w,
            binding: TRlabor < TRbEff - 1e-12 ? 'labor' : 'machines', warnings: [], release: c.release
        };
        if (w != null) {
            out.best = { TR: Math.min(w / T0, TRb), LT: Math.max(T0, w / TRb) };
            out.worst = { TR: 1 / T0, LT: w * T0 };
            out.pwc = { w, TR: w / (WIPc + w - 1) * TRb, LT: T0 + (w - 1) / TRb };
        }
        if (labor && c.carry && equalSpeeds) {
            const v = speeds[0];
            const walkFwd = c.walk > 0 ? (N - 1) * c.walk : 0;
            const LTworker = S.reduce((a, s) => a + (s.st / v + s.auto) / s.oee, 0) + walkFwd;
            const cycle = LTworker + walkFwd;
            out.tied = { TR: Math.min(w, n) / cycle, LTworker };
            out.tied.LTwip = w / out.tied.TR;
            out.tied.LTqueue = out.tied.LTwip - LTworker;
        }
        // Bartholdi-Eisenstein fixed point: worker j takes over at work content sum_{i<j} v_i / sum v
        const work = S.reduce((a, s) => a + s.st, 0);
        let acc = 0;
        out.bbWork = work;
        out.bbHandoff = speeds.map(v => { const x = acc / vSum * work; acc += v; return x; });
        // configurations that stop or flood the line
        const W = out.warnings;
        if (labor && n === 0) W.push('There are no workers: nothing can be processed.');
        if (labor && c.policy === 'zones') S.forEach((s, k) => { if (!c.skills.some(r => r[k])) W.push(`No worker can operate S${k + 1}: the line stops there.`); });
        const maxB = Math.max(...S.map(s => s.batch)), maxT = Math.max(...S.map(s => s.move));
        if (capped && c.wip < maxB) W.push(`WIP w = ${c.wip} is smaller than the largest batch (${maxB} parts): that station never starts and the line stops.`);
        const slack = S.reduce((a, s) => a + s.batch - 1, 0);
        if (capped && c.wip >= maxB && maxB > 1 && c.wip <= slack)
            W.push(`With w = ${c.wip} the parts can split among the batch stations so that none of them has a full batch: the line may stop. Use w > Σ(b−1) = ${slack}.`);
        if (capped && c.wip < maxT) W.push(`WIP w = ${c.wip} is smaller than the largest move lot (${maxT} parts): the lot is never complete and the line stops.`);
        if (cfgIn.stations.some(s => (s.batch | 0) > 1 || (s.move | 0) > 1) && c.carry) W.push('Batches and move lots are ignored when workers carry the jobs (tied workers, bucket brigade).');
        if (cfgIn.buffers && cfgIn.buffers.some(x => x != null && isFinite(x)) && c.carry) W.push('Buffer sizes are ignored when workers carry the jobs: the job stays with the worker.');
        if (c.release.mode === 'push') {
            out.rho = c.release.rate / TRmax;
            if (c.release.rate >= TRmax * 0.999) W.push(`Release rate ${+c.release.rate.toPrecision(3)} ≥ capacity ${+TRmax.toPrecision(3)}: the queue before S1 grows without limit.`);
        }
        if (c.release.mode === 'free' && (c.mode === 'machines' || c.policy === 'zones' || c.policy === 'dropping') && c.buffers.slice(1).some(x => !isFinite(x)))
            W.push('No WIP cap and unlimited buffers: if a downstream station is slower than the first one, the WIP grows without limit (push).');
        return out;
    }

    class FlowLine {
        constructor(cfg) {
            this.cfg = normalize(cfg);
            this.reset();
        }

        reset() {
            const c = this.cfg;
            this.N = c.stations.length;
            this.n = c.workers.length;
            this.labor = c.mode === 'labor';
            this.rng = mulberry32((c.seed >>> 0) || 1);
            this.t = 0;
            this.jobSeq = 0;
            this.jobs = new Set();
            this.inLine = 0;
            this.queues = Array.from({ length: this.N }, () => []);
            this.outbox = Array.from({ length: this.N }, () => []);
            this.machines = c.stations.map((s, k) => Array.from({ length: s.m }, (_, i) => this.makeSlot(k, i)));
            this.slots = [].concat(...this.machines);
            this.cumWork = [0];
            for (let k = 0; k < this.N; k++) this.cumWork.push(this.cumWork[k] + c.stations[k].st);
            this.workers = c.workers.map((w, j) => this.makeWorker(j, w.speed, c.skills[j], w.name));
            this.updates = 0;            // number of live changes applied with update()
            this.statsFrom = c.warmup;
            this.newStats();
            this.completed = 0;
            this.started = 0;
            this.exitLog = [];        // {t, lt, ltLine, id, tEnter, tStart, counted}   drained by the UI
            this.entryLog = [];       // {t}               first operation started (drained by the UI)
            this.handoffs = [];       // {t, j, wp}        bucket brigade take-overs
            this.trace = this.workers.map(() => []);
            this.arrRng = mulberry32((((c.seed >>> 0) || 1) + 7919) >>> 0);
            this.nextArrival = c.release.mode === 'push' ? 0 : Infinity;
            // staggered start: worker j starts j/n of a cycle later (tied workers, zones, job dropping)
            if (this.labor && c.stagger && (c.policy === 'tied' || c.policy === 'dropping') && this.n > 1) {
                const vMean = c.workers.reduce((a, w) => a + w.speed, 0) / this.n;
                const cycle = c.stations.reduce((a, x) => a + (x.st / vMean + x.auto) / x.oee / x.batch, 0);
                this.workers.forEach((w, j) => { w.readyAt = j * cycle / this.n; });
            }
            this.stalled = false;
            this.stopCompleted = 0;      // > 0: advanceTo() stops exactly when this many jobs are completed
            this.zeroSteps = 0;
            this.release();
            this.resolve();
            this.recordTrace();
        }

        makeSlot(k, i) {
            return { k, i, jobs: [], phase: 'idle', rem: 0, dur: 0, autoRem: 0, worker: null, since: 0, state: 'idle', log: [], retire: false };
        }
        makeWorker(j, speed, skills, name) {
            const first = skills.indexOf(true);
            return {
                id: j, name: name || null, speed, x: this.cfg.policy === 'zones' && first >= 0 ? first : 0, skills,
                state: 'free', job: null, slot: null, walk: null, since: 0, idleSince: this.t, leaving: false, readyAt: 0
            };
        }
        newStats() {
            this.stats = {
                exits: 0, sumLT: 0, sumLTline: 0, wipArea: 0, lineArea: 0, time: 0,
                w: this.workers.map(() => ({ working: 0, blocked: 0, walking: 0, idle: 0 })),
                st: this.cfg.stations.map(() => ({ working: 0, blocked: 0, waitWorker: 0, idle: 0 })),
                buf: this.cfg.stations.map(() => ({ area: 0, max: 0 })), out: this.cfg.stations.map(() => 0)
            };
        }

        // statistics start again from now (the line keeps running)
        resetStats() {
            this.cfg.warmup = this.t;
            this.statsFrom = this.t;
            this.newStats();
        }

        // ---------------- live changes ----------------
        // Applies a new configuration to the running line. Mode, policy and number of
        // stations cannot change (a new line is needed). Operations in progress keep the
        // time they already drew; removed workers finish their job, removed machines
        // finish their batch, a smaller WIP cap or buffer drains by itself.
        update(cfgNew) {
            const c = this.cfg, n2 = normalize(Object.assign({}, cfgNew, { warmup: c.warmup, seed: c.seed }));
            if (n2.mode !== c.mode || n2.policy !== c.policy || n2.stations.length !== this.N) throw new Error('This change needs a new run (reset).');
            this.updates++;
            n2.stations.forEach((s, k) => {
                const old = c.stations[k];
                ['st', 'auto', 'dist', 'cv', 'oee', 'oees', 'batch', 'move'].forEach(key => { old[key] = s[key]; });
                const slots = this.machines[k];
                const active = slots.filter(x => !x.retire);
                if (s.m > active.length) {
                    let add = s.m - active.length;
                    for (const x of slots) if (x.retire && add > 0) { x.retire = false; add--; }       // un-retire first
                    for (let i = 0; i < add; i++) slots.push(this.makeSlot(k, slots.length));
                } else if (s.m < active.length) {
                    let drop = active.length - s.m;
                    for (const x of active.slice().reverse()) {                                     // idle machines go first
                        if (drop > 0 && x.phase === 'idle') { x.retire = true; drop--; }
                    }
                    for (const x of active.slice().reverse()) if (drop > 0 && !x.retire) { x.retire = true; drop--; }
                }
                old.m = s.m;
            });
            this.slots = [].concat(...this.machines);
            c.buffers = n2.buffers;
            c.wip = n2.wip; c.walk = n2.walk; c.preempt = n2.preempt;
            const wasPush = c.release.mode === 'push';
            c.release = n2.release;
            if (c.release.mode === 'push' && !wasPush) this.nextArrival = this.t;
            if (c.release.mode !== 'push') this.nextArrival = Infinity;
            this.cumWork = [0];
            for (let k = 0; k < this.N; k++) this.cumWork.push(this.cumWork[k] + c.stations[k].st);
            // workers: matched by name when every worker has one, otherwise by position
            const active = this.workers.filter(w => !w.leaving);
            const m2 = n2.workers.length;
            const byName = active.every(w => w.name) && n2.workers.every(w => w.name);
            const added = [];
            if (byName) {
                const names = n2.workers.map(w => w.name);
                active.forEach(w => {
                    const j = names.indexOf(w.name);
                    if (j < 0) w.leaving = true;
                    else { w.speed = n2.workers[j].speed; w.skills = n2.skills[j]; }
                });
                n2.workers.forEach((w, j) => { if (!active.some(a => a.name === w.name)) added.push(j); });
            } else {
                active.forEach((w, j) => {
                    if (j < m2) { w.speed = n2.workers[j].speed; w.skills = n2.skills[j]; }
                    else w.leaving = true;
                });
                for (let j = active.length; j < m2; j++) added.push(j);
            }
            for (const j of added) {
                const w = this.makeWorker(this.workers.length, n2.workers[j].speed, n2.skills[j], n2.workers[j].name);
                this.workers.push(w);
                this.trace.push([]);
                this.stats.w.push({ working: 0, blocked: 0, walking: 0, idle: 0 });
            }
            c.workers = n2.workers; c.skills = n2.skills;
            this.n = this.workers.length;
            this.prune();
            this.resolve();
            this.recordTrace();
        }

        // remove machines and workers that were asked to leave, as soon as they are free
        prune() {
            let changed = false;
            this.machines.forEach((slots, k) => {
                const keep = slots.filter(x => !(x.retire && x.phase === 'idle'));
                if (keep.length !== slots.length) { keep.forEach((x, i) => { x.i = i; }); this.machines[k] = keep; changed = true; }
            });
            if (changed) this.slots = [].concat(...this.machines);
            const gone = this.workers.map((w, j) => (w.leaving && !w.job && !w.slot && !(w.state === 'walking' && w.walk && (w.walk.purpose === 'carry' || w.walk.purpose === 'claim'))) ? j : -1).filter(j => j >= 0);
            if (gone.length) {
                for (const j of gone.reverse()) { this.workers.splice(j, 1); this.trace.splice(j, 1); this.stats.w.splice(j, 1); }
                this.workers.forEach((w, j) => { w.id = j; });
                this.n = this.workers.length;
                changed = true;
            }
            return changed;
        }

        // ---------------- random times ----------------
        sample(k) {
            const s = this.cfg.stations[k];
            if (s.st <= 0) return 0;
            const u = this.rng();
            let v;
            switch (s.dist) {
                case 'exp': v = -s.st * Math.log(1 - u); break;
                case 'uniform': v = s.st + (2 * u - 1) * s.st * s.cv * Math.sqrt(3); break;
                case 'tri': {   // symmetric triangular, half-width a = ST·CV·sqrt(6)
                    const a = s.st * s.cv * Math.sqrt(6);
                    v = u < 0.5 ? s.st - a + a * Math.sqrt(2 * u) : s.st + a - a * Math.sqrt(2 * (1 - u));
                    break;
                }
                case 'normal':
                    do {
                        const u1 = this.rng() || 1e-12, u2 = this.rng();
                        v = s.st + s.st * s.cv * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    } while (v <= 0.02 * s.st);
                    break;
                default: v = s.st;
            }
            return Math.max(1e-6, v);
        }

        // ---------------- jobs, queues, buffers ----------------
        newJob() {
            const job = { id: ++this.jobSeq, k: 0, tEnter: this.t, tStart: null, state: 'queue' };
            this.jobs.add(job);
            return job;
        }
        // jobs wait in the queue before S1 (CONWIP, push, DBR) or raw material is always there (free, kanban)
        srcQueue() { const m = this.cfg.release.mode; return m === 'conwip' || m === 'push' || m === 'dbr'; }
        release() {
            const r = this.cfg.release;
            if (r.mode === 'conwip') while (this.jobs.size < this.cfg.wip) this.queues[0].push(this.newJob());
            else if (r.mode === 'push') {
                while (this.nextArrival <= this.t + EPS) {
                    this.queues[0].push(this.newJob());
                    this.nextArrival += r.arrivals === 'exp' ? -Math.log(1 - this.arrRng()) / r.rate : 1 / r.rate;
                }
            } else if (r.mode === 'dbr') while (this.upToDrum() < r.rope) this.queues[0].push(this.newJob());
        }
        // jobs released that have not yet finished the drum (bottleneck) operation
        upToDrum() { let n = 0; const d = this.cfg.release.drum; for (const j of this.jobs) if (j.k <= d && j.state !== 'done') n++; return n; }
        // kanban: station k may start b jobs only if it holds a free card for each
        kanbanLoad(k) {
            return this.machines[k].reduce((a, s) => a + s.jobs.length, 0) + (k + 1 < this.N ? this.queues[k + 1].length : 0) + this.outbox[k].length;
        }
        canStart(k, b) { return this.cfg.release.mode !== 'kanban' || this.kanbanLoad(k) + b <= this.cfg.release.cards[k]; }
        cap(k) { return this.cfg.buffers[k]; }
        space(k) { return this.cap(k) - this.queues[k].length; }
        doneSlots(k) { return this.machines[k].filter(s => s.phase === 'done' && s.jobs.length).sort((a, b) => a.since - b.since); }
        // parts that station k can pull right now
        available(k) {
            if (k === 0) return this.srcQueue() ? this.queues[0].length : Infinity;
            let a = this.queues[k].length;
            if (this.cap(k) === 0 && this.cfg.stations[k - 1].move === 1) for (const s of this.doneSlots(k - 1)) a += s.jobs.length;
            return a;
        }
        take(k, b) {
            const out = [];
            while (out.length < b) {
                if (k === 0) { out.push(this.queues[0].length ? this.queues[0].shift() : this.newJob()); continue; }
                if (this.queues[k].length) { out.push(this.queues[k].shift()); continue; }
                const s = this.doneSlots(k - 1)[0];                // direct transfer (buffer of size 0)
                out.push(s.jobs.shift());
                if (!s.jobs.length) this.freeSlot(s);
            }
            return out;
        }
        idleSlot(k) { return this.machines[k].find(s => s.phase === 'idle' && !s.retire); }
        freeSlot(s) { s.jobs = []; s.phase = 'idle'; s.worker = null; s.rem = 0; s.dur = 0; s.autoRem = 0; }

        workPos(job, slot) {
            if (!slot || (slot.phase !== 'manual' && slot.phase !== 'auto') || !slot.dur) return this.cumWork[job.k];
            const st = this.cfg.stations[slot.k].st;
            const f = slot.phase === 'auto' ? 1 : 1 - slot.rem / slot.dur;
            return this.cumWork[slot.k] + f * st;
        }

        markStart(jobs) {
            for (const j of jobs) if (j.tStart == null) {
                j.tStart = this.t; this.inLine++; this.started++;
                this.entryLog.push({ t: this.t });
            }
        }

        // begin the operation on slot s (the jobs are already on the slot)
        beginOp(s, w) {
            const st = this.cfg.stations[s.k];
            s.worker = w || null;
            s.phase = 'manual';
            if (!(s.dur > 0)) {
                const oee = (st.oees && st.oees[s.i]) || st.oee;          // this machine's OEE
                if (this.labor) { s.dur = this.sample(s.k) / oee; s.autoDur = st.auto / oee; }
                else { s.dur = (this.sample(s.k) + st.auto) / oee; s.autoDur = 0; }   // machines run alone
                s.rem = s.dur;
            }
            s.jobs.forEach(j => { j.state = 'inproc'; j.k = s.k; });
            this.markStart(s.jobs);
            if (w) { w.slot = s; w.walk = null; w.x = s.k; w.state = 'working'; }
            if (s.rem <= EPS && s.dur <= EPS) s.rem = 0;
        }

        exitJob(job) {
            this.jobs.delete(job);
            this.inLine--;
            this.completed++;
            job.state = 'done';
            const lt = this.t - job.tEnter, ltLine = this.t - job.tStart;
            const counted = this.t > this.cfg.warmup + EPS || (this.cfg.warmup === 0 && this.t > 0);
            if (counted) {
                this.stats.exits++;
                this.stats.sumLT += lt;
                this.stats.sumLTline += ltLine;
            }
            // every exit is logged; counted = inside the statistics window (after the warm-up)
            this.exitLog.push({ t: this.t, lt, ltLine, id: job.id, tEnter: job.tEnter, tStart: job.tStart, counted });
        }

        // manual part of the operation finished on slot s
        manualDone(s) {
            const w = s.worker;
            if (s.autoDur > EPS) {
                s.phase = 'auto'; s.autoRem = s.autoDur;
                if (w) {
                    if (this.cfg.carry) { w.state = 'waiting'; }                       // the worker stays with his job
                    else { s.worker = null; w.slot = null; w.state = 'free'; }        // the worker can tend another machine
                }
                return;
            }
            this.opDone(s);
        }

        // whole operation finished on slot s
        opDone(s) {
            const k = s.k, last = k === this.N - 1;
            if (this.cfg.carry) {
                const w = s.worker, job = w.job;
                if (last) {
                    this.exitJob(job); this.freeSlot(s);
                    w.job = null; w.slot = null; w.state = 'free';
                } else {
                    job.k = k + 1; job.state = 'held';
                    s.phase = 'done'; s.since = this.t; s.rem = 0; s.dur = 0;
                    w.state = 'blocked'; w.since = this.t;
                }
                return;
            }
            const w = s.worker;
            if (w) { w.slot = null; w.state = 'free'; }
            s.worker = null; s.phase = 'done'; s.since = this.t; s.rem = 0; s.dur = 0; s.autoRem = 0;
            s.jobs.forEach(j => { j.k = k + 1; j.state = 'held'; });
        }

        // move finished parts downstream (buffers, move lots, exits); no worker needed
        flush() {
            let changed = false;
            const S = this.cfg.stations;
            for (let k = this.N - 1; k >= 0; k--) {
                const last = k === this.N - 1, lot = S[k].move;
                for (const s of this.doneSlots(k)) {
                    if (lot > 1) { s.jobs.forEach(j => { j.state = 'outbox'; this.outbox[k].push(j); }); this.freeSlot(s); changed = true; continue; }
                    if (last) { s.jobs.forEach(j => this.exitJob(j)); this.freeSlot(s); changed = true; continue; }
                    while (s.jobs.length && this.space(k + 1) > 0) {
                        const j = s.jobs.shift(); j.state = 'queue'; this.queues[k + 1].push(j); changed = true;
                    }
                    if (!s.jobs.length) this.freeSlot(s);
                }
                if (lot > 1) {
                    while (this.outbox[k].length >= lot) {
                        if (last) { this.outbox[k].splice(0, lot).forEach(j => this.exitJob(j)); changed = true; }
                        else if (this.space(k + 1) >= lot) {
                            this.outbox[k].splice(0, lot).forEach(j => { j.state = 'queue'; this.queues[k + 1].push(j); }); changed = true;
                        } else break;
                    }
                }
            }
            return changed;
        }

        handoff(p, w) {
            const job = p.job;
            this.handoffs.push({ t: this.t, j: w.id, wp: this.workPos(job, p.slot) });
            if (this.handoffs.length > 5000) this.handoffs.splice(0, 1000);
            w.job = job; w.slot = p.slot; w.x = p.x; w.walk = p.walk; w.since = p.since; w.state = p.state;
            if (p.slot && p.slot.worker === p) p.slot.worker = w;
            p.job = null; p.slot = null; p.walk = null; p.state = 'free';
        }

        // carry policies: worker w holds a job that finished its operation; move it to slot ns of station k
        moveWithJob(w, k, ns) {
            if (w.slot) this.freeSlot(w.slot);
            w.slot = ns;
            ns.jobs = [w.job]; ns.dur = 0;
            if (this.cfg.walk === 0 || Math.abs(w.x - k) <= EPS) { this.beginOp(ns, w); return; }
            ns.phase = 'reserved'; ns.worker = w;
            w.state = 'walking'; w.walk = { purpose: 'carry', to: k };
            w.job.state = 'carried';
        }

        // ---------------- policies (instantaneous decisions) ----------------
        resolve() {
            let guard = 0, changed = true;
            while (changed) {
                if (++guard > 20000) throw new Error('resolve(): no convergence (' + this.cfg.mode + '/' + this.cfg.policy + ')');
                this.release();
                if (this.updates && this.prune()) { changed = true; continue; }
                changed = this.cfg.carry ? false : this.flush();
                if (changed) continue;
                if (!this.labor) changed = this.resolveMachines();
                else if (this.cfg.policy === 'tied') changed = this.resolveTied();
                else if (this.cfg.policy === 'bucket') changed = this.resolveBucket();
                else changed = this.resolveDropping();
            }
            this.recordStates();
        }

        resolveMachines() {
            for (let k = this.N - 1; k >= 0; k--) {
                const b = this.cfg.stations[k].batch;
                const s = this.idleSlot(k);
                if (s && this.available(k) >= b && this.canStart(k, b)) { s.jobs = this.take(k, b); s.dur = 0; this.beginOp(s, null); return true; }
            }
            return false;
        }

        resolveTied() {
            const walk = this.cfg.walk;
            const blocked = this.workers.filter(w => w.state === 'blocked').sort((a, b) => a.since - b.since || b.x - a.x);
            for (const w of blocked) {
                const k = w.job.k, ns = this.canStart(k, 1) ? this.idleSlot(k) : null;
                if (ns) { this.moveWithJob(w, k, ns); return true; }
            }
            for (const w of this.workers) {
                if (w.state !== 'free' && w.state !== 'idle') continue;
                if (w.leaving) continue;
                if (w.readyAt > this.t + EPS) { w.state = 'idle'; continue; }   // staggered start
                if (w.x > EPS) {
                    if (walk === 0) w.x = 0;
                    else { w.state = 'walking'; w.walk = { purpose: 'start', to: 0 }; return true; }
                }
                if (this.available(0) >= 1 && this.canStart(0, 1)) {
                    const s = this.idleSlot(0);
                    if (s) { w.job = this.take(0, 1)[0]; s.jobs = [w.job]; s.dur = 0; this.beginOp(s, w); return true; }
                }
                w.state = 'idle';
            }
            return false;
        }

        resolveBucket() {
            const W = this.workers, walk = this.cfg.walk;
            for (let j = this.n - 1; j >= 0; j--) {
                const w = W[j];
                if (w.state === 'blocked') {
                    const k = w.job.k, d = W[j + 1];
                    const ok = !d || !d.job || d.x >= k - EPS;          // no overtaking
                    if (ok && this.canStart(k, 1)) {
                        const ns = this.idleSlot(k);
                        if (ns) { this.moveWithJob(w, k, ns); return true; }
                    }
                    continue;
                }
                if (w.job) continue;
                if (j === 0) {
                    if (w.x > EPS) {
                        if (walk === 0) { w.x = 0; return true; }
                        if (w.state !== 'walking') { w.state = 'walking'; w.walk = { purpose: 'return' }; return true; }
                        continue;
                    }
                    if (w.state === 'walking') { w.state = 'free'; w.walk = null; }
                    if (this.available(0) >= 1 && this.canStart(0, 1)) {
                        const s = this.idleSlot(0);
                        if (s) { w.job = this.take(0, 1)[0]; s.jobs = [w.job]; s.dur = 0; this.beginOp(s, w); return true; }
                    }
                    if (w.state !== 'idle') w.state = 'idle';
                    continue;
                }
                const p = W[j - 1];
                if (w.x - p.x <= EPS) {
                    w.x = p.x;
                    if (w.state === 'walking') { w.state = 'free'; w.walk = null; }
                    if (p.job) {
                        if (p.state === 'working' && !this.cfg.preempt) { w.state = 'waiting'; }
                        else { this.handoff(p, w); return true; }
                    } else if (w.state !== 'idle') w.state = 'idle';
                } else {
                    if (walk === 0) { w.x = p.x; return true; }
                    if (w.state !== 'walking') { w.state = 'walking'; w.walk = { purpose: 'return' }; return true; }
                }
            }
            return false;
        }

        resolveDropping() {
            const free = this.workers.filter(w => (w.state === 'free' || w.state === 'idle') && !w.leaving && !(w.readyAt > this.t + EPS));
            if (!free.length) return false;
            for (let k = this.N - 1; k >= 0; k--) {
                const b = this.cfg.stations[k].batch;
                if (this.available(k) < b || !this.canStart(k, b)) continue;
                const s = this.idleSlot(k);
                if (!s) continue;
                // nearest skilled worker; on a tie, the one who has been idle the longest
                let best = null, bd = Infinity, bi = Infinity;
                for (const w of free) {
                    if (!w.skills[k]) continue;
                    const d = Math.abs(w.x - k), since = w.state === 'idle' ? w.idleSince : this.t;
                    if (d < bd - EPS || (d <= bd + EPS && since < bi - EPS)) { best = w; bd = d; bi = since; }
                }
                if (!best) continue;
                s.jobs = this.take(k, b); s.dur = 0;
                if (this.cfg.walk === 0 || bd <= EPS) this.beginOp(s, best);
                else {
                    s.phase = 'reserved'; s.worker = best; s.jobs.forEach(j => j.state = 'claimed');
                    best.slot = s; best.state = 'walking'; best.walk = { purpose: 'claim', to: k };
                }
                return true;
            }
            for (const w of free) if (w.state !== 'idle') { w.state = 'idle'; w.idleSince = this.t; }
            for (const w of this.workers) if (w.readyAt > this.t + EPS && w.state === 'free') { w.state = 'idle'; w.idleSince = this.t; }
            return false;
        }

        // ---------------- time advance ----------------
        walkTarget(w) {
            if (w.walk.purpose === 'return') return w.id === 0 ? 0 : this.workers[w.id - 1].x;
            return w.walk.to;
        }
        velocity(w) {
            if (w.state !== 'walking') return 0;
            const tg = this.walkTarget(w);
            if (Math.abs(tg - w.x) <= EPS) return 0;
            return (tg > w.x ? 1 : -1) / this.cfg.walk;
        }
        progressRate(s) {
            if (s.phase === 'auto') return 1;
            if (s.phase !== 'manual') return 0;
            if (!this.labor) return 1;
            return s.worker && s.worker.state === 'working' ? s.worker.speed : 0;
        }

        nextEventDt() {
            let dt = Infinity;
            if (this.t < this.cfg.warmup - EPS) dt = this.cfg.warmup - this.t;
            if (isFinite(this.nextArrival)) dt = Math.min(dt, Math.max(0, this.nextArrival - this.t));
            for (const w of this.workers) if (w.readyAt > this.t + EPS) dt = Math.min(dt, w.readyAt - this.t);
            for (const s of this.slots) {
                if (s.phase === 'manual') { const r = this.progressRate(s); if (r > 0) dt = Math.min(dt, Math.max(0, s.rem) / r); }
                else if (s.phase === 'auto') dt = Math.min(dt, Math.max(0, s.autoRem));
            }
            for (const w of this.workers) {
                if (w.state !== 'walking') continue;
                if (w.walk.purpose === 'return' && w.id > 0) {
                    const p = this.workers[w.id - 1];
                    const rate = 1 / this.cfg.walk + this.velocity(p);
                    if (rate > EPS) dt = Math.min(dt, Math.max(0, w.x - p.x) / rate);
                } else dt = Math.min(dt, Math.abs(w.x - this.walkTarget(w)) * this.cfg.walk);
            }
            return dt;
        }

        // something is still in progress (an operation or a walk)?
        active() {
            return this.slots.some(s => (s.phase === 'manual' && this.progressRate(s) > 0) || s.phase === 'auto') ||
                this.workers.some(w => w.state === 'walking');
        }

        slotState(s) {
            if (s.phase === 'idle') return 'idle';
            if (s.phase === 'done') return 'blocked';
            if (s.phase === 'auto') return 'working';
            if (s.phase === 'manual') return this.progressRate(s) > 0 ? 'working' : 'waitWorker';
            return 'waitWorker';                                       // reserved: a worker is on the way
        }

        recordStates() {
            const lim = this.cfg.stateLimit;
            this.slots.forEach(s => {
                const st = this.slotState(s);
                if (st === s.state && s.log.length) return;
                s.state = st;
                const log = s.log;
                const last = log[log.length - 1];
                if (last && Math.abs(last.t - this.t) <= EPS) last.s = st; else log.push({ t: this.t, s: st });
                if (log.length > lim) log.splice(0, log.length - lim);
            });
        }

        accumulate(dt) {
            if (dt <= 0 || this.t < this.cfg.warmup - EPS) return;
            const S = this.stats;
            S.time += dt;
            S.wipArea += this.jobs.size * dt;
            S.lineArea += this.inLine * dt;
            this.workers.forEach((w, j) => {
                const b = w.state === 'working' ? 'working' : w.state === 'blocked' ? 'blocked' : w.state === 'walking' ? 'walking' : 'idle';
                S.w[j][b] += dt;
            });
            this.machines.forEach((slots, k) => {
                for (const s of slots) S.st[k][s.state] += dt / slots.length;
                const q = this.queues[k].length;
                S.buf[k].area += q * dt;
                if (q > S.buf[k].max) S.buf[k].max = q;
                S.out[k] += this.outbox[k].length * dt;
            });
        }

        move(dt) {
            for (const s of this.slots) {
                if (s.phase === 'manual') s.rem -= this.progressRate(s) * dt;
                else if (s.phase === 'auto') s.autoRem -= dt;
            }
            for (const w of this.workers) {
                if (w.state !== 'walking') continue;
                const tg = this.walkTarget(w), step = dt / this.cfg.walk;
                w.x = w.x > tg ? Math.max(tg, w.x - step) : Math.min(tg, w.x + step);
            }
        }

        handleEvents() {
            const due = this.slots.filter(s => (s.phase === 'manual' && (this.progressRate(s) > 0 || s.dur <= EPS) && s.rem <= EPS * Math.max(1, s.dur)) ||
                (s.phase === 'auto' && s.autoRem <= EPS * Math.max(1, s.autoDur)))
                .sort((a, b) => b.k - a.k);
            for (const s of due) { if (s.phase === 'manual') this.manualDone(s); else this.opDone(s); }
            for (const w of this.workers) {
                if (w.state !== 'walking' || w.walk.purpose === 'return') continue;
                if (Math.abs(w.x - w.walk.to) > EPS) continue;
                w.x = w.walk.to;
                const wk = w.walk;
                if (wk.purpose === 'carry' || wk.purpose === 'claim') this.beginOp(w.slot, w);
                else { w.state = 'free'; w.walk = null; }
            }
        }

        recordTrace() {
            const lim = this.cfg.traceLimit;
            this.workers.forEach((w, j) => {
                const tr = this.trace[j], last = tr[tr.length - 1];
                if (last && Math.abs(last.x - w.x) <= EPS && last.s === w.state) return;
                tr.push({ t: this.t, x: w.x, s: w.state });
                if (tr.length > lim) tr.splice(0, tr.length - lim);
            });
        }

        advanceTo(T) {
            let iter = 0;
            while (true) {
                this.resolve();
                this.recordTrace();
                if (this.t >= T - EPS) break;
                const next = this.nextEventDt();
                this.stalled = !isFinite(next) && !this.active() && (this.jobs.size > 0 || !this.srcQueue());
                const dt = Math.min(T - this.t, next);
                if (dt <= EPS) { if (++this.zeroSteps > 100000) throw new Error('advanceTo(): stuck at t=' + this.t); }
                else this.zeroSteps = 0;
                this.accumulate(dt);
                this.move(dt);
                this.t += dt;
                this.recordTrace();
                this.handleEvents();
                if (this.stopCompleted && this.completed >= this.stopCompleted) { this.resolve(); this.recordTrace(); break; }
                if (++iter > 5e6) throw new Error('advanceTo(): too many events');
            }
            if (this.t > T) this.t = T;
        }

        // ---------------- results ----------------
        metrics() {
            const S = this.stats, T = S.time;
            const TR = T > 0 ? S.exits / T : 0;
            const LT = S.exits ? S.sumLT / S.exits : 0;
            const LTline = S.exits ? S.sumLTline / S.exits : 0;
            const WIP = T > 0 ? S.wipArea / T : 0;
            const workers = S.w.map(x => {
                const tot = x.working + x.blocked + x.walking + x.idle || 1;
                return { working: x.working / tot, blocked: x.blocked / tot, walking: x.walking / tot, idle: x.idle / tot };
            });
            const laborUtil = workers.length ? workers.reduce((a, w) => a + w.working, 0) / workers.length : 0;
            const stations = S.st.map(x => {
                const tot = T || 1;
                const r = { working: x.working / tot, blocked: x.blocked / tot, waitWorker: x.waitWorker / tot, idle: x.idle / tot };
                r.busy = r.working; r.occupied = 1 - r.idle;
                return r;
            });
            return {
                t: this.t, time: T, exits: S.exits, completed: this.completed, TR, LT, LTline, LTqueue: LT - LTline,
                WIP, WIPline: T > 0 ? S.lineArea / T : 0, littleTRxLT: TR * LT, littleErr: WIP > 0 ? (WIP - TR * LT) / WIP : 0,
                workers, laborUtil, stations,
                buffers: S.buf.map((b, k) => ({ avg: T > 0 ? b.area / T : 0, max: b.max, cap: this.cap(k), outbox: T > 0 ? S.out[k] / T : 0 })),
                wipNow: this.jobs.size, stalled: this.stalled
            };
        }

        checkInvariants() {
            const errs = [];
            const seen = new Set();
            let count = 0;
            const add = (j, where) => { if (seen.has(j.id)) errs.push(`job ${j.id} in two places (${where})`); seen.add(j.id); count++; };
            this.queues.forEach((q, k) => q.forEach(j => add(j, 'queue ' + k)));
            this.outbox.forEach((q, k) => q.forEach(j => add(j, 'outbox ' + k)));
            this.slots.forEach(s => s.jobs.forEach(j => add(j, 'slot ' + s.k)));
            if (count !== this.jobs.size) errs.push(`job accounting: ${count} placed vs ${this.jobs.size} in system`);
            this.slots.forEach(s => {
                if (s.phase === 'idle' && s.jobs.length) errs.push('idle slot with jobs at S' + (s.k + 1));
                if (s.phase !== 'idle' && !s.jobs.length) errs.push('busy slot without jobs at S' + (s.k + 1));
                if (!this.updates && s.jobs.length > this.cfg.stations[s.k].batch) errs.push('batch overflow at S' + (s.k + 1));
                if (s.worker && s.worker.slot !== s) errs.push('slot/worker link broken at S' + (s.k + 1));
            });
            if (!this.updates) for (let k = 1; k < this.N; k++) if (this.queues[k].length > this.cap(k)) errs.push('buffer overflow before S' + (k + 1));
            for (const w of this.workers) {
                if (w.state === 'working' && (!w.slot || w.slot.worker !== w || w.slot.phase !== 'manual')) errs.push('worker ' + w.id + ' working without a machine');
                if (w.job && !seen.has(w.job.id)) errs.push('worker ' + w.id + ' holds a job that is nowhere');
                if (!this.updates && w.slot && !w.skills[w.slot.k]) errs.push('worker ' + w.id + ' at a station outside his skills');
            }
            if (this.cfg.policy === 'bucket' && this.labor) {
                for (let j = 1; j < this.n; j++) if (this.workers[j].x < this.workers[j - 1].x - 1e-6) errs.push('bucket order violated at t=' + this.t);
            }
            if (isFinite(this.cfg.wip) && (this.updates ? this.jobs.size < this.cfg.wip : this.jobs.size !== this.cfg.wip)) errs.push('CONWIP violated: ' + this.jobs.size);
            if (!this.updates && this.cfg.release.mode === 'dbr' && this.upToDrum() > this.cfg.release.rope) errs.push('rope violated: ' + this.upToDrum());
            if (!this.updates && this.cfg.release.mode === 'kanban') for (let k = 0; k < this.N; k++) if (this.kanbanLoad(k) > this.cfg.release.cards[k]) errs.push('kanban cards exceeded at S' + (k + 1));
            this.workers.forEach((w, j) => { if (w.id !== j) errs.push('worker ids out of order'); });
            return errs;
        }
    }

    return { FlowLine, LaborLine: FlowLine, POLICIES, RELEASES, computeZones, zonesToSkills, theory, normalize, mulberry32, MAX_CV, NORMAL_MAX_CV: MAX_CV.normal };
});
