/* StreamDonations - ventana Modo OBS */
        // Mensajes válidos: solo los que manda la ventana del panel que abrió esta
        const fromPanel = (e) => !!window.opener && e.source === window.opener;
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
            const fx = d.fx && ['pulse', 'glow', 'rainbow', 'shine'].includes(d.fx.type) && HEX.test(d.fx.color || '') ? d.fx : null;
            if (fx) { alertEl.classList.add('has-fx', 'fx-' + fx.type); alertEl.style.setProperty('--fx-color', fx.color); }
            const rk = d.rank && /^[a-z-]{2,30}$/.test(d.rank.icon || '') && HEX.test(d.rank.color || '') ? d.rank : null;
            const rankHTML = rk ? '<span class="rank-badge" style="--rank-color:' + rk.color + '">' +
                Array.from({ length: Math.min(5, Math.max(1, parseInt(rk.count) || 1)) }, () => '<i class="fa-solid fa-' + rk.icon + '"></i>').join('') +
                (rk.showName ? '<span class="rank-name">' + escapeHTML(String(rk.name || '').slice(0, 24)) + '</span>' : '') + '</span>' : '';
            alertEl.dataset.alertId = alertId;
            alertEl.dataset.platform = d.platform || 'ceneka';
            
            const avatarHTML = d.avatar 
                ? '<img src="' + d.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' 
                : escapeHTML(d.nick ? String(d.nick).charAt(0).toUpperCase() : 'A');

            const platformLabel = ({ youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' })[d.platform] || 'Ceneka';
            const amtColor = /^#[0-9a-fA-F]{6}$/.test(d.amtColor || '') ? d.amtColor : '';
            const formattedAmt = escapeHTML(d.formattedAmount || ('$' + (parseFloat(d.amount) || 0)));

            alertEl.innerHTML = (fx ? '<span class="fx-ring" aria-hidden="true"></span>' : '') + `
                <div class="obs-header">
                    <div class="obs-donor">
                        <div class="obs-avatar">${avatarHTML}</div>
                        <div class="obs-nick">
                            <span>${escapeHTML(d.nick || 'Anónimo')}</span>${rankHTML}
                        </div>
                    </div>
                    <div class="obs-header-right">
                        <span class="obs-tag ${d.platform || 'ceneka'}">${platformLabel}</span>
                        <div class="obs-amount${amtColor ? ' has-amt-color' : ''}"${amtColor ? ' style="--amt-color:' + amtColor + '"' : ''}>${formattedAmt}</div>
                        <button class="obs-btn-dismiss" data-dismiss="${alertId}" title="Marcar como leído y ocultar">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                </div>
                ${(!d.obsHideMessage && d.message) ? '<div class="obs-msg">' + escapeHTML(d.message) + '</div>' : ''}
            `;

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

        // Clics de la barra de plataformas y del botón ✓ (sin código dentro del HTML)
        document.addEventListener('click', (e) => {
            const f = e.target.closest('[data-filter]');
            if (f) { setFilter(f.dataset.filter); return; }
            const d = e.target.closest('[data-dismiss]');
            if (d) dismissAndMarkRead(d.dataset.dismiss);
        });
