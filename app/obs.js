/* StreamDonations - ventana Modo OBS */
        // Mensajes válidos: los que manda la ventana del panel que abrió esta, o los que llegan por la conexión con OBS
        // Vista previa dentro de Opciones (#preview=1): solo muestra ejemplos, no toca las donaciones de verdad
        const PREVIEW = /(^|[#&])preview=1(&|$)/.test(location.hash) && window.parent !== window;
        if (PREVIEW) {
            document.documentElement.classList.add('obs-preview');
            // Le avisa a Opciones cuánto alto ocupan los ejemplos, así la vista previa no queda con espacio vacío
            window.addEventListener('DOMContentLoaded', () => {
                const c = document.getElementById('alerts-container');
                if (!c || !window.ResizeObserver) return;
                let last = 0;
                new ResizeObserver(() => {
                    if (window.__pvHold) return; // mostrando cómo se va: el alto queda quieto
                    const h = Math.ceil(c.getBoundingClientRect().height + c.offsetTop + 10);
                    if (Math.abs(h - last) > 2) { last = h; try { window.parent.postMessage({ type: 'SD_PREVIEW_H', h }, '*'); } catch (e) {} }
                }).observe(c);
            });
        }
        const fromPanel = (e) => e.__sdWs === true || (!!window.opener && e.source === window.opener) || (PREVIEW && e.source === window.parent);

        // ---- Modo transparente real: esta página está dentro de OBS (fuente de navegador) y recibe todo por obs-websocket ----
        const WS_PARAMS = new URLSearchParams(location.hash.slice(1));
        // Versión 2: la fuente la sirve la propia app y los mensajes pasan por su servidor interno (#relay=PUERTO&k=CLAVE)
        const RELAY_MODE = /^\d{1,5}$/.test(WS_PARAMS.get('relay') || '') && /^[0-9a-f]{24,64}$/.test(WS_PARAMS.get('k') || '');
        const WS_MODE = RELAY_MODE || /^\d{1,5}$/.test(WS_PARAMS.get('ws') || '');
        if (WS_MODE) document.documentElement.classList.add('obs-ws');
        const obsLink = { sock: null, ready: false, n: 0 };
        async function sha256b64(text) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return btoa(String.fromCharCode(...new Uint8Array(buf)));
        }
        function wsToPanel(msg) {
            if (!obsLink.ready) return;
            if (RELAY_MODE) { obsLink.sock.send(JSON.stringify({ sd: 1, from: 'obs', msg })); return; }
            obsLink.sock.send(JSON.stringify({ op: 6, d: { requestType: 'BroadcastCustomEvent', requestId: 'o' + (++obsLink.n), requestData: { eventData: { sd: 1, from: 'obs', msg } } } }));
        }
        function relayConnect() {
            let sock;
            try { sock = new WebSocket('ws://127.0.0.1:' + WS_PARAMS.get('relay') + '/ws?k=' + WS_PARAMS.get('k')); } catch (e) { setTimeout(relayConnect, 3000); return; }
            obsLink.sock = sock;
            sock.onopen = () => { obsLink.ready = true; wsToPanel({ type: 'HELLO' }); };
            sock.onmessage = (ev) => {
                let e; try { e = JSON.parse(ev.data); } catch (x) { return; }
                if (!e || e.sd !== 1 || e.from !== 'panel' || !e.msg || typeof e.msg.type !== 'string') return;
                handleWsMsg(e.msg);
            };
            sock.onclose = () => { obsLink.ready = false; setTimeout(relayConnect, 3000); };
            sock.onerror = () => {};
        }
        function wsConnect() {
            if (RELAY_MODE) { relayConnect(); return; }
            const port = WS_PARAMS.get('ws'), pw = WS_PARAMS.get('k') || '';
            let sock;
            try { sock = new WebSocket('ws://127.0.0.1:' + port); } catch (e) { setTimeout(wsConnect, 3000); return; }
            obsLink.sock = sock;
            sock.onmessage = async (ev) => {
                let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
                if (m.op === 0) {
                    const d = { rpcVersion: 1, eventSubscriptions: 1 };
                    if (m.d && m.d.authentication) d.authentication = await sha256b64(await sha256b64(pw + m.d.authentication.salt) + m.d.authentication.challenge);
                    sock.send(JSON.stringify({ op: 1, d }));
                } else if (m.op === 2) {
                    obsLink.ready = true;
                    wsToPanel({ type: 'HELLO' }); // el panel contesta mandando todo lo que hay que mostrar
                } else if (m.op === 5 && m.d && m.d.eventType === 'CustomEvent') {
                    const e = m.d.eventData || {};
                    if (e.sd !== 1 || e.from !== 'panel' || !e.msg || typeof e.msg.type !== 'string') return;
                    handleWsMsg(e.msg);
                }
            };
            sock.onclose = () => { obsLink.ready = false; setTimeout(wsConnect, 3000); };
            sock.onerror = () => {};
        }
        function handleWsMsg(msg) {
            if (msg.type === 'BG_IMAGE') {
                if (/^image\/(png|gif|webp|jpeg)$/.test(msg.mime || '') && typeof msg.data === 'string' && msg.data.length < 12 * 1024 * 1024 && /^[A-Za-z0-9+/=]+$/.test(msg.data.slice(0, 4096))) {
                    try {
                        const bin = atob(msg.data), arr = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                        if (wsBg.url) URL.revokeObjectURL(wsBg.url);
                        wsBg.url = URL.createObjectURL(new Blob([arr], { type: msg.mime })); wsBg.ver = msg.ver;
                        if (lastBgCfg) applyObsBg(lastBgCfg);
                    } catch (e) {}
                }
                return;
            }
            if (msg.type === 'CARD_IMAGE') {
                if ((msg.slot === 'corner' || msg.slot === 'bg') && /^image\/(png|gif|webp|jpeg)$/.test(msg.mime || '') && typeof msg.data === 'string' && msg.data.length < 12 * 1024 * 1024 && /^[A-Za-z0-9+/=]+$/.test(msg.data.slice(0, 4096))) {
                    try {
                        const bin = atob(msg.data), arr = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                        const w = wsCard[msg.slot];
                        if (w.url) URL.revokeObjectURL(w.url);
                        w.url = URL.createObjectURL(new Blob([arr], { type: msg.mime })); w.ver = msg.ver;
                        if (lastCardCfg) applyCard(lastCardCfg);
                    } catch (e) {}
                }
                return;
            }
            if (msg.type === 'ICON') {
                if (/^[a-z0-9]{6,24}$/.test(msg.id || '') && /^image\/(png|gif|webp|jpeg|svg\+xml)$/.test(msg.mime || '') && /^[A-Za-z0-9+/=]+$/.test(msg.data || '') && msg.data.length < 300000) {
                    obsIconUrls[msg.id] = 'data:' + msg.mime + ';base64,' + msg.data;
                    document.querySelectorAll('img[data-icon-wait="' + msg.id + '"]').forEach(im => { im.src = obsIconUrls[msg.id]; im.removeAttribute('data-icon-wait'); });
                }
                return;
            }
            if (msg.type === 'RESET') {
                // Se vacía al instante: enseguida llegan otra vez las pendientes
                document.querySelectorAll('.obs-alert').forEach(el => el.remove());
                renderedIds.clear();
                if (typeof updateAlertCounter === 'function') updateAlertCounter();
                return;
            }
            if (msg.type === 'STYLE_UPDATE' && msg.data && (msg.data.lang === 'en' || msg.data.lang === 'es') && msg.data.lang !== window.SD_LANG) {
                // Mismo idioma que el panel (esta fuente tiene su propio almacenamiento)
                try { localStorage.setItem('streamdonations_settings', JSON.stringify({ language: msg.data.lang })); } catch (e) {}
                location.reload();
                return;
            }
            const ev = new MessageEvent('message', { data: msg });
            ev.__sdWs = true;
            window.dispatchEvent(ev);
        }
        const container = document.getElementById('alerts-container');
        const EYE_SVG = '<svg class="ico-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
        const statusMsg = document.getElementById('status-msg');
        const scrollArea = document.getElementById('obs-scroll-area');
        const countNum = document.getElementById('count-num');

        // Set para deduplicar: evita mostrar la misma donación 2 veces
        const renderedIds = new Set();

        function updateAlertCounter() {
            const alerts = container.querySelectorAll('.obs-alert');
            const count = alerts.length;
            if (countNum) countNum.textContent = count;
            
            if (statusMsg) {
                statusMsg.style.display = count === 0 ? 'flex' : 'none';
            }
            if (typeof applyFilter === 'function') applyFilter();
        }

        // --- MENÚ DE PLATAFORMAS: ver solo las de una red ---
        const FILTER_OPTS = [
            { key: 'all', label: 'Todas', color: null },
            { key: 'ceneka', label: 'Ceneka', color: '#A855F7' },
            { key: 'youtube', label: 'YouTube', color: '#FF0033' },
            { key: 'twitch', label: 'Twitch', color: '#9146FF' },
            { key: 'kick', label: 'Kick', color: '#53FC18' }
        ];
        let obsFilter = 'all';
        try { obsFilter = localStorage.getItem('obs_filter_platform') || 'all'; } catch (e) {}
        let filterBarOn = true;
        let sortOld = false; // false = más nuevas primero
        try { sortOld = localStorage.getItem('obs_sort_old') === '1'; } catch (e) {}
        let allowedPlatforms = null; // plataformas con conexión (las manda la app); null = todas

        // Un clic elige la red (más nuevas primero); otro clic en la misma invierte el orden
        function setFilter(key) {
            if (key === currentActive) sortOld = !sortOld;
            else sortOld = false;
            obsFilter = key;
            try { localStorage.setItem('obs_filter_platform', key); localStorage.setItem('obs_sort_old', sortOld ? '1' : '0'); } catch (e) {}
            if (scrollArea) scrollArea.scrollTop = 0;
            applyFilter();
        }

        let currentActive = 'all';
        function applyFilter() {
            const bar = document.getElementById('obs-filter');
            const allowed = allowedPlatforms || ['ceneka', 'youtube', 'twitch', 'kick'];
            const allAlerts = Array.from(container.querySelectorAll('.obs-alert'));
            // Las de plataformas sin conexión no se muestran
            allAlerts.forEach(a => a.classList.toggle('not-linked', !allowed.includes(a.dataset.platform || 'ceneka')));
            const alerts = allAlerts.filter(a => !a.classList.contains('not-linked'));
            const counts = { all: alerts.length, ceneka: 0, youtube: 0, twitch: 0, kick: 0 };
            alerts.forEach(a => { const p = a.dataset.platform || 'ceneka'; counts[p] = (counts[p] || 0) + 1; });
            // Con el menú apagado, o si la red elegida se quedó sin alertas, se ven todas
            let active = filterBarOn ? obsFilter : 'all';
            if (active !== 'all' && !counts[active]) {
                active = 'all';
                if (alerts.length) { obsFilter = 'all'; try { localStorage.setItem('obs_filter_platform', 'all'); } catch (e) {} }
            }
            alerts.forEach(a => a.classList.toggle('filtered-out', active !== 'all' && (a.dataset.platform || 'ceneka') !== active));
            currentActive = active;
            container.style.flexDirection = sortOld ? 'column-reverse' : 'column';
            const arrow = sortOld ? '<span class="sort-arrow" title="Más antiguas primero">▲</span>' : '<span class="sort-arrow" title="Más nuevas primero">▼</span>';
            if (bar) {
                bar.innerHTML = FILTER_OPTS.filter(o => o.key === 'all' || allowed.includes(o.key)).map(o =>
                    `<button class="obs-filter-btn${o.key === active ? ' active' : ''}${o.key !== 'all' && !counts[o.key] ? ' empty' : ''}" data-filter="${o.key}">` +
                    (o.color ? `<span class="dot" style="background:${o.color}"></span>` : '') +
                    `${o.label} <span class="num">${counts[o.key] || 0}</span>${o.key === active ? arrow : ''}</button>`
                ).join('');
            }
            document.body.classList.toggle('has-filter', filterBarOn);
            if (statusMsg) statusMsg.style.display = alerts.length === 0 ? 'flex' : 'none';
            layoutTop();
        }

        // Deja lugar arriba para el menú y la meta, así no tapan las alertas
        function layoutTop() {
            const top = document.getElementById('obs-top');
            const b = document.body.classList;
            const visible = b.contains('has-goal') || b.contains('has-filter') || b.contains('has-new');
            b.toggle('has-top', visible);
            // Las alertas empiezan debajo de la barra (no pasan por detrás)
            const h = visible && top ? top.offsetHeight : 0;
            if (scrollArea) { scrollArea.style.top = h + 'px'; scrollArea.style.paddingTop = (visible ? 12 : 16) + 'px'; }
            // Los efectos que van arriba (la guirnalda de Navidad) se corren debajo de la barra
            if (window.SDAnimFX && SDAnimFX.setTop) SDAnimFX.setTop(h);
        }
        window.addEventListener('resize', layoutTop);

        function renderAlert(d) {
            if (!d) return;

            // Deduplicar por ID si ya existe en pantalla
            // Todo lo que llega se limpia antes de mostrarlo
            d.id = String(d.id || '').replace(/[^A-Za-z0-9_.-]/g, '');
            d.platform = ['ceneka', 'youtube', 'twitch', 'kick'].includes(d.platform) ? d.platform : 'ceneka';
            if (!(typeof d.avatar === 'string' && /^(https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+)$/i.test(d.avatar))) d.avatar = null;
            const alertId = d.id || ('temp_' + Date.now() + '_' + Math.random().toString(36).substr(2,4));
            if (d.id && renderedIds.has(d.id)) return;
            if (d.id) renderedIds.add(d.id);

            const alertEl = document.createElement('div');
            alertEl.className = 'obs-alert ' + (d.platform || 'ceneka');
            // Efecto para donaciones grandes y rango del donador (se aceptan solo valores conocidos)
            const HEX = /^#[0-9a-fA-F]{6}$/;
            const sty = cleanSty(d.sty);
            const { iconsHTML: rankIconsHTML, nameHTML: rankNameHTML } = rankParts(d.rank, sty.rank);
            alertEl.dataset.alertId = alertId;
            alertEl.dataset.platform = d.platform || 'ceneka';
            
            const avatarHTML = d.avatar 
                ? '<img src="' + d.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' 
                : escapeHTML(d.nick ? String(d.nick).charAt(0).toUpperCase() : 'A');

            const platformLabel = ({ youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' })[d.platform] || 'Ceneka';
            const amtColor = /^#[0-9a-fA-F]{6}$/.test(d.amtColor || '') ? d.amtColor : '';
            const formattedAmt = escapeHTML(d.formattedAmount || ('$' + (parseFloat(d.amount) || 0)));
            // Para el diseño "Barra": el número grande y la moneda abajo (AR$, US$…)
            const numPart = escapeHTML((String(d.formattedAmount || '').match(/\d[\d.,]*/) || [String(parseFloat(d.amount) || 0)])[0]);
            const cur = String(d.currency || 'ARS').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'ARS';
            const curLabel = ({ ARS: 'AR$', USD: 'US$', EUR: '€', BRL: 'R$', CLP: 'CL$', UYU: 'UY$', MXN: 'MX$' })[cur] || cur;
            const accumHTML = (typeof d.accum === 'string' && d.accum && d.accum.length < 30) ? '<span class="obs-accum" data-no-i18n>' + escapeHTML(d.accum) + ' ' + (window.SD_LANG === 'en' ? 'total' : 'acum.') + '</span>' : '';

            if (sty.card) alertEl.classList.add('sfx-host');
            alertEl.innerHTML = ringHTML(sty.card) + '<div class="obs-cb" aria-hidden="true"></div><div class="obs-cc" aria-hidden="true"></div>' + `
                <div class="obs-header">
                    <div class="obs-donor">
                        <div class="obs-avatar">${avatarHTML}</div>
                        <div class="obs-donor-text">
                            <div class="obs-nick">
                                <span${tAttr(sty.nick)}>${escapeHTML(d.nick || 'Anónimo')}</span>${rankIconsHTML}${rankNameHTML}${accumHTML}
                            </div>
                            <div class="obs-sub"></div>
                        </div>
                    </div>
                    <div class="obs-header-right">
                        <span class="obs-tag ${d.platform || 'ceneka'}" data-el="platform">${({ youtube: '<i class="fa-brands fa-youtube"></i>', twitch: '<i class="fa-brands fa-twitch"></i>', kick: '<i class="fa-solid fa-bolt"></i>' })[d.platform] || '<i class="fa-solid fa-mug-hot"></i>'}${platformLabel}</span>
                        <div class="obs-amount${amtColor ? ' has-amt-color' : ''}${sty.amount ? ' tfx tfx-' + sty.amount.fx : ''}" data-el="amount" style="${amtColor ? '--amt-color:' + amtColor + ';' : ''}${sty.amount ? vars(sty.amount) : ''}"><span class="amt-full">${formattedAmt}</span><span class="amt-split"><b>${numPart}</b><small>${escapeHTML(curLabel)}</small></span></div>
                        <button class="obs-btn-dismiss" data-dismiss="${alertId}" title="Marcar como leído y ocultar">
                            <i class="fa-solid fa-check ico-check"></i>${EYE_SVG}
                        </button>
                    </div>
                </div>
                ${(!d.obsHideMessage && d.message) ? '<div class="obs-msg' + (sty.msg ? ' sfx-host' : '') + '">' + ringHTML(sty.msg) + escapeHTML(d.message) + '</div>' : ''}
            `;

            placeElements(alertEl);

            // Si estás leyendo más abajo, la pantalla NO salta arriba: se mantiene donde estabas
            const reading = scrollArea && scrollArea.scrollTop > 30;
            const prevHeight = scrollArea ? scrollArea.scrollHeight : 0;
            container.prepend(alertEl);
            updateAlertCounter();
            if (reading) {
                scrollArea.scrollTop += scrollArea.scrollHeight - prevHeight;
                if (!alertEl.classList.contains('filtered-out') && !alertEl.classList.contains('not-linked')) newWhileReading++;
                updateNewIndicator();
            }

            // Se oculta sola después de la duración configurada en la app (no la marca como leída)
            const secs = parseFloat(d.obsDuration);
            if (secs > 0 && !PREVIEW) {
                setTimeout(() => dismissAlert(alertId), secs * 1000);
            }

            // Si estabas arriba de todo, la nueva queda a la vista
            if (scrollArea && !reading) {
                scrollArea.scrollTop = 0;
            }
        }

        // --- Pausa de scroll: aviso de "nuevas arriba" mientras leés ---
        let newWhileReading = 0;
        function updateNewIndicator() {
            const btn = document.getElementById('obs-new-indicator');
            if (!btn) return;
            // (el contador de nuevas se quitó: la pantalla igual no salta mientras leés)
        }
        function goToTop() {
            scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
            newWhileReading = 0;
            updateNewIndicator();
        }
        window.goToTop = goToTop;
        if (scrollArea) {
            scrollArea.addEventListener('scroll', () => {
                if (scrollArea.scrollTop <= 30 && newWhileReading) {
                    newWhileReading = 0;
                    updateNewIndicator();
                }
            });
        }

        // ---- Cómo se va una donación al marcarla leída ----
        let EXIT = 'fade';
        const EXIT_MS = { fade: 450, dissolve: 950, explode: 650, back: 650, slide: 520, fall: 850, spin: 650, burn: 950, pixel: 800, float: 950 };
        const EXIT_EASE = { fall: 'cubic-bezier(.5,0,.9,.5)', float: 'cubic-bezier(.5,0,.9,.5)', spin: 'cubic-bezier(.6,0,.8,.4)', pixel: 'steps(7)' };
        let burstCv = null, burstCx = null, burstParts = [], burstRaf = null;
        function burst(el, type) {
            const r = el.getBoundingClientRect(); if (!r.width) return;
            if (!burstCv) {
                burstCv = document.createElement('canvas'); burstCv.id = 'exit-burst';
                burstCv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483001;';
                document.body.appendChild(burstCv); burstCx = burstCv.getContext('2d');
            }
            burstCv.width = innerWidth; burstCv.height = innerHeight;
            const cs = getComputedStyle(el), cur = cs.getPropertyValue('--cur').trim() || '#8B5CF6';
            const cols = [cur, cur, '#FFFFFF', 'rgba(255,255,255,0.7)'];
            const n = type === 'explode' ? 110 : 90, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            for (let i = 0; i < n; i++) {
                const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height;
                if (type === 'explode') {
                    const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.6, v = 250 + Math.random() * 450;
                    burstParts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 500, life: 0, max: 0.5 + Math.random() * 0.4, s: 2 + Math.random() * 4, c: cols[i % cols.length], delay: 0 });
                } else if (type === 'burn') {
                    // Quemarse: brasas que suben, de abajo hacia arriba
                    const hot = ['#FF7A1A', '#FFB02E', '#FF4D1A', '#FFE08A'];
                    burstParts.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 120, g: -60, life: 0, max: 0.6 + Math.random() * 0.6, s: 1.5 + Math.random() * 3.5, c: hot[i % hot.length], delay: (1 - (y - r.top) / r.height) * 0.5 });
                } else if (type === 'pixel') {
                    // Pixelarse: bloques cuadrados que se desprenden y caen
                    const sz = 6 + ((Math.random() * 3) | 0) * 3;
                    burstParts.push({ x: Math.round(x / 6) * 6, y: Math.round(y / 6) * 6, vx: (Math.random() - 0.5) * 120, vy: -60 - Math.random() * 90, g: 900, life: 0, max: 0.6 + Math.random() * 0.4, s: sz, c: [cur, cur, '#FFFFFF', '#1A1F2B'][i % 4], delay: Math.random() * 0.35, hard: true });
                } else {
                    // Desintegrar: se va deshaciendo de izquierda a derecha, en polvo que vuela
                    burstParts.push({ x, y, vx: 40 + Math.random() * 90, vy: -30 - Math.random() * 70, g: -20, life: 0, max: 0.6 + Math.random() * 0.5, s: 1.5 + Math.random() * 3, c: cols[i % cols.length], delay: ((x - r.left) / r.width) * 0.45 });
                }
            }
            if (type === 'explode') burstParts.push({ flash: true, x: cx, y: cy, life: 0, max: 0.35, r: Math.max(r.width, r.height) * 0.7, c: cur, delay: 0 });
            if (!burstRaf) { let last = performance.now(); const tick = (now) => {
                const dt = Math.min(0.05, (now - last) / 1000); last = now;
                burstCx.clearRect(0, 0, burstCv.width, burstCv.height);
                burstParts = burstParts.filter(p => {
                    if (p.delay > 0) { p.delay -= dt; return true; }
                    p.life += dt; if (p.life > p.max) return false;
                    const k = 1 - p.life / p.max;
                    if (p.flash) { const gr = burstCx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r); gr.addColorStop(0, 'rgba(255,255,255,' + (0.7 * k) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); burstCx.fillStyle = gr; burstCx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); return true; }
                    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
                    burstCx.globalAlpha = p.hard ? (k > 0.25 ? 1 : k * 4) : k; burstCx.fillStyle = p.c; burstCx.fillRect(p.x, p.y, p.s, p.s);
                    return true;
                });
                burstCx.globalAlpha = 1;
                if (burstParts.length) burstRaf = requestAnimationFrame(tick); else { burstRaf = null; burstCx.clearRect(0, 0, burstCv.width, burstCv.height); }
            }; burstRaf = requestAnimationFrame(tick); }
        }
        function exitAlert(el, done) {
            if (el.dataset.leaving) return; el.dataset.leaving = '1';
            if (el.classList.contains('step-focus')) stepAfterLeave(el);
            const type = LITE ? 'fade' : (EXIT_MS[EXIT] ? EXIT : 'fade'), ms = EXIT_MS[type];
            if (type === 'dissolve' || type === 'explode' || type === 'burn' || type === 'pixel') burst(el, type);
            el.style.animation = 'exit-' + type + ' ' + ms + 'ms ' + (EXIT_EASE[type] || 'ease') + ' forwards';
            setTimeout(() => {
                // En la vista previa no se cierra el hueco: el ejemplo vuelve enseguida y el recuadro no se mueve
                if (PREVIEW) { el.remove(); if (done) done(); return; }
                // Se cierra el hueco suave (así las de abajo suben sin saltar)
                const h = el.offsetHeight;
                el.style.height = h + 'px'; el.style.overflow = 'hidden';
                void el.offsetHeight;
                el.style.transition = 'height .22s ease, margin .22s ease, padding .22s ease';
                el.style.height = '0px'; el.style.marginTop = '0px'; el.style.marginBottom = '0px'; el.style.paddingTop = '0px'; el.style.paddingBottom = '0px';
                setTimeout(() => { el.remove(); if (done) done(); }, 240);
            }, ms);
        }
        function dismissAlert(id) {
            if (id === 'all') {
                container.querySelectorAll('.obs-alert').forEach(el => exitAlert(el));
                renderedIds.clear();
                setTimeout(() => {
                    updateAlertCounter();
                }, 1300);
                return;
            }

            const target = container.querySelector('[data-alert-id="' + id + '"]');
            if (target) {
                exitAlert(target, updateAlertCounter);
                renderedIds.delete(id);
            }
        }

        function dismissAndMarkRead(id) {
            if (PREVIEW) return; // en la vista previa el ejemplo no se puede cerrar (si no, queda vacía)
            dismissAlert(id);
            if (WS_MODE) wsToPanel({ type: 'MARK_READ', id });

            // 1. Notificar vía BroadcastChannel
            if (typeof BroadcastChannel !== 'undefined') {
                try {
                    const bc = new BroadcastChannel('obs_overlay_channel');
                    bc.postMessage({ type: 'MARK_READ', id: id });
                } catch(e) {}
            }

            // 2. Notificar vía cola de localStorage
            try {
                const queue = JSON.parse(localStorage.getItem('obs_mark_read_queue') || '[]');
                queue.push({ id: id, _t: Date.now() });
                localStorage.setItem('obs_mark_read_queue', JSON.stringify(queue));
            } catch(e) {}

            // 3. Notificar vía window.opener
            if (window.opener) {
                try {
                    window.opener.postMessage({ type: 'MARK_READ', id: id }, '*');
                } catch(e) {}
            }
        }

        function escapeHTML(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        window.renderAlert = renderAlert;
        window.dismissAlert = dismissAlert;
        window.dismissAndMarkRead = dismissAndMarkRead;

        // Late cada 5 segundos para que el panel sepa que OBS está conectado (puntito "OBS" del encabezado)
        if (!PREVIEW) {
            let aliveBc = null;
            const beat = () => {
                if (WS_MODE) { wsToPanel({ type: 'ALIVE' }); return; }
                try { aliveBc = aliveBc || new BroadcastChannel('obs_overlay_channel'); aliveBc.postMessage({ type: 'OBS_ALIVE' }); } catch (e) {}
            };
            setTimeout(beat, 1500);
            setInterval(beat, 5000);
        }

        // --- CANALES DE COMUNICACIÓN ---
        const OBS_OPENED_AT = Date.now() - 2000;

        // 1. BroadcastChannel
        if (typeof BroadcastChannel !== 'undefined' && !PREVIEW) {
            try {
                const bc = new BroadcastChannel('obs_overlay_channel');
                bc.onmessage = (e) => {
                    if (e.data && e.data.type === 'NEW_DONATION') {
                        renderAlert(e.data.data);
                    } else if (e.data && e.data.type === 'DISMISS_ALERT') {
                        dismissAlert(e.data.id);
                    }
                };
            } catch(e) {}
        }

        // 2. window.postMessage
        window.addEventListener('message', (e) => {
            if (!fromPanel(e)) return; // solo se aceptan avisos del panel de StreamDonations
            if (e.data && e.data.type === 'NEW_DONATION') {
                renderAlert(e.data.data);
            } else if (e.data && e.data.type === 'DISMISS_ALERT') {
                dismissAlert(e.data.id);
            } else if (PREVIEW && e.data && e.data.type === 'PREVIEW_EXIT') {
                // Vista previa: muestra cómo se va el ejemplo y lo vuelve a poner
                const el = document.querySelector('.obs-alert');
                if (el && lastPreviewData) { window.__pvHold = true; clearTimeout(window.__pvHoldT); window.__pvHoldT = setTimeout(() => { window.__pvHold = false; }, 2600); }
                if (el && lastPreviewData) exitAlert(el, () => setTimeout(() => { if (!document.querySelector('.obs-alert')) { renderedIds.clear(); renderAlert(Object.assign({}, lastPreviewData, { id: lastPreviewData.id + 'r' })); } setTimeout(() => { window.__pvHold = false; }, 250); }, 350));
            } else if (PREVIEW && e.data && e.data.type === 'PREVIEW_ENTER') {
                // Vista previa: vuelve a mostrar el ejemplo para ver cómo aparece
                if (lastPreviewData) { document.querySelectorAll('.obs-alert').forEach(a => a.remove()); renderedIds.clear(); renderAlert(Object.assign({}, lastPreviewData, { id: lastPreviewData.id + 'e' + Date.now() })); }
            } else if (PREVIEW && e.data && e.data.type === 'PREVIEW_SHOW' && e.data.data) {
                lastPreviewData = e.data.data;
                // Vista previa: siempre un solo ejemplo (se borra lo anterior de golpe, sin animación)
                document.querySelectorAll('.obs-alert').forEach(a => a.remove());
                renderedIds.clear();
                renderAlert(e.data.data);
                if (scrollArea) scrollArea.scrollTop = 0;
            }
        });

        // 3. Polling de localStorage COLA (funciona siempre en file:// y OBS Browser Source)
        if (!PREVIEW) setInterval(() => {
            // Nuevas donaciones
            try {
                const queueRaw = localStorage.getItem('obs_donation_queue');
                if (queueRaw) {
                    const queue = JSON.parse(queueRaw);
                    if (Array.isArray(queue) && queue.length > 0) {
                        queue.forEach(don => renderAlert(don));
                        localStorage.setItem('obs_donation_queue', '[]');
                    }
                }
            } catch(e) {}

            // Alertas descartadas desde el panel principal
            try {
                const disRaw = localStorage.getItem('obs_dismiss_queue');
                if (disRaw) {
                    const queue = JSON.parse(disRaw);
                    if (Array.isArray(queue) && queue.length > 0) {
                        queue.forEach(dis => {
                            // Se ignoran las órdenes de ocultar viejas (de antes de abrir esta ventana)
                            if (dis && dis.id && (!dis._t || dis._t >= OBS_OPENED_AT)) dismissAlert(dis.id);
                        });
                        localStorage.setItem('obs_dismiss_queue', '[]');
                    }
                }
            } catch(e) {}
        }, 500);

        // 4. Saludo inicial al abrirse para sincronizar con la ventana principal
        if (window.opener) {
            try {
                window.opener.postMessage({ type: 'OBS_OVERLAY_READY' }, '*');
            } catch(e) {}
        }



        // --- ACTUALIZAR ALERTAS YA MOSTRADAS (cambio de opciones de links/mensajes) ---
        let lastAlertsUpdate = 0;
        function applyAlertsUpdate(payload) {
            if (!payload || !Array.isArray(payload.items) || payload.ts <= lastAlertsUpdate) return;
            lastAlertsUpdate = payload.ts;
            payload.items.forEach(item => {
                const el = document.querySelector('[data-alert-id="' + item.id + '"]');
                if (!el) return;
                const nickEl = el.querySelector('.obs-nick span:first-child');
                if (nickEl && typeof item.nick === 'string' && item.nick) nickEl.textContent = item.nick;
                const sty = 'sty' in item ? cleanSty(item.sty) : null;
                if (sty) {
                    // El estilo cambió: se vuelven a poner los efectos de la tarjeta, el mensaje, el nick y el monto
                    el.querySelectorAll(':scope > .sfx-ring, .obs-msg > .sfx-ring').forEach(x => x.remove());
                    el.classList.toggle('sfx-host', !!sty.card);
                    if (sty.card) el.insertAdjacentHTML('afterbegin', ringHTML(sty.card));
                    const nickSpan = el.querySelector('.obs-nick > span:first-child');
                    if (nickSpan) { nickSpan.className = sty.nick ? 'tfx tfx-' + sty.nick.fx : ''; nickSpan.setAttribute('style', sty.nick ? vars(sty.nick) : ''); }
                    const am = el.querySelector('[data-el="amount"]');
                    if (am) { am.className = am.className.replace(/\s*tfx(-[a-z0-9-]+)?/g, '') + (sty.amount ? ' tfx tfx-' + sty.amount.fx : '');
                        am.style.cssText = am.style.cssText.replace(/--(c1|c2|gi|sp):[^;]*;?/g, '') + (sty.amount ? vars(sty.amount) : ''); }
                    const mm = el.querySelector('.obs-msg');
                    if (mm) { mm.classList.toggle('sfx-host', !!sty.msg); if (sty.msg) mm.insertAdjacentHTML('afterbegin', ringHTML(sty.msg)); }
                }
                if ('rank' in item) {
                    // El rango cambió (por ejemplo, se lo diste a mano): se vuelve a dibujar
                    el.querySelectorAll('[data-el="rankIcons"], [data-el="rankName"]').forEach(x => x.remove());
                    const parts = rankParts(item.rank, sty ? sty.rank : undefined);
                    const nk = el.querySelector('.obs-nick');
                    if (nk) nk.insertAdjacentHTML('beforeend', parts.iconsHTML + parts.nameHTML);
                    placeElements(el);
                }
                let msgEl = el.querySelector('.obs-msg');
                if (item.obsHideMessage || !item.message) {
                    if (msgEl) msgEl.remove();
                    return;
                }
                if (!msgEl) {
                    msgEl = document.createElement('div');
                    msgEl.className = 'obs-msg';
                    el.appendChild(msgEl);
                }
                msgEl.textContent = item.message;
            });
        }
        if (!PREVIEW) setInterval(() => {
            try {
                const raw = localStorage.getItem('obs_alerts_update');
                if (raw) applyAlertsUpdate(JSON.parse(raw));
            } catch (e) {}
        }, 700);
        window.addEventListener('message', (e) => {
            if (!fromPanel(e)) return; // solo se aceptan avisos del panel de StreamDonations
            if (e.data && e.data.type === 'UPDATE_ALERTS') applyAlertsUpdate(e.data.data);
        });
        try {
            const raw = localStorage.getItem('obs_alerts_update');
            if (raw) lastAlertsUpdate = (JSON.parse(raw).ts || 0);
        } catch (e) {}


        // --- TAMAÑO DEL TEXTO (lo manda la app) ---
        let lastStyleTs = 0;
        // ---- Íconos: Font Awesome (fa:), marcas (fab:), emoji (emoji:) o imagen propia guardada en la PC (img:) ----
        const obsIconUrls = {};
        function obsIconHTML(icon) {
            const v = String(icon || '');
            let m = /^(fa|fab):([a-z0-9-]{1,40})$/.exec(v);
            if (!m && /^[a-z0-9-]{1,40}$/.test(v)) m = [v, 'fa', v];
            if (m) return '<i class="' + (m[1] === 'fab' ? 'fa-brands' : 'fa-solid') + ' fa-' + m[2] + '"></i>';
            m = /^emoji:([^\x00-\x7F]{1,16})$/u.exec(v);
            if (m) return '<span class="rank-emoji">' + escapeHTML(m[1]) + '</span>';
            m = /^img:([a-z0-9]{6,24})$/.exec(v);
            if (m) {
                const id = m[1];
                if (obsIconUrls[id]) return '<img class="rank-img" src="' + obsIconUrls[id] + '" alt="">';
                if (window.SDStore && !(id in obsIconUrls)) {
                    obsIconUrls[id] = '';
                    SDStore.get('icon:' + id).then(blob => {
                        if (!blob) return;
                        obsIconUrls[id] = URL.createObjectURL(blob);
                        document.querySelectorAll('img[data-icon-wait="' + id + '"]').forEach(im => { im.src = obsIconUrls[id]; im.removeAttribute('data-icon-wait'); });
                    }).catch(() => {});
                }
                return '<img class="rank-img" data-icon-wait="' + id + '" alt="">';
            }
            return '<i class="fa-solid fa-star"></i>';
        }

        // ---- Rango del donador: íconos y cartel con el nombre (solo valores conocidos) ----
        // ---- Estilos: solo efectos y valores conocidos ----
        const SFX = { card: ['pulse', 'glow', 'breathe', 'neon', 'rainbow', 'gradient', 'snake', 'snake-left', 'snake2', 'dash', 'tick', 'shine', 'double'],
            nick: ['glow', 'neon', 'breathe', 'pulse', 'rainbow', 'gradient'], rank: ['shine', 'pulse', 'glow', 'breathe', 'neon', 'rainbow', 'gradient'] };
        SFX.msg = SFX.card; SFX.amount = SFX.nick;
        function cleanSty(st) {
            const out = {};
            if (!st || typeof st !== 'object') return out;
            const HEX = /^#[0-9a-fA-F]{6}$/;
            const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? Math.min(2.5, Math.max(0.3, n)) : d; };
            Object.keys(SFX).forEach(k => {
                const p = st[k];
                if (p && SFX[k].includes(p.fx)) out[k] = { fx: p.fx, c1: HEX.test(p.c1 || '') ? p.c1 : '#FFD700', c2: HEX.test(p.c2 || '') ? p.c2 : '#FF4D00', gi: num(p.gi, 1), sp: num(p.sp, 1) };
            });
            return out;
        }
        const vars = (p) => '--c1:' + p.c1 + ';--c2:' + p.c2 + ';--gi:' + p.gi + ';--sp:' + p.sp;
        const ringHTML = (p) => p ? '<span class="sfx-ring sfx-' + p.fx + '" style="' + vars(p) + '" aria-hidden="true"></span>' : '';
        const tAttr = (p) => p ? ' class="tfx tfx-' + p.fx + '" style="' + vars(p) + '"' : '';

        function rankParts(rank, part) {
            const HEX = /^#[0-9a-fA-F]{6}$/;
            const rk = rank && HEX.test(rank.color || '') ? rank : null;
            if (!rk) return { iconsHTML: '', nameHTML: '' };
            const iconsHTML = '<span class="rank-badge" data-el="rankIcons" style="--rank-color:' + rk.color + '">' +
                Array.from({ length: Math.min(5, Math.max(1, parseInt(rk.count) || 1)) }, () => obsIconHTML(rk.icon)).join('') + '</span>';
            const bBg = HEX.test(rk.badgeColor || '') ? rk.badgeColor : '';
            const bFx = part ? ' bfx bfx-' + part.fx : (['shine', 'pulse', 'glow', 'rainbow'].includes(rk.badgeFx) ? ' rank-fx-' + rk.badgeFx : '');
            const bInk = bBg ? ((n => (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150 ? '#111' : '#fff')(parseInt(bBg.slice(1), 16))) : '';
            const nameHTML = rk.showName ? '<span class="rank-badge" data-el="rankName" style="--rank-color:' + rk.color + '"><span class="rank-name' + (bBg ? ' has-bg' : '') + bFx + '"' +
                ((bBg || part) ? ' style="' + (bBg ? '--badge-bg:' + bBg + ';--badge-ink:' + bInk + ';' : '') + (part ? vars(part) : '') + '"' : '') + '>' + escapeHTML(String(rk.name || '').slice(0, 24)) + '</span></span>' : '';
            return { iconsHTML, nameHTML };
        }

        // ---- Qué se ve en cada donación y dónde (lo elige el streamer) ----
        const LAYOUT_ORDER = ['rankIcons', 'rankName', 'platform', 'amount'];
        const LAYOUT_SPOTS = ['name', 'below', 'right', 'hidden'];
        let obsLayout = { amount: 'right', platform: 'right', rankIcons: 'name', rankName: 'name' };
        // Diseños que necesitan cosas en un lugar fijo (en "Barra" el monto va siempre en su bloque de la izquierda)
        const DESIGNS = ['tarjeta', 'barra', 'compacto', 'burbuja', 'neon', 'cristal', 'ticket', 'subtitulo', 'franja', 'pixel', 'hud', 'zocalo', 'sticker', 'postit', 'pastel', 'mono', 'glitch', 'holo', 'comic', 'capsula', 'lhda'];
        const DESIGN_FORCE = { barra: { amount: 'right' }, zocalo: { amount: 'right', platform: 'right' }, lhda: { amount: 'right', platform: 'right' } };
        let obsDesign = 'tarjeta';
        function placeElements(card) {
            const zones = { name: card.querySelector('.obs-nick'), below: card.querySelector('.obs-sub'), right: card.querySelector('.obs-header-right') };
            const btn = card.querySelector('.obs-btn-dismiss');
            if (!zones.name || !zones.below || !zones.right) return;
            LAYOUT_ORDER.forEach(k => {
                const el = card.querySelector('[data-el="' + k + '"]');
                if (!el) return;
                const forced = (DESIGN_FORCE[obsDesign] || {})[k];
                const spot = forced && obsLayout[k] !== 'hidden' ? forced : obsLayout[k];
                el.classList.toggle('lay-hidden', spot === 'hidden');
                if (spot === 'hidden') return;
                if (spot === 'right') zones.right.insertBefore(el, btn);
                else zones[spot].appendChild(el);
            });
            zones.below.classList.toggle('empty', !zones.below.querySelector('[data-el]:not(.lay-hidden)'));
        }
        function setLayout(lay) {
            if (!lay || typeof lay !== 'object') return;
            const next = {};
            Object.keys(obsLayout).forEach(k => { next[k] = LAYOUT_SPOTS.includes(lay[k]) ? lay[k] : obsLayout[k]; });
            if (JSON.stringify(next) === JSON.stringify(obsLayout)) return;
            obsLayout = next;
            document.querySelectorAll('.obs-alert').forEach(placeElements);
        }

        function applyStyle(st) {
            if (!st || (st.ts && st.ts < lastStyleTs)) return;
            lastStyleTs = st.ts || Date.now();
            const sc = Math.min(2.5, Math.max(0.7, parseFloat(st.scale) || 1));
            const fb = !PREVIEW && st.filterBar !== false;
            const pl = !PREVIEW && Array.isArray(st.platforms) && st.platforms.length ? st.platforms : null;
            const plChanged = JSON.stringify(pl) !== JSON.stringify(allowedPlatforms);
            if (fb !== filterBarOn || plChanged) { filterBarOn = fb; allowedPlatforms = pl; applyFilter(); }
            if (st.platformColors) {
                Object.keys(st.platformColors).forEach(k => {
                    const hex = String(st.platformColors[k] || '');
                    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
                    const n = parseInt(hex.slice(1), 16);
                    document.documentElement.style.setProperty('--pc-' + k, hex);
                    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
                    document.documentElement.style.setProperty('--pc-' + k + '-rgb', rgb.join(', '));
                    // Letra que se lee encima de ese color
                    const L = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
                    document.documentElement.style.setProperty('--pc-' + k + '-ink', 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.3 ? '#111111' : '#FFFFFF');
                });
            }
            themeOwn = !!st.themeOwn;
            if (typeof st.exitFx === 'string') EXIT = st.exitFx;
            // Cómo aparece cada donación, ícono de leído, leer de a una e imágenes de las tarjetas
            const en = ENTER_TYPES.includes(st.enterFx) ? st.enterFx : 'pop';
            if (en === 'pop' || st.lite) delete document.documentElement.dataset.enter; else document.documentElement.dataset.enter = en;
            document.documentElement.classList.toggle('read-eye', st.readIcon === 'eye');
            setStep(!!st.step, st.stepDim !== false);
            applyCard(st.card);
            // Ancho de las tarjetas: el del diseño, uno elegido o todo el ancho; y dónde va la columna
            const cw = st.cardWidth, rt = document.documentElement;
            rt.classList.toggle('cw-full', cw === 'full');
            rt.classList.toggle('cw-custom', typeof cw === 'number' && cw > 0);
            if (typeof cw === 'number' && cw > 0) rt.style.setProperty('--obs-card-w', Math.min(1900, Math.max(300, cw)) + 'px');
            rt.dataset.calign = ['left', 'right'].includes(st.cardAlign) ? st.cardAlign : 'center';
            // Separación entre tarjetas elegida a mano (si no, la del diseño)
            const gp = Number(st.gap);
            document.documentElement.classList.toggle('gap-custom', st.gap !== null && st.gap !== undefined && Number.isFinite(gp));
            if (Number.isFinite(gp)) document.documentElement.style.setProperty('--obs-gap', Math.min(100, Math.max(0, gp)) + 'px');
            // Modo liviano: sin efectos animados ni animaciones decorativas
            if (!!st.lite !== LITE) { LITE = !!st.lite; document.documentElement.classList.toggle('lite', LITE); applyFx(); }
            applyObsBg(st.obsBg);
            // Fondo detrás de cada donación: automático (según el diseño) o el que elijas
            const ca = parseFloat(st.cardAlpha);
            if (Number.isFinite(ca) && ca >= 0 && ca <= 1) document.documentElement.style.setProperty('--obs-card-alpha', String(ca));
            else document.documentElement.style.removeProperty('--obs-card-alpha');
            const dz = DESIGNS.includes(st.design) ? st.design : 'tarjeta';
            if (dz !== obsDesign) {
                obsDesign = dz;
                document.documentElement.dataset.design = dz;
                document.querySelectorAll('.obs-alert').forEach(placeElements);
            }
            setLayout(st.layout);
            document.documentElement.classList.toggle('text-shadow', st.textShadow !== false);
            const ps = ['tag', 'color', 'both'].includes(st.platformStyle) ? st.platformStyle : 'tag';
            document.documentElement.classList.toggle('pstyle-color', ps === 'color');
            document.documentElement.classList.toggle('pstyle-both', ps === 'both');
            const as = Math.min(1.6, Math.max(0.5, parseFloat(st.amountScale) || 0.8));
            document.documentElement.style.setProperty('--obs-amount-scale', as);
            document.documentElement.style.setProperty('--obs-head-scale', Math.min(1.4, Math.max(0.5, parseFloat(st.headScale) || 0.75)));
            document.documentElement.style.setProperty('--obs-scale', sc);
            if (st.theme) {
                const t = st.theme, r = document.documentElement.style;
                r.setProperty('--obs-accent', t.accent);
                r.setProperty('--obs-accent-rgb', t.accentRgb);
                r.setProperty('--obs-accent-soft', t.accentSoft);
                r.setProperty('--obs-accent2', t.accent2);
                r.setProperty('--obs-on-accent', t.onAccent || '#fff');
                r.setProperty('--obs-bg-rgb', t.obsBgRgb);
                // Color de las letras (el del tema o el elegido en Personalizado) y la sombra que le corresponde
                const txt = /^#[0-9a-fA-F]{6}$/.test(t.text || '') && t.customText ? t.text : (t.mode === 'light' ? '#111827' : '#FFFFFF');
                const rgb = [1, 3, 5].map(i => parseInt(txt.slice(i, i + 2), 16));
                const lum = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
                const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
                r.setProperty('--obs-ink-rgb', t.customText ? rgb.join(', ') : (t.mode === 'light' ? '15, 23, 42' : '255, 255, 255'));
                r.setProperty('--obs-text', txt);
                r.setProperty('--obs-shadow-rgb', L > 0.35 ? '0, 0, 0' : '255, 255, 255');
                document.documentElement.dataset.mode = t.mode === 'light' ? 'light' : 'dark';
                document.documentElement.dataset.fx = t.fx || '';
                delete document.documentElement.dataset.anim; // los temas ya no traen animación (va en "Efecto animado de fondo")
                themeFx = '';
                applyFx();
            }
            // Colores propios de la tarjeta (fondo y letras), en cualquier diseño
            {
                const r = document.documentElement.style;
                const hex = c => /^#[0-9a-fA-F]{6}$/.test(c || '') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) : null;
                const cc = hex(st.cardColor);
                let light = false;
                if (cc) { r.setProperty('--obs-card-rgb', cc.join(', ')); r.setProperty('--obs-card-custom', st.cardColor); }
                else { r.removeProperty('--obs-card-rgb'); r.removeProperty('--obs-card-custom'); }
                const tc = hex(st.textColor);
                if (tc) {
                    const L = tc.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
                    r.setProperty('--obs-text', st.textColor);
                    r.setProperty('--obs-ink-rgb', tc.join(', '));
                    r.setProperty('--obs-text-custom', st.textColor);
                    r.setProperty('--obs-shadow-rgb', 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.35 ? '0, 0, 0' : '255, 255, 255');
                } else {
                    r.removeProperty('--obs-text-custom');
                    // Tarjeta de color claro (amarillo, blanco…) con letras automáticas: letras oscuras para que se lean
                    if (cc) {
                        const L = cc.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
                        light = 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2] > 0.3;
                        if (light) {
                            r.setProperty('--obs-text', '#111827'); r.setProperty('--obs-ink-rgb', '17, 24, 39'); r.setProperty('--obs-shadow-rgb', '255, 255, 255');
                        }
                    }
                }
                document.documentElement.classList.toggle('light-card', light);
            }
            layoutTop();
        }
        // Efecto animado: el del tema, o el que se elija para el fondo (este también se ve en la fuente de navegador)
        let themeFx = '', bgFx = '', themeOwn = false, LITE = false, lastPreviewData = null;
        const FX_KINDS = ['propio', 'lluvia', 'lluviafuerte', 'nieve', 'papelitos', 'otono', 'primavera', 'burbujas', 'brillos', 'polvo', 'bokeh', 'fugaces', 'niebla', 'rayos', 'corazones', 'plata', 'fuego', 'matrix', 'globos', 'monedas', 'notas', 'pixelhearts', 'estrellas', 'aurora', 'tormenta', 'luciernagas', 'navidad', 'halloween', 'argentina', 'julio4', 'anionuevo', 'sanvalentin', 'fiesta', 'xfiles'];
        function applyFx() {
            const own = bgFx && bgFx !== 'none' && FX_KINDS.includes(bgFx);
            const fx = LITE || bgFx === 'none' ? '' : (own ? bgFx : themeFx);
            // También se muestra (en la fuente de navegador) la del tema de OBS si lo elegiste a propósito
            document.documentElement.classList.toggle('own-fx', !!(own || (!bgFx && themeOwn && themeFx)));
            document.documentElement.classList.toggle('fx-xfiles', fx === 'xfiles');
            if (window.XFilesFX) { if (fx === 'xfiles') window.XFilesFX.start(); else window.XFilesFX.stop(); }
            if (window.SDAnimFX) { if (fx && fx !== 'xfiles') window.SDAnimFX.start(fx); else window.SDAnimFX.stop(); }
        }
        // Imagen de fondo que manda el panel (la fuente de navegador no ve los archivos de la app)
        const wsBg = { ver: -1, url: null };
        const ENTER_TYPES = ['pop', 'fade', 'slide', 'slidel', 'bounce', 'grow', 'drop', 'flip', 'spin', 'blur'];

        // ---- Imagen en la esquina y de fondo de cada tarjeta ----
        const wsCard = { corner: { ver: -1, url: null }, bg: { ver: -1, url: null } };
        const cardImg = { corner: { ver: -1, url: null }, bg: { ver: -1, url: null } };
        let lastCardCfg = null;
        function applyCard(c) {
            const root = document.documentElement;
            lastCardCfg = c || null;
            const num = (v, a, b, d) => { v = parseFloat(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
            const on = { corner: !!(c && c.corner), bg: !!(c && c.bg) };
            root.classList.toggle('corner-left', !!c && c.cornerPos === 'left');
            root.classList.toggle('cc-behind', !!c && c.cornerLayer === 'back');
            root.style.setProperty('--cc-size', num(c && c.cornerSize, 30, 220, 90) + 'px');
            root.style.setProperty('--cc-alpha', String(num(c && c.cornerAlpha, 10, 100, 100) / 100));
            ccPos.x = num(c && c.cornerX, -150, 150, 0); ccPos.y = num(c && c.cornerY, -150, 150, 0); ccPos.size = num(c && c.cornerSize, 30, 220, 90); ccPos.left = !!c && c.cornerPos === 'left';
            ccPads();
            root.style.setProperty('--cb-alpha', String(num(c && c.bgAlpha, 5, 100, 100) / 100));
            root.style.setProperty('--cb-dim', String(num(c && c.bgDim, 0, 90, 40) / 100));
            ['corner', 'bg'].forEach(slot => {
                const cls = slot === 'corner' ? 'card-corner' : 'card-bg', v = slot === 'corner' ? '--cc-url' : '--cb-url', ver = c ? (slot === 'corner' ? c.cornerVer : c.bgVer) : 0;
                const show = (url) => { root.classList.toggle(cls, on[slot] && !!url); if (url) root.style.setProperty(v, 'url("' + url + '")'); if (slot === 'corner') ccRun(); };
                if (!on[slot]) { root.classList.remove(cls); if (slot === 'corner') ccRun(); return; }
                if (WS_MODE) { show(wsCard[slot].ver === ver ? wsCard[slot].url : null); return; }
                const ci = cardImg[slot];
                if (ci.ver === ver && ci.url) { show(ci.url); return; }
                if (!window.SDStore) { show(null); return; }
                ci.ver = ver;
                SDStore.get(slot === 'corner' ? 'cardCorner' : 'cardBg').then(blob => {
                    if (ci.url) URL.revokeObjectURL(ci.url);
                    ci.url = blob ? URL.createObjectURL(blob) : null;
                    if (lastCardCfg) show(ci.url);
                });
            });
        }

        // ---- La imagen de la esquina va en una capa propia, así puede sobresalir de la tarjeta sin que la recorte ----
        // (sigue a cada tarjeta cuadro a cuadro, también cuando entra, se va o se opaca)
        const ccPos = { x: 0, y: 0, size: 90, left: false };
        const ccLayer = document.createElement('div');
        ccLayer.id = 'cc-layer';
        if (scrollArea) scrollArea.appendChild(ccLayer);
        const ccMap = new Map();
        let ccLoop = 0;
        function ccPads() {
            // Lugar extra para que lo que sobresale no lo corte el borde de la ventana
            const r = document.documentElement.style;
            r.setProperty('--cc-pt', Math.max(0, -ccPos.y) + 'px');
            // Con la separación en Automático, cada tarjeta deja arriba el lugar que ocupa la imagen que sobresale
            r.setProperty('--cc-up', Math.max(0, -ccPos.y) + 'px');
            r.setProperty('--cc-pr', (ccPos.left ? 0 : Math.max(0, ccPos.x)) + 'px');
            r.setProperty('--cc-pl', (ccPos.left ? Math.max(0, -ccPos.x) : 0) + 'px');
        }
        function ccSync() {
            const on = document.documentElement.classList.contains('card-corner');
            const seen = new Set();
            if (on && scrollArea) {
                const base = scrollArea.getBoundingClientRect(), st = scrollArea.scrollTop, sl = scrollArea.scrollLeft;
                container.querySelectorAll('.obs-alert').forEach(card => {
                    if (card.offsetParent === null) return;
                    let im = ccMap.get(card);
                    if (!im) { im = document.createElement('div'); im.className = 'cc-img'; ccLayer.appendChild(im); ccMap.set(card, im); }
                    seen.add(card);
                    // Posición de la tarjeta sin la animación (offset) y la animación copiada aparte
                    let x = 0, y = 0, el = card;
                    while (el && el !== scrollArea) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
                    const w = card.offsetWidth, s = ccPos.size;
                    const ix = ccPos.left ? x + ccPos.x : x + w - s + ccPos.x, iy = y + ccPos.y;
                    const cs = getComputedStyle(card);
                    const o = (cs.transformOrigin || '50% 50%').split(' ');
                    const ox = parseFloat(o[0]) + x - ix, oy = parseFloat(o[1]) + y - iy;
                    // La imagen va delante de todo; los clics la atraviesan (pointer-events: none), así el botón de "leído" sigue andando aunque quede tapado
                    im.style.cssText = `left:${ix}px;top:${iy}px;width:${s}px;height:${s}px;transform-origin:${ox}px ${oy}px;transform:${cs.transform === 'none' ? '' : cs.transform};opacity:${(parseFloat(cs.opacity) || 0) * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cc-alpha')) || 1)};filter:${cs.filter === 'none' ? '' : cs.filter};background-position:${ccPos.left ? 'top left' : 'top right'}`;
                });
            }
            ccMap.forEach((im, card) => { if (!seen.has(card)) { im.remove(); ccMap.delete(card); } });
        }
        function ccRun() {
            const on = document.documentElement.classList.contains('card-corner');
            if (on && !ccLoop) { const tick = () => { ccSync(); ccLoop = document.documentElement.classList.contains('card-corner') ? requestAnimationFrame(tick) : 0; if (!ccLoop) ccSync(); }; ccLoop = requestAnimationFrame(tick); }
            if (!on) ccSync();
        }

        // ---- Leer de a una: la rueda salta de donación en donación y opaca las demás ----
        let STEP = false, STEP_DIM = true;
        function stepCards() { return Array.from(container.querySelectorAll('.obs-alert')).filter(el => !el.dataset.leaving && el.offsetParent !== null); }
        function stepFocus(el, noScroll) {
            container.querySelectorAll('.obs-alert.step-focus').forEach(x => x.classList.remove('step-focus'));
            document.documentElement.classList.toggle('step-on', !!el && STEP_DIM);
            if (!el) return;
            el.classList.add('step-focus');
            if (scrollArea && !noScroll) scrollArea.scrollTo({ top: Math.max(0, el.offsetTop - container.offsetTop - 8), behavior: 'smooth' });
        }
        // Con "Opacar las demás" prendido siempre hay una destacada: si no elegiste ninguna, la primera (sin mover la pantalla)
        // Mientras no uses la rueda, la destacada es siempre la primera de la lista (también cuando llegan nuevas)
        let stepAuto = true;
        function stepEnsure() {
            if (!STEP || !STEP_DIM) return;
            const list = stepCards();
            if (!list.length) { document.documentElement.classList.remove('step-on'); return; }
            if (stepAuto) { if (!list[0].classList.contains('step-focus')) stepFocus(list[0], true); }
            else if (!list.some(x => x.classList.contains('step-focus'))) stepFocus(list[0], true);
        }
        new MutationObserver(() => { if (STEP && STEP_DIM) setTimeout(stepEnsure, 0); }).observe(container, { childList: true });
        function stepAfterLeave(el) {
            const list = stepCards().filter(x => x !== el), all = Array.from(container.querySelectorAll('.obs-alert')), i = all.indexOf(el);
            const next = all.slice(i + 1).find(x => list.includes(x)) || all.slice(0, i).reverse().find(x => list.includes(x)) || null;
            el.classList.remove('step-focus');
            setTimeout(() => { if (!(STEP && STEP_DIM && stepAuto)) stepFocus(STEP ? next : null); stepEnsure(); }, 0);
        }
        function setStep(on, dim) {
            STEP_DIM = dim;
            if (on === STEP) { if (!on || !container.querySelector('.step-focus')) document.documentElement.classList.remove('step-on'); else document.documentElement.classList.toggle('step-on', dim); stepEnsure(); return; }
            STEP = on;
            if (!on) stepFocus(null);
            stepEnsure();
        }
        if (scrollArea && !PREVIEW) scrollArea.addEventListener('wheel', (e) => {
            if (!STEP || e.ctrlKey) return;
            const list = stepCards(); if (!list.length) return;
            e.preventDefault();
            const cur = list.findIndex(x => x.classList.contains('step-focus')), dir = e.deltaY > 0 ? 1 : -1;
            stepAuto = false;
            if (cur < 0) { if (dir > 0) stepFocus(list[0]); return; }
            const ni = cur + dir;
            if (ni < 0) { stepAuto = true; if (STEP_DIM) stepFocus(list[0]); else stepFocus(null); scrollArea.scrollTo({ top: 0, behavior: 'smooth' }); return; }
            if (ni < list.length) stepFocus(list[ni]);
        }, { passive: false });
        let lastBgCfg = null;
        // Fondo de la ventana: el del tema, un color o una imagen/GIF (guardada en IndexedDB)
        let obsBgUrl = null, obsBgVer = -1;
        function applyObsBg(bg) {
            const root = document.documentElement, el = document.getElementById('obs-bg');
            if (!el) return;
            lastBgCfg = bg || null;
            // Transparencia del fondo (en la fuente de navegador y la vista previa) y efecto propio
            const al = bg ? parseFloat(bg.alpha) : NaN;
            root.style.setProperty('--obs-bg-alpha', String(Number.isFinite(al) ? Math.min(100, Math.max(0, al)) / 100 : 1));
            // Transparencia del efecto (si no hay una propia, la misma del fondo, como antes)
            let fa = bg ? parseFloat(bg.fxAlpha) : NaN;
            if (!Number.isFinite(fa)) fa = Number.isFinite(al) ? al : 100;
            root.style.setProperty('--obs-fx-alpha', String(Math.min(100, Math.max(0, fa)) / 100));
            const fr = bg ? parseFloat(bg.front) : 0;
            if (window.SDAnimFX && SDAnimFX.setFront) SDAnimFX.setFront(Number.isFinite(fr) ? fr / 100 : 0);
            // Fondo del efecto: como viene / todos con fondo / sin fondo
            const fxBg = bg && ['on', 'off'].includes(bg.fxBg) ? bg.fxBg : 'auto';
            if (window.SDAnimFX && SDAnimFX.setBgMode) SDAnimFX.setBgMode(fxBg);
            root.classList.toggle('fxbg-off', fxBg === 'off');
            if (window.SDAnimFX && SDAnimFX.setCustom) SDAnimFX.setCustom(bg && bg.custom);
            const nfx = bg && typeof bg.fx === 'string' ? bg.fx : '';
            if (nfx !== bgFx) { bgFx = nfx; applyFx(); }
            const chroma = !!bg && bg.type === 'chroma';
            root.classList.toggle('obs-chroma', chroma);
            if (chroma) {
                const c = ['#FF00FF', '#00FF00', '#0000FF'].includes(bg.chroma) ? bg.chroma : '#FF00FF';
                root.style.setProperty('--obs-chroma', c);
                root.classList.remove('has-obs-bg'); el.style.background = '';
                return;
            }
            if (!bg || bg.type === 'theme') { root.classList.remove('has-obs-bg'); el.style.background = ''; return; }
            if (bg.type === 'color') {
                el.style.background = /^#[0-9a-fA-F]{6}$/.test(bg.color || '') ? bg.color : '#000';
                root.style.setProperty('--obs-bg-dim', 0);
                root.classList.add('has-obs-bg');
                return;
            }
            const paint = () => {
                if (!obsBgUrl) { root.classList.remove('has-obs-bg'); return; }
                const fit = bg.fit === 'contain' ? 'contain' : (bg.fit === 'repeat' ? 'auto' : 'cover');
                el.style.background = '#000 url("' + obsBgUrl + '") center / ' + fit + (bg.fit === 'repeat' ? ' repeat' : ' no-repeat');
                root.style.setProperty('--obs-bg-dim', Math.min(0.85, Math.max(0, parseFloat(bg.dim) || 0)));
                root.classList.add('has-obs-bg');
            };
            if (WS_MODE) { obsBgUrl = wsBg.ver === bg.ver ? wsBg.url : null; paint(); return; }
            if (bg.ver === obsBgVer && obsBgUrl) { paint(); return; }
            obsBgVer = bg.ver;
            if (!window.SDStore) return;
            SDStore.get('obsBg').then(blob => {
                if (obsBgUrl) URL.revokeObjectURL(obsBgUrl);
                obsBgUrl = blob ? URL.createObjectURL(blob) : null;
                paint();
            });
        }

        // Si cambiás el idioma en el panel, esta ventana se recarga sola en el idioma nuevo
        setInterval(() => {
            try {
                const st = JSON.parse(localStorage.getItem('streamdonations_settings') || '{}');
                if ((st.language === 'en' || st.language === 'es') && window.SD_LANG && st.language !== window.SD_LANG) location.reload();
            } catch (e) {}
        }, 2000);

        function readStyle() {
            try { const raw = localStorage.getItem('obs_style'); if (raw) applyStyle(JSON.parse(raw)); } catch (e) {}
        }
        readStyle();
        if (!PREVIEW) setInterval(readStyle, 700);
        window.addEventListener('message', (e) => {
            if (!fromPanel(e)) return; // solo se aceptan avisos del panel de StreamDonations
            if (e.data && e.data.type === 'STYLE_UPDATE') applyStyle(e.data.data);
        });

        // --- META DE DONACIONES ---
        let lastGoalJson = '';
        function renderGoal(g) {
            if (!g) return;
            document.body.classList.toggle('has-goal', !!g.enabled);
            layoutTop();
            if (!g.enabled) return;
            document.getElementById('obs-goal-title').textContent = g.title || 'Meta';
            document.getElementById('obs-goal-nums').textContent = (g.currentText || '$0') + ' / ' + (g.targetText || '$0') + ' (' + (g.percent || 0) + '%)';
            document.getElementById('obs-goal-fill').style.width = Math.min(100, g.percent || 0) + '%';
            document.getElementById('obs-goal').classList.toggle('complete', (g.percent || 0) >= 100);
        }
        function readGoalFromStorage() {
            try {
                const raw = localStorage.getItem('obs_goal_state');
                if (raw && raw !== lastGoalJson) {
                    lastGoalJson = raw;
                    renderGoal(JSON.parse(raw));
                }
            } catch (e) {}
        }
        if (!PREVIEW) { readGoalFromStorage(); setInterval(readGoalFromStorage, 1000); }
        window.addEventListener('message', (e) => {
            if (!fromPanel(e)) return; // solo se aceptan avisos del panel de StreamDonations
            if (e.data && e.data.type === 'GOAL_UPDATE') {
                lastGoalJson = JSON.stringify(e.data.data);
                renderGoal(e.data.data);
            }
        });

        // Estado inicial
        updateAlertCounter();

        if (WS_MODE) wsConnect();

        // Clics de la barra de plataformas y del botón ✓ (sin código dentro del HTML)
        document.addEventListener('click', (e) => {
            const f = e.target.closest('[data-filter]');
            if (f) { setFilter(f.dataset.filter); return; }
            const d = e.target.closest('[data-dismiss]');
            if (d) dismissAndMarkRead(d.dataset.dismiss);
        });
