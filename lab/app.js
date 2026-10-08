/* =====================================================================
   Factory Flow Lab - user interface
   Uses FlowEngine (engine.js) and Chart.js
   ===================================================================== */
(function () {
    'use strict';
    const E = window.FlowEngine;
    const $ = id => document.getElementById(id);

    const WORKER_COLORS = ['#e07a2e', '#7b55d6', '#159aa3', '#c8418f', '#6f9420', '#2f63b5', '#a8642c', '#c9a90f', '#5e6b6e', '#e2566c'];
    const POLICY_COLORS = { zones: '#7b55d6', tied: '#e07a2e', bucket: '#159aa3', dropping: '#c8418f', machines: '#1f7f8c' };
    const DIST_LABEL = { det: 'Deterministic', normal: 'Normal', exp: 'Exponential', uniform: 'Uniform', tri: 'Triangular' };
    const STORE_KEY = 'flowLab.saved';

    // ------------------------------------------------------------------
    // Scenarios, grouped by topic (the ids are also used by the links in the slides)
    // ------------------------------------------------------------------
    const ST = (st, o = {}) => Object.assign({ st, auto: 0, m: 1, batch: 1, move: 1, oee: 1, dist: 'det', cv: 0.3 }, o);
    const L = (arr, o = {}) => arr.map((x, k) => ST(x, typeof o === 'function' ? o(k) : o));
    const PRESETS = [
        // ---- part 1: machines ----
        { id: 'balanced', mode: 'machines', ref: 'Reference lines', name: 'Balanced line: 5 × 5 s, buffers of 2, w = 9',
          cfg: { stations: L([5, 5, 5, 5, 5]), buffers: [2, 2, 2, 2], wip: 9, unit: 's', warmup: 60 } },
        { id: 'bottleneck', mode: 'machines', ref: 'Reference lines', name: 'Bottleneck at S3 behind a 1-place buffer',
          cfg: { stations: [ST(4, { dist: 'uniform', cv: 0.14, oee: 0.95 }), ST(4, { dist: 'normal', cv: 0.3, oee: 0.9 }), ST(8, { oee: 0.8 }), ST(4, { dist: 'uniform', cv: 0.14, oee: 0.95 }), ST(4, { dist: 'normal', cv: 0.3, oee: 0.9 })],
                 buffers: [3, 1, 3, 3], wip: 10, unit: 's', warmup: 200 } },
        { id: 'volatility', mode: 'machines', ref: 'Reference lines', name: 'High variability: random times, batches, small buffers',
          cfg: { stations: [ST(6, { dist: 'exp', oee: 0.85 }), ST(4.7, { dist: 'tri', cv: 0.4, oee: 0.9 }), ST(7, { dist: 'exp', oee: 0.75, batch: 2 }), ST(4, { dist: 'normal', cv: 0.3, oee: 0.88 }), ST(5, { dist: 'tri', cv: 0.25, oee: 0.92 })],
                 buffers: [1, 2, 1, 1], wip: 8, unit: 's', warmup: 300 } },
        { id: 'assignment', mode: 'machines', ref: 'Reference lines', name: 'Line A–D with parallel machines, 10 000 units',
          cfg: { stations: [ST(20, { m: 1, dist: 'normal', cv: 0.1 }), ST(50, { m: 2, dist: 'normal', cv: 0.1 }), ST(100, { m: 6, dist: 'normal', cv: 0.1 }), ST(30, { m: 2, dist: 'normal', cv: 0.1 })],
                 buffers: [5, 5, 5], wip: 16, unit: 's', warmup: 600, stopAfter: 10000 } },
        { id: 'best', mode: 'machines', ref: 'Best, worst and practical worst case', name: 'Best case: 4 stations × 2 h, w = 4',
          cfg: { stations: L([2, 2, 2, 2]), wip: 4, unit: 'h' } },
        { id: 'worst', mode: 'machines', ref: 'Best, worst and practical worst case', name: 'Worst case: pallets of 2 (4 h for the first part, 0 h for the second)',
          cfg: { stations: L([4, 4, 4, 4], { batch: 2 }), wip: 2, unit: 'h' } },
        { id: 'worstLot', mode: 'machines', ref: 'Best, worst and practical worst case', name: 'Worst case, general form: all w parts travel together',
          cfg: { stations: L([2, 2, 2, 2], { move: 4 }), wip: 4, unit: 'h' } },
        { id: 'pwc', mode: 'machines', ref: 'Best, worst and practical worst case', name: 'Practical worst case: exponential times',
          cfg: { stations: L([2, 2, 2, 2], { dist: 'exp' }), wip: 4, unit: 'h', warmup: 50 } },
        { id: 'unbal', mode: 'machines', ref: 'Unbalanced lines', name: 'Unbalanced line with parallel machines (A–D)',
          cfg: { stations: [ST(2, { m: 1 }), ST(5, { m: 2 }), ST(10, { m: 6 }), ST(3, { m: 2 })], wip: 8, unit: 'h' } },
        { id: 'unbalExp', mode: 'machines', ref: 'Unbalanced lines', name: 'Same unbalanced line, exponential times',
          cfg: { stations: [ST(2, { m: 1, dist: 'exp' }), ST(5, { m: 2, dist: 'exp' }), ST(10, { m: 6, dist: 'exp' }), ST(3, { m: 2, dist: 'exp' })], wip: 8, unit: 'h', warmup: 200 } },
        { id: 'pushRate', mode: 'machines', ref: 'Push and pull', name: 'Push: release at 90% of capacity, random arrivals',
          cfg: { stations: L([2, 2, 2, 2], { dist: 'exp' }), wipMode: 'push', release: { rate: 0.45, arrivals: 'exp' }, unit: 'h', warmup: 500 } },
        { id: 'conwip', mode: 'machines', ref: 'Push and pull', name: 'CONWIP on the same line: same TR with less WIP',
          cfg: { stations: L([2, 2, 2, 2], { dist: 'exp' }), wip: 27, unit: 'h', warmup: 500 } },
        { id: 'pushOver', mode: 'machines', ref: 'Push and pull', name: 'Push above capacity: the WIP explodes',
          cfg: { stations: L([2, 2.5, 2, 2]), wipMode: 'push', release: { rate: 0.45, arrivals: 'det' }, unit: 'h' } },
        { id: 'kanban', mode: 'machines', ref: 'Push and pull', name: 'Kanban: 2 cards per station',
          cfg: { stations: L([2, 2, 2, 2], { dist: 'exp' }), wipMode: 'kanban', release: { cards: [2, 2, 2, 2] }, unit: 'h', warmup: 200 } },
        { id: 'dbr', mode: 'machines', ref: 'Push and pull', name: 'Drum-Buffer-Rope: release tied to the bottleneck',
          cfg: { stations: L([1.5, 1.5, 2, 1.5, 1.5], { dist: 'exp' }), wipMode: 'dbr', release: { rope: 10 }, unit: 'h', warmup: 200 } },
        { id: 'push', mode: 'machines', ref: 'Buffers, batches and OEE', name: 'No WIP cap, 1-place buffers: blocking',
          cfg: { stations: L([5, 5, 5, 5], { dist: 'exp' }), buffers: [1, 1, 1], wipMode: 'free', unit: 's', warmup: 200 } },
        { id: 'oven', mode: 'machines', ref: 'Buffers, batches and OEE', name: 'Oven: batches of 2 parts every 4 h',
          cfg: { stations: L([2, 4, 2, 2], k => ({ batch: k === 1 ? 2 : 1 })), wip: 6, unit: 'h' } },
        { id: 'oeeMach', mode: 'machines', ref: 'Buffers, batches and OEE', name: 'Two parallel machines with different OEE',
          cfg: { stations: [ST(2), ST(4, { m: 2, oee: 0.775, oeeM: [0.95, 0.6] }), ST(2)], wip: 8, unit: 'h' } },
        // ---- part 2: manpower ----
        { id: 'slide90', mode: 'labor', ref: 'Labor as the constraint', name: '5 stations 10–20–30–10–20, n = 2, w = 4, ample machines',
          cfg: { stations: L([10, 20, 30, 10, 20], { m: 2 }), speeds: [1, 1], policy: 'tied', wip: 4, warmup: 180 } },
        { id: 'slide99', mode: 'labor', ref: 'Labor as the constraint', name: 'Same 5 stations, one machine each, random times',
          cfg: { stations: L([10, 20, 30, 10, 20], { dist: 'exp' }), speeds: [1, 1], policy: 'tied', wip: 4, warmup: 500 } },
        { id: 'pizza2', mode: 'labor', ref: 'Labor as the constraint', name: 'Take-away pizza shop: 8 customers, n = 2',
          cfg: { stations: L([3, 3, 4, 4, 3, 3], { m: 2 }), speeds: [1, 1], policy: 'tied', wip: 8, warmup: 40 } },
        { id: 'pizza4', mode: 'labor', ref: 'Labor as the constraint', name: 'Take-away pizza shop: n = 4 workers',
          cfg: { stations: L([3, 3, 4, 4, 3, 3], { m: 4 }), speeds: [1, 1, 1, 1], policy: 'tied', wip: 8, warmup: 40 } },
        { id: 'tend', mode: 'labor', ref: 'Labor as the constraint', name: 'One operator tending three machines (automatic cycle)',
          cfg: { stations: [ST(1, { auto: 4, m: 3 }), ST(0.5)], speeds: [1], policy: 'dropping', wip: 6, warmup: 50 } },
        { id: 'bbSF', mode: 'labor', ref: 'Bucket brigade', name: 'Bucket brigade, slowest → fastest',
          cfg: { stations: L(new Array(10).fill(2)), speeds: [0.6, 1.0, 1.4], policy: 'bucket', wipMode: 'free', warmup: 40 } },
        { id: 'bbFS', mode: 'labor', ref: 'Bucket brigade', name: 'Bucket brigade, fastest → slowest',
          cfg: { stations: L(new Array(10).fill(2)), speeds: [1.4, 1.0, 0.6], policy: 'bucket', wipMode: 'free', warmup: 40 } },
        { id: 'bnEnd', mode: 'labor', ref: 'Blocking and job dropping', name: 'Bottleneck at the end, tied workers',
          cfg: { stations: L([4, 4, 4, 4, 12]), speeds: [1, 1, 1], policy: 'tied', wipMode: 'free', warmup: 60 } },
        { id: 'dropFlood', mode: 'labor', ref: 'Blocking and job dropping', name: 'Job dropping without a WIP cap',
          cfg: { stations: L([4, 4, 4, 4, 12]), speeds: [1, 1, 1], policy: 'dropping', wipMode: 'free' } },
        { id: 'dropCap', mode: 'labor', ref: 'Blocking and job dropping', name: 'Job dropping with a CONWIP cap',
          cfg: { stations: L([4, 4, 4, 4, 12]), speeds: [1, 1, 1], policy: 'dropping', wip: 5, warmup: 60 } },
        { id: 'skills', mode: 'labor', ref: 'Dedicated workers and skills', name: 'Cross-training: two workers share S2',
          cfg: { stations: L([5, 5, 5], { dist: 'exp' }), speeds: [1, 1], policy: 'zones', skills: [[true, true, false], [false, true, true]], wip: 6, warmup: 200 } },
        { id: 'penny', mode: 'labor', ref: 'Dedicated workers and skills', name: 'One worker per station: the classic line',
          cfg: { stations: L([2, 2, 2, 2], { dist: 'exp' }), speeds: [1, 1, 1, 1], policy: 'zones', wip: 4, unit: 'h', warmup: 50 } }
    ];
    const REL_DEFAULT = () => ({ rate: null, arrivals: 'det', cards: null, rope: null, drum: null });
    const RMODE = { cap: 'conwip', free: 'free', push: 'push', kanban: 'kanban', dbr: 'dbr' };

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    let cfg = null, sim = null, th = null;
    let running = false, speed = 10, activePreset = null;
    let series = [], exits = [], entries = [], exitAnims = [], disp = [], logRows = [], nextLog = 0;
    let geo = null, charts = {}, colors = {};
    let lastUi = 0, lastFrame = 0, sweepDone = false, lastAlert = null;
    let deferredInstall = null;
    let appliedCfg = null;          // configuration the running line was built / last updated with
    let markers = [];               // live changes shown on the time charts {t, short, label}
    let noticeTimer = null;
    let chartsUnit = null;
    let lastSweep = null;
    // exercise mode (link #scenario.exercise): the theoretical references are hidden, students build them
    let exercise = false;
    let jobRows = [], stepExits = 0, stepLT = 0, pendingEvents = [], logBase = 0, logFullShown = false;
    // view of each time chart: 'all' (whole run), 'recent' (follows the zoom window), 'user' (zoomed or panned by hand)
    const DEFAULT_VIEWS = { tr: 'all', lt: 'all', cum: 'all', space: 'recent', handoff: 'recent' };
    let views = Object.assign({}, DEFAULT_VIEWS);

    const deepCopy = o => JSON.parse(JSON.stringify(o));
    function presetToCfg(p) {
        const c = p.cfg;
        const stations = c.stations.map(s => Object.assign(ST(1), s));
        const N = stations.length;
        const speeds = c.speeds || [1, 1];
        const out = {
            mode: p.mode, stations, buffers: (c.buffers || new Array(N - 1).fill(null)).slice(0, N - 1),
            workers: speeds.map(s => ({ speed: s })), skills: c.skills ? deepCopy(c.skills) : null,
            policy: c.policy || 'tied', wipMode: c.wipMode || 'cap', wip: c.wip || 4,
            walk: c.walk || 0, preempt: true, warmup: c.warmup || 0, seed: 1, unit: c.unit || 'min', chartWindow: 0,
            stopAfter: c.stopAfter || 0,
            release: Object.assign(REL_DEFAULT(), c.release ? deepCopy(c.release) : {}),
            stagger: c.stagger != null ? c.stagger : p.mode === 'labor'
        };
        while (out.buffers.length < N - 1) out.buffers.push(null);
        out.showMore = stations.some(s => s.batch > 1 || s.move > 1 || s.oee < 1 || s.auto > 0 || s.oeeM);
        out.logStep = defaultLogStep(out);
        return out;
    }
    function defaultLogStep(c) {
        const t0 = c.stations.reduce((a, s) => a + (s.st + s.auto) / s.oee, 0);
        return +Math.max(0.1, t0 / 10).toPrecision(2);
    }
    function engineCfg(c) {
        return {
            mode: c.mode, buffers: c.buffers.map(x => (x == null || x === '') ? Infinity : x),
            stations: c.stations.map(s => s.oeeM && s.oeeM.length > 1 ? Object.assign({}, s, { oee: s.oeeM }) : s),
            workers: c.workers, skills: c.skills, policy: c.policy,
            wip: c.wipMode === 'cap' ? c.wip : Infinity, walk: c.walk, preempt: c.preempt,
            release: Object.assign(REL_DEFAULT(), c.release || {}, { mode: RMODE[c.wipMode] || 'conwip' }), stagger: !!c.stagger,
            warmup: c.warmup, seed: c.seed, traceLimit: 3000, stateLimit: 3000
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
    const rate = x => isFinite(x) ? fmt(x) + ' pcs/' + U() : '–';
    function perHour(x) {
        if (U() === 'min') return (x * 60).toFixed(2) + ' pcs/h';
        if (U() === 's') return (x * 3600).toFixed(1) + ' pcs/h';
        return '';
    }
    const pct = x => (x * 100).toFixed(1) + '%';
    const fmtShort = x => Number.isInteger(x) ? String(x) : (+x.toFixed(2)).toString();
    function clampNum(v, lo, hi, dflt) {
        const x = parseFloat(v);
        if (!isFinite(x)) return dflt;
        return Math.min(hi, Math.max(lo, x));
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ------------------------------------------------------------------
    // Setup panels
    // ------------------------------------------------------------------
    // scenario menu: both parts, grouped by topic
    function buildPresets() {
        const menu = $('scenarioMenu');
        const part = mode => `<div class="menu-part"><p class="menu-part-title">${mode === 'machines' ? 'Part 1 · Machines' : 'Part 2 · Manpower'}</p>` +
            [...new Set(PRESETS.filter(p => p.mode === mode).map(p => p.ref))].map(g => `<p class="menu-group">${g}</p>` +
                PRESETS.filter(p => p.mode === mode && p.ref === g).map(p =>
                    `<button type="button" role="menuitemradio" aria-checked="${p.id === activePreset}" class="menu-item" data-id="${p.id}" title="Direct link: index.html#${p.id}">${p.name}</button>`).join('')).join('') + '</div>';
        menu.innerHTML = part('machines') + part('labor');
        menu.querySelectorAll('.menu-item').forEach(b => b.addEventListener('click', () => { closeMenu(); loadPreset(b.dataset.id); }));
        const cur = PRESETS.find(p => p.id === activePreset);
        $('scenarioName').textContent = cur ? cur.name : 'Your setup (changed)';
    }
    function openMenu() {
        $('scenarioMenu').hidden = false;
        $('scenarioBtn').setAttribute('aria-expanded', 'true');
        const cur = $('scenarioMenu').querySelector('[aria-checked="true"]') || $('scenarioMenu').querySelector('.menu-item');
        if (cur) cur.focus();
    }
    function closeMenu() {
        $('scenarioMenu').hidden = true;
        $('scenarioBtn').setAttribute('aria-expanded', 'false');
    }
    function bindMenu() {
        $('scenarioBtn').addEventListener('click', e => { e.stopPropagation(); if ($('scenarioMenu').hidden) openMenu(); else closeMenu(); });
        document.addEventListener('click', e => { if (!$('scenarioMenu').hidden && !e.target.closest('.menu-wrap')) closeMenu(); });
        document.addEventListener('keydown', e => {
            if ($('scenarioMenu').hidden) return;
            if (e.key === 'Escape') { closeMenu(); $('scenarioBtn').focus(); }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = [...$('scenarioMenu').querySelectorAll('.menu-item')];
                const i = items.indexOf(document.activeElement);
                const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
                if (n) { n.focus(); e.preventDefault(); }
            }
        });
    }
    function loadPreset(id) {
        const p = PRESETS.find(x => x.id === id);
        cfg = presetToCfg(p);
        activePreset = id;
        renderAll();
        rebuild();
        setSpeed(Math.log10(Math.max(0.05, th.T0 / 8)));
        if (!exercise) setTimeout(runSweep, 300);
    }

    function buildPolicies() {
        const box = $('policyList');
        box.innerHTML = '';
        Object.entries(E.POLICIES).forEach(([key, p]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'policy-opt'; b.dataset.policy = key;
            b.setAttribute('role', 'radio');
            b.textContent = p.label;
            b.addEventListener('click', () => { cfg.policy = key; cfg.skills = null; changed(); });
            box.appendChild(b);
        });
    }

    function renderAll() {
        document.body.classList.toggle('mode-machines', cfg.mode === 'machines');
        document.body.classList.toggle('mode-labor', cfg.mode === 'labor');
        document.querySelectorAll('.mode-opt').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === cfg.mode ? 'true' : 'false'));
        buildPresets();
        renderSetup();
        renderConfigTable();
    }

    function renderSetup() {
        document.querySelectorAll('.policy-opt').forEach(b => b.setAttribute('aria-checked', b.dataset.policy === cfg.policy ? 'true' : 'false'));
        $('policyRule').textContent = E.POLICIES[cfg.policy].rule;
        $('bucketOpts').hidden = cfg.policy !== 'bucket';
        $('preemptSel').value = cfg.preempt ? '1' : '0';
        $('nWorkers').value = cfg.workers.length;
        const wt = $('workerTable');
        wt.innerHTML = '';
        cfg.workers.forEach((w, j) => {
            const d = document.createElement('div');
            d.className = 'wcell';
            d.innerHTML = `<span class="wdot" style="background:${WORKER_COLORS[j % 10]}"></span><span class="wname">W${j + 1}</span>` +
                `<input type="number" id="speed${j}" min="0.2" max="3" step="0.1" value="${w.speed}" aria-label="Speed of worker ${j + 1}" title="Speed (1 = standard)">`;
            d.querySelector('input').addEventListener('change', e => { cfg.workers[j].speed = clampNum(e.target.value, 0.2, 3, 1); changed(); });
            wt.appendChild(d);
        });
        $('walkTime').value = cfg.walk;
        $('skillsBox').hidden = cfg.policy !== 'zones';
        if (cfg.policy === 'zones') renderSkills();
        $('staggerChk').checked = !!cfg.stagger;
        $('staggerRow').hidden = !(cfg.policy === 'tied' || cfg.policy === 'dropping');
        document.querySelectorAll('input[name="wipMode"]').forEach(r => { r.checked = r.value === cfg.wipMode; });
        $('freeLabel').innerHTML = cfg.mode === 'machines'
            ? '<strong>No WIP cap</strong>: S1 starts a new job whenever it can; only the buffers limit the WIP'
            : '<strong>No WIP cap</strong>: a new job starts whenever a worker (and S1) is free';
        $('wipCap').value = cfg.wip;
        $('relCap').hidden = cfg.wipMode !== 'cap';
        $('relPush').hidden = cfg.wipMode !== 'push';
        $('relKanban').hidden = cfg.wipMode !== 'kanban';
        $('relDbr').hidden = cfg.wipMode !== 'dbr';
        renderRelease();
        $('nStations').value = cfg.stations.length;
        $('warmup').value = cfg.warmup;
        $('seed').value = cfg.seed;
        $('unitSel').value = cfg.unit;
        $('logStep').value = cfg.logStep;
        $('chartWindow').value = cfg.chartWindow;
        $('stopAfter').value = cfg.stopAfter || 0;
        $('showMore').checked = !!cfg.showMore;
        document.querySelectorAll('.unit-label').forEach(el => el.textContent = cfg.unit);
        $('sweepVar').value = cfg.mode === 'machines' ? 'w' : $('sweepVar').value;
        renderSaved();
    }

    // release rules: values shown are the ones the engine uses (defaults filled in)
    function renderRelease() {
        const t = E.theory(engineCfg(cfg)), R = t.release, u = cfg.unit;
        $('relRate').value = +R.rate.toPrecision(4);
        $('relRateUnit').textContent = 'pcs/' + u;
        $('relArr').value = R.arrivals;
        const rho = R.rate / t.TRmax;
        $('relPushHint').textContent = `Capacity of the line ${fmt(t.TRmax)} pcs/${u}: utilization ρ = ${(rho * 100).toFixed(0)}%. ` +
            (rho >= 0.999 ? 'Above capacity: the queue before S1 grows without limit.' : R.arrivals === 'exp' || cfg.stations.some(s => s.dist !== 'det')
                ? 'With variability the queues grow quickly as ρ approaches 100% (VUT equation).' : 'Regular arrivals and times below capacity: TR = rate and nobody waits.');
        const cards = $('kanbanCards');
        cards.innerHTML = R.cards.map((k, i) => `<label>S${i + 1}<input type="number" min="1" max="99" step="1" value="${k}" data-k="${i}" aria-label="Cards at S${i + 1}"></label>`).join('');
        cards.querySelectorAll('input').forEach(inp => inp.addEventListener('change', e => {
            const cs = R.cards.slice();
            cs[+e.target.dataset.k] = Math.round(clampNum(e.target.value, 1, 99, cs[+e.target.dataset.k]));
            cfg.release.cards = cs;
            changed();
        }));
        $('relKanbanHint').textContent = `Total cards ${R.cards.reduce((x, y) => x + y, 0)}: the WIP never exceeds it. A station with a batch b needs at least b cards.`;
        $('relDrum').innerHTML = `<option value="">auto: the bottleneck (S${t.bottleneck + 1})</option>` + cfg.stations.map((_, k) => `<option value="${k}">S${k + 1}</option>`).join('');
        $('relDrum').value = cfg.release.drum == null ? '' : String(cfg.release.drum);
        $('relRope').value = R.rope;
        $('relDbrHint').textContent = `Drum S${R.drum + 1}, capacity ${fmt(t.rate[R.drum])} pcs/${u}. At most R = ${R.rope} jobs between the release and the end of the drum operation; the jobs past the drum do not count.`;
    }

    function currentSkills() {
        if (cfg.skills) return cfg.skills;
        return E.zonesToSkills(E.computeZones(cfg.stations, cfg.workers.length), cfg.stations.length);
    }
    function renderSkills() {
        const sk = currentSkills();
        const N = cfg.stations.length;
        let h = '<thead><tr><th></th>' + cfg.stations.map((_, k) => `<th>S${k + 1}</th>`).join('') + '</tr></thead><tbody>';
        sk.forEach((row, j) => {
            h += `<tr><th class="wname" style="color:${WORKER_COLORS[j % 10]}">W${j + 1}</th>` +
                row.map((v, k) => `<td><input type="checkbox" data-j="${j}" data-k="${k}" ${v ? 'checked' : ''} aria-label="W${j + 1} can work at S${k + 1}"></td>`).join('') + '</tr>';
        });
        h += '</tbody>';
        void N;
        $('skillsTable').innerHTML = h;
        $('skillsTable').querySelectorAll('input').forEach(inp => inp.addEventListener('change', e => {
            const m = deepCopy(currentSkills());
            m[+e.target.dataset.j][+e.target.dataset.k] = e.target.checked;
            cfg.skills = m;
            changed();
        }));
    }

    function renderConfigTable() {
        const S = cfg.stations, N = S.length, u = cfg.unit, labor = cfg.mode === 'labor';
        const more = cfg.showMore;
        const head = '<thead><tr><th scope="col"></th>' + S.map((_, k) => `<th scope="col">S${k + 1}</th>`).join('') + '</tr></thead>';
        const row = (label, cells, cls = '', tip = '') => `<tr class="${cls}"${cls.includes('more') && !more ? ' hidden' : ''}><th scope="row">${label}${tip ? ` <span class="tip" tabindex="0" data-tip="${escapeHtml(tip)}">?</span>` : ''}</th>${cells}</tr>`;
        const num = (k, key, min, max, step, val, dis) => `<td><input type="number" id="c_${key}_${k}" data-k="${k}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${val}" ${dis ? 'disabled' : ''}></td>`;
        let h = head + '<tbody>';
        h += row(`${labor ? 'Manual time' : 'Process time'} ST [${u}]`, S.map((s, k) => num(k, 'st', 0, 100000, 'any', s.st)).join(''), '',
            labor ? 'Time of the manual work at the station (a worker is needed). Divided by the worker speed.' : 'Mean time to process one part (or one batch).');
        if (labor) h += row(`Automatic cycle [${u}]`, S.map((s, k) => num(k, 'auto', 0, 100000, 'any', s.auto)).join(''), 'more',
            'Time the machine keeps running alone after the manual part: meanwhile the worker can tend another machine (dedicated and job dropping policies).');
        h += row('Distribution', S.map((s, k) => `<td><select id="c_dist_${k}" data-k="${k}" data-key="dist">${Object.entries(DIST_LABEL).map(([v, l]) => `<option value="${v}"${v === s.dist ? ' selected' : ''}>${l}</option>`).join('')}</select></td>`).join(''), '',
            'Deterministic = fixed time. Exponential has CV = 1. Normal is limited to CV ≤ 0.3, uniform to 0.58, triangular (symmetric) to 0.41.');
        h += row('CV (σ / mean)', S.map((s, k) => num(k, 'cv', 0, E.MAX_CV[s.dist] || 0, 0.05, s.dist === 'exp' ? 1 : s.dist === 'det' ? 0 : s.cv, s.dist === 'det' || s.dist === 'exp')).join(''), '',
            'Coefficient of variation of the process time: the measure of variability used in Factory Physics.');
        h += row('Machines m', S.map((s, k) => num(k, 'm', 1, 10, 1, s.m)).join(''), '', 'Parallel machines at the station.');
        h += row('Process batch b', S.map((s, k) => num(k, 'batch', 1, 50, 1, s.batch, labor && (cfg.policy === 'tied' || cfg.policy === 'bucket'))).join(''), 'more',
            'Parts processed together in one cycle (oven, autoclave). The machine starts only when b parts are waiting.');
        h += row('Move lot', S.map((s, k) => num(k, 'move', 1, 50, 1, s.move, labor && (cfg.policy === 'tied' || cfg.policy === 'bucket'))).join(''), 'more',
            'Parts moved together to the next station (forklift, pallet). Move lot = w at every station gives the worst case.');
        h += row('OEE', S.map((s, k) => `<td><input type="text" inputmode="decimal" class="oee-in" id="c_oee_${k}" data-k="${k}" data-key="oee" value="${s.oeeM && s.oeeM.length > 1 ? s.oeeM.join('; ') : s.oee}" title="One value for the station, or one per machine separated by ; (e.g. 0.95; 0.6)"></td>`).join(''), 'more',
            'Overall Equipment Effectiveness: process times are divided by the OEE. With parallel machines give one value per machine, separated by a semicolon: 0.95; 0.6.');
        h += row(`Buffer after the station`, S.map((s, k) => k < N - 1
            ? `<td class="buf"><input type="number" id="c_buf_${k}" data-k="${k}" data-key="buf" min="0" max="500" step="1" placeholder="∞" value="${cfg.buffers[k] == null ? '' : cfg.buffers[k]}"></td>`
            : '<td class="buf mono">OUT</td>').join(''), 'sep', 'Places in the buffer between this station and the next one. Empty = unlimited, 0 = direct transfer.');
        // statistics, filled by refreshUi()
        const stat = (label, key, tip) => row(label, S.map((_, k) => `<td id="s_${key}_${k}">–</td>`).join(''), 'stat', tip);
        h += row(`Capacity m·b/t [pcs/${u}]`, S.map((_, k) => `<td id="s_cap_${k}">–</td>`).join(''), 'stat ref-only', 'Maximum rate of the station. The lowest one is the bottleneck TR_b (underlined).');
        void stat;
        h += stat('Processing', 'work', 'Share of time the machines are processing (or running their automatic cycle).');
        h += stat('Blocked', 'block', 'Finished parts that cannot leave because the next buffer is full (or the worker is blocked).');
        if (labor) h += stat('Waiting for a worker', 'wait', 'A part is ready on the machine but no worker is there yet.');
        h += stat('Starved (no part)', 'idle', 'The machine is free and has nothing to process.');
        h += stat('Buffer after: avg / max', 'buf', 'Average and maximum number of parts in the buffer after the station.');
        h += '</tbody>';
        $('configTable').innerHTML = h;
        $('configTable').querySelectorAll('input, select').forEach(el => el.addEventListener('change', onConfigInput));
    }

    function onConfigInput(e) {
        const k = +e.target.dataset.k, key = e.target.dataset.key, s = cfg.stations[k];
        const v = e.target.value;
        switch (key) {
            case 'st': s.st = clampNum(v, 0, 1e5, s.st); if (s.st + s.auto <= 0) s.st = 1; break;
            case 'auto': s.auto = clampNum(v, 0, 1e5, s.auto); if (s.st + s.auto <= 0) s.auto = 1; break;
            case 'dist': s.dist = v; s.cv = Math.min(s.cv || 0.3, E.MAX_CV[v] || 0.3) || 0.3; break;
            case 'cv': s.cv = clampNum(v, 0, E.MAX_CV[s.dist] || 0, s.cv); break;
            case 'm': s.m = Math.round(clampNum(v, 1, 10, s.m)); break;
            case 'batch': s.batch = Math.round(clampNum(v, 1, 50, s.batch)); break;
            case 'move': s.move = Math.round(clampNum(v, 1, 50, s.move)); break;
            case 'oee': {
                const txt = String(v).trim();
                const parts = txt.includes(';') ? txt.split(';') : /\s/.test(txt) ? txt.split(/,?\s+/) : (txt.includes('.') ? txt.split(',') : [txt]);
                const xs = parts.map(x => x.trim().replace(',', '.')).filter(x => x !== '').map(x => clampNum(x, 0.01, 1, NaN)).filter(x => isFinite(x)).slice(0, 10);
                if (xs.length === 1) { s.oee = xs[0]; delete s.oeeM; }
                else if (xs.length > 1) { s.oeeM = xs; s.m = Math.max(s.m, xs.length); s.oee = +(xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(4); }
                break;
            }
            case 'buf': cfg.buffers[k] = v === '' ? null : Math.round(clampNum(v, 0, 500, 1)); break;
        }
        changed();
    }

    // a change is applied to the running line, unless it needs a new one
    function changed() {
        activePreset = null;
        const prev = appliedCfg;
        const structural = !sim || !prev || sim.t === 0 || prev.mode !== cfg.mode || prev.policy !== cfg.policy ||
            prev.stations.length !== cfg.stations.length || prev.seed !== cfg.seed || prev.warmup !== cfg.warmup || !!prev.stagger !== !!cfg.stagger;
        renderAll();
        if (structural) {
            const wasRunning = sim && sim.t > 0;
            rebuild();
            if (wasRunning) notice('New run: the mode, the policy, the number of stations, the seed, the warm-up and the staggered start can only change from the start.');
        } else liveUpdate(prev);
        if (sweepDone) $('sweepStatus').textContent = 'The setup has changed: run the experiment again to update the curves.';
    }

    function liveUpdate(prev) {
        try { sim.update(engineCfg(cfg)); }
        catch (err) { rebuild(); notice('New run: ' + err.message); return; }
        th = E.theory(engineCfg(cfg));
        appliedCfg = deepCopy(cfg);
        const d = describeDiff(prev, cfg);
        if (d.length) {
            markers.push({ t: sim.t, short: d.length === 1 ? d[0] : d[0] + ' …', label: d.join(', ') });
            pendingEvents.push(`t=${+sim.t.toFixed(4)}: ${d.join(', ')}`);
            notice(`Changed at t = ${fmtShort(+sim.t.toFixed(2))} ${cfg.unit} while running: ${d.join(', ')}. The averages still include the time before; press “Restart statistics” to measure the new situation.`);
        }
        layout();
        refreshUi(true);
        draw(0);
    }

    function describeDiff(a, b) {
        const out = [];
        const wTxt = c => c.wipMode === 'free' ? '∞' : String(c.wip);
        const R = c => c.release || {};
        const relTxt = c => ({ cap: 'CONWIP w ' + c.wip, free: 'no cap', push: `push ${R(c).rate}${R(c).arrivals === 'exp' ? ' random' : ''}`,
            kanban: 'kanban ' + (R(c).cards ? R(c).cards.join('/') : 'auto'), dbr: 'DBR R ' + (R(c).rope || 'auto') + (R(c).drum != null ? ' S' + (R(c).drum + 1) : '') })[c.wipMode];
        if (['cap', 'free'].includes(a.wipMode) && ['cap', 'free'].includes(b.wipMode)) { if (wTxt(a) !== wTxt(b)) out.push(`w ${wTxt(a)}→${wTxt(b)}`); }
        else if (relTxt(a) !== relTxt(b)) out.push(`${relTxt(a)}→${relTxt(b)}`);
        if (b.mode === 'labor') {
            if (a.workers.length !== b.workers.length) out.push(`n ${a.workers.length}→${b.workers.length}`);
            else if (a.workers.some((w, j) => w.speed !== b.workers[j].speed)) out.push('speeds ' + b.workers.map(w => w.speed).join('/'));
            if (a.walk !== b.walk) out.push(`walk ${a.walk}→${b.walk}`);
            if (a.preempt !== b.preempt) out.push('take-over rule');
            if (JSON.stringify(a.skills) !== JSON.stringify(b.skills)) out.push('skills');
        }
        const names = { st: 'ST', auto: 'auto', dist: '', cv: 'CV', m: 'm', batch: 'b', move: 'lot', oee: 'OEE' };
        b.stations.forEach((s, k) => Object.keys(names).forEach(key => {
            if (a.stations[k][key] !== s[key]) out.push(`S${k + 1} ${names[key] ? names[key] + ' ' : ''}${key === 'dist' ? DIST_LABEL[a.stations[k][key]] : a.stations[k][key]}→${key === 'dist' ? DIST_LABEL[s[key]] : s[key]}`);
        }));
        b.stations.forEach((s, k) => { if (JSON.stringify(a.stations[k].oeeM || null) !== JSON.stringify(s.oeeM || null) && s.oeeM) out.push(`S${k + 1} OEE ${s.oeeM.join('/')}`); });
        b.buffers.forEach((x, k) => { if (a.buffers[k] !== x) out.push(`B${k + 1} ${a.buffers[k] == null ? '∞' : a.buffers[k]}→${x == null ? '∞' : x}`); });
        return out;
    }

    function notice(text) {
        const el = $('notice');
        el.textContent = text;
        el.hidden = false;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { el.hidden = true; }, 12000);
    }

    function setWorkers(n) {
        n = Math.round(clampNum(n, 1, 10, cfg.workers.length));
        while (cfg.workers.length < n) cfg.workers.push({ speed: 1 });
        cfg.workers.length = n;
        cfg.skills = null;
        changed();
    }
    function setStations(N) {
        N = Math.round(clampNum(N, 2, 12, cfg.stations.length));
        while (cfg.stations.length < N) cfg.stations.push(Object.assign({}, cfg.stations[cfg.stations.length - 1]));
        cfg.stations.length = N;
        while (cfg.buffers.length < N - 1) cfg.buffers.push(cfg.buffers.length ? cfg.buffers[cfg.buffers.length - 1] : null);
        cfg.buffers.length = N - 1;
        cfg.skills = null;
        changed();
    }

    function bindSetup() {
        document.querySelectorAll('.mode-opt').forEach(b => b.addEventListener('click', () => {
            if (cfg.mode === b.dataset.mode) return;
            cfg.mode = b.dataset.mode;
            if (!cfg.workers.length) cfg.workers = [{ speed: 1 }, { speed: 1 }];
            changed();
        }));
        document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
            const id = b.dataset.step, d = +b.dataset.d;
            if (id === 'nWorkers') setWorkers(cfg.workers.length + d);
            if (id === 'nStations') setStations(cfg.stations.length + d);
            if (id === 'wipCap') { cfg.wip = Math.round(clampNum(cfg.wip + d, 1, 500, cfg.wip)); changed(); }
            if (id === 'relRope') { const r0 = E.theory(engineCfg(cfg)).release.rope; cfg.release.rope = Math.round(clampNum(r0 + d, 1, 500, r0)); changed(); }
        }));
        $('nWorkers').addEventListener('change', e => setWorkers(e.target.value));
        $('nStations').addEventListener('change', e => setStations(e.target.value));
        $('wipCap').addEventListener('change', e => { cfg.wip = Math.round(clampNum(e.target.value, 1, 500, cfg.wip)); changed(); });
        document.querySelectorAll('input[name="wipMode"]').forEach(r => r.addEventListener('change', () => {
            if (!r.checked) return;
            cfg.wipMode = r.value;
            if (r.value === 'push' && !(cfg.release.rate > 0)) cfg.release.rate = +(0.9 * E.theory(engineCfg(cfg)).TRmax).toPrecision(2);
            changed();
        }));
        $('relRate').addEventListener('change', e => { cfg.release.rate = clampNum(e.target.value, 1e-6, 1e6, cfg.release.rate || 1); changed(); });
        $('relArr').addEventListener('change', e => { cfg.release.arrivals = e.target.value; changed(); });
        $('relDrum').addEventListener('change', e => { cfg.release.drum = e.target.value === '' ? null : +e.target.value; changed(); });
        $('relRope').addEventListener('change', e => { cfg.release.rope = Math.round(clampNum(e.target.value, 1, 500, 4)); changed(); });
        $('staggerChk').addEventListener('change', e => { cfg.stagger = e.target.checked; changed(); });
        $('walkTime').addEventListener('change', e => { cfg.walk = clampNum(e.target.value, 0, 20, 0); changed(); });
        $('preemptSel').addEventListener('change', e => { cfg.preempt = e.target.value === '1'; changed(); });
        $('warmup').addEventListener('change', e => { cfg.warmup = clampNum(e.target.value, 0, 1e8, 0); changed(); });
        $('seed').addEventListener('change', e => { cfg.seed = Math.round(clampNum(e.target.value, 1, 1e9, 1)); changed(); });
        $('unitSel').addEventListener('change', e => { cfg.unit = e.target.value; renderAll(); makeCharts(); refreshUi(true); setSpeed($('speedRange').value); });
        $('logStep').addEventListener('change', e => {
            cfg.logStep = clampNum(e.target.value, 0.0001, 1e7, cfg.logStep);
            // keep the rows taken so far; the next ones follow the new step
            logBase = nextLog - logRows.length * cfg.logStep;
            logStatus();
        });
        $('stopAfter').addEventListener('change', e => { cfg.stopAfter = Math.round(clampNum(e.target.value, 0, 1e7, 0)); });
        $('chartWindow').addEventListener('change', e => { cfg.chartWindow = clampNum(e.target.value, 0, 1e8, 0); refreshUi(true); });
        $('showMore').addEventListener('change', e => { cfg.showMore = e.target.checked; renderConfigTable(); refreshUi(true); });
        $('speedsEqual').addEventListener('click', () => { cfg.workers.forEach(w => w.speed = 1); changed(); });
        $('speedsSlowFast').addEventListener('click', () => { const s = cfg.workers.map(w => w.speed).sort((a, b) => a - b); cfg.workers.forEach((w, j) => w.speed = s[j]); changed(); });
        $('speedsFastSlow').addEventListener('click', () => { const s = cfg.workers.map(w => w.speed).sort((a, b) => b - a); cfg.workers.forEach((w, j) => w.speed = s[j]); changed(); });
        $('skillsZones').addEventListener('click', () => { cfg.skills = null; changed(); });
        $('skillsAll').addEventListener('click', () => { cfg.skills = cfg.workers.map(() => cfg.stations.map(() => true)); changed(); });
        $('ampleBtn').addEventListener('click', () => { cfg.stations.forEach(s => s.m = Math.max(s.m, cfg.workers.length)); changed(); });
        $('oneMachineBtn').addEventListener('click', () => { cfg.stations.forEach(s => s.m = 1); changed(); });
        $('buffersInf').addEventListener('click', () => { cfg.buffers = cfg.buffers.map(() => null); changed(); });
        $('buffersZero').addEventListener('click', () => { cfg.buffers = cfg.buffers.map(() => 0); changed(); });
        $('allDet').addEventListener('click', () => { cfg.stations.forEach(s => s.dist = 'det'); changed(); });
        $('allExp').addEventListener('click', () => { cfg.stations.forEach(s => s.dist = 'exp'); changed(); });
        // files
        $('saveCfg').addEventListener('click', () => download('flow-lab-setup.json', JSON.stringify(cfg, null, 2), 'application/json'));
        $('loadCfg').addEventListener('click', () => $('cfgFile').click());
        $('cfgFile').addEventListener('change', e => {
            const f = e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => {
                try { applyLoaded(JSON.parse(r.result)); }
                catch (err) { showAlert(['Could not open the setup file: ' + err.message], true); }
            };
            r.readAsText(f);
            e.target.value = '';
        });
        $('exportCsv').addEventListener('click', exportCsv);
        $('exportJobs').addEventListener('click', exportJobs);
        $('saveLocal').addEventListener('click', saveLocal);
        $('cfgName').addEventListener('keydown', e => { if (e.key === 'Enter') saveLocal(); });
    }

    // accepts both this app's setups and the original simulator's JSON
    function applyLoaded(c) {
        if (Array.isArray(c.stations) && c.stations.length && c.stations[0].params) {
            const distMap = { deterministic: 'det', exponential: 'exp', normal: 'normal', uniform: 'uniform', triangular: 'tri' };
            const st = c.stations.map(s => {
                const d = distMap[s.dist] || 'det', p = s.params || {};
                let mean = +p.mean || 5, cv = 0.3;
                if (d === 'normal') cv = Math.sqrt(+p.variance || 1) / mean;
                if (d === 'uniform') { mean = ((+p.min || 0) + (+p.max || 0)) / 2; cv = ((+p.max || 0) - (+p.min || 0)) / (2 * Math.sqrt(3) * mean); }
                if (d === 'tri') { const a = +p.min || 0, m = +p.mode || 0, b = +p.max || 0; mean = (a + m + b) / 3; cv = Math.sqrt((a * a + m * m + b * b - a * m - a * b - m * b) / 18) / mean; }
                return ST(mean, { dist: d, cv: Math.min(cv, E.MAX_CV[d] || 0.3), oee: +s.oee || 1, batch: +s.batchSize || 1, m: +s.parallelMachines || 1 });
            });
            cfg = presetToCfg({ mode: 'machines', cfg: { stations: st, buffers: (c.buffers || []).map(b => b.capacity), wip: +c.wip || 9, unit: 's', warmup: +c.warmupPeriod || 0 } });
            if (+c.logStep > 0) cfg.logStep = +c.logStep;
        } else {
            if (!Array.isArray(c.stations) || !Array.isArray(c.workers)) throw new Error('missing stations or workers');
            const base = presetToCfg(PRESETS[0]);
            cfg = Object.assign(base, c);
            cfg.release = Object.assign(REL_DEFAULT(), c.release || {});
            if (!RMODE[cfg.wipMode]) cfg.wipMode = 'cap';
            cfg.stations = c.stations.map(s => Object.assign(ST(1), s));
            if (!Array.isArray(cfg.buffers)) cfg.buffers = [];
            while (cfg.buffers.length < cfg.stations.length - 1) cfg.buffers.push(null);
            cfg.buffers.length = cfg.stations.length - 1;
        }
        activePreset = null;
        renderAll();
        rebuild();
    }

    function download(name, text, type) {
        const blob = new Blob([text], { type });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // saved setups (browser storage)
    function readSaved() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function writeSaved(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); return true; } catch (e) { return false; } }
    function saveLocal() {
        const name = $('cfgName').value.trim();
        if (!name) { $('cfgName').focus(); $('cfgName').placeholder = 'Type a name first'; return; }
        const all = readSaved();
        all[name] = { cfg: deepCopy(cfg), saved: new Date().toISOString() };
        if (!writeSaved(all)) showAlert(['This browser does not allow saving: use “Download (JSON)” instead.'], true);
        $('cfgName').value = '';
        renderSaved();
    }
    function renderSaved() {
        const all = readSaved();
        const names = Object.keys(all).sort();
        const ul = $('savedList');
        if (!names.length) { ul.innerHTML = '<li class="empty">No saved setups in this browser yet.</li>'; return; }
        ul.innerHTML = names.map(n => `<li><span class="s-name" title="${escapeHtml(n)}">${escapeHtml(n)}</span>` +
            `<button class="btn btn-small" type="button" data-load="${escapeHtml(n)}">Open</button>` +
            `<button class="btn btn-small" type="button" data-del="${escapeHtml(n)}">Delete</button></li>`).join('');
        ul.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => { const s = readSaved()[b.dataset.load]; if (s) applyLoaded(s.cfg); }));
        ul.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Sure?'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Delete'; }, 2500); return; }
            const all2 = readSaved(); delete all2[b.dataset.del]; writeSaved(all2); renderSaved();
        }));
    }

    // ------------------------------------------------------------------
    // Simulation control
    // ------------------------------------------------------------------
    function rebuild() {
        try { sim = new E.FlowLine(engineCfg(cfg)); }
        catch (err) { showAlert(['The setup is not valid: ' + err.message], true); return; }
        th = E.theory(engineCfg(cfg));
        if (chartsUnit !== cfg.unit) makeCharts();          // axis titles carry the time unit
        appliedCfg = deepCopy(cfg);
        markers = [];
        views = Object.assign({}, DEFAULT_VIEWS);
        markViews();
        series = []; exits = []; entries = []; exitAnims = []; logRows = []; nextLog = 0;
        jobRows = []; stepExits = 0; stepLT = 0; pendingEvents = []; logBase = 0; logFullShown = false;
        disp = sim.workers.map(() => null);
        lastAlert = null;
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
        $('speedOut').textContent = (speed < 1 ? speed.toFixed(3) : speed < 10 ? speed.toFixed(2) : speed < 100 ? speed.toFixed(1) : speed.toFixed(0)) + ' ' + cfg.unit + '/s';
    }
    function bindRun() {
        $('startBtn').addEventListener('click', () => {
            if (startGuard && !startGuard()) return;
            if (sim && stopReached()) { notice(`${cfg.stopAfter} jobs are already completed: raise “Stop after” (0 = no stop) or press Reset.`); return; }
            setRunning(true);
        });
        $('pauseBtn').addEventListener('click', () => setRunning(false));
        $('resetBtn').addEventListener('click', () => { setRunning(false); rebuild(); });
        $('stepBtn').addEventListener('click', () => {
            setRunning(false);
            let dt = sim.nextEventDt();
            if (!isFinite(dt) || dt <= 0) dt = Math.max(0.01, th.T0 / 100);
            advance(sim.t + dt);
            refreshUi(true);
        });
        $('speedRange').addEventListener('input', e => setSpeed(e.target.value));
        $('statsBtn').addEventListener('click', () => {
            if (!sim || sim.t === 0) return;
            sim.resetStats();
            markers.push({ t: sim.t, short: 'statistics', label: 'statistics restarted' });
            pendingEvents.push(`t=${+sim.t.toFixed(4)}: statistics restarted`);
            notice(`Statistics restarted at t = ${fmtShort(+sim.t.toFixed(2))} ${cfg.unit}: averages, histogram and machine shares now describe only what happens from here on.`);
            refreshUi(true);
        });
    }

    // The time series is sampled exactly on the grid 0, Δ, 2Δ, ...: the engine stops at each
    // grid time, so every row is the state at that instant plus what happened since the row before.
    const LOG_MAX = 100000, JOB_MAX = 200000;
    function stopReached() { return cfg.stopAfter > 0 && sim.completed >= cfg.stopAfter; }
    // a stop at an exact time (used by the challenge: events and end of the shift)
    let stopAt = null, clockFormat = null, startGuard = null;
    function advance(T) {
        if (stopAt && T > stopAt.t) T = stopAt.t;
        sim.stopCompleted = cfg.stopAfter > 0 ? cfg.stopAfter : 0;
        try {
            while (cfg.logStep > 0 && nextLog <= T + 1e-9 && logRows.length < LOG_MAX && !stopReached()) {
                if (nextLog > sim.t) sim.advanceTo(nextLog);
                collect();
                logRows.push(logRow(nextLog));
                nextLog = (logRows.length) * cfg.logStep + logBase;
            }
            if (logRows.length >= LOG_MAX && !logFullShown) { logFullShown = true; notice(`The time series is full (${LOG_MAX} rows): export it, or use a longer log step.`); }
            if (!stopReached()) sim.advanceTo(T);
            if (stopReached() && running) {
                setRunning(false);
                collect();
                logRows.push(logRow(sim.t));                          // last row at the stop
                notice(`Stopped: ${cfg.stopAfter} jobs completed at t = ${fmtShort(+sim.t.toFixed(3))} ${cfg.unit}. Export the data, or raise the number (0 = no stop) to go on.`);
            }
        } catch (err) { setRunning(false); showAlert(['Simulation stopped: ' + err.message], true); console.error(err); }
        collect();
        if (stopAt && sim.t >= stopAt.t - 1e-9) { const f = stopAt.fn; stopAt = null; setRunning(false); refreshUi(true); f(); }
    }
    // move what the engine logged into the app (charts, job log, counters of the current log step)
    function collect() {
        const ex = sim.exitLog.splice(0);
        for (const e of ex) {
            exits.push(e);
            stepExits++; stepLT += e.lt;
            if (jobRows.length < JOB_MAX) jobRows.push([e.id, e.tEnter, e.tStart, e.t, e.lt, e.ltLine, e.tStart - e.tEnter, e.counted ? 1 : 0]);
        }
        if (exits.length > 6000) exits.splice(0, exits.length - 6000);
        const en = sim.entryLog.splice(0);
        for (const e of en) entries.push(e.t);
        if (entries.length > 6000) entries.splice(0, entries.length - 6000);
        if (ex.length && ex.length < 6) { const now = performance.now(); ex.forEach(() => exitAnims.push({ t0: now })); }
    }
    function logRow(t) {
        const m = sim.metrics();
        const step = logRows.length ? cfg.logStep : 0;
        const r = {
            t, event: pendingEvents.splice(0).join('; '),
            WIP_now: sim.jobs.size, queue_before_S1_now: sim.queues[0].length, in_line_now: sim.inLine,
            exits_in_step: stepExits, TR_step: step > 0 ? stepExits / step : '', LT_avg_step: stepExits ? stepLT / stepExits : '',
            completed_total: sim.completed, TR_avg: m.TR, LT_avg: m.LT, WIP_avg: m.WIP
        };
        stepExits = 0; stepLT = 0;
        sim.machines.forEach((slots, k) => {
            r[`S${k + 1}_processing_now`] = slots.filter(x => x.state === 'working').length;
            r[`S${k + 1}_blocked_now`] = slots.filter(x => x.state === 'blocked').length;
            if (sim.labor) r[`S${k + 1}_waiting_worker_now`] = slots.filter(x => x.state === 'waitWorker').length;
            r[`S${k + 1}_starved_now`] = slots.filter(x => x.state === 'idle').length;
        });
        sim.queues.forEach((q, k) => { if (k > 0) r[`B${k}_now`] = q.length; });
        sim.workers.forEach((w, j) => { r[`W${j + 1}_state_now`] = w.state; r[`W${j + 1}_position_now`] = +(w.x + 1).toFixed(3); });
        return r;
    }
    function csvCell(v) {
        if (v == null || v === '') return '';
        if (typeof v === 'number') return String(+v.toFixed(6));
        const t = String(v);
        return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }
    function exportCsv() {
        if (!logRows.length) { showAlert(['Run the simulation first: the log is empty.'], false); return; }
        const keys = [];
        logRows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));   // workers may change during the run
        const head = keys.map(k => k === 't' ? `t [${cfg.unit}]` : k);
        const lines = [head.join(',')].concat(logRows.map(r => keys.map(k => csvCell(r[k])).join(',')));
        download('flow-lab-time-series.csv', lines.join('\n'), 'text/csv');
    }
    function exportJobs() {
        if (!jobRows.length) { showAlert(['No job has left the line yet.'], false); return; }
        const u = cfg.unit;
        const head = ['job', `t_enter [${u}]`, `t_start_S1 [${u}]`, `t_exit [${u}]`, `LT [${u}]`, `LT_in_line [${u}]`, `wait_before_S1 [${u}]`, 'after_warmup'];
        download('flow-lab-jobs.csv', [head.join(',')].concat(jobRows.map(r => r.map(csvCell).join(','))).join('\n'), 'text/csv');
    }
    function logStatus() {
        const el = $('logStatus');
        if (!el) return;
        el.textContent = `Time series: ${logRows.length} rows, one every ${fmtShort(cfg.logStep)} ${cfg.unit}. Jobs: ${jobRows.length}.`;
    }

    function frame(ts) {
        const dtReal = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
        lastFrame = ts;
        if (running && sim) advance(sim.t + speed * dtReal);
        draw(dtReal);
        if (ts - lastUi > 250) { lastUi = ts; refreshUi(false); }
        requestAnimationFrame(frame);
    }

    function showAlert(lines, stop) {
        const key = (stop ? '!' : '') + lines.join('|');
        if (key === lastAlert) return;
        lastAlert = key;
        const box = $('alertBox');
        if (!lines.length) { box.hidden = true; return; }
        box.hidden = false;
        box.className = 'alert' + (stop ? ' stop' : '');
        box.innerHTML = lines.length === 1 ? escapeHtml(lines[0]) : '<ul>' + lines.map(l => `<li>${escapeHtml(l)}</li>`).join('') + '</ul>';
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
            auto: g('--auto'), starved: g('--starved'), kanban: g('--kanban') || '#f2c14e', kanbanEdge: g('--kanban-edge') || '#5a4300',
            mono: g('--font-mono') || 'monospace', body: g('--font-body') || 'sans-serif'
        };
    }

    function layout() {
        const cv = $('lineCanvas');
        const W = Math.max(640, cv.parentElement.clientWidth);
        const N = cfg.stations.length;
        const labor = cfg.mode === 'labor';
        const maxM = Math.min(10, Math.max(...cfg.stations.map(s => s.m)));
        const anyLot = sim.cfg.stations.some(s => s.move > 1);
        const badges = sim.cfg.stations.some(s => s.batch > 1 || s.move > 1 || s.oee < 1 || s.auto > 0);
        const left = 92, right = 76;
        const colW = (W - left - right) / N;
        const stW = Math.max(60, Math.min(118, colW * 0.62));
        const slotH = maxM > 5 ? 22 : 32;
        const kanban = sim.cfg.release.mode === 'kanban';
        const top = kanban ? 38 : 18, head = badges ? 48 : 36;
        const stH = head + maxM * slotH + 8;
        const lotY = top + stH + 8;
        const laneY = lotY + (anyLot ? 26 : 0) + (labor ? 28 : 0);
        const zoneY = laneY + 30;
        const H = labor ? zoneY + (cfg.policy === 'zones' ? 34 : 14) : lotY + (anyLot ? 26 : 8);
        geo = { W, H, N, left, right, colW, stW, slotH, top, head, stH, laneY, zoneY, lotY, maxM, anyLot, badges, labor, kanban };
        document.body.classList.toggle('rel-kanban', kanban);
        const dpr = window.devicePixelRatio || 1;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        cv.style.height = H + 'px';
        cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
        disp = sim.workers.map(() => null);
    }
    const px = x => geo.left + (x + 0.5) * geo.colW;
    function slotRect(k, si) {
        const cx = px(k);
        return { x: cx - geo.stW / 2 + 5, y: geo.top + geo.head + si * geo.slotH, w: geo.stW - 10, h: geo.slotH - 6 };
    }
    const jobColor = id => `hsl(${(id * 47) % 360}, 58%, 52%)`;
    function stateColor(s) {
        return s === 'working' ? colors.working : s === 'blocked' ? colors.blocked : s === 'walking' ? colors.walking : s === 'waiting' ? colors.waiting : colors.idle;
    }
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    let tagCards = false;           // kanban: every part in the line carries a card
    function drawJob(ctx, job, x, y, size, faded) {
        ctx.save();
        ctx.fillStyle = jobColor(job.id);
        if (faded) ctx.globalAlpha = 0.45;
        roundRect(ctx, x - size / 2, y - size / 2, size, size, 2);
        ctx.fill();
        ctx.restore();
        if (tagCards) drawCard(ctx, x + size / 2 - 1, y - size / 2 - 3, 5.5, 8, true);
    }
    // a kanban card: yellow portrait card with a dark edge and two printed lines; used = empty dashed place
    function drawCard(ctx, x, y, w, h, free) {
        ctx.save();
        roundRect(ctx, x, y, w, h, 1.2);
        if (free) {
            ctx.fillStyle = colors.kanban; ctx.fill();
            ctx.strokeStyle = colors.kanbanEdge; ctx.lineWidth = 1.2; ctx.stroke();
            if (h >= 11) {
                ctx.fillStyle = colors.kanbanEdge;
                ctx.fillRect(x + 2, y + h * 0.42, w - 4, 1); ctx.fillRect(x + 2, y + h * 0.66, w - 4, 1);
                ctx.beginPath(); ctx.arc(x + w / 2, y + 2.6, 1, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            ctx.setLineDash([2, 2]); ctx.strokeStyle = colors.muted; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
    }
    function workerTarget(w) {
        if (w.slot && (w.state === 'working' || w.state === 'blocked' || w.state === 'waiting')) {
            const r = slotRect(w.slot.k, Math.min(w.slot.i, geo.maxM - 1));
            return { x: r.x + r.w - 13, y: r.y + r.h / 2, lane: false };
        }
        return { x: px(w.x), y: geo.laneY, lane: true };
    }

    function draw(dtReal) {
        if (!geo || !sim) return;
        const ctx = $('lineCanvas').getContext('2d');
        const { W, H, N } = geo;
        const S = sim.cfg.stations;
        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        if (geo.labor) {
            ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(px(0) - 10, geo.laneY); ctx.lineTo(px(N - 1) + 10, geo.laneY); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = colors.muted; ctx.textAlign = 'left'; ctx.font = `12px ${colors.body}`;
            ctx.fillText('walkway', 6, geo.laneY);
        }

        // IN
        const inX = 8, inY = geo.top, inW = geo.left - 22, inH = geo.stH;
        ctx.fillStyle = colors.surface2; ctx.strokeStyle = colors.machineEdge; ctx.lineWidth = 1;
        roundRect(ctx, inX, inY, inW, inH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.font = `600 12px ${colors.body}`;
        ctx.fillText('IN', inX + inW / 2, inY + 12);
        ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
        ctx.fillText(sim.srcQueue() ? 'queue ' + sim.queues[0].length : '∞ raw', inX + inW / 2, inY + 27);
        drawStack(ctx, sim.queues[0], inX + inW / 2, inY + 44, inY + inH - 6, Math.floor((inW - 8) / 12), Infinity);
        tagCards = geo.kanban;

        // OUT
        const outX = W - geo.right + 14, outW = geo.right - 22;
        ctx.fillStyle = colors.surface2; ctx.strokeStyle = colors.machineEdge;
        roundRect(ctx, outX, inY, outW, inH, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colors.ink; ctx.font = `600 12px ${colors.body}`; ctx.textAlign = 'center';
        ctx.fillText('OUT', outX + outW / 2, inY + 12);
        ctx.font = `600 15px ${colors.mono}`;
        ctx.fillText(String(sim.completed), outX + outW / 2, inY + 34);
        ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
        ctx.fillText('done', outX + outW / 2, inY + 50);

        // zones
        if (geo.labor && cfg.policy === 'zones') {
            sim.workers.forEach((w, j) => {
                const ks = w.skills.map((v, k) => v ? k : -1).filter(k => k >= 0);
                if (!ks.length) return;
                const x0 = px(ks[0]) - geo.colW / 2 + 4, x1 = px(ks[ks.length - 1]) + geo.colW / 2 - 4;
                const y = geo.zoneY + (j % 3) * 6;
                ctx.fillStyle = WORKER_COLORS[j % 10]; ctx.globalAlpha = 0.85;
                ks.forEach(k => { roundRect(ctx, px(k) - geo.colW / 2 + 6, y, geo.colW - 12, 4, 2); ctx.fill(); });
                ctx.globalAlpha = 1;
                ctx.fillStyle = WORKER_COLORS[j % 10]; ctx.font = `600 10px ${colors.mono}`; ctx.textAlign = 'right';
                ctx.fillText(w.name || 'W' + (j + 1), x0 - 2, y + 2);
                void x1;
            });
        }

        // stations, buffers, move lots
        for (let k = 0; k < N; k++) {
            const s = S[k], cx = px(k), x = cx - geo.stW / 2, y = geo.top;
            const isB = !exercise && th.bottleneck === k && th.rate.filter(r => Math.abs(r - th.TRb) < 1e-12).length === 1;
            ctx.fillStyle = colors.surface; ctx.strokeStyle = isB ? colors.waiting : colors.machineEdge; ctx.lineWidth = isB ? 2 : 1.2;
            roundRect(ctx, x, y, geo.stW, geo.stH, 6); ctx.fill(); ctx.stroke();
            ctx.fillStyle = colors.ink; ctx.textAlign = 'center'; ctx.font = `600 13px ${colors.body}`;
            ctx.fillText('S' + (k + 1), cx, y + 12);
            ctx.font = `11px ${colors.mono}`; ctx.fillStyle = colors.muted;
            const dl = s.dist === 'det' ? '' : s.dist === 'exp' ? ' exp' : s.dist === 'normal' ? ' N' : s.dist === 'tri' ? ' T' : ' U';
            ctx.fillText(fmtShort(s.st) + (s.auto > 0 ? '+' + fmtShort(s.auto) : '') + ' ' + cfg.unit + dl, cx, y + 27);
            if (geo.badges) {
                const b = [];
                if (s.batch > 1) b.push('b' + s.batch);
                if (s.move > 1) b.push('lot ' + s.move);
                if (s.oees && s.oees.some(x => Math.abs(x - s.oees[0]) > 1e-9)) b.push('OEE ' + s.oees.map(fmtShort).join('/')); else if (s.oee < 1) b.push('OEE ' + fmtShort(s.oee));
                if (s.auto > 0) b.push('auto');
                ctx.font = `10px ${colors.mono}`; ctx.fillStyle = colors.accent;
                ctx.fillText(b.join(' · '), cx, y + 40);
            }
            // kanban post above the station: free cards (yellow) and cards in use (dashed places)
            if (geo.kanban) {
                const K = sim.cfg.release.cards[k], used = Math.min(K, sim.kanbanLoad(k)), free = K - used;
                const cw = Math.min(10, (geo.stW - 6) / K - 3), ch = cw * 1.45;
                if (cw >= 5) {
                    const x0 = cx - (K * (cw + 3) - 3) / 2;
                    for (let i = 0; i < K; i++) drawCard(ctx, x0 + i * (cw + 3), y - ch - 5, cw, ch, i < free);
                } else {
                    drawCard(ctx, cx - 22, y - 19, 9, 13, free > 0);
                    ctx.fillStyle = colors.ink; ctx.font = `600 11px ${colors.mono}`; ctx.textAlign = 'left';
                    ctx.fillText(`${free}/${K}`, cx - 9, y - 12);
                }
            }
            const slots = sim.machines[k];
            const shown = Math.min(slots.length, geo.maxM);
            for (let si = 0; si < shown; si++) {
                const r = slotRect(k, si), sl = slots[si];
                const st = sl.state;
                ctx.fillStyle = colors.machine;
                ctx.strokeStyle = st === 'blocked' ? colors.blocked : st === 'waitWorker' ? colors.waiting : colors.machineEdge;
                ctx.lineWidth = st === 'blocked' || st === 'waitWorker' ? 1.8 : 1;
                ctx.setLineDash(sl.phase === 'reserved' ? [3, 3] : []);
                roundRect(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); ctx.stroke();
                ctx.setLineDash([]); ctx.lineWidth = 1;
                if (sl.jobs.length) {
                    const n = sl.jobs.length;
                    const js = Math.max(5, Math.min(14, r.h - 8, (r.w - 30) / n - 2));
                    sl.jobs.forEach((jb, i) => drawJob(ctx, jb, r.x + 4 + js / 2 + i * (js + 2), r.y + r.h / 2 - 2, js, sl.phase === 'reserved'));
                    let prog = 1, col = colors.working;
                    if (sl.phase === 'manual' && sl.dur > 0) prog = Math.max(0, Math.min(1, 1 - sl.rem / sl.dur));
                    if (sl.phase === 'auto' && sl.autoDur > 0) { prog = Math.max(0, Math.min(1, 1 - sl.autoRem / sl.autoDur)); col = colors.auto; }
                    if (sl.phase === 'done') col = colors.blocked;
                    if (sl.phase === 'reserved') prog = 0;
                    ctx.fillStyle = colors.line; ctx.fillRect(r.x + 3, r.y + r.h - 4, r.w - 6, 2.5);
                    ctx.fillStyle = col; ctx.fillRect(r.x + 3, r.y + r.h - 4, (r.w - 6) * prog, 2.5);
                }
            }
            if (slots.length > shown) {
                ctx.fillStyle = colors.muted; ctx.font = `11px ${colors.mono}`;
                ctx.fillText('+' + (slots.length - shown) + ' more', cx, y + geo.stH - 4);
            }
            // move lot being formed
            if (geo.anyLot && s.move > 1) {
                const ob = sim.outbox[k];
                ctx.fillStyle = colors.muted; ctx.font = `10px ${colors.mono}`; ctx.textAlign = 'center';
                ctx.fillText(`lot ${ob.length}/${s.move}`, cx, geo.lotY + 4);
                ob.slice(0, 12).forEach((jb, i) => drawJob(ctx, jb, cx - (Math.min(ob.length, 12) - 1) * 5.5 + i * 11, geo.lotY + 16, 9));
            }
            // buffer before station k
            if (k > 0) {
                const bx = geo.left + k * geo.colW;
                const cap = sim.cap(k), q = sim.queues[k];
                ctx.fillStyle = colors.muted; ctx.font = `10px ${colors.mono}`; ctx.textAlign = 'center';
                ctx.fillText(isFinite(cap) ? `${q.length}/${cap}` : (q.length ? String(q.length) : ''), bx, geo.top + geo.head - 8);
                drawStack(ctx, q, bx, geo.top + geo.head + 2, geo.top + geo.stH, 1, cap);
            }
        }

        // workers
        if (geo.labor) {
            const minOp = Math.min(...S.map(s => (s.st + s.auto) / s.oee)) / (th.vMax || 1);
            const kk = 14 * Math.max(1, speed / Math.max(1e-6, 2 * minOp));
            const a = dtReal > 0 ? 1 - Math.exp(-dtReal * kk) : 1;
            const targets = sim.workers.map(workerTarget);
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
                // outer ring = state, thin white ring, inner disc = the worker's own colour
                ctx.beginPath(); ctx.arc(d.x, d.y, 13, 0, Math.PI * 2); ctx.fillStyle = stateColor(w.state); ctx.fill();
                ctx.beginPath(); ctx.arc(d.x, d.y, 10, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
                ctx.beginPath(); ctx.arc(d.x, d.y, 8.6, 0, Math.PI * 2); ctx.fillStyle = WORKER_COLORS[j % 10]; ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `600 11px ${colors.mono}`; ctx.textAlign = 'center';
                ctx.fillText(w.name ? w.name[0] : String(j + 1), d.x, d.y + 0.5);
                if (w.state === 'blocked') { ctx.fillStyle = colors.blocked; ctx.font = `700 12px ${colors.body}`; ctx.fillText('!', d.x + 16, d.y - 13); }
            });
        }

        tagCards = false;
        // exits
        const now = performance.now();
        exitAnims = exitAnims.filter(e => now - e.t0 < 600);
        exitAnims.forEach(e => {
            const f = (now - e.t0) / 600, x0 = px(N - 1) + geo.stW / 2, x1 = outX + outW / 2;
            ctx.globalAlpha = 1 - f; ctx.fillStyle = colors.working;
            roundRect(ctx, x0 + (x1 - x0) * f - 5, geo.top + 60 - 5, 10, 10, 2); ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawStack(ctx, q, cx, y0, yMax, cols, cap) {
        const size = 10, gap = 3, cw = Math.max(1, cols);
        const per = Math.max(1, Math.floor((yMax - y0) / (size + gap)));
        const room = per * cw;
        // finite buffer: draw its empty places
        if (isFinite(cap) && cap > 0 && cap <= room) {
            ctx.strokeStyle = colors.machineEdge; ctx.lineWidth = 1;
            for (let i = 0; i < cap; i++) {
                const c = i % cw, r = Math.floor(i / cw);
                const x = cx + (c - (cw - 1) / 2) * (size + gap);
                roundRect(ctx, x - size / 2, y0 + r * (size + gap), size, size, 2); ctx.stroke();
            }
        }
        const shown = q.slice(0, room - (q.length > room ? 1 : 0));
        shown.forEach((job, i) => {
            const c = i % cw, r = Math.floor(i / cw);
            drawJob(ctx, job, cx + (c - (cw - 1) / 2) * (size + gap), y0 + r * (size + gap) + size / 2, size);
        });
        if (q.length > shown.length) {
            ctx.fillStyle = colors.muted; ctx.font = `10px ${colors.mono}`; ctx.textAlign = 'center';
            ctx.fillText('+' + (q.length - shown.length), cx, y0 + (per - 1) * (size + gap) + size / 2);
        }
    }

    // ------------------------------------------------------------------
    // KPIs, theory, alerts
    // ------------------------------------------------------------------
    function deltaCell(simV, theo, mode, exitsN) {
        if (!isFinite(simV) || !isFinite(theo) || theo === 0 || (mode !== 'info' && !(simV > 0))) return '<td class="num">–</td>';
        const d = (simV - theo) / theo, a = Math.abs(d);
        const tol = 1.5 / Math.max(1, exitsN || 1);
        let cls = a < 0.01 + tol ? 'delta-ok' : a < 0.05 + tol ? 'delta-warn' : 'delta-bad';
        if (mode === 'bound') cls = d <= 0.01 + tol ? 'delta-ok' : 'delta-bad';
        if (mode === 'info') cls = '';
        return `<td class="num ${cls}">${(d >= 0 ? '+' : '−') + (a * 100).toFixed(a < 0.1 ? 2 : 1)}%</td>`;
    }

    function unstable() {
        const big = sim.jobs.size > 3 * Math.max(th.n, th.N) + 4;
        if (th.release.mode === 'push') return th.rho >= 0.999 && big;
        return th.release.mode === 'free' && (cfg.mode === 'machines' || cfg.policy === 'dropping' || cfg.policy === 'zones') &&
            sim.cfg.buffers.slice(1).some(x => !isFinite(x)) && big;
    }

    function theoryRows(m) {
        const u = cfg.unit, r = [], noData = !m.exits;
        const row = (q, f, t, s, mode, cls = '') => {
            if (noData && s) return r.push(`<tr class="${cls}"><td>${q}</td><td>${f}</td><td class="num">${t}</td><td class="num">–</td><td class="num">–</td></tr>`);
            r.push(`<tr class="${cls}"><td>${q}</td><td>${f}</td><td class="num">${t}</td><td class="num">${s}</td>${mode ? deltaCell(m[mode.key] != null ? m[mode.key] : mode.sim, mode.theo, mode.kind, m.exits) : '<td class="num"></td>'}</tr>`);
        };
        const grp = t => r.push(`<tr class="group"><td colspan="5">${t}</td></tr>`);
        const labor = cfg.mode === 'labor', n = th.n, w = th.w;
        grp('Line data');
        row(labor ? 'Value-added time VAT (T<sub>0</sub>)' : 'Raw process time T<sub>0</sub>', 'Σ t<sub>k</sub> / (b<sub>k</sub>·OEE<sub>k</sub>)', fmt(th.T0) + ' ' + u, '');
        row(`Bottleneck rate TR<sub>b</sub> (S${th.bottleneck + 1})`, 'min m<sub>k</sub>·b<sub>k</sub> / t<sub>k</sub>', rate(th.TRb) + (perHour(th.TRb) ? ' · ' + perHour(th.TRb) : ''), '');
        row('Critical WIP W<sub>0</sub>', 'TR<sub>b</sub> · T<sub>0</sub>', fmt(th.WIPc) + ' pcs', '');
        if (labor) row('Labor capacity (TH<sub>max</sub>)', th.carry ? 'Σv / VAT' : 'Σv / manual work per part', rate(th.TRlabor), '');
        const RL = th.release;
        if (RL.mode === 'push') {
            grp('Release: push');
            row('Release rate λ', 'set by the plan', rate(RL.rate), rate(m.TR), th.rho < 0.999 ? { key: 'TR', theo: RL.rate } : null);
            row('Utilization ρ', 'λ / capacity', pct(th.rho), '', null, th.rho >= 0.999 ? 'delta-bad' : '');
        } else if (RL.mode === 'kanban') {
            const K = RL.cards.reduce((x, y) => x + y, 0);
            grp('Release: kanban');
            row('Cards in the line', 'Σ K<sub>k</sub> (' + RL.cards.join(' + ') + ')', K + ' pcs', fmt(m.WIP) + ' pcs', { key: 'WIP', theo: K, kind: 'bound' });
        } else if (RL.mode === 'dbr') {
            grp('Release: Drum-Buffer-Rope');
            row(`Drum S${RL.drum + 1}: capacity`, 'm·b / t of the drum', rate(th.rate[RL.drum]), rate(m.TR), { key: 'TR', theo: th.rate[RL.drum], kind: 'bound' });
            row('Rope R', 'jobs released and not past the drum', RL.rope + ' pcs', '', null);
        }

        grp('Throughput');
        let ub = labor ? th.TRmax : (th.best ? th.best.TR : th.TRb);
        if (RL.mode === 'push') ub = Math.min(ub, RL.rate);
        const ubF = labor ? ['labor', 'TR<sub>b</sub>'] : th.capped ? ['w/T<sub>0</sub>', 'TR<sub>b</sub>'] : ['TR<sub>b</sub>'];
        if (RL.mode === 'push') ubF.push('λ');
        row('Upper bound', ubF.length > 1 ? 'min(' + ubF.join(', ') + ')' : ubF[0],
            rate(ub), rate(m.TR), { key: 'TR', theo: ub, kind: 'bound' });
        const exactTied = labor && th.tied && th.carry && th.ample;
        if (exactTied) {
            const f = th.walk > 0 ? 'min(w,n) / (VAT + 2(N−1)·walk)' : (w < n ? 'w / VAT' : 'n / VAT');
            row(w < n ? 'Only w workers busy (w &lt; n)' : 'Workers tied to jobs, ample machines', f, rate(th.tied.TR), rate(m.TR), { key: 'TR', theo: th.tied.TR });
        }
        const ref = refCase();
        if (th.best && (!labor || (cfg.policy === 'zones' && th.n === th.N))) {
            row('Best case', 'min(w/T<sub>0</sub>, TR<sub>b</sub>)', rate(th.best.TR), rate(m.TR), { key: 'TR', theo: th.best.TR, kind: ref === 'best' ? undefined : 'info' }, ref === 'best' ? '' : 'ref');
            row('Practical worst case', 'w/(W<sub>0</sub>+w−1)·TR<sub>b</sub>', rate(th.pwc.TR), rate(m.TR), { key: 'TR', theo: th.pwc.TR, kind: ref === 'pwc' ? undefined : 'info' }, ref === 'pwc' ? '' : 'ref');
            row('Worst case', '1 / T<sub>0</sub>', rate(th.worst.TR), rate(m.TR), { key: 'TR', theo: th.worst.TR, kind: ref === 'worst' ? undefined : 'info' }, ref === 'worst' ? '' : 'ref');
        }

        grp('Lead time');
        if (exactTied) {
            row('LT<sub>worker</sub>', th.walk > 0 ? 'VAT + (N−1)·walk' : 'VAT', fmt(th.tied.LTworker) + ' ' + u, fmt(m.LTline) + ' ' + u, { key: 'LTline', theo: th.tied.LTworker });
            row('LT<sub>wip</sub>', 'w / TR = (w/n)·VAT', fmt(th.tied.LTwip) + ' ' + u, fmt(m.LT) + ' ' + u, { key: 'LT', theo: th.tied.LTwip });
            row('LT<sub>queue</sub> (waiting for a free worker)', '(w−n)/n · VAT', fmt(Math.max(0, th.tied.LTqueue)) + ' ' + u, fmt(m.LTqueue) + ' ' + u, th.tied.LTqueue > 1e-9 ? { key: 'LTqueue', theo: th.tied.LTqueue } : null);
        } else {
            if (th.best && (!labor || (cfg.policy === 'zones' && th.n === th.N))) {
                row('Best case', 'max(T<sub>0</sub>, w/TR<sub>b</sub>)', fmt(th.best.LT) + ' ' + u, fmt(m.LT) + ' ' + u, { key: 'LT', theo: th.best.LT, kind: ref === 'best' ? undefined : 'info' }, ref === 'best' ? '' : 'ref');
                row('Practical worst case', 'T<sub>0</sub> + (w−1)/TR<sub>b</sub>', fmt(th.pwc.LT) + ' ' + u, fmt(m.LT) + ' ' + u, { key: 'LT', theo: th.pwc.LT, kind: ref === 'pwc' ? undefined : 'info' }, ref === 'pwc' ? '' : 'ref');
                row('Worst case', 'w · T<sub>0</sub>', fmt(th.worst.LT) + ' ' + u, fmt(m.LT) + ' ' + u, { key: 'LT', theo: th.worst.LT, kind: ref === 'worst' ? undefined : 'info' }, ref === 'worst' ? '' : 'ref');
            }
            row('LT from Little, with the simulated TR', th.capped ? 'w / TR' : 'WIP / TR', m.TR > 0 ? fmt((th.capped ? th.w : m.WIP) / m.TR) + ' ' + u : '–', fmt(m.LT) + ' ' + u,
                m.TR > 0 ? { key: 'LT', theo: (th.capped ? th.w : m.WIP) / m.TR, kind: unstable() ? 'info' : undefined } : null, unstable() ? 'ref' : '');
        }

        grp('Checks');
        row("Little's law", 'WIP = TR · LT', fmt(m.littleTRxLT) + ' pcs', fmt(m.WIP) + ' pcs', { key: 'WIP', theo: m.littleTRxLT, kind: unstable() ? 'info' : undefined }, unstable() ? 'ref' : '');
        if (m.WIP > 0 && m.exits) {
            const pwcAt = m.WIP / (th.WIPc + m.WIP - 1) * th.TRb;
            const good = m.TR >= pwcAt;
            r.push(`<tr><td>Where is the line?</td><td>PWC at the measured WIP</td><td class="num">${rate(pwcAt)}</td><td class="num">${rate(m.TR)}</td><td class="num ${good ? 'delta-ok' : 'delta-bad'}">${good ? 'good area' : 'bad area'}</td></tr>`);
        }
        return r.join('');
    }

    // which reference case should match exactly (part 1)
    function refCase() {
        const S = sim.cfg.stations;
        if (!th.capped) return null;
        const bufInf = sim.cfg.buffers.slice(1).every(x => !isFinite(x));
        const single = S.every(s => s.m === 1 && s.batch === 1);
        // worst case: the w parts travel together, as a move lot or as a pallet processed in one go
        if (th.deterministic && bufInf && S.every(s => s.m === 1 && ((s.batch === 1 && s.move === th.w) || (s.batch === th.w && s.move <= th.w)))) return 'worst';
        if (th.deterministic && th.onePiece && bufInf) return 'best';
        const te0 = th.te[0];
        if (S.every(s => s.dist === 'exp' && s.auto === 0) && th.onePiece && single && bufInf && th.te.every(t => Math.abs(t - te0) < 1e-9)) return 'pwc';
        return null;
    }

    function releaseNote() {
        const R = th.release;
        if (R.mode === 'push') return th.rho >= 0.999
            ? `Push above capacity (ρ = ${(th.rho * 100).toFixed(0)}%): the release plan ignores the line, the queue before S1 and the lead time grow without limit.`
            : 'Push: jobs enter at the planned rate whatever happens in the line. The WIP is not controlled: with variability it grows quickly as ρ approaches 100%. Compare with CONWIP at the same TR.';
        if (R.mode === 'kanban') return 'Kanban: each station holds a fixed number of cards, so the parts between two stations are capped (like a finite buffer with blocking) and the total WIP cannot exceed the cards.';
        if (R.mode === 'dbr') return `Drum-Buffer-Rope: only the jobs not yet past the drum (S${R.drum + 1}) are capped. A rope long enough keeps the drum busy, TR approaches its capacity, and the faster stations after it carry little WIP.`;
        return '';
    }
    function theoryNote() {
        const p = cfg.policy, parts = [];
        if (releaseNote()) parts.push(releaseNote());
        if (unstable()) parts.push(`The WIP keeps growing (now ${sim.jobs.size} jobs): the line is not stable, so Little's law cannot hold for the averages.`);
        if (cfg.mode === 'machines') {
            const ref = refCase();
            if (ref === 'best') parts.push('Deterministic times, one-piece flow, unlimited buffers: this is the best case, the simulation must match it exactly (after the warm-up).');
            else if (ref === 'worst') parts.push('The w parts travel together (a pallet, or a move lot of w): this is the worst case, TR = 1/T₀ and LT = w·T₀.');
            else if (ref === 'pwc') parts.push('Balanced line with exponential times and single machines: the practical worst case is exact here (it converges as the run gets longer).');
            else if (th.capped) parts.push('Best case, practical worst case and worst case are references: the real line sits between the best and the worst case.');
            if (!th.onePiece) parts.push('Batches or move lots: parts wait for their lot, so the lead time grows even when the capacity is the same.');
            if (sim.cfg.buffers.slice(1).some(x => isFinite(x))) parts.push('Finite buffers: when a buffer is full the upstream machine is blocked and loses capacity, unless the times are deterministic and balanced.');
            return parts.join(' ');
        }
        if (th.ample && th.carry && th.equalSpeeds) {
            parts.push('Full capacity and flexibility: the formulas are exact.');
            if (p === 'bucket') parts.push('With equal speeds a bucket brigade gives the same numbers as workers tied to jobs: only the identity of the worker on each job changes.');
        } else if (!th.ample && th.carry) parts.push('Limited capacity: n/VAT is only an upper bound; a worker who finds the next machine busy is blocked.');
        if (p === 'bucket' && !th.equalSpeeds) parts.push('Unequal speeds: ordering the workers from the slowest to the fastest makes the line balance itself (Bartholdi & Eisenstein).');
        if (p === 'dropping') parts.push(th.capped ? 'Job dropping with a CONWIP cap: workers never stay blocked; a larger cap gives more TR but a longer LT.' : 'Job dropping without a WIP cap: free workers keep starting new jobs and the WIP can grow without limit.');
        if (p === 'zones') parts.push(th.n === th.N && sim.workers.every((w, j) => w.skills.filter(Boolean).length === 1 && w.skills[j])
            ? 'One dedicated worker per station: this is the line of part 1.' : 'Dedicated workers: TR is limited by the most loaded worker; cross-training (shared stations) helps when times vary.');
        if (sim.cfg.stations.some(s => s.auto > 0)) parts.push(th.carry ? 'Automatic cycles: tied workers wait at the machine during the cycle.' : 'Automatic cycles: the worker is free during the cycle and can tend another machine; when two machines need him at the same time one waits (machine interference).');
        if (th.walk > 0) parts.push('Walking time is on: moving costs time, so TR is below the ideal value.');
        return parts.join(' ');
    }

    function refreshUi(force) {
        if (!sim) return;
        const m = sim.metrics(), u = cfg.unit;
        $('clock').textContent = clockFormat ? clockFormat(sim.t) : sim.t < 1000 ? sim.t.toFixed(1) : sim.t.toFixed(0);
        logStatus();
        $('kTR').textContent = m.TR > 0 ? fmt(m.TR) : '–';
        $('kTRsub').textContent = `pcs/${u}` + (m.TR > 0 && perHour(m.TR) ? ' = ' + perHour(m.TR) : '') + (exercise ? '' : ` · bound ${fmt(cfg.mode === 'labor' ? th.TRmax : (th.best ? th.best.TR : th.TRb))}`);
        $('kLT').textContent = m.exits ? fmt(m.LT) : '–';
        $('kLTsub').textContent = m.exits ? `${u} · in the line ${fmt(m.LTline)}, before S1 ${fmt(Math.max(0, m.LTqueue))}` : u;
        $('kWIP').textContent = m.time > 0 ? fmt(m.WIP) : '–';
        const RL = th.release;
        $('kWIPsub').textContent = `pcs · now ${m.wipNow}` + ({ conwip: ` (cap ${th.w})`, free: ' (no cap)', push: ` (push ${fmtShort(+RL.rate.toPrecision(3))}/${u})`,
            kanban: ` (kanban, ${RL.cards.reduce((x, y) => x + y, 0)} cards)`, dbr: ` (rope ${RL.rope})` })[RL.mode];
        if (cfg.mode === 'labor') {
            const blocked = m.workers.length ? m.workers.reduce((a, w) => a + w.blocked, 0) / m.workers.length : 0;
            $('kUtilLabel').textContent = 'Labor utilization';
            $('kUtil').textContent = m.time > 0 ? pct(m.laborUtil) : '–';
            $('kUtilsub').textContent = m.time > 0 ? `working · blocked ${pct(blocked)}` : 'working';
        } else {
            if (exercise) {
                const avg = k => m.stations.reduce((a, x) => a + x[k], 0) / m.stations.length;
                $('kUtilLabel').textContent = 'Machines, average';
                $('kUtil').textContent = m.time > 0 ? pct(avg('working')) : '–';
                $('kUtilsub').textContent = m.time > 0 ? `processing · blocked ${pct(avg('blocked'))} · starved ${pct(avg('idle'))}` : 'processing';
            } else {
                const b = m.stations[th.bottleneck];
                $('kUtilLabel').textContent = `Bottleneck S${th.bottleneck + 1} utilization`;
                $('kUtil').textContent = m.time > 0 ? pct(b.working) : '–';
                $('kUtilsub').textContent = m.time > 0 ? `blocked ${pct(b.blocked)} · starved ${pct(b.idle)}` : 'processing';
            }
        }
        $('kDone').textContent = String(m.completed);
        $('kDonesub').textContent = cfg.warmup > 0 ? `${m.exits} after warm-up` : `N = ${th.N} stations${cfg.mode === 'labor' ? ', n = ' + th.n + ' workers' : ''}`;
        $('theoryRows').innerHTML = theoryRows(m);
        $('theoryNote').textContent = theoryNote();
        const pill = $('bindingPill');
        if (cfg.mode === 'labor') { pill.hidden = false; pill.className = 'pill ' + th.binding; pill.textContent = th.binding === 'labor' ? 'Constraint: labor' : 'Constraint: machines'; }
        else { pill.hidden = false; pill.className = 'pill machines'; pill.textContent = `Bottleneck: S${th.bottleneck + 1}`; }

        // configuration statistics
        th.rate.forEach((r, k) => {
            const c = $('s_cap_' + k); if (!c) return;
            c.textContent = fmt(r); c.classList.toggle('bottleneck', Math.abs(r - th.TRb) < 1e-12);
        });
        m.stations.forEach((s, k) => {
            const set = (key, v) => { const el = $(`s_${key}_${k}`); if (el) el.textContent = m.time > 0 ? pct(v) : '–'; };
            set('work', s.working); set('block', s.blocked); set('wait', s.waitWorker); set('idle', s.idle);
            const el = $('s_buf_' + k);
            if (el) el.textContent = k < th.N - 1 && m.time > 0 ? `${fmt(m.buffers[k + 1].avg)} / ${m.buffers[k + 1].max}` : (k === th.N - 1 ? '' : '–');
        });

        // alerts
        const warn = th.warnings.slice();
        if (sim.stalled) warn.unshift('The line has stopped: no operation can start any more. ' + (th.warnings.length ? 'See below.' : 'Probably the move lots or batches split the parts so that none can complete: change w, the lots or the batches.'));
        showAlert(warn, sim.stalled || th.warnings.some(x => /stops/.test(x)));

        // caption
        const st = { working: 0, blocked: 0, walking: 0, idle: 0, waiting: 0, free: 0 };
        sim.workers.forEach(w => st[w.state]++);
        const qLine = sim.queues.slice(1).reduce((a, q) => a + q.length, 0);
        $('lineCaption').textContent = (cfg.mode === 'labor' ? `Workers now: ${st.working} working, ${st.blocked} blocked, ${st.walking} walking, ${st.idle + st.waiting + st.free} idle or waiting. ` : '') +
            `Jobs: ${sim.srcQueue() ? sim.queues[0].length + ' waiting before S1, ' : ''}${sim.inLine} in the line${qLine ? ' (' + qLine + ' in buffers)' : ''}.`;

        // series
        const Wd = Math.max(2 * th.T0, 20 / Math.max(1e-9, cfg.mode === 'labor' ? th.TRmax : th.TRb));
        const recent = exits.filter(e => e.t > sim.t - Wd);
        const span = Math.min(Wd, Math.max(1e-9, sim.t - cfg.warmup));
        const last = series[series.length - 1];
        if (sim.t > 0 && (!last || sim.t - last.t > 1e-9)) {
            const ready = sim.t - cfg.warmup >= 0.25 * Wd;
            series.push({
                t: sim.t,
                trWin: ready ? recent.length / span : null,
                trCum: ready ? m.TR || null : null,
                ltWin: recent.length ? recent.reduce((a, e) => a + e.lt, 0) / recent.length : null,
                ltCum: m.exits ? m.LT : null,
                wipNow: m.wipNow, wipAvg: m.time > 0 ? m.WIP : null, little: m.exits ? m.littleTRxLT : null
            });
            if (series.length > 800) series = series.filter((s, i) => i % 2 === 0 || i > series.length - 50);
        }
        // convergence of the moving-window throughput
        const tail = series.filter(s => s.trWin != null).slice(-30).map(s => s.trWin);
        const conv = $('convergence');
        if (tail.length >= 30) {
            const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
            const sd = Math.sqrt(tail.reduce((a, b) => a + (b - mean) ** 2, 0) / tail.length);
            const cv = mean > 0 ? sd / mean : 1;
            conv.innerHTML = cv < 0.03 ? `<span class="ok">Steady state reached</span> · the moving-window TR varies by ${(cv * 100).toFixed(1)}%` : `Not yet stable: the moving-window TR still varies by ${(cv * 100).toFixed(1)}%`;
        } else conv.textContent = sim.t > 0 ? 'Collecting data…' : '';
        updateCharts(m, force);
        drawGantt();
    }

    // ------------------------------------------------------------------
    // Charts
    // ------------------------------------------------------------------
    function baseOptions(xTitle, yTitle) {
        return {
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { labels: { color: colors.muted, boxWidth: 12, font: { size: 11 }, filter: legendFilter } }, tooltip: { enabled: true } },
            scales: {
                x: { type: 'linear', title: { display: !!xTitle, text: xTitle, color: colors.muted }, ticks: { color: colors.muted }, grid: { color: colors.line } },
                y: { title: { display: !!yTitle, text: yTitle, color: colors.muted }, ticks: { color: colors.muted }, grid: { color: colors.line }, beginAtZero: true }
            },
            elements: { point: { radius: 0 }, line: { borderWidth: 2, tension: 0 } }
        };
    }
    // vertical lines where the setup was changed while running
    const markerPlugin = {
        id: 'markers',
        afterDatasetsDraw(chart) {
            if (!markers.length || !chart.scales.x) return;
            const x = chart.scales.x, a = chart.chartArea, ctx = chart.ctx;
            ctx.save();
            ctx.strokeStyle = colors.accent; ctx.fillStyle = colors.accent; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
            ctx.font = `10px ${colors.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            markers.forEach((m, i) => {
                if (m.t < x.min || m.t > x.max) return;
                const p = x.getPixelForValue(m.t);
                ctx.beginPath(); ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); ctx.stroke();
                ctx.fillText(m.short, p + 3, a.top + 2 + (i % 3) * 11);
            });
            ctx.restore();
        }
    };
    // wheel / pinch zoom and drag pan on the time axis (chartjs-plugin-zoom, as in the original simulator)
    function zoomOptions(key) {
        const toUser = () => { views[key] = 'user'; markViews(); return true; };
        return {
            pan: { enabled: true, mode: 'x', onPanStart: toUser },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', onZoomStart: toUser },
            limits: { x: { min: 0 } }
        };
    }
    function withZoom(opts, key) { opts.plugins.zoom = zoomOptions(key); return opts; }
    function markViews() {
        document.querySelectorAll('[data-zoom]').forEach(b => b.setAttribute('aria-pressed', views[b.dataset.zoom] === b.dataset.view ? 'true' : 'false'));
    }
    function recentWindow(key) {
        if (cfg.chartWindow > 0) return cfg.chartWindow;
        if (key === 'space') return Math.max(2.5 * th.T0 / (th.vSum / Math.max(1, th.n) || 1), 10);
        if (key === 'handoff') return Math.max(30 * th.bbWork / Math.max(1e-9, th.vSum), 4 * th.T0);
        const r = cfg.mode === 'labor' ? th.TRmax : th.TRb;
        return Math.max(5 * th.T0, 25 / Math.max(1e-9, r));
    }
    // x range of a time chart, or null when the user zoomed by hand
    function xRange(key) {
        const t1 = Math.max(sim.t, 1);
        if (views[key] === 'user') return null;
        if (views[key] === 'recent') { const w = recentWindow(key); return { min: Math.max(0, t1 - w), max: Math.max(t1, w) }; }
        return { min: 0, max: t1 };
    }
    function applyX(chart, key) {
        const r = xRange(key);
        if (r) { chart.options.scales.x.min = r.min; chart.options.scales.x.max = r.max; }
    }
    function bindZoomButtons() {
        document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
            views[b.dataset.zoom] = b.dataset.view;
            const ch = charts[b.dataset.zoom];
            if (ch && ch.resetZoom) { try { ch.resetZoom('none'); } catch (e) { /* plugin missing */ } }
            markViews();
            refreshUi(true);
        }));
        markViews();
    }

    // datasets that do not apply to the current mode are hidden and left out of the legend
    const legendFilter = (item, data) => !data.datasets[item.datasetIndex].modeHidden && !String(item.text).startsWith('B&E');
    const dashed = (label, color) => ({ label, data: [], borderColor: color, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, fill: false });
    function barOptions(horizontal, yTitle) {
        return {
            responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
            plugins: { legend: { labels: { color: colors.muted, boxWidth: 12, font: { size: 11 }, filter: legendFilter } } },
            scales: {
                x: { stacked: true, ticks: { color: colors.muted }, grid: { color: colors.line }, max: horizontal ? 100 : undefined, title: { display: horizontal, text: '% of time', color: colors.muted } },
                y: { stacked: true, ticks: { color: colors.muted }, grid: { color: colors.line }, max: horizontal ? undefined : 100, beginAtZero: true, title: { display: !!yTitle, text: yTitle, color: colors.muted } }
            }
        };
    }

    function makeCharts() {
        Object.values(charts).forEach(c => c && c.destroy());
        charts = {};
        if (typeof Chart === 'undefined') return;
        if (window.ChartZoom && !Chart.registry.plugins.get('zoom')) Chart.register(window.ChartZoom);
        const u = cfg ? cfg.unit : 'min';
        chartsUnit = u;
        charts.tr = new Chart($('chTR'), { type: 'line', data: { datasets: [
            { label: 'TR, moving window', data: [], borderColor: colors.accent, pointRadius: 0 },
            { label: 'TR, cumulative', data: [], borderColor: colors.ink, borderWidth: 1.5, pointRadius: 0 },
            dashed('labor capacity', colors.walking), dashed('bottleneck TR_b', colors.waiting)
        ] }, options: withZoom(baseOptions('time [' + u + ']', 'pcs/' + u), 'tr'), plugins: [markerPlugin] });
        const ltOpts = baseOptions('time [' + u + ']', 'LT [' + u + ']');
        ltOpts.scales.y2 = { position: 'right', title: { display: true, text: 'WIP [pcs]', color: colors.muted }, ticks: { color: colors.muted }, grid: { drawOnChartArea: false }, beginAtZero: true };
        charts.lt = new Chart($('chLT'), { type: 'line', data: { datasets: [
            { label: 'LT, moving window', data: [], borderColor: colors.accent, pointRadius: 0 },
            { label: 'LT, cumulative', data: [], borderColor: colors.ink, borderWidth: 1.5, pointRadius: 0 },
            dashed('LT reference', colors.working),
            { label: 'WIP in the system', data: [], borderColor: colors.waiting, borderWidth: 1.2, pointRadius: 0, yAxisID: 'y2', stepped: true }
        ] }, options: withZoom(ltOpts, 'lt'), plugins: [markerPlugin] });
        const hOpts = { responsive: true, maintainAspectRatio: false, animation: false,
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { color: colors.muted, maxRotation: 0, autoSkip: true }, grid: { display: false }, title: { display: true, text: 'lead time [' + u + ']', color: colors.muted } },
                      y: { ticks: { color: colors.muted }, grid: { color: colors.line }, beginAtZero: true, title: { display: true, text: '% of jobs', color: colors.muted } } } };
        charts.hist = new Chart($('chHist'), { type: 'bar', data: { labels: [], datasets: [{ label: 'jobs', data: [], backgroundColor: colors.accent }] }, options: hOpts });
        const lOpts = baseOptions('WIP, time average [pcs]', 'TR · LT [pcs]');
        charts.little = new Chart($('chLittle'), { type: 'scatter', data: { datasets: [
            { label: 'samples during the run', data: [], backgroundColor: colors.accent, pointRadius: 2.5 },
            { label: 'WIP = TR · LT', data: [], borderColor: colors.muted, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, showLine: true }
        ] }, options: lOpts });
        charts.cum = new Chart($('chCum'), { type: 'line', data: { datasets: [
            { label: 'entered S1', data: [], borderColor: colors.walking, pointRadius: 0, stepped: true },
            { label: 'left the line', data: [], borderColor: colors.working, pointRadius: 0, stepped: true }
        ] }, options: withZoom(baseOptions('time [' + u + ']', 'parts'), 'cum'), plugins: [markerPlugin] });
        charts.stations = new Chart($('chStations'), { type: 'bar', data: { labels: [], datasets: [
            { label: 'processing', data: [], backgroundColor: colors.working },
            { label: 'blocked', data: [], backgroundColor: colors.blocked },
            { label: 'waiting for a worker', data: [], backgroundColor: colors.waiting },
            { label: 'starved', data: [], backgroundColor: colors.starved }
        ] }, options: barOptions(false, '% of time') });
        charts.workers = new Chart($('chWorkers'), { type: 'bar', data: { labels: [], datasets: [
            { label: 'working', data: [], backgroundColor: colors.working },
            { label: 'blocked', data: [], backgroundColor: colors.blocked },
            { label: 'walking', data: [], backgroundColor: colors.walking },
            { label: 'idle / waiting', data: [], backgroundColor: colors.idle }
        ] }, options: barOptions(true) });
        const spOpts = baseOptions('time [' + u + ']', '');
        spOpts.scales.y = { min: -0.5, max: 4.5, ticks: { color: colors.muted, stepSize: 1, callback: v => Number.isInteger(v) ? 'S' + (v + 1) : '' }, grid: { color: colors.line } };
        charts.space = new Chart($('chSpace'), { type: 'line', data: { datasets: [] }, options: withZoom(spOpts, 'space'), plugins: [markerPlugin] });
        charts.handoff = new Chart($('chHandoff'), { type: 'scatter', data: { datasets: [] }, options: withZoom(baseOptions('time [' + u + ']', 'manual work done [' + u + ']'), 'handoff') });
        const sw = y => { const o = baseOptions('', y); o.elements.point.radius = 3; return o; };
        charts.sweepTR = new Chart($('chSweepTR'), { type: 'line', data: { datasets: [] }, options: sw('TR [pcs/' + u + ']') });
        charts.sweepLT = new Chart($('chSweepLT'), { type: 'line', data: { datasets: [] }, options: sw('LT [' + u + ']') });
    }

    function windowFrom() { return cfg.chartWindow > 0 ? Math.max(0, sim.t - cfg.chartWindow) : 0; }

    function updateCharts(m) {
        if (!charts.tr) return;
        const from = 0, t1 = Math.max(sim.t, 1);
        const line = y => [{ x: from, y }, { x: t1, y }];
        const inWin = () => true;
        const labor = cfg.mode === 'labor';
        // throughput
        const tr = charts.tr;
        tr.data.datasets[0].data = series.filter(s => s.trWin != null && inWin(s)).map(s => ({ x: s.t, y: s.trWin }));
        tr.data.datasets[1].data = series.filter(s => s.trCum != null && inWin(s)).map(s => ({ x: s.t, y: s.trCum }));
        tr.data.datasets[2].data = labor ? line(th.TRlabor) : [];
        tr.data.datasets[2].hidden = tr.data.datasets[2].modeHidden = !labor;
        tr.data.datasets[3].data = line(labor ? th.TRbEff : th.TRb);
        tr.data.datasets[3].hidden = tr.data.datasets[3].modeHidden = exercise;
        if (exercise) tr.data.datasets[2].hidden = tr.data.datasets[2].modeHidden = true;
        applyX(tr, 'tr');
        tr.options.scales.y.suggestedMax = Math.max(labor ? th.TRlabor : 0, th.TRbEff, th.TRb) * 1.15;
        tr.update('none');
        // lead time
        const lt = charts.lt;
        lt.data.datasets[0].data = series.filter(s => s.ltWin != null && inWin(s)).map(s => ({ x: s.t, y: s.ltWin }));
        lt.data.datasets[1].data = series.filter(s => s.ltCum != null && inWin(s)).map(s => ({ x: s.t, y: s.ltCum }));
        const exactTied = labor && th.tied && th.carry && th.ample;
        const ref = !labor ? refCase() : null;
        const ltRef = exactTied ? th.tied.LTwip : ref ? th[ref].LT : null;
        lt.data.datasets[2].data = ltRef && !exercise ? line(ltRef) : [];
        lt.data.datasets[2].modeHidden = exercise;
        lt.data.datasets[3].data = series.filter(inWin).map(s => ({ x: s.t, y: s.wipNow }));
        applyX(lt, 'lt');
        lt.update('none');
        // histogram of lead times
        const lts = exits.filter(e => e.t > sim.statsFrom).map(e => e.lt);
        const hc = charts.hist;
        if (lts.length) {
            let lo = Math.min(...lts), hi = Math.max(...lts);
            if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
            const bins = 18, w = (hi - lo) / bins, cnt = new Array(bins).fill(0);
            lts.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - lo) / w))]++);
            hc.data.labels = cnt.map((_, i) => fmtShort(+(lo + (i + 0.5) * w).toPrecision(3)));
            hc.data.datasets[0].data = cnt.map(c => +(c / lts.length * 100).toFixed(2));
        } else { hc.data.labels = []; hc.data.datasets[0].data = []; }
        hc.update('none');
        // Little
        const lc = charts.little;
        const pts = series.filter(s => s.wipAvg != null && s.little != null && inWin(s)).map(s => ({ x: s.wipAvg, y: s.little }));
        lc.data.datasets[0].data = pts;
        const mx = Math.max(1, ...pts.map(p => Math.max(p.x, p.y))) * 1.1;
        lc.data.datasets[1].data = [{ x: 0, y: 0 }, { x: mx, y: mx }];
        lc.options.scales.x.max = mx; lc.options.scales.y.max = mx;
        lc.update('none');
        // cumulative entries / exits
        const cc = charts.cum;
        const cumPts = (times, offset) => {
            const arr = [];
            const step = Math.max(1, Math.ceil(times.length / 500));
            for (let i = 0; i < times.length; i += step) if (times[i] >= from) arr.push({ x: times[i], y: offset + i + 1 });
            if (times.length) arr.push({ x: t1, y: offset + times.length });
            return arr;
        };
        const entOffset = Math.max(0, sim.started - entries.length), exOffset = Math.max(0, sim.completed - exits.length);
        cc.data.datasets[0].data = cumPts(entries, entOffset);
        cc.data.datasets[1].data = cumPts(exits.map(e => e.t), exOffset);
        applyX(cc, 'cum');
        cc.options.scales.y.beginAtZero = views.cum === 'all';
        cc.update('none');
        // stations
        const sc = charts.stations;
        sc.data.labels = m.stations.map((_, k) => 'S' + (k + 1) + (sim.cfg.stations[k].m > 1 ? ' (m=' + sim.cfg.stations[k].m + ')' : ''));
        sc.data.datasets[0].data = m.stations.map(s => +(s.working * 100).toFixed(2));
        sc.data.datasets[1].data = m.stations.map(s => +(s.blocked * 100).toFixed(2));
        sc.data.datasets[2].data = m.stations.map(s => +(s.waitWorker * 100).toFixed(2));
        sc.data.datasets[2].hidden = sc.data.datasets[2].modeHidden = !labor;
        sc.data.datasets[3].data = m.stations.map(s => +(s.idle * 100).toFixed(2));
        sc.update('none');
        if (!labor) return;
        // workers
        const wc = charts.workers;
        wc.data.labels = m.workers.map((_, j) => { const w = sim.workers[j]; return (w && w.name ? w.name : 'W' + (j + 1)) + (w ? ' (v ' + w.speed + ')' : ''); });
        ['working', 'blocked', 'walking', 'idle'].forEach((k, i) => wc.data.datasets[i].data = m.workers.map(w => +(w[k] * 100).toFixed(2)));
        wc.update('none');
        // space-time
        const sp = charts.space;
        const vMean = th.vSum / Math.max(1, th.n);
        const win = recentWindow('space');
        const sFrom = views.space === 'recent' ? Math.max(0, sim.t - win) : 0;
        void vMean;
        const off = j => (j - (th.n - 1) / 2) * Math.min(0.08, 0.5 / th.n);
        sp.data.datasets = sim.trace.map((trc, j) => {
            const p2 = [];
            let prev = null;
            const push = (t, x) => p2.push({ x: t, y: x + off(j) });
            for (const p of trc) {
                if (p.t < sFrom) { prev = p; continue; }
                if (prev) {
                    if (!p2.length) push(sFrom, prev.s === 'walking' ? prev.x + (p.x - prev.x) * (sFrom - prev.t) / Math.max(1e-9, p.t - prev.t) : prev.x);
                    if (prev.s !== 'walking') push(p.t, prev.x);
                }
                push(p.t, p.x);
                prev = p;
            }
            if (!p2.length && prev) push(sFrom, prev.x);
            if (prev && prev.s !== 'walking') push(sim.t, prev.x);
            push(sim.t, sim.workers[j].x);
            return { label: 'W' + (j + 1), data: p2, borderColor: WORKER_COLORS[j % 10], pointRadius: 0, borderWidth: 2 };
        });
        applyX(sp, 'space');
        sp.options.scales.y.max = th.N - 0.5;
        sp.update('none');
        // bucket brigade take-overs
        const ho = charts.handoff;
        const hwin = recentWindow('handoff');
        const hFrom = views.handoff === 'recent' ? Math.max(0, sim.t - hwin) : 0;
        const recentH = sim.handoffs.filter(h => h.t >= hFrom);
        const ds = [];
        if (cfg.policy === 'bucket') {
            for (let j = 1; j < th.n; j++) {
                ds.push({ label: 'W' + (j + 1) + ' takes over', data: recentH.filter(h => h.j === j).map(h => ({ x: h.t, y: h.wp })), backgroundColor: WORKER_COLORS[j % 10], borderColor: WORKER_COLORS[j % 10], pointRadius: 3, showLine: false });
                ds.push({ label: 'B&E W' + (j + 1), data: [{ x: hFrom, y: th.bbHandoff[j] }, { x: Math.max(hFrom + hwin, sim.t), y: th.bbHandoff[j] }], borderColor: WORKER_COLORS[j % 10], borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, showLine: true });
            }
        }
        ho.data.datasets = ds;
        applyX(ho, 'handoff');
        ho.options.scales.y.max = th.bbWork;
        ho.update('none');
        const sorted = cfg.workers.every((w, j) => j === 0 || w.speed >= cfg.workers[j - 1].speed);
        $('handoffNote').innerHTML = cfg.policy !== 'bucket'
            ? 'Select the bucket brigade policy to see the take-over points.'
            : 'Dots: manual work already done on the job when a worker takes it over. Dashed lines: Bartholdi &amp; Eisenstein fixed point, Σ<sub>i&lt;j</sub> v<sub>i</sub> / Σ v of the work. ' +
              (sorted ? 'Workers are ordered slow → fast, so the dots converge on the lines.' : 'Workers are not ordered slow → fast: the dots do not settle on the lines.');
    }

    // 1, 2 or 5 times a power of ten
    function niceStep(x) {
        const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9))));
        const f = x / p;
        return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
    }

    // Gantt of every machine (custom canvas)
    function drawGantt() {
        const cv = $('gantt');
        if (!cv || !sim) return;
        const rows = sim.slots.length;
        const rowH = rows > 24 ? 12 : 20, labelW = 52, padT = 6, axisH = 22;
        const W = Math.max(560, cv.parentElement.clientWidth), H = padT + rows * rowH + axisH;
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
            cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
        }
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const win = cfg.chartWindow > 0 ? cfg.chartWindow : Math.max(3 * th.T0, 12 * Math.max(...th.te));
        const t1 = Math.max(sim.t, win), t0 = t1 - win;
        const X = t => labelW + (t - t0) / win * (W - labelW - 8);
        const col = { working: colors.working, blocked: colors.blocked, waitWorker: colors.waiting, idle: colors.starved };
        ctx.font = `11px ${colors.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        sim.slots.forEach((s, i) => {
            const y = padT + i * rowH;
            const multi = sim.machines[s.k].length > 1;
            ctx.fillStyle = colors.muted;
            ctx.fillText('S' + (s.k + 1) + (multi ? '·' + (s.i + 1) : ''), 4, y + rowH / 2);
            const log = s.log;
            for (let e = 0; e < log.length; e++) {
                const a = log[e].t, b = e + 1 < log.length ? log[e + 1].t : sim.t;
                if (b < t0 || a > sim.t) continue;
                const xa = X(Math.max(a, t0)), xb = X(Math.min(b, sim.t));
                if (xb - xa < 0.3) continue;
                ctx.fillStyle = col[log[e].s] || colors.starved;
                ctx.fillRect(xa, y + 2, xb - xa, rowH - 4);
            }
        });
        // changes made while running
        ctx.save(); ctx.strokeStyle = colors.accent; ctx.setLineDash([4, 3]);
        markers.forEach(mk => { if (mk.t >= t0 && mk.t <= sim.t) { ctx.beginPath(); ctx.moveTo(X(mk.t), padT); ctx.lineTo(X(mk.t), padT + rows * rowH); ctx.stroke(); } });
        ctx.restore();
        // time axis
        ctx.strokeStyle = colors.line; ctx.fillStyle = colors.muted; ctx.textAlign = 'center';
        const yA = padT + rows * rowH + 4;
        ctx.beginPath(); ctx.moveTo(labelW, yA); ctx.lineTo(W - 8, yA); ctx.stroke();
        const step = niceStep(win / 6);
        for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) {
            if (t < 0) continue;
            ctx.fillText(fmtShort(+t.toPrecision(6)), X(t), yA + 10);
        }
    }

    // ------------------------------------------------------------------
    // Experiment: sweep of w (or n)
    // ------------------------------------------------------------------
    function runSweep() {
        if ($('sweepBtn').disabled) return;
        const labor = cfg.mode === 'labor';
        const variable = labor ? $('sweepVar').value : 'w';
        const pols = labor ? [...document.querySelectorAll('.sweep-policies input:checked')].map(i => i.value) : ['machines'];
        if (!pols.length) { $('sweepStatus').textContent = 'Select at least one policy.'; return; }
        const wMax = Math.round(clampNum($('sweepMax').value, 2, 200, 20));
        const wStep = Math.max(1, Math.ceil(wMax / 30));
        const xs = variable === 'n' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : Array.from({ length: Math.floor(wMax / wStep) }, (_, i) => (i + 1) * wStep);
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
                if (p !== 'machines') c.policy = p;
                c.skills = p === 'zones' ? c.skills : null;
                c.traceLimit = 2; c.stateLimit = 2;
                if (variable === 'n') { c.workers = Array.from({ length: x }, () => ({ speed: 1 })); c.skills = null; }
                else { c.wip = x; c.release = Object.assign({}, c.release, { mode: 'conwip' }); }
                if (!isFinite(c.wip) && c.release.mode === 'free' && (p === 'zones' || p === 'dropping' || p === 'machines')) {
                    c.wip = Math.max(2 * c.workers.length, 2 * c.stations.length); c.release = Object.assign({}, c.release, { mode: 'conwip' });
                }
                const t = E.theory(c);
                const nJobs = random ? 2000 : 300;
                const H = nJobs / Math.max(1e-9, t.TRmax);
                c.warmup = Math.max(cfg.warmup, 0.1 * H, 3 * t.T0);
                try {
                    const s = new E.FlowLine(c);
                    s.advanceTo(c.warmup + H);
                    const mm = s.metrics();
                    out[p].push({ x, TR: s.stalled ? 0 : mm.TR, LT: s.stalled ? null : mm.LT });
                } catch (err) { out[p].push({ x, TR: null, LT: null }); console.error(err); }
            }
            $('sweepStatus').textContent = `Running… ${Math.round(i / jobs.length * 100)}%`;
            if (i < jobs.length) setTimeout(chunk, 0);
            else {
                drawSweep(variable, xs, out);
                sweepDone = true;
                $('sweepBtn').disabled = false;
                $('sweepStatus').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${random ? 2000 : 300} jobs per point after the warm-up.`;
            }
        }
        chunk();
    }

    function drawSweep(variable, xs, out) {
        const u = cfg.unit, labor = cfg.mode === 'labor';
        const c0 = engineCfg(cfg);
        const ref = xs.map(x => {
            const c = Object.assign({}, c0);
            if (variable === 'n') c.workers = Array.from({ length: x }, () => ({ speed: 1 }));
            else { c.wip = x; c.release = Object.assign({}, c.release, { mode: 'conwip' }); }
            return { x, t: E.theory(c) };
        });
        lastSweep = { variable, xs, out, ref, unit: u };
        if (!charts.sweepTR) return;
        const capNote = p => (variable === 'n' && cfg.wipMode === 'free' && (p === 'zones' || p === 'dropping')) ? ' (w = 2n)' : '';
        const trDs = [], ltDs = [];
        Object.entries(out).forEach(([p, arr]) => {
            const name = p === 'machines' ? 'Simulated' : E.POLICIES[p].short + capNote(p);
            trDs.push({ label: name, data: arr.filter(a => a.TR != null).map(a => ({ x: a.x, y: a.TR })), borderColor: POLICY_COLORS[p], backgroundColor: POLICY_COLORS[p] });
            ltDs.push({ label: name, data: arr.filter(a => a.LT).map(a => ({ x: a.x, y: a.LT })), borderColor: POLICY_COLORS[p], backgroundColor: POLICY_COLORS[p] });
        });
        const dl = (label, color, pts, dash = [6, 4]) => ({ label, data: pts, borderColor: color, borderDash: dash, borderWidth: 1.5, pointRadius: 0 });
        if (variable === 'n') {
            trDs.push(dl('labor n/VAT', colors.walking, ref.map(r => ({ x: r.x, y: r.t.TRlabor }))));
            trDs.push(dl('bottleneck TR_b', colors.waiting, ref.map(r => ({ x: r.x, y: r.t.TRb }))));
        } else {
            trDs.push(dl('best case', colors.working, ref.map(r => ({ x: r.x, y: r.t.best.TR }))));
            trDs.push(dl('practical worst case', colors.waiting, ref.map(r => ({ x: r.x, y: r.t.pwc.TR }))));
            trDs.push(dl('worst case', colors.blocked, ref.map(r => ({ x: r.x, y: r.t.worst.TR }))));
            ltDs.push(dl('best case', colors.working, ref.map(r => ({ x: r.x, y: r.t.best.LT }))));
            ltDs.push(dl('practical worst case', colors.waiting, ref.map(r => ({ x: r.x, y: r.t.pwc.LT }))));
            ltDs.push(dl('worst case', colors.blocked, ref.map(r => ({ x: r.x, y: r.t.worst.LT }))));
            if (labor) {
                const v = c0.workers.reduce((a, w) => a + w.speed, 0) / c0.workers.length;
                trDs.push(dl('labor limit min(w,n)·v/VAT', colors.walking, ref.map(r => ({ x: r.x, y: Math.min(Math.min(r.x, r.t.n) * v / r.t.VAT, r.t.TRlabor) })), [2, 3]));
            }
        }
        const xTitle = variable === 'n' ? 'number of workers n' : 'WIP w [pcs]';
        const ltMax = Math.max(...ltDs.filter(d => !d.borderDash || d.label !== 'worst case').flatMap(d => d.data.map(p => p.y)), 1);
        [charts.sweepTR, charts.sweepLT].forEach((ch, i) => {
            ch.data.datasets = i === 0 ? trDs : ltDs;
            ch.options.scales.x.title = { display: true, text: xTitle, color: colors.muted };
            ch.options.scales.x.min = xs[0]; ch.options.scales.x.max = xs[xs.length - 1];
            ch.options.scales.x.ticks.stepSize = variable === 'n' ? 1 : 2;
        });
        const st = niceStep(ltMax * 1.1 / 5);
        charts.sweepLT.options.scales.y.max = Math.ceil(ltMax * 1.1 / st) * st;
        charts.sweepTR.update(); charts.sweepLT.update();
        $('sweepNote').textContent = variable === 'n'
            ? 'Every worker has speed 1.0; the WIP rule is kept (with no cap, zones and job dropping get w = 2n, otherwise their WIP never settles).'
            : (labor ? 'Current workers and policy settings; dashed lines are the references of part 1 (machines only) and the labor limit.' :
                'The TR–WIP and LT–WIP curves of the chapter: dashed lines are the best case, the practical worst case and the worst case for this line.') +
              (cfg.wipMode !== 'cap' ? ' The experiment always uses a CONWIP cap.' : '');
    }

    function exportSweep() {
        if (!lastSweep) { notice('Run the experiment first.'); return; }
        const { variable, xs, out, ref, unit } = lastSweep;
        const names = Object.keys(out);
        const head = [variable === 'n' ? 'n' : 'w'];
        names.forEach(p => { const nm = p === 'machines' ? 'sim' : p; head.push(`TR_${nm} [pcs/${unit}]`, `LT_${nm} [${unit}]`); });
        if (variable === 'w') head.push(`TR_best [pcs/${unit}]`, `TR_pwc [pcs/${unit}]`, `TR_worst [pcs/${unit}]`, `LT_best [${unit}]`, `LT_pwc [${unit}]`, `LT_worst [${unit}]`);
        const rows = xs.map((x, i) => {
            const r = [x];
            names.forEach(p => { const a = out[p].find(o => o.x === x) || {}; r.push(a.TR, a.LT); });
            if (variable === 'w') { const t = ref[i].t; r.push(t.best.TR, t.pwc.TR, t.worst.TR, t.best.LT, t.pwc.LT, t.worst.LT); }
            return r.map(csvCell).join(',');
        });
        download('flow-lab-experiment.csv', [head.join(',')].concat(rows).join('\n'), 'text/csv');
    }

    // ------------------------------------------------------------------
    // Theme, install, boot
    // ------------------------------------------------------------------
    function initTheme() {
        let saved = null;
        try { saved = localStorage.getItem('flowLab.theme'); } catch (e) { saved = null; }
        if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
        $('themeToggle').addEventListener('click', () => {
            const cur = document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            try { localStorage.setItem('flowLab.theme', next); } catch (e) { /* storage unavailable */ }
            applyTheme();
        });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    function applyTheme() { readColors(); makeCharts(); refreshUi(true); draw(0); if (sweepDone) runSweep(); }

    function initInstall() {
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('installBtn').hidden = false; });
        $('installBtn').addEventListener('click', async () => {
            if (!deferredInstall) return;
            deferredInstall.prompt();
            try { await deferredInstall.userChoice; } catch (e) { /* dismissed */ }
            deferredInstall = null; $('installBtn').hidden = true;
        });
        window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });
        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* optional */ });
    }

    // ------------------------------------------------------------------
    // API for the Factory Challenge (challenge-ui.js)
    // ------------------------------------------------------------------
    function cfgFromEngine(ec, unit) {
        return {
            mode: ec.mode, stations: ec.stations.map(x => Object.assign(ST(1), x)), buffers: new Array(ec.stations.length - 1).fill(null),
            workers: ec.workers.map(w => ({ speed: w.speed, name: w.name })), skills: ec.skills, policy: ec.policy,
            wipMode: isFinite(ec.wip) ? 'cap' : 'free', wip: isFinite(ec.wip) ? ec.wip : 4, walk: ec.walk, preempt: ec.preempt !== false,
            warmup: 0, seed: ec.seed, unit: unit || 'min', chartWindow: 0, stopAfter: 0, showMore: true, logStep: 5,
            release: REL_DEFAULT(), stagger: false
        };
    }
    const api = {
        get sim() { return sim; },
        get exits() { return exits; },
        // new run (fresh = true) or change of the running line
        applyEngineConfig(ec, fresh, unit, label) {
            cfg = cfgFromEngine(ec, unit);
            activePreset = null;
            renderAll();
            if (fresh || !sim) { rebuild(); return; }
            sim.update(engineCfg(cfg));
            th = E.theory(engineCfg(cfg));
            appliedCfg = deepCopy(cfg);
            if (label) { markers.push({ t: sim.t, short: label, label }); pendingEvents.push(`t=${+sim.t.toFixed(4)}: ${label}`); }
            layout(); refreshUi(true); draw(0);
        },
        setRunning, isRunning: () => running, setSpeed: v => setSpeed(v),
        stopAt(t, fn) { stopAt = t == null ? null : { t, fn }; },
        setClock(fn) { clockFormat = fn; refreshUi(true); },
        setStartGuard(fn) { startGuard = fn; },
        notice, refresh: () => refreshUi(true)
    };

    // one tooltip box for every "?" icon, kept inside the window
    function initTips() {
        const box = $('tipBox');
        let cur = null;
        const show = el => {
            cur = el;
            box.textContent = el.dataset.tip;
            box.hidden = false;
            const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
            const x = Math.max(8, Math.min(window.innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2));
            let y = r.top - b.height - 8;
            if (y < 8) y = r.bottom + 8;
            box.style.left = x + 'px'; box.style.top = y + 'px';
        };
        const hide = () => { cur = null; box.hidden = true; };
        const tipOf = e => e.target && e.target.closest ? e.target.closest('.tip') : null;
        document.addEventListener('mouseover', e => { const t = tipOf(e); if (t) { if (t !== cur) show(t); } else if (cur) hide(); });
        document.addEventListener('focusin', e => { const t = tipOf(e); if (t) show(t); else if (cur) hide(); });
        document.addEventListener('click', e => { const t = tipOf(e); if (t) { e.preventDefault(); e.stopPropagation(); if (cur === t && !box.hidden) hide(); else show(t); } else if (cur) hide(); }, true);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); });
        window.addEventListener('scroll', hide, true);
    }

    // every panel collapses to its title; the state is remembered in this browser
    const COLLAPSE_KEY = 'flowLab.collapsed';
    function readCollapsed() { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]') || []; } catch (e) { return []; } }
    function initCollapsible() {
        const saved = readCollapsed();
        document.querySelectorAll('.panel').forEach(p => {
            if (p.id === 'challengePanel' || p.id === 'chResult') return;
            const title = p.querySelector(':scope > .panel-title, :scope > .chart-title, :scope > .panel-head > .panel-title, :scope > .panel-head > .chart-title, :scope > .chart-head > .chart-title');
            if (!title) return;
            const key = p.dataset.panel || title.textContent.trim().slice(0, 60);
            title.classList.add('collapsible-title');
            title.tabIndex = 0;
            title.setAttribute('role', 'button');
            title.title = 'Show or hide';
            const set = c => { p.classList.toggle('collapsed', c); title.setAttribute('aria-expanded', String(!c)); };
            set(saved.includes(key));
            const toggle = () => {
                const c = !p.classList.contains('collapsed');
                set(c);
                const s = readCollapsed().filter(x => x !== key);
                if (c) s.push(key);
                try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s)); } catch (e) { /* not saved */ }
                if (!c) setTimeout(() => { layout(); draw(0); drawGantt(); Object.values(charts).forEach(ch => { if (ch && ch.resize) ch.resize(); }); }, 30);
            };
            title.addEventListener('click', e => { if (!e.target.closest('.tip')) toggle(); });
            title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        });
    }

    function boot() {
        initTheme();
        readColors();
        buildPolicies();
        bindMenu();
        bindSetup();
        bindRun();
        initInstall();
        $('sweepBtn').addEventListener('click', runSweep);
        $('sweepCsv').addEventListener('click', exportSweep);
        bindZoomButtons();
        initTips();
        initCollapsible();
        // deep link: index.html#pizza2 loads a scenario, #pizza2.run also starts it
        const hash = (location.hash || '').slice(1).split('.');
        exercise = hash.includes('exercise');
        document.body.classList.toggle('exercise', exercise);
        $('exerciseBanner').hidden = !exercise;
        const challengeId = hash.includes('challenge') && window.FlowChallenge && window.FlowChallenge.SCENARIOS[hash[0]] ? hash[0] : null;
        if (challengeId) {
            exercise = true;
            document.body.classList.add('exercise', 'challenge');
        }
        const first = PRESETS.find(p => p.id === hash[0]) || PRESETS[0];
        cfg = presetToCfg(first);
        activePreset = first.id;
        renderAll();
        makeCharts();
        rebuild();
        setSpeed(Math.log10(Math.max(0.05, th.T0 / 8)));
        if (challengeId && window.FlowChallengeUI) window.FlowChallengeUI.init(api, challengeId);
        else {
            if (hash.includes('run')) setRunning(true);
            if (!exercise) setTimeout(runSweep, 800);
        }
        let rt = null;
        window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); draw(0); drawGantt(); }, 120); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { readColors(); draw(0); });
        requestAnimationFrame(frame);
        window.flowLab = {
            // advance the line by dtSim and redraw as one animation frame of dtReal seconds (used to record GIFs)
            frame(dtSim, dtReal) { advance(sim.t + dtSim); draw(dtReal); refreshUi(true); },
            get sim() { return sim; }, get cfg() { return cfg; }, get theory() { return th; }, get logRows() { return logRows; }, get jobRows() { return jobRows; } };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
