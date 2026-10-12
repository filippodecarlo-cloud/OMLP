/* =====================================================================
   Factory Flow Lab - Italian / English
   The app is written in English. In Italian every text shown on the page
   (and on the canvases) is looked up in window.FLOW_IT (i18n-it.js), with
   numbers and time units as placeholders: "Pezzi: {n} nella linea."
   ===================================================================== */
(function () {
    'use strict';
    const IT = window.FLOW_IT || {};
    const NUM = /[-−+]?\d+(?:[.,]\d+)*%?/g;
    const UNIT = /(?<!['’])\b(min|h|s)\b(?![\w(])/g;
    let lang = '';
    try { lang = localStorage.getItem('flowLab.lang') || ''; } catch (e) { lang = ''; }
    if (lang !== 'it' && lang !== 'en') lang = /^it\b/i.test(navigator.language || '') ? 'it' : 'en';

    // exact match of the skeleton (numbers -> {n}, units -> {u}), then the numbers go back in order
    function look(s) {
        const nums = [], units = [];
        const k = s.replace(NUM, m => { nums.push(m); return '{n}'; }).replace(UNIT, m => { units.push(m); return '{u}'; });
        const t = IT[k];
        if (t == null) return null;
        let i = 0, j = 0;
        return t.replace(/\{n\}|\{u\}/g, m => m === '{n}' ? (nums[i++] ?? '') : (units[j++] ?? ''));
    }
    // texts with free parts (names, lists of changes)
    const RX = [
        [/^Changed at t = (.+?) while running: (.+)\.$/, m => `Modificato a t = ${m[1]} durante la simulazione: ${m[2]}.`],
        [/^Statistics restarted at t = (.+?): averages, histogram and machine shares now describe only what happens from here on\.$/, m => `Statistiche riazzerate a t = ${m[1]}: medie, istogramma e quote delle macchine descrivono solo ciò che succede da qui in poi.`],
        [/^Stopped: (\S+) jobs completed at t = (.+?)\.$/, m => `Fermata: ${m[1]} pezzi completati a t = ${m[2]}.`],
        [/^Export the data, or raise the number \(0 = no stop\) to go on\.$/, () => 'Esporta i dati, o aumenta il numero (0 = nessuno stop) per continuare.'],
        [/^New run: (.+)$/, m => 'Nuova simulazione: ' + one(m[1])],
        [/^Direct link: (.+)$/, m => 'Link diretto: ' + m[1]],
        [/^Move (\S+) up$/, m => `Sposta ${m[1]} in su`],
        [/^Move (\S+) down$/, m => `Sposta ${m[1]} in giù`],
        [/^(\S+) trained on S(\d+)$/, m => `${m[1]}: addestramento su S${m[2]}`],
        [/^Temp worker (\S+)$/, m => `Interinale ${m[1]}`],
        [/^Official result · (.+)$/, m => `Risultato ufficiale · ${m[1]}`],
        [/^Practice result · (.+)$/, m => `Risultato della prova · ${m[1]}`],
        [/^Event #(\d+) · (.+)$/, m => `Evento n. ${m[1]} · ${m[2]}`],
        [/^Decisions: (.+)$/, m => 'Decisioni: ' + m[1]],
        [/^WIP cap: (.+)$/, m => 'Limite WIP: ' + m[1]],
        [/^(\S+) can work at S(\d+)$/, m => `${m[1]} può lavorare in S${m[2]}`],
        [/^Speed of (\S+)$/, m => `Velocità di ${m[1]}`]
    ];
    function one(s) {
        const r = look(s);
        if (r != null) return r;
        for (const [re, f] of RX) { const m = s.match(re); if (m) return f(m); }
        return null;
    }
    function core(s) {
        const r = one(s);
        if (r != null) return r;
        // long notes are made of sentences: translate them one by one
        const parts = s.split(/(?<=[.!?])\s+(?=[A-Z“(])/);
        if (parts.length > 1) {
            let any = false;
            const o = parts.map(p => { const t = one(p); if (t != null) { any = true; return t; } return p; });
            if (any) return o.join(' ');
        }
        return s;
    }
    const cache = new Map();
    function tr(s) {
        if (lang !== 'it' || typeof s !== 'string' || !/[A-Za-z]{2}/.test(s)) return s;
        let c = cache.get(s);
        if (c !== undefined) return c;
        const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
        c = lead + core(s.trim()) + trail;
        if (cache.size > 20000) cache.clear();
        cache.set(s, c);
        return c;
    }

    // ---------------------------------------------------------------- the page
    const ORIG = new WeakMap();            // text node -> {en, it}
    const AORIG = new WeakMap();           // element -> {attribute: {en, it}}
    const ATTRS = ['data-tip', 'title', 'placeholder', 'aria-label'];
    const skip = el => !el || el.closest('script,style,textarea,[data-noi18n]');
    function doText(n) {
        if (skip(n.parentElement)) return;
        const cur = n.nodeValue, rec = ORIG.get(n);
        if (lang === 'it') {
            if (rec && rec.it === cur) return;
            const t = tr(cur);
            if (t !== cur) { ORIG.set(n, { en: cur, it: t }); n.nodeValue = t; }
        } else if (rec) { if (rec.it === cur) n.nodeValue = rec.en; ORIG.delete(n); }
    }
    function doAttr(el, a) {
        if (skip(el)) return;
        const cur = el.getAttribute(a);
        if (cur == null) return;
        let recs = AORIG.get(el);
        const rec = recs && recs[a];
        if (lang === 'it') {
            if (rec && rec.it === cur) return;
            const t = tr(cur);
            if (t !== cur) { if (!recs) AORIG.set(el, recs = {}); recs[a] = { en: cur, it: t }; el.setAttribute(a, t); }
        } else if (rec) { if (rec.it === cur) el.setAttribute(a, rec.en); delete recs[a]; }
    }
    function walk(root) {
        if (root.nodeType === 3) { doText(root); return; }
        if (root.nodeType !== 1) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = w.nextNode())) doText(n);
        const els = [root, ...root.querySelectorAll('[data-tip],[title],[placeholder],[aria-label]')];
        for (const el of els) for (const a of ATTRS) if (el.hasAttribute && el.hasAttribute(a)) doAttr(el, a);
    }
    const mo = new MutationObserver(list => {
        for (const m of list) {
            if (m.type === 'characterData') doText(m.target);
            else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
            else m.addedNodes.forEach(walk);
        }
    });

    // ---------------------------------------------------------------- canvases (line, Gantt, Chart.js)
    const P = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (P) ['fillText', 'strokeText', 'measureText'].forEach(fn => {
        const orig = P[fn];
        P[fn] = function (t, ...rest) { return orig.call(this, typeof t === 'string' ? tr(t) : t, ...rest); };
    });

    // ---------------------------------------------------------------- the switch (two small flags)
    const FLAG_IT = '<svg viewBox="0 0 3 2" width="24" height="16" aria-hidden="true"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/></svg>';
    const FLAG_EN = '<svg viewBox="0 0 60 40" width="24" height="16" aria-hidden="true"><clipPath id="ukc"><rect width="60" height="40"/></clipPath><g clip-path="url(#ukc)"><rect width="60" height="40" fill="#012169"/><path d="M0,0 60,40 M60,0 0,40" stroke="#fff" stroke-width="8"/><path d="M0,0 60,40 M60,0 0,40" stroke="#c8102e" stroke-width="3"/><path d="M30,0 v40 M0,20 h60" stroke="#fff" stroke-width="12"/><path d="M30,0 v40 M0,20 h60" stroke="#c8102e" stroke-width="7"/></g></svg>';
    const listeners = [];
    function mark() {
        document.documentElement.lang = lang;
        document.querySelectorAll('.lang-flag').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    }
    function setLang(l) {
        if (l !== 'it' && l !== 'en' || l === lang) return;
        lang = l;
        try { localStorage.setItem('flowLab.lang', l); } catch (e) { /* not saved */ }
        cache.clear();
        walk(document.body);
        mark();
        listeners.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });
    }
    function addSwitch() {
        const host = document.getElementById('langSwitch') || document.querySelector('.masthead-actions');
        if (!host || host.querySelector('.lang-flag')) return;
        const box = document.createElement('div');
        box.className = 'lang-switch';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', 'Language');
        box.innerHTML = `<button type="button" class="lang-flag" data-lang="it" title="Italiano" data-noi18n>${FLAG_IT}</button>` +
                        `<button type="button" class="lang-flag" data-lang="en" title="English" data-noi18n>${FLAG_EN}</button>`;
        box.querySelectorAll('.lang-flag').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
        host.prepend(box);
    }
    function start() {
        addSwitch();
        mark();
        walk(document.body);
        mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    window.FlowI18n = { tr, setLang, get lang() { return lang; }, onChange(fn) { listeners.push(fn); } };
})();
