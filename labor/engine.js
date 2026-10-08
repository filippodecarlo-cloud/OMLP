/* =====================================================================
   Labor-Constrained Line - simulation engine (no DOM)
   Factory Dynamics, part 2 - Manpower constrained systems
   Reference: Hopp & Spearman, Factory Physics, §7.4
   ---------------------------------------------------------------------
   Exact next-event simulation of a serial line with:
     - N stations, m_k machines each, process time ST_k (work content)
     - n workers with individual speed v_j; an operation needs one worker
       AND one machine for its whole duration (worker-tended)
     - a worker-movement policy:
         zones    : dedicated workers, each serves a fixed zone
         tied     : workers tied to jobs ("rabbit chase")
         bucket   : bucket brigade (Bartholdi & Eisenstein)
         dropping : job dropping, free worker takes the farthest
                    downstream job (optionally with a CONWIP cap)
     - WIP control: CONWIP cap w (jobs in system, queue included) or
       no cap (a new job starts whenever a worker is free)
   Works in the browser (window.LaborEngine) and in Node (require).
   ===================================================================== */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LaborEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const EPS = 1e-7;
    const NORMAL_MAX_CV = 0.3;

    const POLICIES = {
        zones: {
            label: 'Dedicated workers (fixed zones)',
            short: 'Zones',
            rule: 'Each worker is assigned a fixed zone of consecutive stations (balanced on work content). A free worker takes the farthest-downstream job waiting in his zone. Jobs are left in the buffers between zones. With n = N it is the classic line: one operator per station.'
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

    // Deterministic, seedable PRNG (mulberry32)
    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Split the stations into contiguous zones, one per worker, minimizing the
    // largest work content of a zone. If n > N, extra workers go to the most
    // loaded stations (zone = single station).
    function computeZones(stations, n) {
        const N = stations.length;
        const load = stations.map(s => s.st);
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
        // DP: best[i][j] = min over partitions of stations 0..i-1 into j zones of the max zone load
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

    // Closed-form references from the slides / Factory Physics
    function theory(cfg) {
        const st = cfg.stations.map(s => s.st);
        const N = st.length;
        const n = cfg.workers.length;
        const speeds = cfg.workers.map(w => w.speed);
        const vSum = speeds.reduce((a, b) => a + b, 0);
        const equalSpeeds = speeds.every(v => Math.abs(v - speeds[0]) < 1e-9);
        const VAT = st.reduce((a, b) => a + b, 0);
        const vMax = Math.max(...speeds);
        // machines are worker-paced: a station runs at the speed of whoever works there
        const TRb = Math.min(...cfg.stations.map(s => s.m / s.st));          // at standard speed (v = 1)
        const TRbEff = TRb * (equalSpeeds ? speeds[0] : vMax);               // exact if equal speeds, else upper bound
        const WIPc = TRb * VAT;
        const TRlabor = vSum / VAT;                // TH_max = n / T0 (equal speeds, v = 1)
        const TRmax = Math.min(TRlabor, TRbEff);
        const ample = cfg.stations.every(s => s.m >= n);
        const deterministic = cfg.stations.every(s => s.dist === 'det');
        const walk = cfg.walk || 0;
        const capped = isFinite(cfg.wip);
        const w = capped ? cfg.wip : n;            // no cap: WIP = n (one job per worker)
        const out = { N, n, VAT, TRb, TRbEff, WIPc, TRlabor, TRmax, vSum, vMax, equalSpeeds, ample, deterministic, walk, capped, w,
            binding: TRlabor < TRbEff - 1e-12 ? 'labor' : 'machines' };
        // Tied workers with ample machines (slides 92-94): exact if deterministic & walk = 0 & equal speeds
        if (equalSpeeds) {
            const v = speeds[0];
            const cycle = VAT / v + (walk > 0 ? 2 * (N - 1) * walk : 0); // forward walk + walk back
            out.tied = {
                TR: Math.min(w, n) / cycle,
                LTworker: VAT / v + (walk > 0 ? (N - 1) * walk : 0),
            };
            out.tied.LTwip = w / out.tied.TR;
            out.tied.LTqueue = out.tied.LTwip - out.tied.LTworker;
        }
        // Practical worst case with WIP = w (Factory Physics: labor line ~ CONWIP with WIP = n)
        const wp = capped ? w : n;
        out.pwc = { w: wp, TR: wp / (WIPc + wp - 1) * TRb, LT: VAT + (wp - 1) / TRb };
        out.best = { TR: Math.min(wp / VAT, TRb), LT: Math.max(VAT, wp / TRb) };
        // Bartholdi-Eisenstein fixed point (bucket brigade, slowest -> fastest):
        // worker j starts at work content VAT * sum_{i<j} v_i / sum v
        let acc = 0;
        out.bbHandoff = speeds.map(v => { const x = acc / vSum * VAT; acc += v; return x; });
        return out;
    }

    function normalize(cfg) {
        const c = Object.assign({ policy: 'tied', wip: Infinity, walk: 0, preempt: true, warmup: 0, seed: 1, traceLimit: 4000 }, cfg);
        c.stations = cfg.stations.map(s => {
            const dist = s.dist || 'det';
            let cv = s.cv == null ? 0.5 : Math.max(0, +s.cv);
            if (dist === 'normal') cv = Math.min(cv, NORMAL_MAX_CV);   // keeps the truncation bias < 0.1%
            if (dist === 'uniform') cv = Math.min(cv, 1 / Math.sqrt(3)); // support [0, 2·ST]
            if (dist === 'exp') cv = 1;
            return { st: +s.st, m: Math.max(1, s.m | 0), dist, cv };
        });
        c.workers = cfg.workers.map(w => ({ speed: Math.max(0.05, +w.speed || 1) }));
        if (!(c.wip > 0)) c.wip = Infinity;
        return c;
    }

    class LaborLine {
        constructor(cfg) {
            this.cfg = normalize(cfg);
            this.reset();
        }

        reset() {
            const c = this.cfg;
            this.N = c.stations.length;
            this.n = c.workers.length;
            this.rng = mulberry32((c.seed >>> 0) || 1);
            this.t = 0;
            this.jobSeq = 0;
            this.jobs = new Set();
            this.inLine = 0;
            this.queues = Array.from({ length: this.N }, () => []);
            this.machines = c.stations.map(s => Array.from({ length: s.m }, () => ({ job: null, worker: null, reserved: false })));
            this.cum = [0];
            for (let k = 0; k < this.N; k++) this.cum.push(this.cum[k] + c.stations[k].st);
            this.zones = c.policy === 'zones' ? computeZones(c.stations, this.n)
                : c.workers.map(() => [0, this.N - 1]);
            this.workers = c.workers.map((w, j) => ({
                id: j, speed: w.speed, x: c.policy === 'zones' ? this.zones[j][0] : 0,
                state: 'free', job: null, mach: null, walk: null, since: 0, zone: this.zones[j]
            }));
            this.stats = {
                exits: 0, sumLT: 0, sumLTline: 0, wipArea: 0, lineArea: 0, time: 0,
                w: this.workers.map(() => ({ working: 0, blocked: 0, walking: 0, idle: 0 })),
                busy: c.stations.map(() => 0), occ: c.stations.map(() => 0)
            };
            this.completed = 0;
            this.exitLog = [];        // {t, lt, ltLine} (drained by the UI)
            this.handoffs = [];       // {t, j, wp}  bucket brigade take-overs (work-content position)
            this.trace = this.workers.map(() => []);
            this.zeroSteps = 0;
            this.release();
            this.resolve();
            this.recordTrace();
        }

        // ---------------- helpers ----------------
        sample(k) {
            const s = this.cfg.stations[k];
            const u = this.rng();
            let v;
            switch (s.dist) {
                case 'exp': v = -s.st * Math.log(1 - u); break;
                case 'uniform': { const a = s.st * s.cv * Math.sqrt(3); v = s.st + (2 * u - 1) * a; break; }
                case 'normal': {
                    do {
                        const u1 = this.rng() || 1e-12, u2 = this.rng();
                        v = s.st + s.st * s.cv * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    } while (v <= 0.02 * s.st);
                    break;
                }
                default: v = s.st;
            }
            return Math.max(1e-6, v);
        }

        newJob() {
            const job = { id: ++this.jobSeq, k: 0, rem: null, dur: null, tEnter: this.t, tStart: null, state: 'queue' };
            this.jobs.add(job);
            return job;
        }

        release() {
            if (isFinite(this.cfg.wip)) {
                while (this.jobs.size < this.cfg.wip) this.queues[0].push(this.newJob());
            }
        }

        sourceAvailable() { return !isFinite(this.cfg.wip) || this.queues[0].length > 0; }
        takeSource() { return isFinite(this.cfg.wip) ? this.queues[0].shift() : this.newJob(); }
        freeSlot(k) { return this.machines[k].findIndex(s => !s.job && !s.reserved); }

        workPos(job) {
            // position of a job along the work content (0..VAT)
            if (job.rem == null || job.dur == null) return this.cum[job.k];
            const st = this.cfg.stations[job.k].st;
            return this.cum[job.k] + (1 - job.rem / job.dur) * st;
        }

        startOp(w, k, si, job) {
            const s = this.machines[k][si];
            s.job = job; s.worker = w; s.reserved = false;
            w.mach = { k, si }; w.job = job; w.walk = null; w.x = k; w.state = 'working';
            job.state = 'inproc'; job.k = k;
            if (job.rem == null) { job.dur = this.sample(k); job.rem = job.dur; }
            if (job.tStart == null) { job.tStart = this.t; this.inLine++; }
        }

        releaseMachine(w) {
            if (!w.mach) return;
            const s = this.machines[w.mach.k][w.mach.si];
            s.job = null; s.worker = null; s.reserved = false;
            w.mach = null;
        }

        // worker w holds a job that finished op k-1; moves it to machine si of station k
        moveWithJob(w, k, si) {
            this.releaseMachine(w);
            if (this.cfg.walk === 0 || Math.abs(w.x - k) <= EPS) { this.startOp(w, k, si, w.job); return; }
            this.machines[k][si].reserved = true;
            w.state = 'walking'; w.walk = { purpose: 'carry', to: k, k, si };
            w.job.state = 'carried';
        }

        exitJob(job) {
            this.jobs.delete(job);
            this.inLine--;
            this.completed++;
            job.state = 'done';
            // statistics window is (warmup, t]: an exit exactly at the end of the warm-up is not counted
            if (this.t > this.cfg.warmup + EPS || (this.cfg.warmup === 0 && this.t > 0)) {
                const lt = this.t - job.tEnter, ltLine = this.t - job.tStart;
                this.stats.exits++;
                this.stats.sumLT += lt;
                this.stats.sumLTline += ltLine;
                this.exitLog.push({ t: this.t, lt, ltLine });
            }
        }

        opComplete(w) {
            const job = w.job, k = job.k, p = this.cfg.policy;
            job.rem = null; job.dur = null;
            if (k === this.N - 1) {
                this.releaseMachine(w);
                this.exitJob(job);
                w.job = null; w.state = 'free';
                return;
            }
            job.k = k + 1;
            if (p === 'tied' || p === 'bucket') {
                w.state = 'blocked'; w.since = this.t; job.state = 'held';
            } else {
                this.releaseMachine(w);
                job.state = 'queue'; this.queues[k + 1].push(job);
                w.job = null; w.state = 'free';
            }
        }

        handoff(p, w) {
            const job = p.job;
            this.handoffs.push({ t: this.t, j: w.id, wp: this.workPos(job) });
            if (this.handoffs.length > 5000) this.handoffs.splice(0, 1000);
            w.job = job; w.mach = p.mach; w.x = p.x; w.walk = p.walk; w.since = p.since;
            w.state = p.state;
            if (p.mach && p.state !== 'walking') this.machines[p.mach.k][p.mach.si].worker = w;
            p.job = null; p.mach = null; p.walk = null; p.state = 'free';
        }

        // ---------------- policies (instantaneous decisions) ----------------
        resolve() {
            const p = this.cfg.policy;
            let guard = 0, changed = true;
            while (changed) {
                if (++guard > 20000) throw new Error('resolve(): no convergence (policy ' + p + ')');
                this.release();
                if (p === 'tied') changed = this.resolveTied();
                else if (p === 'bucket') changed = this.resolveBucket();
                else changed = this.resolveDropping();
            }
        }

        resolveTied() {
            const walk = this.cfg.walk;
            const blocked = this.workers.filter(w => w.state === 'blocked').sort((a, b) => a.since - b.since || b.x - a.x);
            for (const w of blocked) {
                const k = w.job.k, si = this.freeSlot(k);
                if (si >= 0) { this.moveWithJob(w, k, si); return true; }
            }
            for (const w of this.workers) {
                if (w.state !== 'free' && w.state !== 'idle') continue;
                if (w.x > EPS) {
                    if (walk === 0) w.x = 0;
                    else { w.state = 'walking'; w.walk = { purpose: 'start', to: 0 }; return true; }
                }
                if (this.sourceAvailable()) {
                    const si = this.freeSlot(0);
                    if (si >= 0) { this.startOp(w, 0, si, this.takeSource()); return true; }
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
                    // no overtaking: cannot go beyond the next worker who holds a job
                    const ok = !d || !d.job || d.x >= k - EPS;
                    if (ok) {
                        const si = this.freeSlot(k);
                        if (si >= 0) { this.moveWithJob(w, k, si); return true; }
                    }
                    continue;
                }
                if (w.job) continue;                       // working or carrying
                if (j === 0) {
                    if (w.x > EPS) {
                        if (walk === 0) { w.x = 0; return true; }
                        if (w.state !== 'walking') { w.state = 'walking'; w.walk = { purpose: 'return' }; return true; }
                        continue;
                    }
                    if (w.state === 'walking') { w.state = 'free'; w.walk = null; }
                    if (this.sourceAvailable()) {
                        const si = this.freeSlot(0);
                        if (si >= 0) { this.startOp(w, 0, si, this.takeSource()); return true; }
                    }
                    if (w.state !== 'idle') w.state = 'idle';
                    continue;
                }
                const p = W[j - 1];
                if (w.x - p.x <= EPS) {                    // met the predecessor
                    w.x = p.x;
                    if (w.state === 'walking') { w.state = 'free'; w.walk = null; }
                    if (p.job) {
                        if (p.state === 'working' && !this.cfg.preempt) { w.state = 'waiting'; }
                        else { this.handoff(p, w); return true; }
                    } else if (w.state !== 'idle') w.state = 'idle';
                } else {                                   // walk back towards the predecessor
                    if (walk === 0) { w.x = p.x; return true; }
                    if (w.state !== 'walking') { w.state = 'walking'; w.walk = { purpose: 'return' }; return true; }
                }
            }
            return false;
        }

        resolveDropping() {
            const free = this.workers.filter(w => w.state === 'free' || w.state === 'idle');
            if (!free.length) return false;
            for (let k = this.N - 1; k >= 0; k--) {
                const avail = k === 0 ? this.sourceAvailable() : this.queues[k].length > 0;
                if (!avail) continue;
                const si = this.freeSlot(k);
                if (si < 0) continue;
                let best = null, bd = Infinity;
                for (const w of free) {
                    if (k < w.zone[0] || k > w.zone[1]) continue;
                    const d = Math.abs(w.x - k);
                    if (d < bd - EPS) { best = w; bd = d; }
                }
                if (!best) continue;
                const job = k === 0 ? this.takeSource() : this.queues[k].shift();
                if (this.cfg.walk === 0 || bd <= EPS) this.startOp(best, k, si, job);
                else {
                    this.machines[k][si].reserved = true;
                    best.job = job; job.state = 'claimed';
                    best.state = 'walking'; best.walk = { purpose: 'claim', to: k, k, si };
                }
                return true;
            }
            for (const w of free) w.state = 'idle';
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

        nextEventDt() {
            let dt = Infinity;
            if (this.t < this.cfg.warmup - EPS) dt = this.cfg.warmup - this.t;
            for (const w of this.workers) {
                if (w.state === 'working') dt = Math.min(dt, Math.max(0, w.job.rem) / w.speed);
                else if (w.state === 'walking') {
                    if (w.walk.purpose === 'return' && w.id > 0) {
                        const p = this.workers[w.id - 1];
                        const gap = w.x - p.x;
                        const rate = 1 / this.cfg.walk + this.velocity(p);
                        if (rate > EPS) dt = Math.min(dt, Math.max(0, gap) / rate);
                    } else {
                        dt = Math.min(dt, Math.abs(w.x - this.walkTarget(w)) * this.cfg.walk);
                    }
                }
            }
            return dt;
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
                let busy = 0, occ = 0;
                for (const s of slots) {
                    if (s.job || s.reserved) occ++;
                    if (s.job && s.worker && s.worker.state === 'working') busy++;
                }
                S.busy[k] += dt * busy / slots.length;
                S.occ[k] += dt * occ / slots.length;
            });
        }

        move(dt) {
            for (const w of this.workers) {           // index order: predecessor moves first
                if (w.state === 'working') w.job.rem -= w.speed * dt;
                else if (w.state === 'walking') {
                    const tg = this.walkTarget(w), step = dt / this.cfg.walk;
                    w.x = w.x > tg ? Math.max(tg, w.x - step) : Math.min(tg, w.x + step);
                }
            }
        }

        handleEvents() {
            const done = this.workers.filter(w => w.state === 'working' && w.job.rem <= EPS * Math.max(1, w.job.dur || 1))
                .sort((a, b) => b.x - a.x);
            for (const w of done) this.opComplete(w);
            for (const w of this.workers) {
                if (w.state !== 'walking' || w.walk.purpose === 'return') continue;
                if (Math.abs(w.x - w.walk.to) > EPS) continue;
                w.x = w.walk.to;
                const wk = w.walk;
                if (wk.purpose === 'carry' || wk.purpose === 'claim') this.startOp(w, wk.k, wk.si, w.job);
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
                const dt = Math.min(T - this.t, this.nextEventDt());
                if (dt <= EPS) { if (++this.zeroSteps > 100000) throw new Error('advanceTo(): stuck at t=' + this.t); }
                else this.zeroSteps = 0;
                this.accumulate(dt);
                this.move(dt);
                this.t += dt;
                this.recordTrace();
                this.handleEvents();
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
            const WIPline = T > 0 ? S.lineArea / T : 0;
            const workers = S.w.map(x => {
                const tot = x.working + x.blocked + x.walking + x.idle || 1;
                return { working: x.working / tot, blocked: x.blocked / tot, walking: x.walking / tot, idle: x.idle / tot };
            });
            const laborUtil = workers.length ? workers.reduce((a, w) => a + w.working, 0) / workers.length : 0;
            return {
                t: this.t, time: T, exits: S.exits, completed: this.completed, TR, LT, LTline, LTqueue: LT - LTline,
                WIP, WIPline, littleTRxLT: TR * LT, littleErr: WIP > 0 ? (WIP - TR * LT) / WIP : 0,
                workers, laborUtil,
                stations: S.busy.map((b, k) => ({ busy: T > 0 ? b / T : 0, occupied: T > 0 ? S.occ[k] / T : 0 })),
                wipNow: this.jobs.size, queueNow: this.queues.reduce((a, q) => a + q.length, 0)
            };
        }

        // consistency checks used by the test-suite
        checkInvariants() {
            const errs = [];
            const holders = new Map();
            for (const w of this.workers) {
                if (w.job) {
                    if (holders.has(w.job.id)) errs.push('job ' + w.job.id + ' held by two workers');
                    holders.set(w.job.id, w.id);
                }
                if (w.state === 'working' && (!w.mach || this.machines[w.mach.k][w.mach.si].job !== w.job)) errs.push('worker ' + w.id + ' working without machine');
                if (w.state === 'working' && this.machines[w.mach.k][w.mach.si].worker !== w) errs.push('machine/worker link broken W' + w.id);
            }
            if (this.cfg.policy === 'bucket') {
                for (let j = 1; j < this.n; j++) if (this.workers[j].x < this.workers[j - 1].x - 1e-6) errs.push('bucket order violated at t=' + this.t);
            }
            if (isFinite(this.cfg.wip) && this.jobs.size !== this.cfg.wip) errs.push('CONWIP violated: ' + this.jobs.size);
            let inQueues = 0; this.queues.forEach(q => inQueues += q.length);
            let onMach = 0; this.machines.forEach(sl => sl.forEach(s => { if (s.job) onMach++; }));
            const carried = this.workers.filter(w => w.job && (w.state === 'walking' || w.state === 'blocked') && w.job.state !== 'inproc' && !(w.mach && this.machines[w.mach.k][w.mach.si].job === w.job)).length;
            if (inQueues + onMach + carried !== this.jobs.size) errs.push(`job accounting: q${inQueues}+m${onMach}+c${carried} != ${this.jobs.size}`);
            return errs;
        }
    }

    return { LaborLine, POLICIES, computeZones, theory, mulberry32, NORMAL_MAX_CV };
});
