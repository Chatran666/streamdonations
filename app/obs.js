/* StreamDonations - ventana Modo OBS */
        // Mensajes válidos: los que manda la ventana del panel que abrió esta, o los que llegan por la conexión con OBS
        const fromPanel = (e) => e.__sdWs === true || (!!window.opener && e.source === window.opener);

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

            if (sty.card) alertEl.classList.add('sfx-host');
            alertEl.innerHTML = ringHTML(sty.card) + `
                <div class="obs-header">
                    <div class="obs-donor">
                        <div class="obs-avatar">${avatarHTML}</div>
                        <div class="obs-donor-text">
                            <div class="obs-nick">
                                <span${tAttr(sty.nick)}>${escapeHTML(d.nick || 'Anónimo')}</span>${rankIconsHTML}${rankNameHTML}
                            </div>
                            <div class="obs-sub"></div>
                        </div>
                    </div>
                    <div class="obs-header-right">
                        <span class="obs-tag ${d.platform || 'ceneka'}" data-el="platform">${platformLabel}</span>
                        <div class="obs-amount${amtColor ? ' has-amt-color' : ''}${sty.amount ? ' tfx tfx-' + sty.amount.fx : ''}" data-el="amount" style="${amtColor ? '--amt-color:' + amtColor + ';' : ''}${sty.amount ? vars(sty.amount) : ''}">${formattedAmt}</div>
                        <button class="obs-btn-dismiss" data-dismiss="${alertId}" title="Marcar como leído y ocultar">
                            <i class="fa-solid fa-check"></i>
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
            if (secs > 0) {
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

        function dismissAlert(id) {
            if (id === 'all') {
                const allAlerts = container.querySelectorAll('.obs-alert');
                allAlerts.forEach(el => {
                    el.style.animation = 'popSlideOut 0.3s forwards';
                    setTimeout(() => el.remove(), 300);
                });
                renderedIds.clear();
                setTimeout(() => {
                    updateAlertCounter();
                }, 350);
                return;
            }

            const target = container.querySelector('[data-alert-id="' + id + '"]');
            if (target) {
                target.style.animation = 'popSlideOut 0.3s forwards';
                setTimeout(() => {
                    target.remove();
                    updateAlertCounter();
                }, 300);
                renderedIds.delete(id);
            }
        }

        function dismissAndMarkRead(id) {
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

        // --- CANALES DE COMUNICACIÓN ---
        const OBS_OPENED_AT = Date.now() - 2000;

        // 1. BroadcastChannel
        if (typeof BroadcastChannel !== 'undefined') {
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
            }
        });

        // 3. Polling de localStorage COLA (funciona siempre en file:// y OBS Browser Source)
        setInterval(() => {
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
        setInterval(() => {
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
        function placeElements(card) {
            const zones = { name: card.querySelector('.obs-nick'), below: card.querySelector('.obs-sub'), right: card.querySelector('.obs-header-right') };
            const btn = card.querySelector('.obs-btn-dismiss');
            if (!zones.name || !zones.below || !zones.right) return;
            LAYOUT_ORDER.forEach(k => {
                const el = card.querySelector('[data-el="' + k + '"]');
                if (!el) return;
                const spot = obsLayout[k];
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
            const fb = st.filterBar !== false;
            const pl = Array.isArray(st.platforms) && st.platforms.length ? st.platforms : null;
            const plChanged = JSON.stringify(pl) !== JSON.stringify(allowedPlatforms);
            if (fb !== filterBarOn || plChanged) { filterBarOn = fb; allowedPlatforms = pl; applyFilter(); }
            if (st.platformColors) {
                Object.keys(st.platformColors).forEach(k => {
                    const hex = String(st.platformColors[k] || '');
                    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
                    const n = parseInt(hex.slice(1), 16);
                    document.documentElement.style.setProperty('--pc-' + k, hex);
                    document.documentElement.style.setProperty('--pc-' + k + '-rgb', ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255));
                });
            }
            applyObsBg(st.obsBg);
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
                r.setProperty('--obs-ink-rgb', t.mode === 'light' ? '15, 23, 42' : '255, 255, 255');
                r.setProperty('--obs-text', t.mode === 'light' ? '#111827' : '#FFFFFF');
                document.documentElement.dataset.mode = t.mode === 'light' ? 'light' : 'dark';
                document.documentElement.dataset.fx = t.fx || '';
                if (window.XFilesFX) { if (t.fx === 'xfiles') window.XFilesFX.start(); else window.XFilesFX.stop(); }
            }
            layoutTop();
        }
        // Fondo de la ventana: el del tema, un color o una imagen/GIF (guardada en IndexedDB)
        let obsBgUrl = null, obsBgVer = -1;
        function applyObsBg(bg) {
            const root = document.documentElement, el = document.getElementById('obs-bg');
            if (!el) return;
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
        setInterval(readStyle, 700);
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
        readGoalFromStorage();
        setInterval(readGoalFromStorage, 1000);
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
