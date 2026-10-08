/* =====================================================================
   Labor Flow Simulator - user interface
   Uses LaborEngine (engine.js) and Chart.js
   ===================================================================== */
(function () {
    'use strict';
    const E = window.LaborEngine;
    const $ = id => document.getElementById(id);

    const WORKER_COLORS = ['#e07a2e', '#7b55d6', '#159aa3', '#c8418f', '#6f9420', '#2f63b5', '#a8642c', '#c9a90f', '#5e6b6e', '#e2566c'];
    const POLICY_COLORS = { zones: '#7b55d6', tied: '#e07a2e', bucket: '#159aa3', dropping: '#c8418f' };
    const DIST_LABEL = { det: 'Deterministic', uniform: 'Uniform', normal: 'Normal', exp: 'Exponential' };

    // ------------------------------------------------------------------
    // Scenarios (each one is tied to a slide of Factory Dynamics, part 2)
    // ------------------------------------------------------------------
    const S = (st, m, dist = 'det', cv = 0.3) => st.map(x => ({ st: x, m, dist, cv }));
    const PRESETS = [
        { id: 'slide90', ref: 'Slides 90–96', name: '5 stations, n = 2, w = 4, ample machines',
          cfg: { stations: S([10, 20, 30, 10, 20], 2), speeds: [1, 1], policy: 'tied', wipMode: 'cap', wip: 4, warmup: 180 } },
        { id: 'slide99', ref: 'Slide 99', name: 'Same line, 1 machine per station, random times',
          cfg: { stations: S([10, 20, 30, 10, 20], 1, 'exp'), speeds: [1, 1], policy: 'tied', wipMode: 'cap', wip: 4, warmup: 500 } },
        { id: 'pizza2', ref: 'Slides 97–98', name: 'Pizza shop: 8 customers, n = 2',
          cfg: { stations: S([3, 3, 4, 4, 3, 3], 2), speeds: [1, 1], policy: 'tied', wipMode: 'cap', wip: 8, warmup: 40 } },
        { id: 'pizza4', ref: 'Slide 98', name: 'Pizza shop: n = 4 workers',
          cfg: { stations: S([3, 3, 4, 4, 3, 3], 4), speeds: [1, 1, 1, 1], policy: 'tied', wipMode: 'cap', wip: 8, warmup: 40 } },
        { id: 'bbSF', ref: 'Slides 101, 107', name: 'Bucket brigade, slowest → fastest',
          cfg: { stations: S(new Array(10).fill(2), 1), speeds: [0.6, 1.0, 1.4], policy: 'bucket', wipMode: 'free', warmup: 40 } },
        { id: 'bbFS', ref: 'Slides 103–104', name: 'Bucket brigade, fastest → slowest',
          cfg: { stations: S(new Array(10).fill(2), 1), speeds: [1.4, 1.0, 0.6], policy: 'bucket', wipMode: 'free', warmup: 40 } },
        { id: 'bnEnd', ref: 'Slide 104', name: 'Bottleneck at the end, tied workers',
          cfg: { stations: S([4, 4, 4, 4, 12], 1), speeds: [1, 1, 1], policy: 'tied', wipMode: 'free', warmup: 60 } },
        { id: 'dropFlood', ref: 'Slide 105', name: 'Job dropping without a WIP cap',
          cfg: { stations: S([4, 4, 4, 4, 12], 1), speeds: [1, 1, 1], policy: 'dropping', wipMode: 'free' } },
        { id: 'dropCap', ref: 'Slide 106', name: 'Job dropping with a CONWIP cap',
          cfg: { stations: S([4, 4, 4, 4, 12], 1), speeds: [1, 1, 1], policy: 'dropping', wipMode: 'cap', wip: 5, warmup: 60 } },
        { id: 'penny', ref: 'Part 1 · Penny Fab', name: 'One worker per station: the classic line (PWC)',
          cfg: { stations: S([2, 2, 2, 2], 1, 'exp'), speeds: [1, 1, 1, 1], policy: 'zones', wipMode: 'cap', wip: 4, unit: 'h', warmup: 50 } }
    ];

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    let cfg = null;            // UI configuration
    let sim = null;            // engine instance
    let th = null;             // theory for the current cfg
    let running = false;
    let speed = 10;            // simulated time units per real second
    let activePreset = null;
    let series = [];           // sampled time series
    let exits = [];            // {t, lt}
    let exitAnims = [];        // exit animations
    let disp = [];             // displayed worker positions (px)
    let geo = null;            // canvas geometry
    let charts = {};
    let lastUi = 0, lastFrame = 0;
    let colors = {};
    let sweepDone = false;

    function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
    function presetToCfg(p) {
        const c = p.cfg;
        return {
            stations: deepCopy(c.stations),
            workers: c.speeds.map(s => ({ speed: s })),
            policy: c.policy, wipMode: c.wipMode, wip: c.wip || Math.max(4, c.speeds.length + 2),
            walk: c.walk || 0, preempt: true, warmup: c.warmup || 0, seed: 1, unit: c.unit || 'min'
        };
    }
    function engineCfg(c) {
        return {
            stations: c.stations, workers: c.workers, policy: c.policy,
            wip: c.wipMode === 'free' ? Infinity : c.wip, walk: c.walk, preempt: c.preempt,
            warmup: c.warmup, seed: c.seed, traceLimit: 3000
        };
    }

    // ------------------------------------------------------------------
    // Formatting
    // ------------------------------------------------------------------
    const U = () => cfg.unit;
    function fmt(x, d = 2) {
        if (x == null || !isFinite(x)) return '–';
        const a = Math.abs(x);
        if (a < 1e-9) return '0';
        if (a < 0.01) return x.toFixed(5);
        if (a < 1) return x.toFixed(4);
        if (a < 100) return x.toFixed(d);
        return x.toFixed(1);
    }
    function rate(x) {
        if (!isFinite(x)) return '–';
        return fmt(x) + ' pcs/' + U();
    }
    function perHour(x) {
        if (U() === 'min') return ' = ' + (x * 60).toFixed(2) + ' pcs/h';
        if (U() === 's') return ' = ' + (x * 3600).toFixed(1) + ' pcs/h';
        return '';
    }

    // ------------------------------------------------------------------
    // Setup panel
    // ------------------------------------------------------------------
    function buildPresets() {
        const box = $('presetList');
        box.innerHTML = '';
        PRESETS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'preset'; b.dataset.id = p.id;
            b.innerHTML = `<span class="p-ref">${p.ref}</span><span class="p-name">${p.name}</span>`;
            b.title = 'Direct link: index.html#' + p.id;
            b.addEventListener('click', () => loadPreset(p.id));
            box.appendChild(b);
        });
    }
    function markPreset() {
        document.querySelectorAll('.preset').forEach(b => b.classList.toggle('active', b.dataset.id === activePreset));
    }
    function loadPreset(id) {
        const p = PRESETS.find(x => x.id === id);
        cfg = presetToCfg(p);
        activePreset = id;
        markPreset();
        renderSetup();
        rebuild();
        const t = E.theory(engineCfg(cfg));
        setSpeed(Math.log10(Math.max(0.2, t.VAT / 8)));
        setTimeout(runSweep, 300);
    }

    function buildPolicies() {
        const box = $('policyList');
        box.innerHTML = '';
        Object.entries(E.POLICIES).forEach(([key, p]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'policy-opt'; b.dataset.policy = key;
            b.setAttribute('role', 'radio');
            b.textContent = p.label;
            b.addEventListener('click', () => { cfg.policy = key; changed(); });
            box.appendChild(b);
        });
    }

    function renderSetup() {
        document.querySelectorAll('.policy-opt').forEach(b => b.setAttribute('aria-checked', b.dataset.policy === cfg.policy ? 'true' : 'false'));
        $('policyRule').textContent = E.POLICIES[cfg.policy].rule;
        $('bucketOpts').hidden = cfg.policy !== 'bucket';
        $('preemptSel').value = cfg.preempt ? '1' : '0';
        $('zonesInfo').hidden = cfg.policy !== 'zones';
        if (cfg.policy === 'zones') {
            const z = E.computeZones(cfg.stations, cfg.workers.length);
            $('zonesInfo').innerHTML = z.map((r, j) => `<span class="zone-chip" style="border-color:${WORKER_COLORS[j % 10]}">W${j + 1}: S${r[0] + 1}${r[1] > r[0] ? '–S' + (r[1] + 1) : ''}</span>`).join('');
        }
        $('nWorkers').value = cfg.workers.length;
        const wt = $('workerTable');
        wt.innerHTML = '';
        cfg.workers.forEach((w, j) => {
            const d = document.createElement('div');
            d.className = 'wcell';
            d.innerHTML = `<span class="wdot" style="background:${WORKER_COLORS[j % 10]}"></span><span class="wname">W${j + 1}</span>` +
                `<input type="number" id="speed${j}" min="0.2" max="3" step="0.1" value="${w.speed}" aria-label="Speed of worker ${j + 1}" title="Speed (1 = standard)">`;
            d.querySelector('input').addEventListener('change', e => {
                cfg.workers[j].speed = clampNum(e.target.value, 0.2, 3, 1); changed();
            });
            wt.appendChild(d);
        });
        $('walkTime').value = cfg.walk;
        $('wipModeFree').checked = cfg.wipMode === 'free';
        $('wipModeCap').checked = cfg.wipMode === 'cap';
        $('wipCap').value = cfg.wip;
        $('wipCap').disabled = cfg.wipMode === 'free';
        document.querySelectorAll('[data-step="wipCap"]').forEach(b => b.disabled = cfg.wipMode === 'free');
        $('nStations').value = cfg.stations.length;
        const tb = $('stationRows');
        tb.innerHTML = '';
        cfg.stations.forEach((s, k) => {
            const tr = document.createElement('tr');
            const cvDisabled = s.dist === 'det' || s.dist === 'exp';
            tr.innerHTML = `<td>S${k + 1}</td>` +
                `<td><input type="number" id="st${k}" min="0.1" max="1000" step="0.5" value="${s.st}" aria-label="Process time of station ${k + 1}"></td>` +
                `<td><select id="dist${k}" aria-label="Distribution of station ${k + 1}">${Object.entries(DIST_LABEL).map(([v, l]) => `<option value="${v}"${v === s.dist ? ' selected' : ''}>${l}</option>`).join('')}</select></td>` +
                `<td><input type="number" id="cv${k}" min="0" max="${s.dist === 'normal' ? E.NORMAL_MAX_CV : 0.57}" step="0.05" value="${s.dist === 'exp' ? 1 : s.cv}" ${cvDisabled ? 'disabled' : ''} aria-label="Coefficient of variation of station ${k + 1}"></td>` +
                `<td><input type="number" id="m${k}" min="1" max="10" step="1" value="${s.m}" aria-label="Machines at station ${k + 1}"></td>`;
            tr.querySelector(`#st${k}`).addEventListener('change', e => { s.st = clampNum(e.target.value, 0.1, 1000, s.st); changed(); });
            tr.querySelector(`#dist${k}`).addEventListener('change', e => { s.dist = e.target.value; if (s.dist === 'normal') s.cv = Math.min(s.cv, E.NORMAL_MAX_CV); if (s.dist === 'uniform') s.cv = Math.min(s.cv, 0.57); changed(); });
            tr.querySelector(`#cv${k}`).addEventListener('change', e => { s.cv = clampNum(e.target.value, 0, s.dist === 'normal' ? E.NORMAL_MAX_CV : 0.57, s.cv); changed(); });
            tr.querySelector(`#m${k}`).addEventListener('change', e => { s.m = Math.round(clampNum(e.target.value, 1, 10, s.m)); changed(); });
            tb.appendChild(tr);
        });
        $('warmup').value = cfg.warmup;
        $('seed').value = cfg.seed;
        $('unitSel').value = cfg.unit;
        document.querySelectorAll('.unit-label').forEach(el => el.textContent = cfg.unit);
    }

    function clampNum(v, lo, hi, dflt) {
        const x = parseFloat(v);
        if (!isFinite(x)) return dflt;
        return Math.min(hi, Math.max(lo, x));
    }

    function changed() {
        activePreset = null;
        markPreset();
        renderSetup();
        rebuild();
        if (sweepDone) $('sweepStatus').textContent = 'The setup has changed: run the sweep again to update the curves.';
    }

    function setWorkers(n) {
        n = Math.round(clampNum(n, 1, 10, cfg.workers.length));
        while (cfg.workers.length < n) cfg.workers.push({ speed: 1 });
        cfg.workers.length = n;
        changed();
    }
    function setStations(N) {
        N = Math.round(clampNum(N, 2, 12, cfg.stations.length));
        while (cfg.stations.length < N) {
            const last = cfg.stations[cfg.stations.length - 1];
            cfg.stations.push({ st: last.st, m: last.m, dist: last.dist, cv: last.cv });
        }
        cfg.stations.length = N;
        changed();
    }

    function bindSetup() {
        document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
            const id = b.dataset.step, d = +b.dataset.d;
            if (id === 'nWorkers') setWorkers(cfg.workers.length + d);
            if (id === 'nStations') setStations(cfg.stations.length + d);
            if (id === 'wipCap') { cfg.wip = Math.round(clampNum(cfg.wip + d, 1, 200, cfg.wip)); changed(); }
        }));
        $('nWorkers').addEventListener('change', e => setWorkers(e.target.value));
        $('nStations').addEventListener('change', e => setStations(e.target.value));
        $('wipCap').addEventListener('change', e => { cfg.wip = Math.round(clampNum(e.target.value, 1, 200, cfg.wip)); changed(); });
        $('wipModeFree').addEventListener('change', () => { cfg.wipMode = 'free'; changed(); });
        $('wipModeCap').addEventListener('change', () => { cfg.wipMode = 'cap'; changed(); });
        $('walkTime').addEventListener('change', e => { cfg.walk = clampNum(e.target.value, 0, 20, 0); changed(); });
        $('preemptSel').addEventListener('change', e => { cfg.preempt = e.target.value === '1'; changed(); });
        $('warmup').addEventListener('change', e => { cfg.warmup = clampNum(e.target.value, 0, 1e7, 0); changed(); });
        $('seed').addEventListener('change', e => { cfg.seed = Math.round(clampNum(e.target.value, 1, 1e9, 1)); changed(); });
        $('unitSel').addEventListener('change', e => { cfg.unit = e.target.value; renderSetup(); refreshUi(true); });
        $('speedsEqual').addEventListener('click', () => { cfg.workers.forEach(w => w.speed = 1); changed(); });
        $('speedsSlowFast').addEventListener('click', () => { const s = cfg.workers.map(w => w.speed).sort((a, b) => a - b); cfg.workers.forEach((w, j) => w.speed = s[j]); changed(); });
        $('speedsFastSlow').addEventListener('click', () => { const s = cfg.workers.map(w => w.speed).sort((a, b) => b - a); cfg.workers.forEach((w, j) => w.speed = s[j]); changed(); });
        $('ampleBtn').addEventListener('click', () => { cfg.stations.forEach(s => s.m = Math.max(s.m, cfg.workers.length)); changed(); });
        $('oneMachineBtn').addEventListener('click', () => { cfg.stations.forEach(s => s.m = 1); changed(); });
        $('saveCfg').addEventListener('click', () => download('labor-line-setup.json', JSON.stringify(cfg, null, 2), 'application/json'));
        $('loadCfg').addEventListener('click', () => $('cfgFile').click());
        $('cfgFile').addEventListener('change', e => {
            const f = e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
                try {
                    const c = JSON.parse(r.result);
                    if (!Array.isArray(c.stations) || !Array.isArray(c.workers)) throw new Error('missing stations or workers');
                    cfg = Object.assign(presetToCfg(PRESETS[0]), c);
                    changed();
                } catch (err) { $('lineCaption').textContent = 'Could not load the setup file: ' + err.message; }
            };
            r.readAsText(f);
            e.target.value = '';
        });
    }

    function download(name, text, type) {
        const blob = new Blob([text], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // ------------------------------------------------------------------
    // Simulation control
    // ------------------------------------------------------------------
    function rebuild() {
        sim = new E.LaborLine(engineCfg(cfg));
        th = E.theory(engineCfg(cfg));
        series = []; exits = []; exitAnims = [];
        disp = sim.workers.map(() => null);
        layout();
        refreshUi(true);
        draw(0);
    }
    function setRunning(on) {
        running = on;
        $('startBtn').disabled = on;
        $('pauseBtn').disabled = !on;
    }
    function setSpeed(logv) {
        $('speedRange').value = logv;
        speed = Math.pow(10, +logv);
        $('speedOut').textContent = (speed < 10 ? speed.toFixed(2) : speed < 100 ? speed.toFixed(1) : speed.toFixed(0)) + ' ' + cfg.unit + '/s';
    }
    function bindRun() {
        $('startBtn').addEventListener('click', () => setRunning(true));
        $('pauseBtn').addEventListener('click', () => setRunning(false));
        $('resetBtn').addEventListener('click', () => { setRunning(false); rebuild(); });
        $('stepBtn').addEventListener('click', () => {
            setRunning(false);
            let dt = sim.nextEventDt();
            if (!isFinite(dt) || dt <= 0) dt = Math.max(0.1, th.VAT / 100);
            advance(sim.t + dt);
            refreshUi(true);
        });
        $('speedRange').addEventListener('input', e => setSpeed(e.target.value));
        $('exportCsv').addEventListener('click', () => {
            const head = 't,TR_window,TR_cumulative,LT_window,LT_cumulative,WIP_now,WIP_average';
            const rows = series.map(s => [s.t, s.trWin, s.trCum, s.ltWin, s.ltCum, s.wipNow, s.wipAvg].map(v => v == null ? '' : +(+v).toFixed(6)).join(','));
            download('labor-line-series.csv', [head].concat(rows).join('\n'), 'text/csv');
        });
    }

    function advance(T) {
        try {
            sim.advanceTo(T);
        } catch (err) {
            setRunning(false);
            $('lineCaption').textContent = 'Simulation stopped: ' + err.message;
            console.error(err);
        }
        const ex = sim.exitLog.splice(0);
        for (const e of ex) exits.push(e);
        if (exits.length > 4000) exits.splice(0, exits.length - 4000);
        if (ex.length && ex.length < 6) {
            const now = performance.now();
            ex.forEach(() => exitAnims.push({ t0: now }));
        }
    }

    function frame(ts) {
        const dtReal = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
        lastFrame = ts;
        if (running && sim) advance(sim.t + speed * dtReal);
        draw(dtReal);
        if (ts - lastUi > 250) { lastUi = ts; refreshUi(false); }
        requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------
    // Canvas: the line
    // ------------------------------------------------------------------
    function readColors() {
        const cs = getComputedStyle(document.documentElement);
        const g = n => cs.getPropertyValue(n).trim();
        colors = {
            ink: g('--ink'), muted: g('--muted'), line: g('--line'), surface: g('--surface'), surface2: g('--surface-2'),
            accent: g('--accent'), working: g('--working'), blocked: g('--blocked'), walking: g('--walking'),
            idle: g('--idle'), waiting: g('--waiting'), machine: g('--machine'), machineEdge: g('--machine-edge'),
            mono: g('--font-mono') || 'monospace', body: g('--font-body') || 'sans-serif'
        };
    }

    function layout() {
        const cv = $('lineCanvas');
        const W = Math.max(640, cv.parentElement.clientWidth);
        const N = cfg.stations.length;
        const maxM = Math.min(10, Math.max(...cfg.stations.map(s => s.m)));
        const left = 92, right = 76;
        const colW = (W - left - right) / N;
        const stW = Math.max(58, Math.min(110, colW * 0.62));
        const slotH = maxM > 5 ? 22 : 32;
        const top = 18, head = 38;
        const stH = head + maxM * slotH + 8;
        const laneY = top + stH + 34;
        const zoneY = laneY + 30;
        const H = zoneY + (cfg.policy === 'zones' ? 34 : 14);
        geo = { W, H, N, left, right, colW, stW, slotH, top, head, stH, laneY, zoneY, maxM };
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        cv.style.height = H + 'px';
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
        disp = sim ? sim.workers.map(() => null) : [];
    }
    const px = x => geo.left + (x + 0.5) * geo.colW;
    function slotRect(k, si) {
        const cx = px(k);
        return { x: cx - geo.stW / 2 + 5, y: geo.top + geo.head + si * geo.slotH, w: geo.stW - 10, h: geo.slotH - 6 };
    }
    function jobColor(id) { return `hsl(${(id * 47) % 360}, 58%, 52%)`; }
    function stateColor(s) {
        return s === 'working' ? colors.working : s === 'blocked' ? colors.blocked : s === 'walking' ? colors.walking : s === 'waiting' ? colors.waiting : colors.idle;
    }
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function drawJob(ctx, job, x, y, size, dashed) {
        ctx.save();
        ctx.fillStyle = jobColor(job.id);
        if (dashed) { ctx.globalAlpha = 0.45; }
        roundRect(ctx, x - size / 2, y - size / 2, size, size, 2);
        ctx.fill();
        ctx.restore();
    }

    function workerTarget(w) {
        if ((w.state === 'working' || w.state === 'blocked') && w.mach) {
            const r = slotRect(w.mach.k, Math.min(w.mach.si, geo.maxM - 1));
            return { x: r.x + r.w - 13, y: r.y + r.h / 2, lane: false };
        }
        return { x: px(w.x), y: geo.laneY, lane: true };
    }

    function draw(dtReal) {
        if (!geo || !sim) return;
        const ctx = $('lineCanvas').getContext('2d');
        const { W, H, N } = geo;
        ctx.clearRect(0, 0, W, H);
        ctx.font = `12px ${colors.body}`;
        ctx.textBaseline = 'middle';

        // walkway
        ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(px(0) - 10, geo.laneY); ctx.lineTo(px(N - 1) + 10, geo.laneY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.muted; ctx.textAlign = 'left';
        ctx.fillText('walkway', 6, geo.laneY);

        // IN box (queue before S1)
        const inX = 8, inY = geo.top, inW = geo.left - 22, inH = geo.stH;
        ctx.fillStyle = colors.surface2; ctx.strokeStyle = colors.machineEdge; ctx.lineWidth = 1;
        roundRect(ctx, inX, inY, inW, inH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.font = `600 12px ${colors.body}`;
        ctx.fillText('IN', inX + inW / 2, inY + 12);
        ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
        const q0 = sim.queues[0];
        if (!isFinite(sim.cfg.wip)) ctx.fillText('∞ raw', inX + inW / 2, inY + 27);
        else ctx.fillText('queue ' + q0.length, inX + inW / 2, inY + 27);
        drawStack(ctx, q0, inX + inW / 2, inY + 44, inY + inH - 6, Math.floor((inW - 8) / 12));

        // OUT box
        const outX = W - geo.right + 14, outW = geo.right - 22;
        ctx.fillStyle = colors.surface2; ctx.strokeStyle = colors.machineEdge;
        roundRect(ctx, outX, inY, outW, inH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colors.ink; ctx.font = `600 12px ${colors.body}`; ctx.textAlign = 'center';
        ctx.fillText('OUT', outX + outW / 2, inY + 12);
        ctx.font = `600 15px ${colors.mono}`;
        ctx.fillText(String(sim.completed), outX + outW / 2, inY + 34);
        ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
        ctx.fillText('done', outX + outW / 2, inY + 50);

        // zones band
        if (cfg.policy === 'zones') {
            sim.zones.forEach((z, j) => {
                const x0 = px(z[0]) - geo.colW / 2 + 4, x1 = px(z[1]) + geo.colW / 2 - 4;
                const dup = sim.zones.filter((zz, i) => i < j && zz[0] === z[0] && zz[1] === z[1]).length;
                ctx.fillStyle = WORKER_COLORS[j % 10];
                ctx.globalAlpha = 0.18;
                roundRect(ctx, x0, geo.zoneY + dup * 4, x1 - x0, 18, 4); ctx.fill();
                ctx.globalAlpha = 1;
                ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.font = `11px ${colors.mono}`;
                if (dup === 0) ctx.fillText('zone ' + sim.zones.map((zz, i) => (zz[0] === z[0] && zz[1] === z[1]) ? 'W' + (i + 1) : null).filter(Boolean).join(' '), (x0 + x1) / 2, geo.zoneY + 9);
            });
        }

        // stations and buffers
        for (let k = 0; k < N; k++) {
            const s = cfg.stations[k];
            const cx = px(k);
            const x = cx - geo.stW / 2, y = geo.top;
            ctx.fillStyle = colors.surface; ctx.strokeStyle = colors.machineEdge; ctx.lineWidth = 1.2;
            roundRect(ctx, x, y, geo.stW, geo.stH, 6); ctx.fill(); ctx.stroke();
            ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.font = `600 13px ${colors.body}`;
            ctx.fillText('S' + (k + 1), cx, y + 12);
            ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
            const dl = s.dist === 'det' ? '' : s.dist === 'exp' ? ' exp' : s.dist === 'normal' ? ' N' : ' U';
            ctx.fillText(fmtShort(s.st) + ' ' + cfg.unit + dl, cx, y + 27);
            const slots = sim.machines[k];
            const shown = Math.min(slots.length, geo.maxM);
            for (let si = 0; si < shown; si++) {
                const r = slotRect(k, si);
                const sl = slots[si];
                ctx.fillStyle = colors.machine; ctx.strokeStyle = sl.reserved ? colors.walking : colors.machineEdge;
                ctx.setLineDash(sl.reserved ? [3, 3] : []);
                roundRect(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.stroke();
                ctx.setLineDash([]);
                if (sl.job) {
                    const js = Math.min(14, r.h - 8);
                    drawJob(ctx, sl.job, r.x + 4 + js / 2, r.y + r.h / 2 - 2, js);
                    // progress bar
                    const job = sl.job;
                    let prog = 1;
                    if (job.rem != null && job.dur) prog = Math.max(0, Math.min(1, 1 - job.rem / job.dur));
                    ctx.fillStyle = colors.line;
                    ctx.fillRect(r.x + 3, r.y + r.h - 4, r.w - 6, 2.5);
                    ctx.fillStyle = sl.worker && sl.worker.state === 'blocked' ? colors.blocked : colors.working;
                    ctx.fillRect(r.x + 3, r.y + r.h - 4, (r.w - 6) * prog, 2.5);
                }
            }
            if (slots.length > shown) {
                ctx.fillStyle = colors.muted; ctx.font = `11px ${colors.mono}`;
                ctx.fillText('+' + (slots.length - shown) + ' more', cx, y + geo.stH - 4);
            }
            // buffer before station k (k >= 1)
            if (k > 0) {
                const bx = geo.left + k * geo.colW;
                const claimed = sim.workers.filter(w => w.state === 'walking' && w.walk && w.walk.purpose === 'claim' && w.walk.k === k).map(w => w.job);
                const q = sim.queues[k];
                if (q.length || claimed.length) {
                    ctx.fillStyle = colors.muted; ctx.font = `11px ${colors.mono}`; ctx.textAlign = 'center';
                    ctx.fillText(String(q.length), bx, geo.top + geo.head - 6);
                }
                drawStack(ctx, q, bx, geo.top + geo.head + 4, geo.top + geo.stH, 1, claimed);
            }
        }
        // claimed jobs at station 0
        const claimed0 = sim.workers.filter(w => w.state === 'walking' && w.walk && w.walk.purpose === 'claim' && w.walk.k === 0);
        claimed0.forEach((w, i) => drawJob(ctx, w.job, inX + inW - 10, geo.top + geo.stH - 10 - i * 13, 10, true));

        // workers
        // the faster the simulation, the tighter the visual follow (no lag behind the events)
        const minOp = Math.min(...cfg.stations.map(s => s.st)) / th.vMax;
        const k = 14 * Math.max(1, speed / Math.max(1e-6, 2 * minOp));
        const a = dtReal > 0 ? 1 - Math.exp(-dtReal * k) : 1;
        const targets = sim.workers.map(workerTarget);
        // spread workers that share a spot on the walkway
        const groups = {};
        targets.forEach((t, j) => { if (t.lane) { const key = Math.round(t.x / 6); (groups[key] = groups[key] || []).push(j); } });
        Object.values(groups).forEach(g => g.forEach((j, i) => { targets[j].x += (i - (g.length - 1) / 2) * 25; }));
        sim.workers.forEach((w, j) => {
            const t = targets[j];
            if (!disp[j] || dtReal === 0) disp[j] = { x: t.x, y: t.y };
            else { disp[j].x += (t.x - disp[j].x) * a; disp[j].y += (t.y - disp[j].y) * a; }
        });
        sim.workers.forEach((w, j) => {
            const d = disp[j];
            if (w.job && w.state === 'walking' && w.walk && w.walk.purpose === 'carry') drawJob(ctx, w.job, d.x + 13, d.y - 11, 11);
            ctx.beginPath(); ctx.arc(d.x, d.y, 11, 0, Math.PI * 2);
            ctx.fillStyle = WORKER_COLORS[j % 10]; ctx.fill();
            ctx.lineWidth = 3.5; ctx.strokeStyle = stateColor(w.state); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = `600 11px ${colors.mono}`; ctx.textAlign = 'center';
            ctx.fillText(String(j + 1), d.x, d.y + 0.5);
            if (w.state === 'blocked') {
                ctx.fillStyle = colors.blocked; ctx.font = `700 12px ${colors.body}`;
                ctx.fillText('!', d.x + 14, d.y - 12);
            }
        });

        // exit animations
        const now = performance.now();
        exitAnims = exitAnims.filter(e => now - e.t0 < 600);
        exitAnims.forEach(e => {
            const f = (now - e.t0) / 600;
            const x0 = px(N - 1) + geo.stW / 2, x1 = outX + outW / 2;
            ctx.globalAlpha = 1 - f;
            ctx.fillStyle = colors.working;
            roundRect(ctx, x0 + (x1 - x0) * f - 5, geo.top + 60 - 5, 10, 10, 2); ctx.fill();
            ctx.globalAlpha = 1;
        });
    }
    function fmtShort(x) { return Number.isInteger(x) ? String(x) : x.toFixed(1); }

    function drawStack(ctx, q, cx, y0, yMax, cols, ghost) {
        const size = 10, gap = 3;
        const all = q.slice();
        const per = Math.max(1, Math.floor((yMax - y0) / (size + gap)));
        const cap = per * Math.max(1, cols);
        const shown = all.slice(0, cap - (all.length > cap ? 1 : 0));
        const cw = Math.max(1, cols);
        shown.forEach((job, i) => {
            const c = i % cw, r = Math.floor(i / cw);
            const x = cx + (c - (cw - 1) / 2) * (size + gap);
            drawJob(ctx, job, x, y0 + r * (size + gap) + size / 2, size);
        });
        if (all.length > shown.length) {
            ctx.fillStyle = colors.muted; ctx.font = `10px ${colors.mono}`; ctx.textAlign = 'center';
            ctx.fillText('+' + (all.length - shown.length), cx, y0 + (per - 1) * (size + gap) + size / 2);
        }
        if (ghost && ghost.length) {
            ghost.forEach((job, i) => drawJob(ctx, job, cx, y0 + (shown.length + i) * (size + gap) + size / 2, size, true));
        }
    }

    // ------------------------------------------------------------------
    // KPIs, theory table, caption
    // ------------------------------------------------------------------
    // colour of the difference: tolerance grows when only a few jobs have been completed (±1 job)
    function deltaCell(sim, theo, mode, exits) {
        if (!isFinite(sim) || !isFinite(theo) || theo === 0 || (mode !== 'info' && !(sim > 0))) return '<td class="num">–</td>';
        const d = (sim - theo) / theo;
        const a = Math.abs(d);
        const tol = 1.5 / Math.max(1, exits || 1);
        let cls = a < 0.01 + tol ? 'delta-ok' : a < 0.05 + tol ? 'delta-warn' : 'delta-bad';
        if (mode === 'bound') cls = d <= 0.01 + tol ? 'delta-ok' : 'delta-bad';
        if (mode === 'info') cls = '';
        return `<td class="num ${cls}">${(d >= 0 ? '+' : '−') + (a * 100).toFixed(a < 0.1 ? 2 : 1)}%</td>`;
    }

    function theoryRows(m) {
        const u = cfg.unit, n = th.n, w = th.w;
        const r = [];
        const noData = !m.exits;
        const row = (q, f, t, s, mode, cls = '') => (noData && s) ? r.push(`<tr class="${cls}"><td>${q}</td><td>${f}</td><td class="num">${t}</td><td class="num">–</td><td class="num">–</td></tr>`) : r.push(`<tr class="${cls}"><td>${q}</td><td>${f}</td><td class="num">${t}</td><td class="num">${s}</td>${mode ? deltaCell(m[mode.key] != null ? m[mode.key] : mode.sim, mode.theo, mode.kind, m.exits) : '<td class="num"></td>'}</tr>`);
        const grp = t => r.push(`<tr class="group"><td colspan="5">${t}</td></tr>`);
        const vTxt = th.equalSpeeds ? (th.vSum / n === 1 ? 'n' : 'n·v') : 'Σv';
        grp('Line data');
        row('Value-added time VAT (T<sub>0</sub>)', 'Σ ST<sub>k</sub>', fmt(th.VAT) + ' ' + u, '');
        row('Machine bottleneck TR<sub>b</sub>', 'min m<sub>k</sub> / ST<sub>k</sub>', rate(th.TRb), '');
        row('Critical WIP W<sub>0</sub>', 'TR<sub>b</sub> · VAT', fmt(th.WIPc) + ' pcs', '');
        row('Labor capacity (TH<sub>max</sub>)', vTxt + ' / VAT', rate(th.TRlabor), '');

        grp('Throughput');
        row('Upper bound', `min(${vTxt}/VAT, TR<sub>b</sub>)`, rate(th.TRmax), rate(m.TR), { key: 'TR', theo: th.TRmax, kind: 'bound' });
        const exactTied = th.tied && (cfg.policy === 'tied' || cfg.policy === 'bucket') && th.ample;
        if (exactTied) {
            const f = th.walk > 0 ? 'min(w,n) / (VAT + 2(N−1)·walk)' : (w < n ? 'w / VAT' : 'n / VAT');
            row(w < n ? 'Only w workers busy (w &lt; n)' : 'Workers tied to jobs, ample machines', f, rate(th.tied.TR), rate(m.TR), { key: 'TR', theo: th.tied.TR });
        }
        if (cfg.policy === 'zones' && th.n === th.N && cfg.stations.every(s => s.m === 1)) {
            row('Best case (one worker per station)', 'min(w/VAT, TR<sub>b</sub>)', rate(th.best.TR), rate(m.TR), { key: 'TR', theo: th.best.TR }, th.deterministic ? '' : 'ref');
            row('Practical worst case', 'w/(W<sub>0</sub>+w−1)·TR<sub>b</sub>', rate(th.pwc.TR), rate(m.TR), { key: 'TR', theo: th.pwc.TR }, th.deterministic ? 'ref' : '');
        }

        grp('Lead time');
        if (exactTied) {
            row('LT<sub>worker</sub>', th.walk > 0 ? 'VAT + (N−1)·walk' : 'VAT', fmt(th.tied.LTworker) + ' ' + u, fmt(m.LTline) + ' ' + u, { key: 'LTline', theo: th.tied.LTworker });
            row('LT<sub>wip</sub>', 'w / TR = (w/n)·VAT', fmt(th.tied.LTwip) + ' ' + u, fmt(m.LT) + ' ' + u, { key: 'LT', theo: th.tied.LTwip });
            row('LT<sub>queue</sub> (waiting for a free worker)', '(w−n)/n · VAT', fmt(Math.max(0, th.tied.LTqueue)) + ' ' + u, fmt(m.LTqueue) + ' ' + u, th.tied.LTqueue > 1e-9 ? { key: 'LTqueue', theo: th.tied.LTqueue } : null);
        } else {
            row('LT<sub>wip</sub> from Little, with the simulated TR', th.capped ? 'w / TR' : 'WIP / TR', m.TR > 0 ? fmt((th.capped ? w : m.WIP) / m.TR) + ' ' + u : '–', fmt(m.LT) + ' ' + u, m.TR > 0 ? { key: 'LT', theo: (th.capped ? w : m.WIP) / m.TR, kind: unstable() ? 'info' : undefined } : null, unstable() ? 'ref' : '');
            row('Time in the line (S1 → exit)', '= VAT if a job never waits', fmt(th.VAT / (th.vSum / n)) + ' ' + u, fmt(m.LTline) + ' ' + u, { key: 'LTline', theo: th.VAT / (th.vSum / n), kind: 'info' }, 'ref');
        }

        grp('Checks and references');
        row("Little's law", 'WIP = TR · LT', fmt(m.littleTRxLT) + ' pcs', fmt(m.WIP) + ' pcs', { key: 'WIP', theo: m.littleTRxLT, kind: unstable() ? 'info' : undefined }, unstable() ? 'ref' : '');
        row(`Practical worst case, w = ${th.pwc.w}`, 'TR<sub>b</sub>·w/(W<sub>0</sub>+w−1)', rate(th.pwc.TR), rate(m.TR), { key: 'TR', theo: th.pwc.TR, kind: 'info' }, 'ref');
        return r.join('');
    }

    // no WIP cap and jobs piling up: the system is not stable, Little's law does not apply to the averages
    function unstable() {
        return !th.capped && (cfg.policy === 'dropping' || cfg.policy === 'zones') && sim.jobs.size > 2 * th.n + 2;
    }

    function theoryNote() {
        const p = cfg.policy;
        const parts = [];
        if (unstable()) parts.push(`The WIP keeps growing (now ${sim.jobs.size} jobs): the system is not stable, so Little's law cannot hold for the averages. That is the point of slide 105, not a bug.`);
        if (th.ample && (p === 'tied' || p === 'bucket') && th.equalSpeeds) {
            parts.push('Full capacity and flexibility (slides 91–94): the formulas are exact. With deterministic times the simulation matches them to the last digit; with random times it converges as the run gets longer.');
            if (p === 'bucket') parts.push('With equal speeds a bucket brigade gives the same numbers as workers tied to jobs: only the identity of the worker on each job changes (slide 102).');
        } else if (!th.ample && (p === 'tied' || p === 'bucket')) {
            parts.push('Limited capacity (slide 99): n/VAT is only an upper bound. A worker who finds the next machine busy is blocked, so with random times TR falls below the bound.');
        }
        if (p === 'bucket' && !th.equalSpeeds) parts.push('Unequal speeds: ordering the workers from the slowest to the fastest makes the line balance itself (Bartholdi & Eisenstein, slide 107).');
        if (p === 'dropping') parts.push(th.capped ? 'Job dropping with a CONWIP cap (slide 106): workers never stay blocked, TR approaches the bound; a larger cap gives more TR but a longer LT (Little).' : 'Job dropping without a WIP cap (slide 105): when a downstream machine is the constraint, free workers keep starting new jobs and the WIP grows without limit. Watch the WIP chart.');
        if (p === 'zones') parts.push(th.n === th.N ? 'One dedicated worker per station: this is the line of part 1, so the best case and the practical worst case apply.' : 'Dedicated zones: TR is limited by the most loaded zone, not by n/VAT.');
        if (p === 'zones' && !th.capped) parts.push('Without a WIP cap the first zone keeps pushing jobs into the line: if a later zone is slower, the WIP grows without limit (push system).');
        if (th.walk > 0) parts.push('Walking time is on: the reset to the start costs time, so TR is below the ideal value.');
        if (sim.t < th.VAT * 3) parts.push('Run longer: statistics are still warming up.');
        return parts.join(' ');
    }

    function refreshUi(force) {
        if (!sim) return;
        const m = sim.metrics();
        const u = cfg.unit;
        $('clock').textContent = sim.t < 1000 ? sim.t.toFixed(1) : sim.t.toFixed(0);
        $('kTR').textContent = m.TR > 0 ? fmt(m.TR) : '–';
        $('kTRsub').textContent = `pcs/${u} · bound ${fmt(th.TRmax)}${m.TR > 0 ? perHour(m.TR) : ''}`;
        $('kLT').textContent = m.exits ? fmt(m.LT) : '–';
        $('kLTsub').textContent = m.exits ? `${u} · with worker ${fmt(m.LTline)}, queue ${fmt(Math.max(0, m.LTqueue))}` : u;
        $('kWIP').textContent = m.time > 0 ? fmt(m.WIP) : '–';
        $('kWIPsub').textContent = `pcs · now ${m.wipNow}${th.capped ? ' (cap ' + th.w + ')' : ' (no cap)'}`;
        const blocked = m.workers.length ? m.workers.reduce((a, w) => a + w.blocked, 0) / m.workers.length : 0;
        $('kUtil').textContent = m.time > 0 ? (m.laborUtil * 100).toFixed(1) + '%' : '–';
        $('kUtilsub').textContent = m.time > 0 ? `working · blocked ${(blocked * 100).toFixed(1)}%` : 'working';
        $('kDone').textContent = String(m.completed);
        $('kDonesub').textContent = cfg.warmup > 0 ? `${m.exits} after warm-up` : `n = ${th.n} workers, N = ${th.N} stations`;
        $('theoryRows').innerHTML = theoryRows(m);
        $('theoryNote').textContent = theoryNote();
        const pill = $('bindingPill');
        pill.className = 'pill ' + th.binding;
        pill.textContent = th.binding === 'labor' ? 'Constraint: labor (n/VAT < TR_b)' : 'Constraint: machines (TR_b ≤ n/VAT)';

        // caption
        const st = { working: 0, blocked: 0, walking: 0, idle: 0, waiting: 0, free: 0 };
        sim.workers.forEach(w => st[w.state]++);
        const qLine = sim.queues.slice(1).reduce((a, q) => a + q.length, 0);
        $('lineCaption').textContent = `Workers now: ${st.working} working, ${st.blocked} blocked, ${st.walking} walking, ${st.idle + st.waiting + st.free} idle. ` +
            `Jobs: ${isFinite(sim.cfg.wip) ? sim.queues[0].length + ' waiting before S1, ' : ''}${sim.inLine} in the line${qLine ? ' (' + qLine + ' in buffers)' : ''}.`;

        // series
        const W = Math.max(2 * th.VAT, 20 / Math.max(1e-9, th.TRmax));
        const recent = exits.filter(e => e.t > sim.t - W);
        const span = Math.min(W, Math.max(1e-9, sim.t - Math.max(cfg.warmup, 0)));
        const last = series[series.length - 1];
        if (sim.t > 0 && (!last || sim.t - last.t > 1e-9)) {
            series.push({
                t: sim.t,
                trWin: sim.t - cfg.warmup >= 0.25 * W ? recent.length / span : null,
                trCum: sim.t - cfg.warmup >= 0.25 * W ? m.TR || null : null,
                ltWin: recent.length ? recent.reduce((a, e) => a + e.lt, 0) / recent.length : null,
                ltCum: m.exits ? m.LT : null,
                wipNow: m.wipNow, wipAvg: m.time > 0 ? m.WIP : null
            });
            if (series.length > 800) series = series.filter((s, i) => i % 2 === 0 || i > series.length - 50);
        }
        updateCharts(m, force);
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------
    function baseOptions(xTitle, yTitle) {
        return {
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { labels: { color: colors.muted, boxWidth: 12, font: { size: 11 } } }, tooltip: { enabled: true } },
            scales: {
                x: { type: 'linear', title: { display: !!xTitle, text: xTitle, color: colors.muted }, ticks: { color: colors.muted }, grid: { color: colors.line } },
                y: { title: { display: !!yTitle, text: yTitle, color: colors.muted }, ticks: { color: colors.muted }, grid: { color: colors.line }, beginAtZero: true }
            },
            elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0 } }
        };
    }
    const dashed = (label, color) => ({ label, data: [], borderColor: color, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false });

    function makeCharts() {
        Object.values(charts).forEach(c => c && c.destroy());
        charts = {};
        if (typeof Chart === 'undefined') return;
        const u = cfg ? cfg.unit : 'min';
        charts.tr = new Chart($('chTR'), {
            type: 'line',
            data: { datasets: [
                { label: 'TR, moving window', data: [], borderColor: colors.accent, pointRadius: 0 },
                { label: 'TR, cumulative', data: [], borderColor: colors.ink, borderWidth: 1.5, pointRadius: 0 },
                dashed('labor n/VAT', colors.walking), dashed('machines TR_b', colors.waiting)
            ] },
            options: baseOptions('time [' + u + ']', 'pcs/' + u)
        });
        const ltOpts = baseOptions('time [' + u + ']', 'LT [' + u + ']');
        ltOpts.scales.y2 = { position: 'right', title: { display: true, text: 'WIP [pcs]', color: colors.muted }, ticks: { color: colors.muted }, grid: { drawOnChartArea: false }, beginAtZero: true };
        charts.lt = new Chart($('chLT'), {
            type: 'line',
            data: { datasets: [
                { label: 'LT, moving window', data: [], borderColor: colors.accent, pointRadius: 0 },
                { label: 'LT, cumulative', data: [], borderColor: colors.ink, borderWidth: 1.5, pointRadius: 0 },
                dashed('LT theory', colors.working),
                { label: 'WIP in system', data: [], borderColor: colors.waiting, borderWidth: 1.2, pointRadius: 0, yAxisID: 'y2', stepped: true }
            ] },
            options: ltOpts
        });
        const barOpts = (stacked, horizontal, yTitle) => ({
            responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
            plugins: { legend: { labels: { color: colors.muted, boxWidth: 12, font: { size: 11 } } } },
            scales: {
                x: { stacked, ticks: { color: colors.muted }, grid: { color: colors.line }, max: horizontal ? 100 : undefined, title: { display: horizontal, text: '% of time', color: colors.muted } },
                y: { stacked, ticks: { color: colors.muted }, grid: { color: colors.line }, max: horizontal ? undefined : 100, beginAtZero: true, title: { display: !!yTitle, text: yTitle, color: colors.muted } }
            }
        });
        charts.workers = new Chart($('chWorkers'), {
            type: 'bar',
            data: { labels: [], datasets: [
                { label: 'working', data: [], backgroundColor: colors.working },
                { label: 'blocked', data: [], backgroundColor: colors.blocked },
                { label: 'walking', data: [], backgroundColor: colors.walking },
                { label: 'idle / waiting', data: [], backgroundColor: colors.idle }
            ] },
            options: barOpts(true, true)
        });
        charts.stations = new Chart($('chStations'), {
            type: 'bar',
            data: { labels: [], datasets: [
                { label: 'processing (worker on it)', data: [], backgroundColor: colors.working },
                { label: 'occupied, not processing (blocked)', data: [], backgroundColor: colors.blocked }
            ] },
            options: barOpts(true, false, '% of time')
        });
        const spOpts = baseOptions('time [' + u + ']', '');
        spOpts.scales.y = { min: -0.5, max: 4.5, ticks: { color: colors.muted, stepSize: 1, callback: v => Number.isInteger(v) ? 'S' + (v + 1) : '' }, grid: { color: colors.line } };
        charts.space = new Chart($('chSpace'), { type: 'line', data: { datasets: [] }, options: spOpts });
        const hoOpts = baseOptions('time [' + u + ']', 'work content done [' + u + ']');
        charts.handoff = new Chart($('chHandoff'), { type: 'scatter', data: { datasets: [] }, options: hoOpts });
        const swTR = baseOptions('', 'TR [pcs/' + u + ']');
        swTR.elements.point.radius = 3;
        charts.sweepTR = new Chart($('chSweepTR'), { type: 'line', data: { datasets: [] }, options: swTR });
        const swLT = baseOptions('', 'LT [' + u + ']');
        swLT.elements.point.radius = 3;
        charts.sweepLT = new Chart($('chSweepLT'), { type: 'line', data: { datasets: [] }, options: swLT });
    }

    function updateCharts(m, force) {
        if (!charts.tr) return;
        const t0 = series.length ? series[0].t : 0, t1 = Math.max(sim.t, 1e-6);
        const line = (y) => [{ x: 0, y }, { x: t1, y }];
        // throughput
        const tr = charts.tr;
        tr.data.datasets[0].data = series.filter(s => s.trWin != null).map(s => ({ x: s.t, y: s.trWin }));
        tr.data.datasets[1].data = series.filter(s => s.trCum != null).map(s => ({ x: s.t, y: s.trCum }));
        tr.data.datasets[2].data = line(th.TRlabor);
        tr.data.datasets[3].data = line(th.TRbEff);
        tr.options.scales.x.min = 0; tr.options.scales.x.max = t1;
        tr.options.scales.y.suggestedMax = Math.max(th.TRlabor, th.TRbEff) * 1.15;
        tr.update('none');
        // lead time
        const lt = charts.lt;
        lt.data.datasets[0].data = series.filter(s => s.ltWin != null).map(s => ({ x: s.t, y: s.ltWin }));
        lt.data.datasets[1].data = series.filter(s => s.ltCum != null).map(s => ({ x: s.t, y: s.ltCum }));
        const exactTied = th.tied && (cfg.policy === 'tied' || cfg.policy === 'bucket') && th.ample;
        lt.data.datasets[2].data = exactTied ? line(th.tied.LTwip) : [];
        lt.data.datasets[3].data = series.map(s => ({ x: s.t, y: s.wipNow }));
        lt.options.scales.x.min = 0; lt.options.scales.x.max = t1;
        lt.update('none');
        void t0;
        // workers
        const wc = charts.workers;
        wc.data.labels = m.workers.map((_, j) => 'W' + (j + 1) + ' (v ' + cfg.workers[j].speed + ')');
        ['working', 'blocked', 'walking', 'idle'].forEach((k, i) => wc.data.datasets[i].data = m.workers.map(w => +(w[k] * 100).toFixed(2)));
        wc.update('none');
        const sc = charts.stations;
        sc.data.labels = m.stations.map((_, k) => 'S' + (k + 1) + (cfg.stations[k].m > 1 ? ' (m=' + cfg.stations[k].m + ')' : ''));
        sc.data.datasets[0].data = m.stations.map(s => +(s.busy * 100).toFixed(2));
        sc.data.datasets[1].data = m.stations.map(s => +(Math.max(0, s.occupied - s.busy) * 100).toFixed(2));
        sc.update('none');
        // space-time
        if (!charts.space) return;
        const sp = charts.space;
        const vMean = th.vSum / th.n;
        const win = Math.max(2.5 * th.VAT / vMean, 10);
        const from = Math.max(0, sim.t - win);
        // positions change linearly only while walking: otherwise the trace is a step
        const off = j => (j - (th.n - 1) / 2) * Math.min(0.08, 0.5 / th.n);
        sp.data.datasets = sim.trace.map((tr, j) => {
            const pts = [];
            let prev = null;
            const push = (t, x) => pts.push({ x: t, y: x + off(j) });
            for (const p of tr) {
                if (p.t < from) { prev = p; continue; }
                if (prev) {
                    if (!pts.length) push(from, prev.s === 'walking' ? prev.x + (p.x - prev.x) * (from - prev.t) / Math.max(1e-9, p.t - prev.t) : prev.x);
                    if (prev.s !== 'walking') push(p.t, prev.x);
                }
                push(p.t, p.x);
                prev = p;
            }
            const w = sim.workers[j];
            if (!pts.length && prev) push(from, prev.x);
            if (prev && prev.s !== 'walking') push(sim.t, prev.x);
            push(sim.t, w.x);
            return { label: 'W' + (j + 1), data: pts, borderColor: WORKER_COLORS[j % 10], pointRadius: 0, borderWidth: 2 };
        });
        sp.options.scales.x.min = from; sp.options.scales.x.max = Math.max(from + win, sim.t);
        sp.options.scales.y.max = th.N - 0.5;
        sp.update('none');
        // handoffs
        const ho = charts.handoff;
        const hwin = Math.max(30 * th.VAT / th.vSum, 4 * th.VAT);
        const hFrom = Math.max(0, sim.t - hwin);
        const recentH = sim.handoffs.filter(h => h.t >= hFrom);
        const ds = [];
        if (cfg.policy === 'bucket') {
            for (let j = 1; j < th.n; j++) {
                ds.push({ label: 'W' + (j + 1) + ' takes over', data: recentH.filter(h => h.j === j).map(h => ({ x: h.t, y: h.wp })), backgroundColor: WORKER_COLORS[j % 10], borderColor: WORKER_COLORS[j % 10], pointRadius: 3, showLine: false });
                ds.push({ label: 'B&E W' + (j + 1), data: [{ x: hFrom, y: th.bbHandoff[j] }, { x: Math.max(hFrom + hwin, sim.t), y: th.bbHandoff[j] }], borderColor: WORKER_COLORS[j % 10], borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, showLine: true });
            }
        }
        ho.data.datasets = ds;
        ho.options.scales.x.min = hFrom; ho.options.scales.x.max = Math.max(hFrom + hwin, sim.t);
        ho.options.scales.y.max = th.VAT;
        ho.options.plugins.legend.labels.filter = item => !item.text.startsWith('B&E');
        ho.update('none');
        const sorted = cfg.workers.every((w, j) => j === 0 || w.speed >= cfg.workers[j - 1].speed);
        $('handoffNote').innerHTML = cfg.policy !== 'bucket'
            ? 'Select the bucket brigade policy to see the take-over points.'
            : 'Dots: work content already done on the job when a worker takes it over. Dashed lines: Bartholdi &amp; Eisenstein fixed point, worker j takes over at VAT · Σ<sub>i&lt;j</sub> v<sub>i</sub> / Σ v. ' +
              (sorted ? 'Workers are ordered slow → fast, so the dots converge on the lines.' : 'Workers are not ordered slow → fast: the dots do not settle on the lines.');
        void force;
    }

    // ------------------------------------------------------------------
    // Sweep experiment
    // ------------------------------------------------------------------
    function runSweep() {
        const variable = $('sweepVar').value;
        const pols = [...document.querySelectorAll('.sweep-policies input:checked')].map(i => i.value);
        if (!pols.length) { $('sweepStatus').textContent = 'Select at least one policy.'; return; }
        if ($('sweepBtn').disabled) return;
        const xs = variable === 'n' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : Array.from({ length: 20 }, (_, i) => i + 1);
        const jobs = [];
        pols.forEach(p => xs.forEach(x => jobs.push({ p, x })));
        const out = {};
        pols.forEach(p => out[p] = []);
        const random = cfg.stations.some(s => s.dist !== 'det');
        $('sweepBtn').disabled = true;
        let i = 0;
        const t0 = performance.now();
        function chunk() {
            const tEnd = performance.now() + 40;
            while (i < jobs.length && performance.now() < tEnd) {
                const { p, x } = jobs[i++];
                const c = engineCfg(cfg);
                c.policy = p;
                c.traceLimit = 2;
                if (variable === 'n') c.workers = Array.from({ length: x }, () => ({ speed: 1 }));
                else c.wip = x;
                // without a cap these two policies push jobs into the line and the WIP never settles
                if (!isFinite(c.wip) && (p === 'zones' || p === 'dropping')) c.wip = 2 * c.workers.length;
                const t = E.theory(c);
                const rateEst = Math.max(1e-9, t.TRmax);
                const nJobs = random ? 2500 : 300;
                const H = nJobs / rateEst;
                c.warmup = Math.max(cfg.warmup, 0.1 * H, 3 * t.VAT);
                try {
                    const s = new E.LaborLine(c);
                    s.advanceTo(c.warmup + H);
                    const mm = s.metrics();
                    out[p].push({ x, TR: mm.TR, LT: mm.LT, WIP: mm.WIP });
                } catch (err) { out[p].push({ x, TR: null, LT: null }); console.error(err); }
            }
            $('sweepStatus').textContent = `Running… ${Math.round(i / jobs.length * 100)}%`;
            if (i < jobs.length) setTimeout(chunk, 0);
            else { drawSweep(variable, xs, out); sweepDone = true; $('sweepBtn').disabled = false; $('sweepStatus').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${random ? 2500 : 300} jobs per point after warm-up.`; }
        }
        chunk();
    }

    function drawSweep(variable, xs, out) {
        const u = cfg.unit;
        const c0 = engineCfg(cfg);
        const ref = xs.map(x => {
            const c = Object.assign({}, c0);
            if (variable === 'n') c.workers = Array.from({ length: x }, () => ({ speed: 1 }));
            else c.wip = x;
            return { x, t: E.theory(c) };
        });
        const trDs = [], ltDs = [];
        const capNote = p => (variable === 'n' && cfg.wipMode === 'free' && (p === 'zones' || p === 'dropping')) ? ' (w = 2n)' : '';
        Object.entries(out).forEach(([p, arr]) => {
            trDs.push({ label: E.POLICIES[p].short + capNote(p), data: arr.filter(a => a.TR != null).map(a => ({ x: a.x, y: a.TR })), borderColor: POLICY_COLORS[p], backgroundColor: POLICY_COLORS[p] });
            ltDs.push({ label: E.POLICIES[p].short + capNote(p), data: arr.filter(a => a.LT).map(a => ({ x: a.x, y: a.LT })), borderColor: POLICY_COLORS[p], backgroundColor: POLICY_COLORS[p] });
        });
        if (variable === 'n') {
            trDs.push({ label: 'labor n/VAT', data: ref.map(r => ({ x: r.x, y: r.t.TRlabor })), borderColor: colors.walking, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 });
            trDs.push({ label: 'machines TR_b', data: ref.map(r => ({ x: r.x, y: r.t.TRb })), borderColor: colors.waiting, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 });
        } else {
            const v = c0.workers.reduce((a, w) => a + w.speed, 0) / c0.workers.length;
            trDs.push({ label: 'min(w,n)·v/VAT, TR_b', data: ref.map(r => ({ x: r.x, y: Math.min(Math.min(r.x, r.t.n) * v / r.t.VAT, r.t.TRbEff) })), borderColor: colors.walking, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 });
            trDs.push({ label: 'PWC (one worker per station)', data: ref.map(r => ({ x: r.x, y: r.t.pwc.TR })), borderColor: colors.muted, borderDash: [2, 3], borderWidth: 1.5, pointRadius: 0 });
        }
        const xTitle = variable === 'n' ? 'number of workers n' : 'WIP w [pcs]';
        charts.sweepTR.data.datasets = trDs;
        charts.sweepTR.options.scales.x.title = { display: true, text: xTitle, color: colors.muted };
        charts.sweepTR.options.scales.x.min = xs[0]; charts.sweepTR.options.scales.x.max = xs[xs.length - 1];
        charts.sweepTR.options.scales.x.ticks.stepSize = variable === 'n' ? 1 : 2;
        charts.sweepTR.update();
        charts.sweepLT.data.datasets = ltDs;
        charts.sweepLT.options.scales.x.title = { display: true, text: xTitle, color: colors.muted };
        charts.sweepLT.options.scales.x.min = xs[0]; charts.sweepLT.options.scales.x.max = xs[xs.length - 1];
        charts.sweepLT.options.scales.x.ticks.stepSize = variable === 'n' ? 1 : 2;
        charts.sweepLT.options.scales.y.title = { display: true, text: 'LT [' + u + ']', color: colors.muted };
        charts.sweepLT.update();
    }

    // ------------------------------------------------------------------
    // Theme
    // ------------------------------------------------------------------
    function initTheme() {
        let saved = null;
        try { saved = localStorage.getItem('laborSimTheme'); } catch (e) { saved = null; }
        if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
        $('themeToggle').addEventListener('click', () => {
            const cur = document.documentElement.dataset.theme ||
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            try { localStorage.setItem('laborSimTheme', next); } catch (e) { /* storage unavailable */ }
            applyTheme();
        });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    function applyTheme() {
        readColors();
        makeCharts();
        refreshUi(true);
        draw(0);
    }

    // ------------------------------------------------------------------
    // Boot
    // ------------------------------------------------------------------
    function boot() {
        initTheme();
        readColors();
        buildPresets();
        buildPolicies();
        bindSetup();
        bindRun();
        $('sweepBtn').addEventListener('click', runSweep);
        // deep link from a slide: index.html#pizza2 loads a scenario, #pizza2.run also starts it
        const hash = (location.hash || '').slice(1).split('.');
        const first = PRESETS.find(p => p.id === hash[0]) || PRESETS[0];
        cfg = presetToCfg(first);
        activePreset = first.id;
        markPreset();
        renderSetup();
        makeCharts();
        rebuild();
        setSpeed(Math.log10(th.VAT / 8));
        if (hash.includes('run')) setRunning(true);
        setTimeout(runSweep, 800);
        let rt = null;
        window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); draw(0); }, 120); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { readColors(); draw(0); });
        requestAnimationFrame(frame);
        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
            navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* optional */ });
        }
        window.laborSim = { get sim() { return sim; }, get cfg() { return cfg; }, get theory() { return th; } };
    }
    if (typeof Chart === 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            $('lineCaption').textContent = 'Chart.js could not be loaded (no internet connection?): charts are disabled.';
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
