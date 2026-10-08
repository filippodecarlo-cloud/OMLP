/* =====================================================================
   Factory Flow Lab - Factory Challenge, user interface
   Opened with index.html#ebike.challenge. Uses FlowChallenge (challenge.js)
   and the API that app.js passes to init().
   States: plan -> running -> (event -> running)* -> done
   ===================================================================== */
(function () {
    'use strict';
    const CH = window.FlowChallenge;
    const $ = id => document.getElementById(id);
    const COLORS = ['#e07a2e', '#7b55d6', '#159aa3', '#c8418f', '#6f9420'];
    const POLICY_NAMES = { zones: 'Dedicated workers (skills)', tied: 'Workers tied to jobs', bucket: 'Bucket brigade', dropping: 'Job dropping' };

    let api, scn, plan, team = '', state = 'plan', mode = 'official';
    let timeline = [], cur = null, evtIdx = 0, draft = null, liveTimer = null, lastResult = null;

    const clone = o => JSON.parse(JSON.stringify(o));
    const eur = x => (x < 0 ? '−' : '') + Math.abs(Math.round(x)).toLocaleString('en-US') + ' €';
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const people = d => [...new Set(d.order.concat(d.hires))];
    const color = name => COLORS[[...scn.crew, ...scn.temps].findIndex(p => p.name === name) % COLORS.length];
    const storeKey = () => 'flowLab.challenge.' + scn.id;
    function save() { try { localStorage.setItem(storeKey(), JSON.stringify({ plan, team })); } catch (e) { /* storage unavailable */ } }
    function restore() {
        try { const s = JSON.parse(localStorage.getItem(storeKey()) || 'null'); if (s && s.plan) { plan = CH.sanitize(scn, s.plan, null); team = s.team || ''; } } catch (e) { /* ignore */ }
    }

    // the decision being edited and the one it starts from
    function editing() { return state === 'event' ? draft : plan; }
    function previous() { return state === 'event' ? cur : null; }
    function editable() { return state === 'plan' || state === 'event'; }
    function now() { return state === 'event' ? scn.events[evtIdx].t : 0; }
    function stateNow() { return CH.stateAt(scn, now(), mode === 'practice'); }

    // ------------------------------------------------------------ init
    function init(a, id) {
        api = a; scn = CH.SCENARIOS[id];
        plan = CH.baseDecision(scn);
        restore();
        $('challengePanel').hidden = false;
        $('chTitle').textContent = scn.title;
        $('chTeam').value = team;
        $('chTeam').addEventListener('input', e => { team = e.target.value.slice(0, 40); save(); });
        renderRules();
        $('chPractice').addEventListener('click', () => start('practice'));
        $('chOfficial').addEventListener('click', () => start('official'));
        $('chAbort').addEventListener('click', backToPlan);
        $('chWip').addEventListener('change', e => { const d = editing(); d.wip = Math.max(0, Math.round(+e.target.value || 0)); changed(); });
        $('chNoCap').addEventListener('change', e => { const d = editing(); d.wip = e.target.checked ? 0 : (d.wip || 6); changed(); });
        api.setClock(t => CH.clock(scn, t));
        api.setStartGuard(() => {
            if (state === 'running') return true;
            api.notice(state === 'event' ? 'Decide what to do, then press “Continue the shift”.' : 'Start a shift from the challenge panel: “Practice shift” or “Official shift”.');
            return false;
        });
        api.setSpeed(0.9);
        render();
        preview();
    }

    function renderRules() {
        const ec = scn.economics;
        $('chBrief').innerHTML = `Shift ${scn.shift.start}–${CH.clock(scn, scn.shift.length)}. The customer orders <strong>${ec.demand} e-bikes</strong>, each within <strong>${ec.promise} min</strong> of its release. Earn the most.`;
        $('chRules').innerHTML =
            `<ul>
               <li>Margin <strong>${ec.margin} €</strong> per bike delivered, up to ${ec.demand} (extra bikes earn nothing).</li>
               <li>Missing bike −${ec.missing} €; late bike (lead time above the promise) −${ec.late} €.</li>
               <li>Anna, Bruno and Carla cost ${ec.wage} € each per shift. WIP costs ${ec.wipCost} € per bike per hour.</li>
               <li>Training: ${ec.training} € per new skill (one person, one station). Tied workers, bucket brigade and job dropping need everybody trained on every station.</li>
               <li>Purchases and temps are paid per shift. During the shift (at an event) everything costs <strong>× ${ec.emergency}</strong>. The policy and the order of the workers cannot change once the shift has started; purchases cannot be undone.</li>
               <li>The <strong>official shift</strong> has surprises. The <strong>practice shift</strong> is a normal day: use it as much as you like.</li>
             </ul>`;
    }

    // ------------------------------------------------------------ rendering of the plan
    function render() {
        const d = editing(), prev = previous(), ed = editable(), ev = state === 'event';
        const st = stateNow();
        document.body.classList.toggle('ch-running', state === 'running');
        $('chState').textContent = { plan: 'Plan your shift', running: (mode === 'practice' ? 'Practice shift running' : 'Official shift running'), event: 'Event: decide now (prices × ' + scn.economics.emergency + ')', done: 'Shift over' }[state];
        $('chState').className = 'ch-state ' + state;
        // policy
        $('chPolicy').innerHTML = Object.keys(POLICY_NAMES).map(p =>
            `<label class="ch-radio"><input type="radio" name="chPol" value="${p}" ${d.policy === p ? 'checked' : ''} ${state !== 'plan' ? 'disabled' : ''}> ${POLICY_NAMES[p]}</label>`).join('');
        $('chPolicy').querySelectorAll('input').forEach(i => i.addEventListener('change', () => { plan.policy = i.value; changed(); }));
        // crew in order
        const list = people(d);
        $('chCrew').innerHTML = list.map((n, i) => {
            const p = CH.person(scn, n), sick = st.sick.includes(n);
            const canMove = state === 'plan';
            return `<li class="${sick ? 'sick' : ''}"><span class="ch-dot" style="background:${color(n)}">${n[0]}</span>` +
                `<span class="ch-name">${n}</span><span class="ch-speed">v ${p.speed}</span><span class="ch-note">${sick ? 'sick, gone home' : esc(p.note)}</span>` +
                (canMove ? `<span class="ch-move"><button type="button" class="btn btn-sq" data-up="${i}" aria-label="Move ${n} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-sq" data-down="${i}" aria-label="Move ${n} down" ${i === list.length - 1 ? 'disabled' : ''}>↓</button></span>` : '') + '</li>';
        }).join('');
        $('chCrew').querySelectorAll('[data-up],[data-down]').forEach(b => b.addEventListener('click', () => {
            const i = +(b.dataset.up != null ? b.dataset.up : b.dataset.down), j = b.dataset.up != null ? i - 1 : i + 1;
            const o = people(plan); [o[i], o[j]] = [o[j], o[i]]; plan.order = o; changed();
        }));
        $('chOrderHint').textContent = d.policy === 'bucket' ? 'Bucket brigade: the first in the list works upstream, the last one downstream.' :
            d.policy === 'zones' ? 'Dedicated workers: each one works only where trained (see the skills).' : 'The order matters only for the bucket brigade.';
        // temps
        const mult = ev ? scn.economics.emergency : 1;
        $('chTemps').innerHTML = scn.temps.map(p => {
            const has = d.hires.includes(p.name), locked = prev && prev.hires.includes(p.name);
            return `<label class="ch-check"><input type="checkbox" data-hire="${p.name}" ${has ? 'checked' : ''} ${!ed || locked ? 'disabled' : ''}> Hire <strong>${p.name}</strong> (v ${p.speed}, ${esc(p.note)}) <span class="ch-price">${eur(p.cost * mult)}</span></label>`;
        }).join('');
        $('chTemps').querySelectorAll('[data-hire]').forEach(c => c.addEventListener('change', () => {
            const n = c.dataset.hire, dd = editing();
            if (c.checked) { dd.hires.push(n); if (state === 'plan') dd.order.push(n); }
            else { dd.hires = dd.hires.filter(x => x !== n); dd.order = dd.order.filter(x => x !== n); }
            changed();
        }));
        // skills
        const full = CH.FULL_FLEX[d.policy];
        const head = '<tr><th></th>' + scn.stations.map(s => `<th title="${esc(s.name)}">${s.key}</th>`).join('') + '</tr>';
        const rows = list.filter(n => !st.sick.includes(n)).map(n => {
            const base = CH.person(scn, n).skills, own = d.skills[n] || base, before = prev && prev.skills[n] ? prev.skills[n] : base;
            return `<tr><th style="color:${color(n)}">${n}</th>` + scn.stations.map((s, k) => {
                const on = full || own[k], fixed = base[k] || (prev && before[k]) || full || !ed;
                return `<td class="${base[k] ? 'base' : ''}"><input type="checkbox" data-sk="${n}" data-k="${k}" ${on ? 'checked' : ''} ${fixed ? 'disabled' : ''} aria-label="${n} trained on ${s.key}"></td>`;
            }).join('') + '</tr>';
        }).join('');
        $('chSkills').innerHTML = '<thead>' + head + '</thead><tbody>' + rows + '</tbody>';
        $('chSkills').querySelectorAll('[data-sk]').forEach(c => c.addEventListener('change', () => {
            const dd = editing(), n = c.dataset.sk;
            dd.skills[n] = (dd.skills[n] || CH.person(scn, n).skills).slice();
            dd.skills[n][+c.dataset.k] = c.checked;
            changed();
        }));
        $('chSkillHint').textContent = full ? `${POLICY_NAMES[d.policy]} needs everybody on every station: the missing skills are trained and paid (${scn.economics.training} € each).` :
            `Shaded = already trained. Each new tick costs ${scn.economics.training * mult} €.`;
        $('chStationList').innerHTML = scn.stations.map(s => `<li><strong>${s.key}</strong> ${esc(s.name)}: ${s.st} min${s.auto ? ' + ' + s.auto + ' automatic' : ''}${s.m > 1 ? ', ' + s.m + ' machines' : ''}${s.oee < 1 ? ', OEE ' + s.oee : ''}</li>`).join('');
        // purchases
        $('chItems').innerHTML = scn.items.map(it => {
            const has = !!d.buy[it.id], locked = prev && prev.buy[it.id];
            return `<label class="ch-check"><input type="checkbox" data-buy="${it.id}" ${has ? 'checked' : ''} ${!ed || locked ? 'disabled' : ''}> ${esc(it.label)} <span class="ch-price">${eur(it.cost * mult)}</span></label>`;
        }).join('');
        $('chItems').querySelectorAll('[data-buy]').forEach(c => c.addEventListener('change', () => { editing().buy[c.dataset.buy] = c.checked; changed(); }));
        // WIP
        $('chWip').value = d.wip > 0 ? d.wip : '';
        $('chWip').disabled = !ed || !(d.wip > 0);
        $('chNoCap').checked = !(d.wip > 0);
        $('chNoCap').disabled = !ed;
        renderCosts();
        // buttons
        $('chPractice').hidden = $('chOfficial').hidden = state !== 'plan';
        $('chAbort').hidden = !(state === 'running' || state === 'event');
        $('chTeam').disabled = state !== 'plan' && state !== 'done';
    }

    function renderCosts() {
        const d = editing(), ec = scn.economics;
        let lines, title;
        if (state === 'event') {
            lines = CH.costOf(scn, CH.sanitize(scn, draft, cur), cur, now());
            title = 'Cost of these emergency decisions';
        } else {
            lines = CH.costOf(scn, CH.sanitize(scn, d, null), null, 0);
            lines.unshift({ what: `Wages of ${scn.crew.map(p => p.name).join(', ')}`, cost: scn.crew.length * ec.wage });
            title = 'Fixed costs of your plan (per shift)';
        }
        const tot = lines.reduce((a, l) => a + l.cost, 0);
        const warn = coverage(d);
        $('chCosts').innerHTML = `<p class="ch-costs-title">${title}</p><table>${lines.map(l => `<tr><td>${esc(l.what)}</td><td class="num">${eur(l.cost)}</td></tr>`).join('')}` +
            `<tr class="tot"><td>Total</td><td class="num">${eur(tot)}</td></tr></table>` +
            (state !== 'event' ? `<p class="caption">Break-even: about ${Math.ceil(tot / ec.margin)} bikes.</p>` : '') +
            (warn.length ? `<p class="ch-warn">${warn.map(esc).join('<br>')}</p>` : '');
    }

    // stations nobody present can operate (dedicated workers only)
    function coverage(d) {
        if (d.policy !== 'zones') return [];
        const st = stateNow();
        const here = people(d).filter(n => !st.sick.includes(n));
        return scn.stations.filter((s, k) => !here.some(n => (d.skills[n] || CH.person(scn, n).skills)[k]))
            .map(s => `Nobody here can work at ${s.key} ${s.name}: the line will stop there.`);
    }

    function changed() {
        if (state === 'plan') { plan = CH.sanitize(scn, plan, null); save(); render(); preview(); }
        else if (state === 'event') { render(); const w = $('chEventWarn'); if (w) w.innerHTML = coverage(draft).map(esc).join('<br>'); }
    }

    function preview() {
        api.applyEngineConfig(CH.engineConfig(scn, CH.sanitize(scn, plan, null), CH.stateAt(scn, 0)), true, 'min');
    }

    // ------------------------------------------------------------ the shift
    function start(m) {
        mode = m;
        cur = CH.sanitize(scn, plan, null);
        timeline = [{ t: 0, d: cur }];
        evtIdx = 0;
        state = 'running';
        $('chResult').hidden = true;
        api.applyEngineConfig(CH.engineConfig(scn, cur, CH.stateAt(scn, 0, mode === 'practice')), true, 'min');
        render();
        scheduleNext();
        api.setRunning(true);
        startLive();
        api.notice(mode === 'practice' ? 'Practice shift started: a normal day, no surprises.' : 'Official shift started. Good luck!');
    }

    function scheduleNext() {
        if (mode === 'official' && evtIdx < scn.events.length) api.stopAt(scn.events[evtIdx].t, onEvent);
        else api.stopAt(scn.shift.length, onEnd);
    }

    function onEvent() {
        const e = scn.events[evtIdx];
        state = 'event';
        draft = clone(cur);
        const box = $('chEvent');
        box.hidden = false;
        box.innerHTML = `<div class="ch-event-card"><span class="ch-event-num">Event #${evtIdx + 1} · ${e.clock}</span>` +
            `<span class="ch-event-body"><strong>${esc(e.title)}.</strong> ${esc(e.text)} <span class="ch-event-hint">Hire, train, buy (prices × ${scn.economics.emergency}) or change the WIP in the challenge panel, or do nothing.</span>` +
            `<span id="chEventWarn" class="ch-warn"></span></span>` +
            `<button id="chContinue" class="btn btn-primary ch-continue" type="button">Continue ▶</button></div>`;
        $('chContinue').addEventListener('click', resume);
        $('chEventNote').hidden = false;
        $('chEventNote').innerHTML = `<strong>${e.clock} · ${esc(e.title)}</strong> ${esc(e.text)}`;
        render();
        const w = coverage(draft);
        $('chEventWarn').innerHTML = w.map(esc).join('<br>');
    }

    function resume() {
        if (state !== 'event') return;                    // a second click on Continue does nothing
        const e = scn.events[evtIdx];
        const d = CH.sanitize(scn, draft, cur);
        timeline.push({ t: e.t, d });
        cur = d;
        api.applyEngineConfig(CH.engineConfig(scn, d, CH.stateAt(scn, e.t)), false, 'min', e.clock + ' ' + e.title);
        evtIdx++;
        $('chEvent').hidden = true;
        $('chEventNote').hidden = true;
        state = 'running';
        render();
        scheduleNext();
        api.setRunning(true);
    }

    function onEnd() {
        state = 'done';
        stopLive();
        const r = CH.runShift(scn, mode === 'practice' ? [{ t: 0, d: cur }] : timeline, { practice: mode === 'practice' });
        lastResult = r;
        render();
        showResult(r);
    }

    function backToPlan() {
        api.stopAt(null);
        api.setRunning(false);
        stopLive();
        state = 'plan';
        $('chEvent').hidden = true;
        $('chEventNote').hidden = true;
        render();
        preview();
    }

    // live counters during the shift
    function startLive() { stopLive(); liveTimer = setInterval(updateLive, 400); updateLive(); }
    function stopLive() { if (liveTimer) clearInterval(liveTimer); liveTimer = null; }
    function updateLive() {
        const sim = api.sim;
        if (!sim) return;
        const ex = api.exits;
        const late = ex.filter(e => e.lt > CH.stateAt(scn, e.t - 1e-9, mode === 'practice').promise + 1e-9).length;
        $('chLive').innerHTML = `<span><strong>${CH.clock(scn, sim.t)}</strong></span><span>bikes <strong>${sim.completed}</strong> / ${scn.economics.demand}</span>` +
            `<span>late <strong>${late}</strong></span><span>WIP <strong>${sim.jobs.size}</strong></span>`;
    }

    // ------------------------------------------------------------ result
    function showResult(r) {
        const box = $('chResult');
        const a = r.account, ec = scn.economics;
        const code = mode === 'official' ? CH.encode(team || 'Team', scn.id, r.timeline, r) : null;
        const rows = [['Revenue', a.revenue, `${Math.min(r.delivered, ec.demand)} bikes × ${ec.margin} €`], ['Wages', a.wages, `${scn.crew.length} × ${ec.wage} €`],
            ['Temps, training, purchases', a.investments, r.costs.map(c => `${c.what}${c.t ? ' (' + CH.clock(scn, c.t) + ')' : ''}`).join('; ') || '–'],
            ['WIP', a.wip, `average ${r.avgWIP.toFixed(1)} bikes`], ['Late bikes', a.late, `${r.late} × ${ec.late} €`], ['Missing bikes', a.missing, `${Math.max(0, ec.demand - r.delivered)} × ${ec.missing} €`]];
        box.hidden = false;
        box.innerHTML = `<div class="panel-head"><h2 class="panel-title">${mode === 'official' ? 'Official result' : 'Practice result'}${team ? ' · ' + esc(team) : ''}</h2>` +
            `<span class="pill ${r.profit >= 0 ? 'labor' : 'machines'}">Profit ${eur(r.profit)}</span></div>` +
            `<div class="ch-kpis"><div><span>Bikes</span><strong>${r.delivered} / ${ec.demand}</strong></div><div><span>On time</span><strong>${(r.onTime * 100).toFixed(0)}%</strong></div>` +
            `<div><span>Average WIP</span><strong>${r.avgWIP.toFixed(1)}</strong></div><div><span>Average LT</span><strong>${r.avgLT.toFixed(0)} min</strong></div>` +
            `<div><span>Workers busy</span><strong>${(r.laborUtil * 100).toFixed(0)}%</strong></div></div>` +
            `<table class="ch-account">${rows.map(x => `<tr><td>${x[0]}</td><td class="num">${eur(x[1])}</td><td class="caption">${esc(x[2])}</td></tr>`).join('')}` +
            `<tr class="tot"><td>Profit</td><td class="num">${eur(r.profit)}</td><td></td></tr></table>` +
            (code ? `<p><strong>Your team code</strong>: copy it and send it to the teacher. The leaderboard recomputes the shift from it.</p>` +
                `<textarea id="chCode" class="ch-code" readonly rows="3">${code}</textarea>` +
                `<div class="chip-row"><button id="chCopy" class="btn btn-primary" type="button">Copy the code</button><button id="chAgain" class="btn" type="button">Back to the plan</button></div>`
                : `<p class="caption">Practice results do not count. When you are ready, play the official shift.</p><div class="chip-row"><button id="chAgain" class="btn btn-primary" type="button">Back to the plan</button></div>`);
        $('chAgain').addEventListener('click', () => { box.hidden = true; backToPlan(); });
        if (code) $('chCopy').addEventListener('click', () => {
            const ta = $('chCode');
            const done = () => api.notice('Code copied: paste it where your teacher asked.');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
            else { ta.select(); document.execCommand('copy'); done(); }
        });
        box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    window.FlowChallengeUI = { init };
})();
