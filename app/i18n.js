/* StreamDonations — idioma de la interfaz (español / English)
 * La app está escrita en español. En inglés, este archivo traduce los textos fijos de la pantalla
 * (y los que aparecen después: avisos, estados, ventanas) usando el diccionario de i18n-en.js.
 * Nunca toca lo que escriben los donadores (nombres y mensajes). */
(function () {
    'use strict';
    function readLang() {
        try {
            const st = JSON.parse(localStorage.getItem('streamdonations_settings') || '{}');
            if (st.language === 'en' || st.language === 'es') return st.language;
        } catch (e) {}
        const nav = (navigator.language || 'es').toLowerCase();
        return nav.startsWith('es') ? 'es' : 'en';
    }
    const LANG = readLang();
    window.SD_LANG = LANG;
    document.documentElement.lang = LANG;

    const DICT = (LANG === 'en' && window.SD_I18N_EN) || {};
    const exact = Object.create(null);
    const patterns = [];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    Object.keys(DICT).forEach(k => {
        const key = k.replace(/\s+/g, ' ').trim();
        if (key.includes('{}')) {
            const re = new RegExp('^' + key.split('{}').map(esc).join('(.+?)') + '$', 's');
            patterns.push([re, DICT[k]]);
        } else exact[key] = DICT[k];
    });

    function tr(text) {
        if (LANG !== 'en' || text == null) return text;
        const raw = String(text);
        const key = raw.replace(/\s+/g, ' ').trim();
        if (!key) return raw;
        let out = exact[key];
        if (out === undefined) {
            for (const [re, val] of patterns) {
                const m = key.match(re);
                if (m) { let i = 1; out = val.replace(/\{\}/g, () => (m[i++] !== undefined ? tr(m[i - 1]) : '')); break; }
            }
        }
        if (out === undefined) return raw;
        const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
        return lead + out + tail;
    }
    // Textos de varias líneas (ventanas de confirmación)
    function trLines(text) {
        if (LANG !== 'en' || text == null) return text;
        const whole = tr(text);
        if (whole !== text) return whole;
        return String(text).split('\n').map(tr).join('\n');
    }
    window.SDi18n = { lang: LANG, t: tr, tLines: trLines };
    if (LANG !== 'en') return;

    // Lo que escribe la gente (nombres, mensajes) y los campos editables no se traducen
    const SKIP_SEL = '[data-no-i18n], .card-message, .donor-nick-text, #focus-message, #focus-nick, .obs-msg, .obs-nick > span:first-child, #stat-top-donor, .db-item-msg, .db-item-nick, .session-top, .obs-nick-text, script, style, #about-version, .censor-result';
    const ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
    function skip(el) { return !el || (el.closest && el.closest(SKIP_SEL)); }

    function trNode(n) {
        if (n.nodeType === 3) {
            if (skip(n.parentElement)) return;
            const v = n.nodeValue, t = tr(v);
            if (t !== v) n.nodeValue = t;
        } else if (n.nodeType === 1) {
            if (skip(n)) return;
            trAttrs(n);
            const w = document.createTreeWalker(n, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
            let c;
            while ((c = w.nextNode())) {
                if (c.nodeType === 1) { if (!skip(c)) trAttrs(c); }
                else if (!skip(c.parentElement)) { const v = c.nodeValue, t = tr(v); if (t !== v) c.nodeValue = t; }
            }
        }
    }
    function trAttrs(el) {
        for (const a of ATTRS) {
            if (!el.hasAttribute(a)) continue;
            const v = el.getAttribute(a), t = tr(v);
            if (t !== v) el.setAttribute(a, t);
        }
        if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
            const t = tr(el.value); if (t !== el.value) el.value = t;
        }
    }

    function start() {
        if (document.title) document.title = tr(document.title);
        trNode(document.body);
        new MutationObserver(muts => {
            for (const m of muts) {
                if (m.type === 'characterData') trNode(m.target);
                else if (m.type === 'attributes') { if (!skip(m.target)) trAttrs(m.target); }
                else m.addedNodes.forEach(trNode);
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    const nativeConfirm = window.confirm.bind(window), nativeAlert = window.alert.bind(window), nativePrompt = window.prompt.bind(window);
    window.confirm = m => nativeConfirm(trLines(m));
    window.alert = m => nativeAlert(trLines(m));
    window.prompt = (m, d) => nativePrompt(trLines(m), d);
})();
