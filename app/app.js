/* ==========================================================================
   StreamDonations - Ceneka & YouTube Superchat Hub (Core Application Engine)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const APP_VERSION = '1.5.3';
    // Limpia una donación que viene de afuera (archivos importados, editor JSON, historial guardado)
    // para que ningún campo pueda meter código en la página.
    function safeDonation(d) {
        d = d && typeof d === 'object' ? d : {};
        const str = (v, max) => String(v == null ? '' : v).slice(0, max);
        const amount = parseFloat(d.amount) || 0;
        const id = str(d.id, 100).replace(/[^A-Za-z0-9_.-]/g, '') || ('don_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
        const avatar = typeof d.avatar === 'string' && /^(https:\/\/[^\s"'<>()]+|data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+)$/i.test(d.avatar) ? d.avatar : null;
        return {
            id,
            platform: ['ceneka', 'youtube', 'twitch', 'kick'].includes(d.platform) ? d.platform : 'ceneka',
            nick: str(d.nick, 80) || 'Anónimo',
            amount,
            currency: str(d.currency, 10).replace(/[^A-Za-z]/g, '').toUpperCase() || 'ARS',
            formattedAmount: str(d.formattedAmount, 40).replace(/[<>&"'`]/g, ''),
            message: str(d.message, 2000),
            timestamp: Number(d.timestamp) || Date.now(),
            isRead: !!d.isRead,
            tier: str(d.tier, 40).replace(/[^A-Za-z0-9-]/g, ''),
            avatar,
            isTest: !!d.isTest,
            ...(d.blocked ? { blocked: true } : {})
        };
    }

    // Cargar base de datos previa de donaciones desde localStorage
    let initialDonations = [];
    try {
        const savedDb = localStorage.getItem('streamdonations_chats_db');
        if (savedDb) {
            const parsed = JSON.parse(savedDb);
            if (Array.isArray(parsed)) {
                initialDonations = parsed.map(safeDonation);
                console.log(`💾 Base de datos cargada automáticamente: ${initialDonations.length} chats recuperados.`);
            }
        }
    } catch (e) {
        console.warn('No se pudo cargar la base de datos previa:', e);
    }

    // --- Application State ---
    const state = {
        donations: initialDonations,
        filter: {
            search: '',
            sort: 'newest', // 'newest' | 'oldest' | 'highest' | 'lowest'
            platform: 'all', // 'all' | 'ceneka' | 'youtube'
            minAmount: 0,
            dateFrom: null, // Date object: solo mostrar donaciones desde esta fecha/hora
            dateTo: null, // Date object: solo mostrar donaciones hasta esta fecha/hora
            hideRead: false
        },
        layout: 'unified', // 'split' | 'unified' (se toma de la configuración guardada)
        isSimulating: false,
        simInterval: null,
        soundEnabled: false, // vienen apagados: se prenden con los botones del encabezado
        ttsEnabled: false,
        showAmounts: false, // false = solo mensajes, true = muestra $
        showOnlyRead: false, // false = solo pendientes (los leídos desaparecen), true = ver historial de leídos
        toolbarVisible: true, // visibilidad de la barra de filtros del medio
        selectedVoice: null,
        activeFocusId: null,
        audioUnlocked: false,
        overlayWindow: null,
        obsChannel: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('obs_overlay_channel') : null,
        streamlabs: {
            socket: null,
            status: 'idle', // 'idle' | 'connecting' | 'connected' | 'error'
            processedIds: new Set()
        },
        settings: {
            slToken: '', // Streamlabs Socket API Token
            minDisplayAmount: 0, // Monto mínimo para mostrar en el panel
            obsMinAmount: null, // Monto mínimo para mostrar en OBS (null = usar el del panel, para configuraciones viejas)
            minTts: 100,
            obsHideMessage: false, // Ocultar texto del mensaje en la alerta de OBS
            obsDuration: 0, // Segundos que queda cada alerta en OBS (0 = queda hasta marcarla como leída)
            simSpeed: 10,
            autoSaveDb: true, // Auto-guardado permanente en base de datos local
            soundEnabled: false,
            ttsEnabled: false,
            hotkeys: false, // Atajos de teclado (apagados de fábrica)
            soundMaxSecs: 3, // El sonido de la PC se corta a los X segundos (0 = completo)
            bigSoundEnabled: false, // Sonido especial para donaciones grandes
            bigSoundMin: 10000, // Desde cuántos pesos suena el especial
            bigSoundChoice: 'fanfarria',
            bigSoundVolume: 0.9,
            bigSoundMaxSecs: 6,
            bigSoundFileVer: 0,
            bigSoundFileName: '',
            // Efecto visual para donaciones grandes
            fxEnabled: false, fxMin: 10000, fxType: 'pulse', fxColor: '#FFD700', fxPanel: true, fxObs: true,
            fxStyle: 'arcoiris', // estilo para las donaciones grandes
            styles: null, // se llenan con los estilos de fábrica al cargar
            // Rangos de donadores (por lo donado en los últimos N días)
            // Color del monto según cuánto donó
            // Ventana OBS: dónde va cada cosa ('name' al lado del nombre, 'below' debajo, 'right' a la derecha, 'hidden')
            obsLayout: { amount: 'right', platform: 'right', rankIcons: 'name', rankName: 'name' },
            // Cómo se muestra la red: 'tag' etiqueta con el nombre, 'color' nombre y foto pintados con el color de la red, 'both' las dos
            obsPlatformStyle: 'tag', panelPlatformStyle: 'tag',
            customIcons: [], // imágenes propias para los rangos: [{ id, name }] (el archivo queda guardado en esta PC)
            amtColorsEnabled: false, amtColorsPanel: true, amtColorsObs: true,
            amtColors: [
                { min: 0, color: '#34D399' },
                { min: 2000, color: '#60A5FA' },
                { min: 10000, color: '#FBBF24' },
                { min: 50000, color: '#F87171' }
            ],
            ranksEnabled: false, ranksDays: 30, ranksPanel: true, ranksObs: true, ranksShowName: true,
            ranks: [
                { name: 'Seguidor', mode: 'manual', users: '', icon: 'heart', color: '#F472B6', count: 1 },
                { name: 'Colaborador', min: 5000, icon: 'star', color: '#60A5FA', count: 1 },
                { name: 'Mecenas', min: 20000, icon: 'gem', color: '#A78BFA', count: 2 },
                { name: 'Leyenda', min: 50000, icon: 'crown', color: '#FBBF24', count: 3, badgeColor: '#FBBF24', style: 'dorado' }
            ],
            showAmounts: false,
            voiceName: '', // Voz elegida para la lectura (vacío = primera voz en español)
            usdRate: 0, // Cotización: pesos por US$1 (0 = no convertir)
            sessionStart: Date.now(), // Inicio del directo actual (botón "Directo")
            goalEnabled: false,
            goalTitle: '',
            goalTarget: 0,
            goalStart: Date.now(),
            goalShowInObs: true,
            goalResetOnSession: true,
            linksInPanel: true, // Links de los mensajes como botón para abrir (con confirmación)
            panelLinkFull: false, // En el panel: false = solo el sitio, true = dirección completa
            obsLinkMode: 'hide', // En OBS: 'hide' = "🔗 link" | 'domain' = "🔗 youtube.com" | 'full' = dirección completa
            ttsLinkMode: 'domain', // En la voz: 'domain' = "link de youtube.com" | 'omit' = no lo menciona
            voiceRate: 1, // Velocidad de la voz
            voicePitch: 1, // Tono de la voz
            voiceVolume: 1, // Volumen de la voz
            layout: 'unified', // Vista por defecto: 'unified' (todo junto) | 'split' (columnas)
            splitColumns: [], // Columnas elegidas para la vista dividida (ninguna por defecto)
            seChannels: [], // StreamElements: [{ label, token }] (un JWT por canal: YouTube, Twitch, Kick...)
            kickUsd: 0.01, // Valor aproximado de 1 KICK en dólares (para totales y meta)
            theme: 'oscuro', // Tema de colores: oscuro | claro | verde | violeta | fuego | cyan | custom
            customAccent: '#00E676', // Color elegido para el tema personalizado
            panelTextScale: 1, // Tamaño del texto de las tarjetas del panel (1 = 100%)
            obsTextScale: 1, // Tamaño del texto de las alertas en la ventana de OBS
            obsAmountScale: 0.8, // Tamaño de los montos ($) en OBS, relativo al texto
            bannedWords: '', // Palabras prohibidas (una por línea o con comas; * al final = variantes)
            censorObs: true, censorTts: true, censorPanel: false,
            blockedUsers: '' // Usuarios bloqueados (uno por línea)
        },
        lastReadId: null
    };

    // ---- Efectos y rangos: valores permitidos (todo lo que se muestra pasa por acá) ----
    const HEX_RE = /^#[0-9a-fA-F]{6}$/;
    const FX_TYPES = ['pulse', 'glow', 'rainbow', 'shine'];
    const RANK_FX = ['none', 'shine', 'pulse', 'glow', 'rainbow'];
    // ---- Estilos: un "look" con nombre que pinta cada parte de la donación ----
    const STYLE_PARTS = ['card', 'msg', 'nick', 'rank', 'amount'];
    const BOX_FX = ['none', 'pulse', 'glow', 'breathe', 'neon', 'rainbow', 'gradient', 'snake', 'snake-left', 'snake2', 'dash', 'tick', 'shine', 'double'];
    const TEXT_FX = ['none', 'glow', 'neon', 'breathe', 'pulse', 'rainbow', 'gradient'];
    const BADGE_FX = ['none', 'shine', 'pulse', 'glow', 'breathe', 'neon', 'rainbow', 'gradient'];
    const PART_FX = { card: BOX_FX, msg: BOX_FX, nick: TEXT_FX, amount: TEXT_FX, rank: BADGE_FX };
    const TWO_COLOR_FX = new Set(['gradient', 'snake', 'snake-left', 'snake2', 'double']);
    const NO_COLOR_FX = new Set(['none', 'rainbow']);
    const GLOW_FX = new Set(['glow', 'breathe', 'neon']); // se recortan con el fondo transparente de OBS
    const sp = (fx, c1, c2) => ({ fx, c1: c1 || '#FFD700', c2: c2 || '#FF4D00', gi: 1, sp: 1 });
    const DEFAULT_STYLES = [
        { id: 'dorado', name: 'Dorado brillante', parts: { card: sp('glow', '#FFD700'), rank: sp('shine', '#FFD700'), amount: sp('glow', '#FFD700') } },
        { id: 'neon-rosa', name: 'Neón rosa', parts: { card: sp('neon', '#FF2BD6'), nick: sp('neon', '#FF2BD6') } },
        { id: 'serpiente', name: 'Serpiente', parts: { card: sp('snake', '#22D3EE', '#A78BFA'), rank: sp('glow', '#22D3EE') } },
        { id: 'arcoiris', name: 'Arcoíris', parts: { card: sp('rainbow'), nick: sp('rainbow') } },
        { id: 'fuego', name: 'Fuego', parts: { card: sp('snake2', '#FF4D00', '#FFC800'), nick: sp('gradient', '#FF4D00', '#FFC800'), amount: sp('glow', '#FF7A00') } },
        { id: 'suave', name: 'Suave', parts: { card: sp('breathe', '#60A5FA') } }
    ];
    function cleanPart(p, part) {
        if (!p || typeof p !== 'object') return null;
        const fx = (PART_FX[part] || []).includes(p.fx) ? p.fx : 'none';
        if (fx === 'none') return null;
        const num = (v, lo, hi, d) => { const n = parseFloat(v); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
        return { fx, c1: HEX_RE.test(p.c1 || '') ? p.c1 : '#FFD700', c2: HEX_RE.test(p.c2 || '') ? p.c2 : '#FF4D00', gi: num(p.gi, 0.3, 2.5, 1), sp: num(p.sp, 0.3, 2.5, 1) };
    }
    function cleanStyles(list) {
        if (!Array.isArray(list)) return JSON.parse(JSON.stringify(DEFAULT_STYLES));
        const seen = new Set();
        return list.filter(x => x && typeof x === 'object' && /^[a-z0-9-]{1,40}$/.test(x.id || '') && !seen.has(x.id) && seen.add(x.id)).slice(0, 30).map(x => {
            const parts = {};
            STYLE_PARTS.forEach(k => { const c = cleanPart(x.parts && x.parts[k], k); if (c) parts[k] = c; });
            return { id: x.id, name: String(x.name || '').replace(/[<>]/g, '').trim().slice(0, 30) || 'Estilo', parts };
        });
    }
    const partVars = (p) => `--c1:${p.c1};--c2:${p.c2};--gi:${p.gi};--sp:${p.sp}`;
    // Texto blanco o negro según el color de fondo, para que siempre se lea
    function inkFor(hex) {
        if (!HEX_RE.test(hex || '')) return '#fff';
        const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
    }
    // ---- Íconos de los rangos: Font Awesome (fa:), marcas (fab:), emoji (emoji:) o imagen propia (img:) ----
    const ICON_LIB = window.SD_ICONS || { solid: [], brands: [], es: {}, emojis: [] };
    const FA_SOLID = new Set(ICON_LIB.solid.flatMap(e => e.split('|')));
    const FA_BRANDS = new Set(ICON_LIB.brands.flatMap(e => e.split('|')));
    const EMOJI_RE = /^[^\x00-\x7F]{1,16}$/u;
    const IMG_ID_RE = /^[a-z0-9]{6,24}$/;
    function cleanIcon(v) {
        v = String(v || '');
        if (FA_SOLID.has(v)) return 'fa:' + v; // formato viejo: solo el nombre
        const m = /^(fa|fab|emoji|img):(.+)$/u.exec(v);
        if (!m) return 'fa:star';
        if (m[1] === 'fa' && FA_SOLID.has(m[2])) return v;
        if (m[1] === 'fab' && FA_BRANDS.has(m[2])) return v;
        if (m[1] === 'emoji' && EMOJI_RE.test(m[2])) return v;
        if (m[1] === 'img' && IMG_ID_RE.test(m[2])) return v;
        return 'fa:star';
    }
    // Imágenes propias: se guardan en esta PC (como el sonido propio) y se cargan una vez
    const customIconUrls = {};
    function loadCustomIcons() {
        if (!window.SDStore) return Promise.resolve();
        const list = Array.isArray(state.settings.customIcons) ? state.settings.customIcons : [];
        return Promise.all(list.map(ic => customIconUrls[ic.id] ? null : SDStore.get('icon:' + ic.id).then(blob => {
            if (blob) customIconUrls[ic.id] = URL.createObjectURL(blob);
        }).catch(() => {}))).then(() => { if (typeof render === 'function') render(); });
    }
    function iconHTML(icon, count) {
        icon = cleanIcon(icon);
        const n = Math.min(5, Math.max(1, parseInt(count) || 1));
        const [kind, val] = [icon.slice(0, icon.indexOf(':')), icon.slice(icon.indexOf(':') + 1)];
        let one;
        if (kind === 'fa') one = `<i class="fa-solid fa-${val}"></i>`;
        else if (kind === 'fab') one = `<i class="fa-brands fa-${val}"></i>`;
        else if (kind === 'emoji') one = `<span class="rank-emoji">${escapeHTML(val)}</span>`;
        else one = customIconUrls[val] ? `<img class="rank-img" src="${customIconUrls[val]}" alt="">` : `<i class="fa-solid fa-image"></i>`;
        return Array.from({ length: n }, () => one).join('');
    }
    const LAYOUT_SPOTS = ['name', 'below', 'right', 'hidden'];
    const LAYOUT_DEFAULT = { amount: 'right', platform: 'right', rankIcons: 'name', rankName: 'name' };
    function cleanObsLayout(o) {
        o = o && typeof o === 'object' ? o : {};
        const out = {};
        Object.keys(LAYOUT_DEFAULT).forEach(k => { out[k] = LAYOUT_SPOTS.includes(o[k]) ? o[k] : LAYOUT_DEFAULT[k]; });
        return out;
    }
    function cleanAmtColors(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(r => r && typeof r === 'object').slice(0, 10).map(r => ({
            min: Math.max(0, Math.round(parseFloat(r.min) || 0)),
            color: HEX_RE.test(r.color || '') ? r.color : '#34D399'
        }));
    }
    function cleanRanks(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(r => r && typeof r === 'object').slice(0, 10).map(r => ({
            name: String(r.name || '').replace(/[<>]/g, '').trim().slice(0, 24) || 'Rango',
            mode: r.mode === 'manual' ? 'manual' : 'auto', // 'auto' = por monto donado, 'manual' = lo das vos
            min: Math.max(0, Math.round(parseFloat(r.min) || 0)),
            users: String(r.users || '').split(/[\n,]+/).map(u => u.trim().replace(/^@+/, '').replace(/[<>]/g, '').slice(0, 60)).filter(Boolean).slice(0, 500).join('\n'),
            icon: cleanIcon(r.icon),
            color: HEX_RE.test(r.color || '') ? r.color : '#60A5FA',
            count: Math.min(5, Math.max(1, parseInt(r.count) || 1)),
            style: /^[a-z0-9-]{1,40}$/.test(r.style || '') ? r.style : '',
            badgeColor: HEX_RE.test(r.badgeColor || '') ? r.badgeColor : '', // color del cartel con el nombre ('' = el del rango)
            badgeFx: RANK_FX.includes(r.badgeFx) ? r.badgeFx : 'none'
        }));
    }

    // Cargar configuraciones guardadas de localStorage
    const SETTINGS_DEFAULTS = JSON.parse(JSON.stringify(state.settings));
    let savedFxOn = false; // tenía prendido el "efecto para donaciones grandes" de antes de los estilos
    try {
        const saved = localStorage.getItem('streamdonations_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { state.settings = { ...state.settings, ...parsed }; savedFxOn = parsed.fxEnabled === true && !Array.isArray(parsed.styles); }
        }
    } catch (e) {}
    // Cada opción tiene que ser del tipo que espera la app (una copia vieja, rota o armada a propósito no la rompe)
    Object.keys(SETTINGS_DEFAULTS).forEach(k => {
        const def = SETTINGS_DEFAULTS[k], v = state.settings[k];
        if (def === null || def === undefined || v === undefined) return;
        if (typeof def === 'boolean' && typeof v !== 'boolean') state.settings[k] = def;
        else if (typeof def === 'string' && typeof v !== 'string') state.settings[k] = def;
        else if (typeof def === 'number' && !(typeof v === 'number' && isFinite(v))) {
            const n = Number(v);
            state.settings[k] = (v !== '' && v !== null && isFinite(n)) ? n : def;
        }
        else if (Array.isArray(def) && !Array.isArray(v)) state.settings[k] = def;
        else if (def && typeof def === 'object' && !Array.isArray(def) && (!v || typeof v !== 'object' || Array.isArray(v))) state.settings[k] = def;
    });
    {
        const PL = ['youtube', 'twitch', 'kick'];
        const chs = Array.isArray(state.settings.seChannels) ? state.settings.seChannels : [];
        state.settings.seChannels = chs.filter(c => c && typeof c === 'object').slice(0, 6).map(c => ({
            label: String(c.label || '').slice(0, 40),
            token: String(c.token || '').trim().slice(0, 4000),
            platform: ['auto', 'none', ...PL].includes(c.platform) ? c.platform : 'auto',
            detected: PL.includes(c.detected) ? c.detected : ''
        }));
        if (typeof state.settings.slToken !== 'string') state.settings.slToken = '';
        if (Array.isArray(state.settings.splitColumns)) state.settings.splitColumns = state.settings.splitColumns.filter(k => ['ceneka', ...PL].includes(k));
        if (state.settings.language !== 'en') state.settings.language = 'es';
        state.settings.fxType = FX_TYPES.includes(state.settings.fxType) ? state.settings.fxType : 'pulse';
        state.settings.fxColor = HEX_RE.test(state.settings.fxColor || '') ? state.settings.fxColor : '#FFD700';
        state.settings.customIcons = (Array.isArray(state.settings.customIcons) ? state.settings.customIcons : [])
            .filter(ic => ic && IMG_ID_RE.test(ic.id || '')).slice(0, 40).map(ic => ({ id: ic.id, name: String(ic.name || '').replace(/[<>]/g, '').slice(0, 60) }));
        // 1.11: estilos. Lo que estaba en "efecto para donaciones grandes" pasa a ser un estilo
        if (!Array.isArray(state.settings.styles)) {
            state.settings.styles = JSON.parse(JSON.stringify(DEFAULT_STYLES));
            if (savedFxOn && state.settings.fxType) {
                const t = FX_TYPES.includes(state.settings.fxType) ? state.settings.fxType : 'pulse';
                if (t === 'rainbow') state.settings.fxStyle = 'arcoiris';
                else { state.settings.styles.unshift({ id: 'grande', name: 'Donación grande', parts: { card: sp(t, state.settings.fxColor) } }); state.settings.fxStyle = 'grande'; }
            }
        }
        state.settings._styles111 = true;
        state.settings.styles = cleanStyles(state.settings.styles);
        if (state.settings.fxStyle && !state.settings.styles.some(x => x.id === state.settings.fxStyle)) state.settings.fxStyle = '';
        state.settings.ranks = cleanRanks(state.settings.ranks);
        state.settings.amtColors = cleanAmtColors(state.settings.amtColors);
        state.settings.obsLayout = cleanObsLayout(state.settings.obsLayout);
        ['obsPlatformStyle', 'panelPlatformStyle'].forEach(k => { if (!['tag', 'color', 'both'].includes(state.settings[k])) state.settings[k] = 'tag'; });
    }
    if (state.settings.hideLinksInObs === false && !state.settings._migratedObsLinks) {
        state.settings.obsLinkMode = 'full';
    }
    state.settings._migratedObsLinks = true;
    delete state.settings.hideLinksInObs;
    if (state.settings.obsMinAmount === null || state.settings.obsMinAmount === undefined) {
        state.settings.obsMinAmount = state.settings.minDisplayAmount || 0;
    }
    if (!Array.isArray(state.settings.splitColumns)) state.settings.splitColumns = [];
    delete state.settings.platforms;
    if (!Array.isArray(state.settings.seChannels)) state.settings.seChannels = [];
    // Los colores guardados tienen que ser colores (#RRGGBB): se usan dentro de estilos
    ['customAccent', 'obsCustomAccent'].forEach(k => {
        if (state.settings[k] !== undefined && !/^#[0-9a-fA-F]{6}$/.test(state.settings[k] || '')) delete state.settings[k];
    });
    // Simulador: ahora por defecto una donación cada 5 segundos
    if (!state.settings._sim5Migrated) {
        if (!state.settings.simSpeed || state.settings.simSpeed === 4) state.settings.simSpeed = 5;
        state.settings._sim5Migrated = true;
    }
    // 1.10.2: simulador cada 10 segundos, y sonido y voz arrancan apagados (se prenden con los botones del encabezado)
    if (!state.settings._defaults1102) {
        if (!state.settings.simSpeed || state.settings.simSpeed === 5) state.settings.simSpeed = 10;
        state.settings.soundEnabled = false;
        state.settings.ttsEnabled = false;
        state.settings._defaults1102 = true;
        try { localStorage.setItem('streamdonations_settings', JSON.stringify(state.settings)); } catch (e) {}
    }
    if (!state.settings._obsStayMigrated) {
        state.settings.obsDuration = 0; // por defecto las alertas quedan en OBS hasta marcarlas como leídas
        state.settings._obsStayMigrated = true;
    }
    state.layout = state.settings.layout === 'split' ? 'split' : 'unified';
    document.documentElement.classList.toggle('hotkeys-off', !state.settings.hotkeys);
    state.soundEnabled = state.settings.soundEnabled === true;
    state.ttsEnabled = state.settings.ttsEnabled === true;
    state.showAmounts = !!state.settings.showAmounts;

    function persistSettings() {
        try {
            localStorage.setItem('streamdonations_settings', JSON.stringify(state.settings));
        } catch (e) {}
    }
    persistSettings(); // fija sessionStart/goalStart la primera vez

    // Función de persistencia automática en base de datos local
    function saveDonationsToStorage() {
        if (typeof syncNoteChanges === 'function') { try { syncNoteChanges(); } catch (e) {} }
        if (state.settings.autoSaveDb !== false) {
            try {
                localStorage.setItem('streamdonations_chats_db', JSON.stringify(state.donations));
            } catch (e) {
                console.error('Error guardando en base de datos local:', e);
            }
        }
    }

    // --- Audio Context for Sound Effects ---
    let audioCtx = null;

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    document.body.addEventListener('click', () => {
        initAudioContext();
    }, { once: false });

    // --- Sonido de alerta: sonidos propios o un archivo de la PC (uno normal y uno "especial") ---
    const customSounds = {}; // clave del archivo -> { ver, url }
    function loadCustomSound(ver, key) {
        key = key || 'alertSound';
        const c = customSounds[key] || (customSounds[key] = { ver: -1, url: null });
        if (!window.SDStore || ver === c.ver) return Promise.resolve(c.url);
        c.ver = ver;
        return SDStore.get(key).then(blob => {
            if (c.url) URL.revokeObjectURL(c.url);
            c.url = blob ? URL.createObjectURL(blob) : null;
            return c.url;
        });
    }
    let playingCustom = null;

    function tone(type, freqs, step, dur, vol, start) {
        const now = audioCtx.currentTime + (start || 0);
        freqs.forEach((f, i) => {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f, now + i * step);
            gain.gain.setValueAtTime(0.0001, now + i * step);
            gain.gain.exponentialRampToValueAtTime(vol, now + i * step + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * step + dur);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * step); osc.stop(now + i * step + dur + 0.02);
        });
    }

    // maxSecs: el sonido de la PC se corta a los X segundos (0 = completo)
    function playSoundChoice(choice, tier, volume, ver, key, maxSecs) {
        const vol = clampNum(volume, 0, 1, 0.8);
        if (vol <= 0) return;
        const big = tier && /red|ruby|magenta|pink/.test(tier);
        if (choice === 'pc') {
            loadCustomSound(ver || 0, key).then(url => {
                if (!url) { playSoundChoice(key === 'alertSoundBig' ? 'fanfarria' : 'campana', tier, vol); return; }
                if (playingCustom) { try { playingCustom.pause(); } catch (e) {} }
                const a = new Audio(url);
                a.volume = vol;
                playingCustom = a;
                const secs = parseFloat(maxSecs) || 0;
                if (secs > 0) {
                    // Baja el volumen en el último cuarto de segundo para que no corte de golpe
                    setTimeout(() => { if (playingCustom === a) a.volume = vol * 0.4; }, Math.max(0, secs * 1000 - 250));
                    setTimeout(() => { try { a.pause(); } catch (e) {} if (playingCustom === a) playingCustom = null; }, secs * 1000);
                }
                a.play().catch(() => {});
            });
            return;
        }
        initAudioContext();
        if (choice === 'pop') {
            // Un "pop" muy corto
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(big ? 900 : 700, now);
            osc.frequency.exponentialRampToValueAtTime(big ? 1800 : 1400, now + 0.06);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.35 * vol, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.14);
        } else if (choice === 'ding') {
            // Una sola nota corta
            tone('sine', [big ? 1567.98 : 1318.5], 0, 0.28, 0.3 * vol);
        } else if (choice === 'gota') {
            // Gota de agua
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(big ? 500 : 400, now + 0.15);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.4 * vol, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + 0.2);
        } else if (choice === 'fanfarria') {
            // Fanfarria corta de festejo (pensada para el sonido especial)
            tone('triangle', [523.3, 659.3, 784], 0.11, 0.2, 0.32 * vol);
            tone('triangle', [1046.5], 0, 0.6, 0.34 * vol, 0.36);
            tone('sine', [1318.5], 0, 0.55, 0.18 * vol, 0.38);
        } else if (choice === 'moneda') {
            // Dos notas cortas y brillantes, como una moneda
            tone('square', big ? [1318.5, 1975.5] : [987.8, 1318.5], 0.08, big ? 0.45 : 0.35, 0.12 * vol);
        } else if (choice === 'arcade') {
            // Arpegio rápido hacia arriba
            tone('triangle', big ? [523.3, 659.3, 784, 1046.5, 1318.5] : [523.3, 659.3, 784, 1046.5], 0.06, 0.18, 0.35 * vol);
        } else {
            // Campanita (el sonido de siempre)
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            let f1 = 523.25, f2 = 659.25, f3 = 783.99;
            if (big) { f1 = 659.25; f2 = 783.99; f3 = 1046.50; }
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f1, now);
            osc.frequency.exponentialRampToValueAtTime(f2, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(f3, now + 0.2);
            gain.gain.setValueAtTime(0.3 * vol / 0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now); osc.stop(now + 0.5);
        }
    }

    // ---- Efecto para donaciones grandes ----
    function fxFor(d, where) {
        const st = state.settings;
        if (!d || !st.fxEnabled || (where === 'obs' ? st.fxObs === false : st.fxPanel === false)) return null;
        const min = parseFloat(st.fxMin) || 0;
        const ars = toARS(d);
        if (ars === null || ars < min || (min <= 0 && ars <= 0)) return null;
        return st.fxStyle ? { style: st.fxStyle } : null;
    }
    function styleById(id, list) { return (list || state.settings.styles || []).find(x => x.id === id) || null; }
    // Partes con efecto para esta donación: primero las del estilo del rango; la donación grande pisa las que también tenga
    function mergedStyle(d, where, rank) {
        const out = {};
        if (rank === undefined) rank = d && !d.blocked ? rankFor(d.nick, where) : null;
        const rs = rank && rank.style ? styleById(rank.style) : null;
        if (rs) Object.assign(out, rs.parts);
        const big = fxFor(d, where);
        const bs = big ? styleById(big.style) : null;
        if (bs) Object.assign(out, bs.parts);
        return Object.keys(out).length ? out : null;
    }
    const ringHTML = (p) => p ? `<span class="sfx-ring sfx-${p.fx}" style="${partVars(p)}" aria-hidden="true"></span>` : '';
    const tfxAttr = (p) => p ? { cls: ` tfx tfx-${p.fx}`, style: partVars(p) } : { cls: '', style: '' };

    // ---- Color del monto según cuánto donó ----
    function amountColor(d, where) {
        const st = state.settings;
        if (!d || !st.amtColorsEnabled || (where === 'obs' ? st.amtColorsObs === false : st.amtColorsPanel === false)) return '';
        const ars = toARS(d);
        if (ars === null || ars <= 0) return '';
        let best = null;
        (st.amtColors || []).forEach(r => { if (ars >= r.min && (!best || r.min >= best.min)) best = r; });
        return best && HEX_RE.test(best.color) ? best.color : '';
    }

    // ---- Rangos de donadores: lo donado por cada nombre en los últimos N días (en pesos) ----
    let rankCache = { key: '', totals: new Map() };
    function donorTotals() {
        const st = state.settings;
        const days = Math.min(3650, Math.max(1, parseInt(st.ranksDays) || 30));
        const dayKey = Math.floor(Date.now() / 3600000); // se recalcula al menos cada hora
        const last = state.donations[0];
        const key = [state.donations.length, last && last.id, days, dayKey, st.usdRate, st.kickUsd].join('|');
        if (rankCache.key === key) return rankCache.totals;
        const since = Date.now() - days * 86400000;
        const totals = new Map();
        state.donations.forEach(d => {
            if (d.isTest || (d.timestamp || 0) < since) return;
            const v = toARS(d);
            if (!v || v <= 0) return;
            const k = nickKey(d.nick);
            if (k) totals.set(k, (totals.get(k) || 0) + v);
        });
        rankCache = { key, totals };
        return totals;
    }
    function rankFor(nick, where) {
        const st = state.settings;
        if (!st.ranksEnabled || (where === 'obs' ? st.ranksObs === false : st.ranksPanel === false)) return null;
        const key = nickKey(nick);
        if (!key) return null;
        const total = donorTotals().get(key) || 0;
        // Un rango dado a mano gana sobre el que se ganó por monto
        let best = (st.ranks || []).find(r => r.mode === 'manual' && manualUsers(r).has(key)) || null;
        if (!best && total > 0) {
            (st.ranks || []).forEach(r => { if (r.mode !== 'manual' && total >= r.min && r.min > 0 && (!best || r.min > best.min)) best = r; });
        }
        return best ? { name: best.name, icon: best.icon, color: best.color, count: best.count, total, manual: best.mode === 'manual',
            badgeColor: best.badgeColor || '', badgeFx: best.badgeFx || 'none', style: best.style || '', showName: st.ranksShowName !== false } : null;
    }
    const manualCache = new WeakMap();
    function manualUsers(r) {
        let c = manualCache.get(r);
        if (!c || c.src !== r.users) { c = { src: r.users, set: new Set(String(r.users || '').split(/\n+/).map(nickKey).filter(Boolean)) }; manualCache.set(r, c); }
        return c.set;
    }
    // Dar o quitar un rango "a mano" a una persona
    function setManualRank(nick, rankIdx) {
        const key = nickKey(nick), name = String(nick || '').trim().replace(/^@+/, '');
        if (!key) return;
        (state.settings.ranks || []).forEach((r, i) => {
            if (r.mode !== 'manual') return;
            const lines = String(r.users || '').split(/\n+/).map(x => x.trim()).filter(x => x && nickKey(x) !== key);
            if (i === rankIdx) lines.push(name);
            r.users = lines.join('\n');
        });
        persistSettings();
    }
    function rankNameHTML(r, part) {
        const bg = HEX_RE.test(r.badgeColor || '') ? r.badgeColor : '';
        let vars = bg ? `--badge-bg:${bg};--badge-ink:${inkFor(bg)}` : '';
        let fx = '';
        if (part) { fx = ` bfx bfx-${part.fx}`; vars += (vars ? ';' : '') + partVars(part); }
        else if (RANK_FX.includes(r.badgeFx) && r.badgeFx !== 'none') fx = ` rank-fx-${r.badgeFx}`; // rangos de antes de los estilos
        return `<span class="rank-name${bg ? ' has-bg' : ''}${fx}"${vars ? ` style="${vars}"` : ''}>${escapeHTML(r.name)}</span>`;
    }
    function rankBadgeHTML(r, part) {
        if (!r) return '';
        const icons = iconHTML(r.icon, r.count);
        const days = parseInt(state.settings.ranksDays) || 30;
        const tip = r.manual ? `${r.name} · rango dado a mano` : `${r.name} · ${formatMoney(Math.round(r.total), 'ARS')} en ${days} días`;
        return `<span class="rank-badge" style="--rank-color:${r.color}" title="${escapeHTML(tip)}">${icons}${r.showName ? rankNameHTML(r, part) : ''}</span>`;
    }

    // ¿Esta donación llega al monto del sonido especial? (en pesos; dólares, Bits y KICKs necesitan la cotización)
    function isBigDonation(d) {
        const st = state.settings;
        if (!d || !st.bigSoundEnabled) return false;
        const min = parseFloat(st.bigSoundMin) || 0;
        if (min <= 0) return false;
        const ars = toARS(d);
        return ars !== null && ars >= min;
    }
    function playDonationSound(tier, donation) {
        if (!state.soundEnabled) return;
        try {
            const st = state.settings;
            if (isBigDonation(donation)) {
                playSoundChoice(st.bigSoundChoice || 'fanfarria', tier, st.bigSoundVolume ?? st.soundVolume ?? 0.8, st.bigSoundFileVer || 0, 'alertSoundBig', st.bigSoundMaxSecs ?? 0);
                return;
            }
            playSoundChoice(st.soundChoice || 'campana', tier, st.soundVolume ?? 0.8, st.soundFileVer || 0, 'alertSound', st.soundMaxSecs ?? 3);
        } catch (e) {
            console.warn('Audio playback blocked or error:', e);
        }
    }

    // --- Text-To-Speech (TTS) Engine ---
    let availableVoices = [];

    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        availableVoices = window.speechSynthesis.getVoices();
        
        const best = rankSpanishVoices(availableVoices)[0];
        state.selectedVoice = best || availableVoices[0] || null;
    }

    // Ordena las voces en español de mejor a peor para Chrome:
    // primero las de Google (más naturales que las de Windows), luego por acento:
    // Argentina > Latinoamérica/EE.UU. > México > resto > España
    const UI_EN = window.SD_LANG === 'en';
    const T = (txt) => (window.SDi18n ? window.SDi18n.t(txt) : txt);
    function voiceScore(v) {
        const lang = (v.lang || '').toLowerCase().replace('_', '-');
        const name = (v.name || '').toLowerCase();
        if (UI_EN) {
            // En inglés: voces en inglés, primero las de Google / naturales
            if (!lang.startsWith('en') && !name.includes('english')) return -1;
            let sc = 0;
            if (name.includes('google')) sc += 100;
            if (name.includes('natural') || name.includes('online')) sc += 80;
            if (lang === 'en-us') sc += 30; else if (lang === 'en-gb') sc += 20; else sc += 10;
            if (v.localService === false) sc += 5;
            return sc;
        }
        if (!lang.startsWith('es') && !name.includes('spanish') && !name.includes('español')) return -1;
        let score = 0;
        if (name.includes('google')) score += 100;
        if (name.includes('natural') || name.includes('online')) score += 80;
        if (lang === 'es-ar') score += 40;
        else if (lang === 'es-419' || lang === 'es-us') score += 30;
        else if (lang === 'es-mx') score += 25;
        else if (lang === 'es-es') score += 5;
        else score += 15;
        if (v.localService === false) score += 5; // voces "de red" suelen sonar mejor
        return score;
    }

    function rankSpanishVoices(voices) {
        return (voices || [])
            .map(v => ({ v, score: voiceScore(v) }))
            .filter(x => x.score >= 0)
            .sort((a, b) => b.score - a.score)
            .map(x => x.v);
    }

    // Chrome corta las lecturas largas (~15 segundos) con las voces de Google.
    // Se divide el texto en frases cortas que se leen una detrás de otra.
    function splitForSpeech(text, maxLen = 160) {
        // Corta solo donde termina una frase (signo seguido de espacio), así "youtube.com" no se parte
        const parts = String(text).split(/(?<=[.!?;:])\s+/);
        const chunks = [];
        let current = '';
        parts.forEach(part => {
            part = part.trim();
            if (!part) return;
            if (part.length > maxLen) {
                // frase muy larga: cortar por comas o espacios
                part.split(/(?<=,)\s+|\s+/).forEach(word => {
                    if ((current + ' ' + word).trim().length > maxLen) { if (current) chunks.push(current.trim()); current = word; }
                    else current = (current + ' ' + word).trim();
                });
                return;
            }
            if ((current + ' ' + part).trim().length > maxLen) { if (current) chunks.push(current.trim()); current = part; }
            else current = (current + ' ' + part).trim();
        });
        if (current.trim()) chunks.push(current.trim());
        return chunks.length ? chunks : [String(text)];
    }

    if ('speechSynthesis' in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // force = leer aunque la voz automática esté apagada o el monto sea menor al mínimo
    // interrupt = cortar lo que se esté leyendo (lecturas manuales). Las automáticas se encolan.
    function speakDonation(donation, force = false, interrupt = false) {
        if (!('speechSynthesis' in window)) return;
        if (!force) {
            if (!state.ttsEnabled) return;
            if (belowMin(donation, state.settings.minTts)) return;
            // Las donaciones de prueba no se acumulan: si la voz todavía está leyendo, esta se saltea
            if (donation.isTest && ttsBusy()) return;
        }

        try {
            if (interrupt) stopAllSpeech();

            const amountText = isForeignCurrency(donation)
                ? donation.formattedAmount
                : `${Math.round(donation.amount)} pesos`;
            const who = censorText(donation.nick, 'tts'), said = spokenMessage(censorText(donation.message, 'tts'));
            const text = UI_EN ? `${who} sent ${amountText}. ${said}` : `${who} ha enviado ${amountText}. ${said}`;
            speakText(text, false);
        } catch (e) {
            console.warn('TTS speech blocked:', e);
        }
    }

    // Cantidad de frases en cola para leer (para no acumular lecturas de prueba)
    var speechPending = 0;
    var speechQueue = [];        // frases que todavía no terminaron de leerse
    var lastSpeechProgress = 0;  // última vez que la voz arrancó o terminó una frase
    function stopAllSpeech() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        stopLocalSpeech();
        speechPending = 0;
        speechQueue = [];
    }
    // Vigilante: Chrome a veces deja la voz trabada (por ejemplo después de unos 15 segundos seguidos de lectura,
    // o cuando la ventana queda detrás de otra como la de OBS). Si pasa, se destraba y se sigue leyendo lo pendiente.
    setInterval(() => {
        if (!('speechSynthesis' in window)) return;
        const syn = window.speechSynthesis;
        // Mantener viva la voz en lecturas largas (truco conocido para las voces "Google")
        if (syn.speaking && !syn.paused && speechQueue.length && speechQueue[0].network) { try { syn.pause(); syn.resume(); } catch (e) {} }
        if (!speechPending) return;
        const head = speechQueue[0];
        const limit = head ? Math.max(12000, 4000 + head.text.length * 110 / clampNum(state.settings.voiceRate, 0.5, 2, 1)) : 12000;
        if (Date.now() - lastSpeechProgress < limit) return;
        console.warn('[voz] trabada: se reinicia y se sigue con lo pendiente');
        const pending = speechQueue.slice(head && head.started ? 1 : 0).map(q => q.text);
        syn.cancel();
        speechPending = 0; speechQueue = [];
        lastSpeechProgress = Date.now();
        if (pending.length) setTimeout(() => speakWeb(pending.join(' '), currentVoiceName()), 300);
    }, 3000);
    function ttsBusy() {
        return speechPending > 0 || !!localPlaying || ('speechSynthesis' in window && window.speechSynthesis.speaking);
    }

    // --- Voces incluidas en el programa de escritorio (Piper, funcionan sin internet) ---
    var DESKTOP_TTS = window.desktopTTS || null;
    var LOCAL_VOICES = DESKTOP_TTS ? (DESKTOP_TTS.voices() || []) : [];
    var localQueue = [], localPlaying = null, localGen = 0, localBroken = false;

    function isLocalVoice(name) { return !!DESKTOP_TTS && /^local:/.test(name || ''); }
    // Voz a usar: la elegida, o en el programa de escritorio la primera incluida (Daniela)
    function currentVoiceName() {
        const n = state.settings.voiceName || '';
        if (n && isLocalVoice(n) && !LOCAL_VOICES.some(v => 'local:' + v.id === n)) return LOCAL_VOICES.length ? 'local:' + LOCAL_VOICES[0].id : '';
        if (!n && LOCAL_VOICES.length) return 'local:' + LOCAL_VOICES[0].id;
        return n;
    }

    function speakLocal(text, voiceId) {
        const rate = clampNum(state.settings.voiceRate, 0.5, 2, 1);
        const pitch = clampNum(state.settings.voicePitch, 0.5, 1.5, 1);
        const volume = clampNum(state.settings.voiceVolume, 0, 1, 1);
        // El tono se logra acelerando/frenando el audio; la velocidad se compensa al generar la voz
        const lengthScale = Math.min(2.5, Math.max(0.4, pitch / rate));
        splitForSpeech(text, 260).forEach(chunk => {
            speechPending++;
            localQueue.push({
                gen: localGen, pitch, volume, text: chunk,
                audioPromise: DESKTOP_TTS.synth(voiceId, chunk, lengthScale)
            });
        });
        pumpLocalSpeech();
    }

    function pumpLocalSpeech() {
        if (localPlaying || !localQueue.length) return;
        const item = localQueue.shift();
        localPlaying = item;
        const done = () => {
            if (item.done) return;
            item.done = true;
            if (item.gen === localGen) speechPending = Math.max(0, speechPending - 1);
            if (localPlaying === item) localPlaying = null;
            pumpLocalSpeech();
        };
        item.audioPromise.then(buf => {
            if (item.gen !== localGen || !buf) return done();
            const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
            const a = new Audio(url);
            a.volume = item.volume;
            a.preservesPitch = false;
            a.playbackRate = item.pitch;
            item.audio = a;
            a.onended = a.onerror = () => { URL.revokeObjectURL(url); done(); };
            a.play().catch(done);
        }).catch(err => {
            console.warn('Voz incluida: error', err);
            // Si la voz incluida falla, se avisa una vez y se sigue con una voz de Windows
            if (!localBroken && item.gen === localGen) {
                localBroken = true;
                const why = String(err && err.message || err).replace(/^Error invoking remote method 'tts-synth': (Error: )?/, '');
                showToast('⚠️ La voz Daniela no pudo arrancar, se usa una voz de Windows. Detalle: ' + escapeHTML(why).slice(0, 220), 'warning');
            }
            if (item.gen === localGen) {
                const pend = localQueue.splice(0).map(q => q.text);
                speechPending = Math.max(0, speechPending - pend.length);
                speakWeb([item.text].concat(pend).join(' '));
            }
            done();
        });
    }

    function stopLocalSpeech() {
        localGen++;
        localQueue = [];
        if (localPlaying) {
            try { if (localPlaying.audio) localPlaying.audio.pause(); } catch (e) {}
            localPlaying.done = true;
            localPlaying = null;
        }
    }

    // Lee un texto cualquiera con la voz y los ajustes elegidos
    function speakText(text, interrupt = true) {
        if (!('speechSynthesis' in window)) return;
        try {
            if (interrupt) stopAllSpeech();
            const vname = currentVoiceName();
            if (isLocalVoice(vname) && !localBroken) {
                speakLocal(text, vname.slice(6));
                return;
            }
            speakWeb(text, isLocalVoice(vname) ? '' : vname);
        } catch (e) {
            console.warn('TTS speech blocked:', e);
        }
    }

    // Lectura con las voces del navegador / de Windows
    function speakWeb(text, vname) {
        try {
            const voice = getVoiceByName(vname) || state.selectedVoice;
            if (!speechPending) lastSpeechProgress = Date.now();
            splitForSpeech(text).forEach(chunk => {
                const utterance = new SpeechSynthesisUtterance(chunk);
                const entry = { text: chunk, started: false, network: !!(voice && voice.localService === false) };
                speechPending++;
                speechQueue.push(entry);
                utterance.onstart = () => { entry.started = true; lastSpeechProgress = Date.now(); };
                utterance.onend = utterance.onerror = () => {
                    speechPending = Math.max(0, speechPending - 1);
                    const k = speechQueue.indexOf(entry); if (k >= 0) speechQueue.splice(k, 1);
                    lastSpeechProgress = Date.now();
                };
                if (voice) {
                    utterance.voice = voice;
                    utterance.lang = voice.lang;
                } else {
                    utterance.lang = UI_EN ? 'en-US' : 'es-AR';
                }
                utterance.rate = clampNum(state.settings.voiceRate, 0.5, 2, 1);
                utterance.pitch = clampNum(state.settings.voicePitch, 0.5, 1.5, 1);
                utterance.volume = clampNum(state.settings.voiceVolume, 0, 1, 1);
                window.speechSynthesis.speak(utterance);
            });
            // Chrome a veces deja la voz "pausada" después de un rato: la reactivamos
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        } catch (e) {
            console.warn('TTS speech blocked:', e);
        }
    }

    function clampNum(v, min, max, def) {
        const n = parseFloat(v);
        if (isNaN(n)) return def;
        return Math.min(max, Math.max(min, n));
    }

    function getVoiceByName(name) {
        if (!name || !('speechSynthesis' in window)) return null;
        return window.speechSynthesis.getVoices().find(v => v.name === name) || null;
    }

    // --- Tier Calculation Helpers (YouTube & Ceneka) ---
    function isForeignCurrency(d) {
        return !!(d && d.currency && String(d.currency).toUpperCase() !== 'ARS');
    }

    // --- Plataformas soportadas ---
    const PLATFORMS = {
        ceneka:  { label: 'Ceneka',  icon: 'fa-solid fa-mug-hot',     color: 'var(--ceneka-purple)', column: 'Donaciones Ceneka',      unit: 'donaciones' },
        youtube: { label: 'YouTube', icon: 'fa-brands fa-youtube',    color: 'var(--youtube-red)',   column: 'Super Chats de YouTube', unit: 'Super Chats' },
        twitch:  { label: 'Twitch',  icon: 'fa-brands fa-twitch',     color: 'var(--twitch-purple)', column: 'Bits de Twitch',         unit: 'Bits' },
        kick:    { label: 'Kick',    icon: 'fa-solid fa-bolt',        color: 'var(--kick-green)',    column: 'KICKs de Kick',          unit: 'KICKs' }
    };
    const PLATFORM_KEYS = Object.keys(PLATFORMS);
    function platformKey(p) { return PLATFORMS[p] ? p : 'ceneka'; }
    function platformInfo(p) { return PLATFORMS[platformKey(p)]; }
    // Plataforma de un canal de StreamElements: la elegida a mano, la detectada o la que sugiere el nombre
    function guessPlatformFromLabel(label) {
        const l = String(label || '').toLowerCase();
        if (/you ?tube|\byt\b/.test(l)) return 'youtube';
        if (/twitch/.test(l)) return 'twitch';
        if (/kick/.test(l)) return 'kick';
        return '';
    }
    function channelPlatform(ch) {
        if (!ch) return '';
        if (ch.platform && ch.platform !== 'auto') return ch.platform === 'none' ? '' : ch.platform;
        return ch.detected || guessPlatformFromLabel(ch.label);
    }

    // Plataformas con una conexión agregada y funcionando (canal con token y sin error).
    // Ceneka cuenta si hay cualquier conexión, porque sus donaciones llegan por el canal vinculado.
    function linkedPlatforms() {
        const set = new Set();
        let configured = false;
        (state.settings.seChannels || []).forEach((ch, i) => {
            const token = String(ch.token || '').trim();
            if (!token) return;
            configured = true;
            const conn = (typeof seConns !== 'undefined' ? seConns : []).find(c => c.index === i && c.token === token);
            if (conn && conn.status === 'error') return;
            set.add('ceneka');
            const p = channelPlatform(ch);
            if (p) set.add(p);
        });
        if ((state.settings.slToken || '').trim()) {
            configured = true;
            if (state.streamlabs.status !== 'error') {
                set.add('ceneka');
                (state.settings.slPlatforms || []).forEach(p => set.add(p));
            }
        }
        return { set, configured };
    }

    // Plataformas que se muestran (feed, columnas, estadísticas y OBS).
    // Sin ninguna conexión cargada se muestran todas, para no dejar la app vacía.
    function visiblePlatforms() {
        const { set, configured } = linkedPlatforms();
        if (!configured) return PLATFORM_KEYS.slice();
        // Las pruebas siempre se ven (simulador / donaciones de prueba)
        state.donations.forEach(d => { if (d.isTest) set.add(platformKey(d.platform)); });
        return PLATFORM_KEYS.filter(k => set.has(k));
    }
    function isVisiblePlatform(p) { return visiblePlatforms().includes(platformKey(p)); }

    // Plataformas "en uso" para las estadísticas y las pruebas
    function activePlatforms() {
        return visiblePlatforms();
    }

    // Cuando cambian las conexiones, se rearma lo que depende de las plataformas
    var lastVisibleKey = '';
    function refreshPlatformVisibility() {
        const key = visiblePlatforms().join(',');
        if (key === lastVisibleKey) return;
        lastVisibleKey = key;
        if (typeof buildPlatformUI === 'function' && typeof statsPlatformsKey !== 'undefined') {
            try { buildPlatformUI(); } catch (e) {}
        }
        if (typeof sendObsStyle === 'function') { try { sendObsStyle(); } catch (e) {} }
    }
    // Para pruebas y simulador: las plataformas en uso, o todas si todavía no hay ninguna
    function testPlatforms() {
        const a = activePlatforms();
        return a.length ? a : PLATFORM_KEYS.slice();
    }

    // Valor en dólares de una donación (null si no se puede calcular)
    function toUSD(d) {
        const amount = parseFloat(d.amount) || 0;
        const cur = String(d.currency || 'ARS').toUpperCase();
        if (cur === 'USD') return amount;
        if (cur === 'BITS') return amount * 0.01; // 1 Bit = US$0,01 para el streamer
        if (cur === 'KICKS') return amount * (parseFloat(state.settings.kickUsd) || 0);
        return null;
    }

    // Valor en pesos de una donación. Devuelve null si está en otra moneda y no hay cotización cargada.
    function toARS(d) {
        if (!d) return 0;
        const amount = parseFloat(d.amount) || 0;
        if (!isForeignCurrency(d)) return amount;
        const rate = parseFloat(state.settings.usdRate) || 0;
        const usd = toUSD(d);
        if (usd !== null && rate > 0) return usd * rate;
        return null;
    }

    // Color (tier) de la tarjeta según plataforma y monto
    function tierFor(platform, amount, currency) {
        const d = { amount, currency: currency || 'ARS' };
        const ars = toARS(d);
        if (platformKey(platform) === 'ceneka') {
            if (ars !== null) return calculateCenekaTier(ars);
            const usd = toUSD(d);
            return calculateCenekaTier(usd !== null ? usd * 1000 : amount);
        }
        if (ars !== null) return calculateSuperchatTier(ars);
        const usd = toUSD(d);
        return calculateForeignSuperchatTier(usd !== null ? usd : amount);
    }

    // true si la donación está por debajo de un mínimo en pesos (las que no se pueden convertir nunca quedan por debajo)
    function belowMin(d, min) {
        if (!min || min <= 0) return false;
        const v = toARS(d);
        return v !== null && v < min;
    }

    function formatARS(n) {
        return '$' + Math.round(n || 0).toLocaleString('es-AR');
    }

    function formatMoney(n, currency) {
        const cur = String(currency || 'ARS').toUpperCase();
        if (cur === 'ARS') return formatARS(n);
        if (cur === 'BITS') return Math.round(n || 0).toLocaleString('es-AR') + ' bits';
        if (cur === 'KICKS') return Math.round(n || 0).toLocaleString('es-AR') + ' KICKs';
        const prefix = cur === 'USD' ? 'US$' : cur + ' ';
        return prefix + (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR');
    }

    // Suma una lista separando lo que se puede pasar a pesos de lo que queda en otra moneda
    function summarize(list) {
        const out = { ars: 0, others: {}, count: list.length };
        list.forEach(d => {
            const v = toARS(d);
            if (v !== null) {
                out.ars += v;
            } else {
                const cur = String(d.currency).toUpperCase();
                out.others[cur] = (out.others[cur] || 0) + (parseFloat(d.amount) || 0);
            }
        });
        return out;
    }

    function formatSummary(sum) {
        const parts = [];
        if (sum.ars > 0 || Object.keys(sum.others).length === 0) parts.push(formatARS(sum.ars));
        Object.keys(sum.others).forEach(cur => parts.push(formatMoney(sum.others[cur], cur)));
        return parts.join(' + ');
    }

    // Agrupa por donante y ordena de mayor a menor (en pesos)
    function topDonors(list, limit) {
        const map = new Map();
        list.forEach(d => {
            const key = d.platform + '|' + String(d.nick).toLowerCase();
            if (!map.has(key)) map.set(key, { nick: d.nick, platform: d.platform, items: [] });
            map.get(key).items.push(d);
        });
        return [...map.values()]
            .map(g => ({ ...g, sum: summarize(g.items) }))
            .sort((a, b) => (b.sum.ars - a.sum.ars) || (Object.values(b.sum.others).reduce((x, y) => x + y, 0) - Object.values(a.sum.others).reduce((x, y) => x + y, 0)))
            .slice(0, limit || 5);
    }

    function sortValue(d) {
        const v = toARS(d);
        return v !== null ? v : (parseFloat(d.amount) || 0);
    }

    // Super Chats en moneda extranjera (USD/EUR...): escala de colores en dólares aprox.
    function calculateForeignSuperchatTier(amount) {
        if (amount < 2) return 'tier-blue';
        if (amount < 5) return 'tier-cyan';
        if (amount < 10) return 'tier-green';
        if (amount < 20) return 'tier-yellow';
        if (amount < 50) return 'tier-orange';
        if (amount < 100) return 'tier-magenta';
        return 'tier-red';
    }

    function calculateSuperchatTier(amount) {
        if (amount < 200) return 'tier-blue';
        if (amount < 500) return 'tier-cyan';
        if (amount < 1000) return 'tier-green';
        if (amount < 2500) return 'tier-yellow';
        if (amount < 5000) return 'tier-orange';
        if (amount < 10000) return 'tier-magenta';
        return 'tier-red';
    }

    function calculateCenekaTier(amount) {
        if (amount < 200) return 'tier-cnk-soft';
        if (amount < 500) return 'tier-cnk-purple';
        if (amount < 1000) return 'tier-cnk-indigo';
        if (amount < 2500) return 'tier-cnk-emerald';
        if (amount < 5000) return 'tier-cnk-gold';
        if (amount < 10000) return 'tier-cnk-pink';
        return 'tier-cnk-ruby';
    }

    // --- DOM Selectors ---
    const els = {
        totalAmount: document.getElementById('stat-total-amount'),
        cenekaCount: document.getElementById('stat-ceneka-count'),
        ytCount: document.getElementById('stat-yt-count'),
        topDonor: document.getElementById('stat-top-donor'),
        
        inputSearch: document.getElementById('input-search'),
        selectSort: document.getElementById('select-sort'),
        selectPlatform: document.getElementById('select-platform'),
        inputMinAmount: document.getElementById('input-min-amount'),
        inputDateFrom: document.getElementById('input-date-from'),
        inputDateTo: document.getElementById('input-date-to'),
        
        mainToolbar: document.getElementById('main-toolbar'),
        btnToggleToolbar: document.getElementById('btn-toggle-toolbar'),
        toolbarIcon: document.getElementById('toolbar-icon'),
        
        btnToggleReadView: document.getElementById('btn-toggle-read-view'),
        readViewIcon: document.getElementById('read-view-icon'),
        readViewText: document.getElementById('read-view-text'),
        badgeReadCount: document.getElementById('badge-read-count'),
        
        btnLayoutSplit: document.getElementById('btn-layout-split'),
        btnLayoutUnified: document.getElementById('btn-layout-unified'),
        feedWrapper: document.getElementById('feed-wrapper'),
        colCeneka: document.getElementById('col-ceneka'),
        colYoutube: document.getElementById('col-youtube'),
        colUnified: document.getElementById('col-unified'),
        
        listCeneka: document.getElementById('list-ceneka'),
        listYoutube: document.getElementById('list-youtube'),
        listUnified: document.getElementById('list-unified'),
        
        badgeCeneka: document.getElementById('badge-count-ceneka'),
        badgeYt: document.getElementById('badge-count-yt'),
        badgeUnified: document.getElementById('badge-count-unified'),
        
        btnToggleSound: document.getElementById('btn-toggle-sound'),
        soundIcon: document.getElementById('sound-icon'),
        btnToggleTts: document.getElementById('btn-toggle-tts'),
        ttsIcon: document.getElementById('tts-icon'),
        cfgToggleAmounts: document.getElementById('cfg-toggle-amounts'),
        cfgToggleSim: document.getElementById('cfg-toggle-sim'),
        
        btnMarkAllRead: document.getElementById('btn-mark-all-read'),
        btnMarkCenekaRead: document.getElementById('btn-mark-ceneka-read'),
        btnMarkYtRead: document.getElementById('btn-mark-yt-read'),
        btnMarkUnifiedRead: document.getElementById('btn-mark-unified-read'),
        btnOpenOverlay: document.getElementById('btn-open-overlay'),
        
        btnOpenSettings: document.getElementById('btn-open-settings'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        modalSettings: document.getElementById('modal-settings'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        btnResetData: document.getElementById('btn-reset-data'),
        
        // Focus Modal Elements
        modalFocus: document.getElementById('modal-focus'),
        focusCardBody: document.getElementById('focus-card-body'),
        focusAvatar: document.getElementById('focus-avatar'),
        focusNick: document.getElementById('focus-nick'),
        focusPlatformTag: document.getElementById('focus-platform-tag'),
        focusAmount: document.getElementById('focus-amount'),
        focusMessage: document.getElementById('focus-message'),
        btnCloseFocus: document.getElementById('btn-close-focus'),
        btnFocusSpeak: document.getElementById('btn-focus-speak'),
        btnFocusToggleRead: document.getElementById('btn-focus-toggle-read'),

        // Database Modal Elements
        btnOpenDb: document.getElementById('btn-open-db'),
        cfgBtnOpenDb: document.getElementById('cfg-btn-open-db'),
        modalDb: document.getElementById('modal-db'),
        btnCloseDb: document.getElementById('btn-close-db'),
        btnCloseDbFooter: document.getElementById('db-btn-close-footer'),
        dbBtnExport: document.getElementById('db-btn-export'),
        dbBtnImportTrigger: document.getElementById('db-btn-import-trigger'),
        dbFileInput: document.getElementById('db-file-input'),
        dbBtnAddChat: document.getElementById('db-btn-add-chat'),
        dbTabVisual: document.getElementById('db-tab-visual'),
        dbTabJson: document.getElementById('db-tab-json'),
        dbViewVisual: document.getElementById('db-view-visual'),
        dbViewJson: document.getElementById('db-view-json'),
        dbInputSearch: document.getElementById('db-input-search'),
        dbSelectFilterPlatform: document.getElementById('db-select-filter-platform'),
        dbSelectFilterStatus: document.getElementById('db-select-filter-status'),
        dbChatsList: document.getElementById('db-chats-list'),
        dbStatCount: document.getElementById('db-stat-count'),
        dbStatUnread: document.getElementById('db-stat-unread'),
        dbStatRead: document.getElementById('db-stat-read'),
        dbStatTotalMoney: document.getElementById('db-stat-total-money'),
        dbEditForm: document.getElementById('db-edit-form'),
        dbFormTitle: document.getElementById('db-form-title'),
        dbEditId: document.getElementById('db-edit-id'),
        dbEditNick: document.getElementById('db-edit-nick'),
        dbEditAmount: document.getElementById('db-edit-amount'),
        dbEditPlatform: document.getElementById('db-edit-platform'),
        dbEditStatus: document.getElementById('db-edit-status'),
        dbEditMsg: document.getElementById('db-edit-msg'),
        dbBtnSaveForm: document.getElementById('db-btn-save-form'),
        dbBtnCancelForm: document.getElementById('db-btn-cancel-form'),
        dbBtnCancelEdit: document.getElementById('db-btn-cancel-edit'),
        dbJsonTextarea: document.getElementById('db-json-textarea'),
        dbBtnSaveJson: document.getElementById('db-btn-save-json'),
        dbBtnFormatJson: document.getElementById('db-btn-format-json'),
        dbBtnCopyJson: document.getElementById('db-btn-copy-json'),
        dbBtnClearAll: document.getElementById('db-btn-clear-all'),
        dbFooterStatus: document.getElementById('db-footer-status'),

        toastContainer: document.getElementById('toast-container')
    };

    // ==========================================================================
    // INTERFAZ POR PLATAFORMA (columnas, estadísticas, filtros)
    // ==========================================================================
    var platformCols = {};
    var statsPlatformsKey = '';
    var platformStatEls = {};

    function buildPlatformUI(skipRender) {
        const en = activePlatforms();

        // Columnas
        const colWrap = document.getElementById('platform-columns');
        if (colWrap) {
            colWrap.innerHTML = '';
            platformCols = {};
            PLATFORM_KEYS.forEach(k => {
                const info = PLATFORMS[k];
                const col = document.createElement('div');
                col.className = `feed-column ${k}-column hidden`;
                col.innerHTML = `
                    <div class="column-header">
                        <div class="column-title">
                            <i class="${info.icon} color-${k}"></i> ${info.column}
                            <span class="count-badge">0</span>
                        </div>
                        <button class="btn-ghost btn-header-action" data-mark-platform="${k}" title="Marcar todo lo de ${info.label} como leído">
                            <i class="fa-solid fa-check-double"></i>
                        </button>
                    </div>
                    <div class="feed-list"></div>`;
                colWrap.appendChild(col);
                platformCols[k] = { el: col, badge: col.querySelector('.count-badge'), list: col.querySelector('.feed-list') };
            });
        }

        // Tarjetas de estadísticas
        const statWrap = document.getElementById('platform-stats');
        if (statWrap) {
            statWrap.innerHTML = '';
            platformStatEls = {};
            en.forEach(k => {
                const info = PLATFORMS[k];
                const card = document.createElement('div');
                card.className = `stat-card ${k}-stat`;
                card.innerHTML = `
                    <div class="stat-icon"><i class="${info.icon}"></i></div>
                    <div class="stat-data">
                        <span class="stat-label">${k === 'youtube' ? 'Super Chats' : info.label}</span>
                        <span class="stat-value">0 mensajes</span>
                    </div>`;
                statWrap.appendChild(card);
                platformStatEls[k] = card.querySelector('.stat-value');
            });
        }

        // Selectores de plataforma (filtro, base de datos)
        const fillSelect = (sel, withAll, allLabel, prefix, keys) => {
            if (!sel) return;
            const prev = sel.value;
            sel.innerHTML = (withAll ? `<option value="all">${allLabel}</option>` : '') +
                (keys || PLATFORM_KEYS).map(k => `<option value="${k}">${prefix}${PLATFORMS[k].label}</option>`).join('');
            sel.value = [...sel.options].some(o => o.value === prev) ? prev : (withAll ? 'all' : 'ceneka');
        };
        fillSelect(document.getElementById('select-platform'), true, 'Todas las plataformas', 'Solo ', en);
        const selP = document.getElementById('select-platform');
        if (selP && state.filter.platform !== 'all' && selP.value === 'all') state.filter.platform = 'all';
        fillSelect(document.getElementById('db-select-filter-platform'), true, 'Todas las plataformas', 'Solo ');
        fillSelect(document.getElementById('db-edit-platform'), false, '', '');
        statsPlatformsKey = en.join(',');

        if (!skipRender) render();
    }

    buildPlatformUI(true);

    // Rellenar campos de configuración con valores guardados
    if (document.getElementById('cfg-sl-token')) document.getElementById('cfg-sl-token').value = state.settings.slToken || '';
    if (document.getElementById('cfg-min-display-amount')) document.getElementById('cfg-min-display-amount').value = state.settings.minDisplayAmount || 0;
    if (document.getElementById('cfg-min-tts')) document.getElementById('cfg-min-tts').value = state.settings.minTts || 100;
    if (document.getElementById('cfg-obs-hide-message')) document.getElementById('cfg-obs-hide-message').checked = !!state.settings.obsHideMessage;
    if (document.getElementById('cfg-obs-duration')) document.getElementById('cfg-obs-duration').value = (state.settings.obsDuration || 0);
    if (document.getElementById('cfg-sim-speed')) document.getElementById('cfg-sim-speed').value = state.settings.simSpeed || 10;
    if (document.getElementById('cfg-auto-save-db')) document.getElementById('cfg-auto-save-db').checked = state.settings.autoSaveDb !== false;
    if (els.inputMinAmount && state.settings.minDisplayAmount) els.inputMinAmount.value = state.settings.minDisplayAmount;

    // Restaurar estado de visibilidad de la barra de filtros del medio
    try {
        const savedToolbar = localStorage.getItem('streamdonations_toolbar_visible');
        if (savedToolbar === 'false') {
            state.toolbarVisible = false;
            if (els.mainToolbar) els.mainToolbar.classList.add('hidden');
            if (els.btnToggleToolbar) els.btnToggleToolbar.classList.remove('active');
        }
    } catch (e) {}

    // ==========================================================================
    // FILTROS: palabras prohibidas y usuarios bloqueados
    // ==========================================================================
    const ACCENT_CLASS = { a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî1]', o: '[oóòöô0]', u: '[uúùüû]', n: '[nñ]', c: '[cç]' };
    function bannedList(src) {
        return String(src || '').split(/[\n,;]+/).map(w => w.trim()).filter(w => w && w.replace(/\*/g, '').length >= 2).slice(0, 500);
    }
    function wordPattern(w) {
        const wild = /\*$/.test(w);
        const core = w.replace(/\*+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        let out = '';
        for (const ch of core) {
            if (ACCENT_CLASS[ch]) out += ACCENT_CLASS[ch];
            else if (/\s/.test(ch)) out += '\\s+';
            else if (ch === '*') out += '[\\p{L}\\p{N}]*';
            else out += ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
        }
        return out + (wild ? '[\\p{L}\\p{N}]*' : '');
    }
    let censorCacheKey = null, censorRe = null;
    function censorRegex() {
        const src = state.settings.bannedWords || '';
        if (src === censorCacheKey) return censorRe;
        censorCacheKey = src;
        const parts = bannedList(src).map(wordPattern).sort((a, b) => b.length - a.length);
        try {
            censorRe = parts.length ? new RegExp('(?<![\\p{L}\\p{N}])(?:' + parts.join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
        } catch (e) { censorRe = null; }
        return censorRe;
    }
    // where: 'obs' | 'tts' | 'panel'
    function censorOn(where) {
        const st = state.settings;
        if (where === 'obs') return st.censorObs !== false;
        if (where === 'tts') return st.censorTts !== false;
        return !!st.censorPanel;
    }
    function censorText(text, where, force) {
        if (!text) return text || '';
        if (!force && !censorOn(where)) return text;
        const re = censorRegex();
        if (!re) return text;
        re.lastIndex = 0;
        return String(text).replace(re, m => where === 'tts' ? ' ' : '*'.repeat(Math.min(12, Math.max(3, [...m].length))));
    }
    function nickKey(n) { return String(n || '').trim().replace(/^@+/, '').toLowerCase(); }
    function blockedSet() {
        return new Set(String(state.settings.blockedUsers || '').split(/\n+/).map(nickKey).filter(Boolean));
    }
    function isBlocked(nick) { const k = nickKey(nick); return !!k && blockedSet().has(k); }
    function setBlocked(nick, on) {
        const k = nickKey(nick);
        if (!k) return;
        const lines = String(state.settings.blockedUsers || '').split(/\n+/).map(x => x.trim()).filter(Boolean)
            .filter(x => nickKey(x) !== k);
        if (on) lines.push(String(nick).trim().replace(/^@+/, ''));
        state.settings.blockedUsers = lines.join('\n');
        persistSettings();
    }
    // Lo que se manda a OBS (nombre y mensaje ya filtrados)
    function overlayPayload(d) {
        return {
            ...d,
            nick: censorText(d.nick, 'obs'),
            message: obsMessage(censorText(d.message, 'obs')),
            sty: mergedStyle(d, 'obs'),
            amtColor: amountColor(d, 'obs'),
            rank: (r => r ? { name: r.name, icon: r.icon, color: r.color, count: r.count, showName: r.showName, badgeColor: r.badgeColor, badgeFx: r.badgeFx } : null)(rankFor(d.nick, 'obs')),
            obsHideMessage: !!state.settings.obsHideMessage,
            obsDuration: state.settings.obsDuration || 0
        };
    }
    function panelNick(n) { return censorText(n, 'panel'); }

    // --- Core Action: Add Donation ---
    function addDonation(item) {
        if (!item) return;
        const amountNum = parseFloat(item.amount) || 0;
        const tier = tierFor(item.platform, amountNum, item.currency);

        const donation = {
            id: item.id || ('don_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
            platform: platformKey(item.platform), // 'ceneka' | 'youtube' | 'twitch' | 'kick'
            nick: item.nick || 'Anónimo',
            amount: amountNum,
            currency: item.currency || 'ARS',
            formattedAmount: String(item.formattedAmount || formatMoney(amountNum, item.currency || 'ARS')).replace(/[<>&"'`]/g, ''),
            message: item.message || '',
            timestamp: item.timestamp || Date.now(),
            isRead: false,
            tier: tier,
            avatar: item.avatar || null,
            isTest: !!item.isTest
        };

        Object.assign(donation, safeDonation(donation));
        if (typeof syncPendingRead === 'function' && syncPendingRead(donation.id)) donation.isRead = true;
        // Usuario bloqueado: se guarda (suma a los totales) pero va directo a "Leídos", sin sonido, voz ni OBS
        if (!donation.isTest && isBlocked(donation.nick)) { donation.isRead = true; donation.blocked = true; }
        state.donations.unshift(donation);
        saveDonationsToStorage();

        // Si es la primera donación de una plataforma, aparece su tarjeta de estadísticas
        if (activePlatforms().join(',') !== statsPlatformsKey) { lastVisibleKey = activePlatforms().join(','); buildPlatformUI(true); sendObsStyle(); }
        
        // Plataforma sin mostrar (por ej. un canal marcado "Solo Ceneka"): se guarda en el historial,
        // pero no suena, no se lee en voz alta, no va a OBS ni muestra aviso
        if (!isVisiblePlatform(donation.platform)) { render(); return; }
        // La otra PC ya la marcó como leída antes de que llegara acá: no suena ni va a OBS
        if (donation.isRead) { render(); return; }

        // Recuperada (llegó con la app cerrada): queda pendiente y va a OBS, pero sin sonido, voz ni cartel
        if (item.recovered) { pushToOverlay(donation); render(); return; }

        playDonationSound(donation.tier, donation);
        speakDonation(donation);
        pushToOverlay(donation);
        
        if (state.settings.donationToasts !== false) showToast(
            `<strong style="color: ${platformInfo(donation.platform).color}">` +
            `${platformInfo(donation.platform).label.toUpperCase()}</strong>: ${escapeHTML(donation.nick)} donó ${escapeHTML(donation.formattedAmount)}!`,
            donation.platform
        );

        render();
    }

    // --- Filter & Sort Logic ---
    function getFilteredDonations() {
        const vis = visiblePlatforms();
        return state.donations.filter(item => {
            // Si estamos en modo "Pendientes", solo muestra !item.isRead.
            // Si estamos en modo "Chats Leídos", solo muestra item.isRead.
            if (state.showOnlyRead ? !item.isRead : item.isRead) {
                return false;
            }

            if (state.filter.search) {
                const q = state.filter.search.toLowerCase();
                const matchNick = item.nick.toLowerCase().includes(q);
                const matchMsg = item.message.toLowerCase().includes(q);
                if (!matchNick && !matchMsg) return false;
            }

            if (state.filter.platform !== 'all' && item.platform !== state.filter.platform) {
                return false;
            }

            // Solo plataformas con la conexión agregada y funcionando
            if (!vis.includes(platformKey(item.platform))) return false;

            // Monto Mínimo: combina configuración global y filtro de barra de herramientas
            const minThresh = Math.max(state.settings.minDisplayAmount || 0, state.filter.minAmount || 0);
            if (belowMin(item, minThresh)) {
                return false;
            }

            // Filtro de fecha: solo mostrar donaciones desde la fecha/hora elegida
            if (state.filter.dateFrom) {
                const fromTime = state.filter.dateFrom.getTime();
                if (item.timestamp < fromTime) {
                    return false;
                }
            }

            // Filtro de fecha: solo mostrar donaciones hasta la fecha/hora elegida
            if (state.filter.dateTo) {
                const toTime = state.filter.dateTo.getTime();
                if (item.timestamp > toTime) {
                    return false;
                }
            }

            return true;
        }).sort((a, b) => {
            switch (state.filter.sort) {
                case 'newest':
                    return b.timestamp - a.timestamp;
                case 'oldest':
                    return a.timestamp - b.timestamp;
                case 'highest':
                    return sortValue(b) - sortValue(a);
                case 'lowest':
                    return sortValue(a) - sortValue(b);
                default:
                    return b.timestamp - a.timestamp;
            }
        });
    }

    // --- Render Cards & Stats ---
    function render() {
        const filtered = getFilteredDonations();

        updateStats();
        updateGoal();
        updateTestCount();

        els.badgeUnified.textContent = filtered.length;
        const splitEmpty = document.getElementById('split-empty');
        renderColumnChips(filtered);

        // Vista dividida: columnas elegidas (o la del filtro "Origen") / vista unificada: todo junto
        if (state.layout === 'split') {
            const chosen = visiblePlatforms().filter(k => (state.settings.splitColumns || []).includes(k));
            const shown = state.filter.platform === 'all' ? chosen : [state.filter.platform];
            PLATFORM_KEYS.forEach(k => {
                const col = platformCols[k];
                if (col) col.el.classList.toggle('hidden', !shown.includes(k));
            });
            els.colUnified.classList.add('hidden');
            if (splitEmpty) splitEmpty.classList.toggle('hidden', shown.length > 0);
            els.feedWrapper.classList.toggle('split-mode', shown.length > 1);
        } else {
            PLATFORM_KEYS.forEach(k => { if (platformCols[k]) platformCols[k].el.classList.add('hidden'); });
            els.colUnified.classList.remove('hidden');
            if (splitEmpty) splitEmpty.classList.add('hidden');
            els.feedWrapper.classList.remove('split-mode');
        }

        PLATFORM_KEYS.forEach(k => {
            const col = platformCols[k];
            if (!col) return;
            const items = filtered.filter(d => platformKey(d.platform) === k);
            col.badge.textContent = items.length;
            const info = PLATFORMS[k];
            renderList(col.list, items, state.showOnlyRead ? `No hay ${info.unit} leídos de ${info.label}.` : `No hay ${info.unit} pendientes de ${info.label}.`);
        });

        const emptyUnified = state.showOnlyRead 
            ? 'No hay chats en el historial de leídos.' 
            : 'No hay donaciones pendientes activas.';

        renderList(els.listUnified, filtered, emptyUnified);
    }

    function renderList(container, items, emptyText) {
        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>${emptyText}</p>
                    <span>${state.showOnlyRead ? 'Los mensajes marcados como leídos aparecerán aquí.' : 'Los eventos nuevos aparecerán automáticamente.'}</span>
                </div>
            `;
            return;
        }

        // Si estás leyendo más abajo, la lista no salta cuando llegan nuevas: se mantiene la tarjeta que mirabas
        // (funciona tanto si se desplaza la lista como si se desplaza toda la página en pantallas bajas)
        const listScrolls = container.scrollHeight > container.clientHeight + 2;
        const reading = listScrolls ? container.scrollTop > 30 : window.scrollY > 30;
        let anchorId = null, anchorTop = 0;
        if (reading && container.offsetParent !== null) {
            const top = listScrolls ? container.getBoundingClientRect().top : 0;
            for (const c of container.querySelectorAll('.donation-card')) {
                const r = c.getBoundingClientRect();
                if (r.bottom > top + 5) { anchorId = c.dataset.id; anchorTop = r.top; break; }
            }
        }
        container.innerHTML = items.map(item => createCardHTML(item)).join('');
        if (anchorId) {
            const again = container.querySelector(`.donation-card[data-id="${anchorId}"]`);
            if (again) {
                const delta = again.getBoundingClientRect().top - anchorTop;
                if (listScrolls) container.scrollTop += delta;
                else window.scrollBy(0, delta);
            }
        }
    }

    function createCardHTML(item) {
        const timeAgo = formatTimeAgo(item.timestamp);
        const readClass = item.isRead ? 'is-read' : '';
        const platformBadgeClass = platformKey(item.platform);
        const platformIcon = platformInfo(item.platform).icon;

        const readActionBtn = item.isRead 
            ? `<button class="btn-card-action" data-act="toggle-read" data-id="${item.id}" title="Restaurar a pendientes">
                   <i class="fa-solid fa-arrow-rotate-left"></i> Restaurar
               </button>`
            : `<button class="btn-card-action is-read-btn" data-act="toggle-read" data-id="${item.id}" title="Marcar como leído y quitar de la vista">
                   <i class="fa-solid fa-check"></i> Marcar Leído
               </button>`;

        // Estilo (rango y/o donación grande): los bordes animados solo mientras está pendiente
        const rk = item.blocked ? null : rankFor(item.nick, 'panel');
        const sty = mergedStyle(item, 'panel', rk) || {};
        const nickFx = tfxAttr(sty.nick), amtFx = tfxAttr(sty.amount);
        const amtCol = amountColor(item, 'panel');
        return `
            <div class="donation-card pf-${platformBadgeClass} ${item.tier} ${readClass}${sty.card && !item.isRead ? ' sfx-host' : ''}" data-id="${item.id}" data-act="focus">${item.isRead ? '' : ringHTML(sty.card)}
                <div class="card-header">
                    <div class="donor-info">
                        <div class="donor-avatar">
                            ${item.avatar ? `<img src="${item.avatar}" alt="">` : escapeHTML(panelNick(item.nick).charAt(0).toUpperCase())}
                        </div>
                        <div class="donor-meta">
                            <div class="donor-nick">
                                <span class="donor-nick-text user-link${nickFx.cls}" data-act="user" data-id="${item.id}" role="button" tabindex="0" title="Opciones de este usuario"${nickFx.style ? ` style="${nickFx.style}"` : ''}>${escapeHTML(panelNick(item.nick))}</span>
                                ${rankBadgeHTML(rk, sty.rank)}
                                ${item.isTest ? '<span class="test-tag">PRUEBA</span>' : ''}
                                ${item.blocked ? '<span class="test-tag blocked-tag"><i class="fa-solid fa-user-slash"></i> BLOQUEADO</span>' : ''}
                                <span class="platform-tag ${platformBadgeClass}">
                                    <i class="${platformIcon}"></i> ${platformInfo(item.platform).label}
                                </span>
                                <span class="amount-badge${amtFx.cls}"${(amtCol || amtFx.style) ? ` style="${amtCol ? `--accent-color:${amtCol};` : ''}${amtFx.style}"` : ''}>${escapeHTML(item.formattedAmount)}</span>
                            </div>
                            <span class="timestamp"><i class="fa-regular fa-clock"></i> ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="card-read-action">
                        ${readActionBtn}
                    </div>
                </div>
                ${item.message ? `<div class="card-message${sty.msg && !item.isRead ? ' sfx-host' : ''}">${item.isRead ? '' : ringHTML(sty.msg)}${messageHTML(item.message)}</div>` : ''}
            </div>
        `;
    }

    // ==========================================================================
    // COPIA COMPLETA (configuración + historial) y DONACIONES
    // ==========================================================================
    function fullBackupData() {
        return {
            app: 'StreamDonations', type: 'full-backup', version: APP_VERSION, date: new Date().toISOString(),
            settings: state.settings,
            donations: state.donations,
            toolbarVisible: localStorage.getItem('streamdonations_toolbar_visible')
        };
    }
    // Imágenes y sonidos que se guardan aparte (fondos, sonidos propios e íconos propios)
    const MEDIA_KEY_RE = /^(panelBg|obsBg|alertSound|alertSoundBig|icon:[a-z0-9]{6,24})$/;
    const MEDIA_TYPE_RE = /^(image\/(png|gif|webp|jpeg|svg\+xml)|audio\/[a-z0-9.+-]{1,30})$/;
    function mediaKeys() {
        return ['panelBg', 'obsBg', 'alertSound', 'alertSoundBig', ...(state.settings.customIcons || []).map(ic => 'icon:' + ic.id)];
    }
    function blobToBase64(blob) {
        return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
    }
    function base64ToBlob(b64, type) {
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type });
    }
    function collectMedia() {
        if (!window.SDStore) return Promise.resolve({});
        const out = {};
        return Promise.all(mediaKeys().map(k => SDStore.get(k).then(b => {
            if (!b || !b.size) return;
            return blobToBase64(b).then(data => { out[k] = { type: b.type || '', data }; });
        }).catch(() => {}))).then(() => out);
    }
    function exportFullBackup(withMedia) {
        const d = new Date();
        const name = 'StreamDonations-copia-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
        return (withMedia ? collectMedia() : Promise.resolve(null)).then(media => {
        const data = fullBackupData();
        if (media && Object.keys(media).length) data.media = media;
        const blob = new Blob([JSON.stringify(data, null, media ? 0 : 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return { name, mb: blob.size / 1048576, files: media ? Object.keys(media).length : 0 };
        });
    }
    // Guarda en esta PC las imágenes y sonidos que trae una copia (solo los tipos y tamaños permitidos)
    function restoreMedia(media) {
        if (!media || typeof media !== 'object' || !window.SDStore) return Promise.resolve(0);
        let total = 0, n = 0;
        const jobs = Object.keys(media).slice(0, 60).map(k => {
            const m = media[k];
            if (!MEDIA_KEY_RE.test(k) || !m || typeof m.data !== 'string' || !MEDIA_TYPE_RE.test(m.type || '')) return null;
            const size = Math.floor(m.data.length * 0.75);
            const max = k.startsWith('icon:') ? 220 * 1024 : (/Bg$/.test(k) ? 8.5 * 1048576 : 3.2 * 1048576);
            if (size > max || (total += size) > 64 * 1048576) return null;
            try { const blob = base64ToBlob(m.data, m.type); n++; return SDStore.put(k, blob).catch(() => { n--; }); } catch (e) { return null; }
        });
        return Promise.all(jobs).then(() => n);
    }
    function importFullBackup(file) {
        const reader = new FileReader();
        reader.onload = () => {
            let data;
            try { data = JSON.parse(reader.result); } catch (e) { showToast('El archivo no es una copia válida', 'warning'); return; }
            if (!data || data.type !== 'full-backup' || !data.settings) {
                showToast('Ese archivo no es una "copia completa". Para importar solo donaciones usá Base de datos.', 'warning');
                return;
            }
            const n = Array.isArray(data.donations) ? data.donations.length : 0;
            const nm = data.media && typeof data.media === 'object' ? Object.keys(data.media).length : 0;
            if (!confirm(`¿Reemplazar la configuración y el historial actuales con esta copia?\n\nIncluye ${n} donaciones y tus conexiones${nm ? ` y ${nm} imágenes o sonidos` : ''}.`)) return;
            try {
                localStorage.setItem('streamdonations_settings', JSON.stringify(data.settings));
                localStorage.setItem('streamdonations_chats_db', JSON.stringify(Array.isArray(data.donations) ? data.donations : []));
                if (data.toolbarVisible !== null && data.toolbarVisible !== undefined) localStorage.setItem('streamdonations_toolbar_visible', data.toolbarVisible);
                localStorage.setItem('streamdonations_welcome_done', '1');
            } catch (e) { showToast('No se pudo guardar la copia', 'warning'); return; }
            restoreMedia(data.media).then(() => location.reload(), () => location.reload());
        };
        reader.readAsText(file);
    }
    function initBackupAndDonate() {
        const ex = document.getElementById('btn-full-export');
        const im = document.getElementById('btn-full-import');
        const fi = document.getElementById('full-import-file');
        if (ex) ex.addEventListener('click', () => {
            const withMedia = !$('cfg-backup-media') || $('cfg-backup-media').checked;
            ex.disabled = true;
            exportFullBackup(withMedia).then(r => {
                showToast('Copia guardada en Descargas: ' + escapeHTML(r.name) + (r.files ? ` (con ${r.files} imágenes o sonidos, ${r.mb.toFixed(1)} MB)` : ''), 'success');
            }).catch(() => showToast('No se pudo guardar la copia', 'warning')).finally(() => { ex.disabled = false; });
        });
        if (im && fi) {
            im.addEventListener('click', () => fi.click());
            fi.addEventListener('change', () => { if (fi.files && fi.files[0]) importFullBackup(fi.files[0]); fi.value = ''; });
        }
        const cp = document.getElementById('btn-copy-donate');
        if (cp) cp.addEventListener('click', () => {
            const url = 'https://ceneka.net/Padeca';
            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(
                () => showToast('Link copiado', 'success'),
                () => { prompt('Copiá el link:', url); }
            );
        });
    }
    initBackupAndDonate();

    // ==========================================================================
    // SINCRONIZAR CON OTRA PC (stream entre dos personas)
    // Las dos PCs tienen los mismos canales; por un canal privado (ntfy.sh) se avisan
    // qué donaciones se marcaron como leídas o se restauraron. Solo viajan códigos de
    // donación, nunca nombres, montos, mensajes ni tokens.
    // ==========================================================================
    const SYNC_SERVER = 'https://ntfy.sh';
    const SYNC_DEVICE = (() => {
        try {
            let d = localStorage.getItem('sd_device_id');
            if (!d) { d = 'pc_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('sd_device_id', d); }
            return d;
        } catch (e) { return 'pc_' + Math.random().toString(36).slice(2, 10); }
    })();
    var syncSource = null, syncStatus = 'off', syncSnapshot = null, syncApplying = false;
    var syncPending = new Map(); // marcas que llegaron antes que la donación (id -> leída)
    var syncOutbox = { r: new Set(), u: new Set() }, syncTimer = null, syncRetry = null;

    function syncCodeValid(c) { return /^sd-[a-z0-9]{20,40}$/.test(c || ''); }
    function syncTopic() { return syncCodeValid(state.settings.syncCode) ? state.settings.syncCode : ''; }
    function syncShareable(d) { return d && d.id && !d.isTest && /^(se|sl)_/.test(d.id); }

    function syncTakeSnapshot() {
        syncSnapshot = new Map();
        state.donations.forEach(d => { if (syncShareable(d)) syncSnapshot.set(d.id, !!d.isRead); });
    }

    // Se llama cada vez que se guardan las donaciones: detecta qué cambió y lo avisa a la otra PC
    function syncNoteChanges() {
        if (!syncTopic() || syncApplying) return;
        if (!syncSnapshot) { syncTakeSnapshot(); return; }
        state.donations.forEach(d => {
            if (!syncShareable(d)) return;
            const before = syncSnapshot.get(d.id), now = !!d.isRead;
            if (before === undefined) {
                // Donación nueva: si ya llega leída por algo de acá (no por la otra PC), también se avisa
                syncSnapshot.set(d.id, now);
                return;
            }
            if (before !== now) {
                syncSnapshot.set(d.id, now);
                (now ? syncOutbox.r : syncOutbox.u).add(d.id);
                (now ? syncOutbox.u : syncOutbox.r).delete(d.id);
            }
        });
        if (syncOutbox.r.size || syncOutbox.u.size) {
            clearTimeout(syncTimer);
            syncTimer = setTimeout(syncFlush, 1000); // junta las marcas hechas en el mismo segundo
        }
    }

    function syncFlush() {
        const topic = syncTopic();
        if (!topic) return;
        const r = [...syncOutbox.r], u = [...syncOutbox.u];
        syncOutbox.r.clear(); syncOutbox.u.clear();
        // De a 60 códigos por mensaje (cada mensaje tiene un tamaño máximo)
        // Si falla (sin internet o el servidor pide esperar), vuelve a la cola y se reintenta en 15 s
        const send = (part) => fetch(SYNC_SERVER + '/' + topic, { method: 'POST', body: JSON.stringify(part) })
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); })
            .catch(() => {
                (part.r || []).forEach(x => { if (!syncOutbox.u.has(x)) syncOutbox.r.add(x); });
                (part.u || []).forEach(x => { if (!syncOutbox.r.has(x)) syncOutbox.u.add(x); });
                clearTimeout(syncTimer); syncTimer = setTimeout(syncFlush, 15000);
            });
        for (let i = 0; i < Math.max(r.length, u.length); i += 60) {
            send({ v: 1, from: SYNC_DEVICE, r: r.slice(i, i + 60), u: u.slice(i, i + 60) });
        }
    }

    // Marca que llegó de la otra PC para una donación que acá todavía no apareció
    function syncPendingRead(id) {
        if (!syncPending.has(id)) return false;
        const v = syncPending.get(id);
        syncPending.delete(id);
        return v;
    }

    function syncApply(msg) {
        if (!msg || msg.from === SYNC_DEVICE) return;
        const valid = x => typeof x === 'string' && /^(se|sl)_[A-Za-z0-9_.-]{1,80}$/.test(x);
        const reads = (Array.isArray(msg.r) ? msg.r : []).filter(valid).slice(0, 200);
        const unreads = (Array.isArray(msg.u) ? msg.u : []).filter(valid).slice(0, 200);
        if (!reads.length && !unreads.length) return;
        let changed = 0;
        syncApplying = true;
        try {
            const apply = (id, val) => {
                const d = state.donations.find(x => x.id === id);
                if (!d) { syncPending.set(id, val); if (syncPending.size > 500) syncPending.delete(syncPending.keys().next().value); return; }
                if (!!d.isRead !== val) {
                    d.isRead = val;
                    if (val) dismissOverlayAlert(d.id); else if (typeof pushToOverlay === 'function' && isVisiblePlatform(d.platform)) pushToOverlay(d);
                    changed++;
                }
                if (syncSnapshot) syncSnapshot.set(id, val);
            };
            reads.forEach(id => apply(id, true));
            unreads.forEach(id => apply(id, false));
            if (changed) { saveDonationsToStorage(); render(); }
        } finally {
            syncApplying = false;
        }
    }

    function setSyncStatus(st) {
        syncStatus = st;
        const el = $('sync-status');
        if (el) {
            const txt = { off: 'Apagado', connecting: 'Conectando…', on: 'Sincronizado', error: 'Sin conexión (reintentando)' }[st];
            el.className = 'sl-status ' + ({ on: 'connected', connecting: 'connecting', error: 'error' }[st] || '');
            el.querySelector('span').textContent = txt;
        }
        const badge = $('sync-badge');
        if (badge) badge.classList.toggle('hidden', st === 'off');
        if (badge) badge.classList.toggle('error', st === 'error');
    }

    function syncConnect() {
        syncDisconnect(true);
        const topic = syncTopic();
        if (!topic || typeof EventSource === 'undefined') { setSyncStatus('off'); return; }
        setSyncStatus('connecting');
        syncTakeSnapshot();
        // "since": trae lo que la otra PC marcó mientras esta estaba cerrada (hasta 12 h)
        const since = state.settings.syncLastSeen ? Math.max(Math.floor(state.settings.syncLastSeen / 1000) - 5, Math.floor(Date.now() / 1000) - 12 * 3600) : '10m';
        const es = new EventSource(SYNC_SERVER + '/' + topic + '/sse?since=' + since);
        syncSource = es;
        es.onopen = () => { if (syncSource === es) setSyncStatus('on'); };
        es.onmessage = (ev) => {
            let data;
            try { data = JSON.parse(ev.data); } catch (e) { return; }
            if (!data || data.event !== 'message') return;
            let msg;
            try { msg = JSON.parse(data.message); } catch (e) { return; }
            syncApply(msg);
            state.settings.syncLastSeen = Date.now();
            clearTimeout(syncRetry);
            syncRetry = setTimeout(persistSettings, 2000);
        };
        es.onerror = () => { if (syncSource === es) setSyncStatus(es.readyState === 2 ? 'error' : 'connecting'); if (es.readyState === 2) setTimeout(() => { if (syncSource === es) syncConnect(); }, 10000); };
    }

    function syncDisconnect(silent) {
        if (syncSource) { try { syncSource.close(); } catch (e) {} }
        syncSource = null;
        if (!silent) setSyncStatus('off');
    }

    function renderSyncForm() {
        const code = syncTopic();
        $('sync-code-show').value = code || '';
        $('sync-active').classList.toggle('hidden', !code);
        $('sync-inactive').classList.toggle('hidden', !!code);
        setSyncStatus(code ? (syncSource ? syncStatus : 'connecting') : 'off');
    }

    function initSync() {
        $('btn-sync-create').addEventListener('click', () => {
            const rnd = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
            state.settings.syncCode = 'sd-' + rnd;
            state.settings.syncLastSeen = Date.now();
            persistSettings();
            renderSyncForm();
            syncConnect();
            showToast('Código creado: pasáselo a la otra persona', 'success');
        });
        $('btn-sync-join').addEventListener('click', () => {
            const c = $('sync-code-input').value.trim().toLowerCase();
            if (!syncCodeValid(c)) { showToast('Ese código no es válido. Copialo completo (empieza con "sd-").', 'warning'); return; }
            state.settings.syncCode = c;
            state.settings.syncLastSeen = Date.now() - 12 * 3600 * 1000;
            persistSettings();
            $('sync-code-input').value = '';
            renderSyncForm();
            syncConnect();
            showToast('Sincronización activada', 'success');
        });
        $('btn-sync-copy').addEventListener('click', () => {
            const c = syncTopic();
            (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => showToast('Código copiado', 'success'), () => prompt('Copiá el código:', c));
        });
        $('btn-sync-stop').addEventListener('click', () => {
            if (!confirm('¿Dejar de sincronizar con la otra PC?')) return;
            state.settings.syncCode = '';
            persistSettings();
            syncDisconnect();
            renderSyncForm();
        });
        renderSyncForm();
        if (syncTopic()) syncConnect();
    }
    initSync();

    // ==========================================================================
    // AVISO DE ACTUALIZACIÓN: al abrir, compara la versión con la publicada
    // ==========================================================================
    // Archivo con la última versión. Puede ser JSON:
    //   { "version": "1.5.2", "url": "https://...", "notes": "Qué cambió", "minVersion": "1.5.0",
    //     "linkText": "Mirá las novedades", "linkUrl": "https://..." }   (los dos últimos son opcionales)
    // o solo el número en texto plano: 1.5.2
    // GitHub publica este archivo solo cada vez que sale una versión nueva (ver .github/workflows/publicar.yml)
    const UPDATE_URL = 'https://raw.githubusercontent.com/Chatran666/streamdonations/actualizaciones/latest.json';
    // Respaldo: el archivo que se editaba a mano antes
    const UPDATE_URL_FALLBACK = 'https://gist.githubusercontent.com/Chatran666/c83c5045378146750cc3e0538e5078da/raw/versionStreamDonations.json';
    const DOWNLOAD_PAGE = 'https://github.com/Chatran666/streamdonations/releases/latest';

    function versionParts(v) { return String(v || '0').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0).concat([0, 0, 0]).slice(0, 3); }
    function compareVersions(a, b) {
        const x = versionParts(a), y = versionParts(b);
        for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; }
        return 0;
    }

    function showUpdateModal(info) {
        const mandatory = info.minVersion && compareVersions(APP_VERSION, info.minVersion) < 0;
        $('update-title').textContent = mandatory ? 'Tenés que actualizar' : 'Hay una versión nueva';
        $('update-text').innerHTML = `Está disponible la versión <strong>${escapeHTML(info.version)}</strong>. Vos tenés la <strong>${escapeHTML(APP_VERSION)}</strong>.` +
            (mandatory ? '<br>Esta versión ya no funciona bien: actualizá para seguir usándola.' : '');
        const notes = $('update-notes');
        notes.textContent = info.notes || '';
        notes.classList.toggle('hidden', !info.notes);
        $('btn-update-later').classList.toggle('hidden', !!mandatory);
        const direct = /\.exe(\?|$)/i.test(info.url || '');
        $('btn-update-go').innerHTML = direct ? '<i class="fa-solid fa-download"></i> Descargar e instalar' : '<i class="fa-solid fa-download"></i> Descargar actualización';
        $('update-how').textContent = direct
            ? 'Se descarga el instalador. Cuando termine, cerrá StreamDonations y abrilo: se instala encima y no perdés nada.'
            : 'Descargá el instalador, cerrá StreamDonations y ejecutalo: se instala encima y no perdés nada.';
        const dlUrl = info.url || DOWNLOAD_PAGE;
        $('btn-update-go').onclick = () => {
            window.open(dlUrl, '_blank', 'noopener');
            // La app corre en su propio Chrome: la descarga se abre ahí, no en tu navegador de siempre
            $('update-how').innerHTML = '<strong>Se abrió una ventana de Chrome para descargar.</strong> La descarga está en la flecha <i class="fa-solid fa-download"></i> de arriba a la derecha de esa ventana. ' +
                'Si Chrome avisa que el archivo "no se descarga habitualmente", tocá los tres puntitos y elegí <strong>Conservar</strong>. ' +
                'Cuando termine, cerrá StreamDonations y abrí el instalador (también queda en tu carpeta Descargas).<br>' +
                '¿Preferís bajarlo con tu navegador? <button type="button" class="btn btn-outline btn-sm" id="btn-update-copy"><i class="fa-solid fa-copy"></i> Copiar link de descarga</button>';
            $('btn-update-copy').addEventListener('click', () => {
                navigator.clipboard.writeText(dlUrl).then(() => showToast('Link copiado: pegalo en tu navegador', 'success'))
                    .catch(() => { window.prompt('Copiá el link:', dlUrl); });
            });
        };
        const extra = $('update-extra-link');
        if (info.linkUrl) {
            extra.href = info.linkUrl;
            extra.textContent = info.linkText || info.linkUrl;
            extra.classList.remove('hidden');
        } else {
            extra.classList.add('hidden');
        }
        $('btn-update-later').onclick = () => {
            $('modal-update').classList.add('hidden');
            try { sessionStorage.setItem('sd_update_later', info.version); } catch (e) {}
        };
        // Si el tutorial está abierto, el aviso de versión nueva espera a que termine
        const showWhenFree = () => {
            if (!$('tour').classList.contains('hidden')) { setTimeout(showWhenFree, 1000); return; }
            $('modal-update').classList.remove('hidden');
        };
        showWhenFree();
    }

    function fetchVersionFile(url) {
        return fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
            .then(r => r.ok ? r.text() : Promise.reject(r.status));
    }
    function checkForUpdate() {
        if (!UPDATE_URL) return;
        fetchVersionFile(UPDATE_URL)
            .catch(() => fetchVersionFile(UPDATE_URL_FALLBACK))
            .then(txt => {
                let info;
                try { info = JSON.parse(txt); } catch (e) { info = { version: txt.trim().split(/\s+/)[0] }; }
                if (!info || !/^v?\d+(\.\d+){0,2}$/.test(String(info.version || '').trim())) return;
                info.version = String(info.version).trim().replace(/^v/i, '');
                // Solo se descarga desde las publicaciones oficiales del proyecto en GitHub
                if (info.url && !/^https:\/\/github\.com\/Chatran666\/streamdonations\//i.test(String(info.url))) info.url = '';
                info.linkUrl = /^https:\/\//i.test(info.linkUrl || '') ? String(info.linkUrl) : '';
                info.linkText = info.linkText ? String(info.linkText).slice(0, 80) : '';
                info.notes = info.notes ? String(info.notes).slice(0, 600) : '';
                if (compareVersions(info.version, APP_VERSION) <= 0) return;
                const mandatory = info.minVersion && compareVersions(APP_VERSION, info.minVersion) < 0;
                let later = '';
                try { later = sessionStorage.getItem('sd_update_later') || ''; } catch (e) {}
                if (!mandatory && later === info.version) return;
                showUpdateModal(info);
            })
            .catch(() => {}); // sin internet: no molesta
    }
    // ==========================================================================
    // TUTORIAL DE LA PRIMERA VEZ (resalta cada botón y explica para qué sirve)
    // ==========================================================================
    const TOUR = [
        { target: null, icon: 'fa-hand-sparkles', title: '¡Bienvenido a StreamDonations!',
          text: 'Te muestro en 5 pasos lo básico: dónde prender el sonido y la voz, los filtros y cómo conectar tu cuenta para que lleguen las donaciones.' },
        { target: '#btn-toggle-sound', title: 'Sonido de alerta',
          text: 'Viene <strong>apagado</strong>. Tocá este botón para que suene un aviso con cada donación. El tipo de sonido y el volumen se eligen en Opciones → Sonido y voz.' },
        { target: '#btn-toggle-tts', title: 'Lectura en voz alta',
          text: 'También viene <strong>apagada</strong>. Prendela acá para que la app lea el nombre, el monto y el mensaje. La voz, la velocidad y desde qué monto se lee están en Opciones → Sonido y voz.' },
        { target: '#btn-open-settings', title: 'Filtros y atajos',
          text: 'En <strong>Opciones → Filtros</strong> cargás palabras prohibidas (se tapan en OBS y la voz las saltea) y usuarios bloqueados. Los atajos de teclado vienen apagados: se prenden en Opciones → Pantalla.' },
        { target: '#btn-open-settings', title: 'Conectá tu cuenta', final: true,
          text: 'Lo más importante: en <strong>Opciones → Conexión</strong> pegás el <strong>JWT Token de StreamElements</strong> de cada canal (YouTube, Kick, Twitch). Las donaciones de Ceneka entran por el canal que vinculaste en ceneka.net. Si no sabés dónde está el token, mirá la <a href="AYUDA.html" target="_blank" class="help-link">guía paso a paso</a>.' }
    ];
    let tourIdx = 0;
    function tourPlace() {
        const st = TOUR[tourIdx];
        const spot = $('tour-spot'), card = $('tour-card');
        const el = st.target ? document.querySelector(st.target) : null;
        const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
        if (!r) {
            spot.style.cssText = 'left:50%;top:40%;width:0;height:0;';
            card.style.left = Math.max(16, (innerWidth - card.offsetWidth) / 2) + 'px';
            card.style.top = Math.max(16, (innerHeight - card.offsetHeight) / 2) + 'px';
            card.classList.remove('has-arrow');
            return;
        }
        const pad = 6;
        spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let left = r.left + r.width / 2 - cw / 2;
        left = Math.min(Math.max(16, left), innerWidth - cw - 16);
        let top = r.bottom + 16;
        if (top + ch > innerHeight - 16) top = Math.max(16, r.top - ch - 16);
        card.style.left = left + 'px'; card.style.top = top + 'px';
        card.classList.add('has-arrow');
        card.style.setProperty('--arrow-x', Math.min(Math.max(20, r.left + r.width / 2 - left), cw - 20) + 'px');
        card.classList.toggle('arrow-bottom', top < r.top);
    }
    function tourShow(i) {
        tourIdx = Math.max(0, Math.min(TOUR.length - 1, i));
        const st = TOUR[tourIdx];
        $('tour-step').textContent = `Paso ${tourIdx + 1} de ${TOUR.length}`;
        $('tour-title').textContent = st.title;
        $('tour-text').innerHTML = st.text;
        $('tour-prev').classList.toggle('hidden', tourIdx === 0);
        $('tour-next').innerHTML = st.final ? '<i class="fa-solid fa-plug"></i> Ir a Conexión' : 'Siguiente <i class="fa-solid fa-chevron-right"></i>';
        $('tour').classList.remove('hidden');
        requestAnimationFrame(tourPlace);
    }
    function tourEnd(goConnection) {
        $('tour').classList.add('hidden');
        state.settings.tutorialDone = true;
        state.settings.hideWelcome = true; // el tutorial ya explica dónde se conecta
        persistSettings();
        if (goConnection) {
            $('btn-open-settings').click();
            setTimeout(() => { const t = document.querySelector('.settings-tab[data-pane="conexion"]'); if (t) t.click(); }, 50);
        }
    }
    $('tour-next').addEventListener('click', () => { if (TOUR[tourIdx].final) tourEnd(true); else tourShow(tourIdx + 1); });
    $('tour-prev').addEventListener('click', () => tourShow(tourIdx - 1));
    $('tour-skip').addEventListener('click', () => tourEnd(false));
    window.addEventListener('resize', () => { if (!$('tour').classList.contains('hidden')) tourPlace(); });
    document.addEventListener('keydown', (e) => {
        if ($('tour').classList.contains('hidden')) return;
        if (e.key === 'Escape') tourEnd(false);
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); $('tour-next').click(); }
        else if (e.key === 'ArrowLeft') tourShow(tourIdx - 1);
    }, true);
    $('btn-replay-tour').addEventListener('click', () => { closeSettings(); setTimeout(() => tourShow(0), 200); });
    function maybeShowTour() {
        if (state.settings.tutorialDone || hasAnyConnection()) return false;
        if (!$('modal-update').classList.contains('hidden')) { setTimeout(maybeShowTour, 1500); return true; }
        tourShow(0);
        return true;
    }

    // Bienvenida: si todavía no hay ninguna conexión cargada, explica dónde se cargan
    function hasAnyConnection() {
        return (state.settings.seChannels || []).some(c => String(c.token || '').trim()) || !!String(state.settings.slToken || '').trim();
    }
    function maybeShowWelcome() {
        if (maybeShowTour()) return;
        if (hasAnyConnection() || state.settings.hideWelcome) return;
        if (!$('modal-update').classList.contains('hidden')) { setTimeout(maybeShowWelcome, 1500); return; }
        $('modal-welcome').classList.remove('hidden');
    }
    function closeWelcome() {
        if ($('welcome-dont-show').checked) { state.settings.hideWelcome = true; persistSettings(); }
        $('modal-welcome').classList.add('hidden');
    }
    $('btn-welcome-later').addEventListener('click', closeWelcome);
    $('btn-welcome-go').addEventListener('click', () => {
        closeWelcome();
        $('btn-open-settings').click();
        setTimeout(() => { const t = document.querySelector('.settings-tab[data-pane="conexion"]'); if (t) t.click(); }, 50);
    });
    setTimeout(maybeShowWelcome, 1200);

    setTimeout(checkForUpdate, 2500);
    setInterval(checkForUpdate, 6 * 60 * 60 * 1000); // y cada 6 horas si la app queda abierta

    function applyTopDonorVisibility() {
        const card = document.querySelector('.top-donor-stat');
        if (card) card.classList.toggle('hidden', state.settings.showTopDonor !== true);
    }
    applyTopDonorVisibility();

    function updateStats() {
        const real = state.donations.filter(d => !d.isTest);
        const tests = state.donations.filter(d => d.isTest);
        // Si todavía no hay donaciones reales, las estadísticas usan las de prueba (marcadas "prueba")
        const onlyTests = real.length === 0 && tests.length > 0;
        const base = onlyTests ? tests : real;
        const tag = onlyTests ? ' (prueba)' : '';

        const readCount = state.donations.filter(d => d.isRead).length;
        if (els.badgeReadCount) els.badgeReadCount.textContent = readCount;

        const pending = list => list.filter(d => !d.isRead).length;
        const money = list => formatSummary(summarize(list.filter(d => base.includes(d))));

        if (state.showAmounts) {
            els.totalAmount.textContent = `${pending(state.donations)} pend. · ${money(state.donations)}${tag}`;
        } else {
            els.totalAmount.textContent = `${pending(state.donations)} mensajes`;
        }
        activePlatforms().forEach(k => {
            const el = platformStatEls[k];
            if (!el) return;
            const list = state.donations.filter(d => platformKey(d.platform) === k);
            el.textContent = state.showAmounts ? `${pending(list)} pend. · ${money(list)}${tag}` : `${pending(list)} mensajes`;
        });

        const top = topDonors(base, 1)[0];
        if (top) {
            els.topDonor.textContent = (state.showAmounts ? `${top.nick} (${formatSummary(top.sum)})` : top.nick) + tag;
            els.topDonor.title = onlyTests
                ? 'Calculado con donaciones de prueba. Cuando llegue la primera donación real, las pruebas dejan de contar.'
                : 'Quien más donó en total';
        } else {
            els.topDonor.textContent = '-';
            els.topDonor.title = '';
        }
    }

    // --- MODAL VISTA EN GRANDE (FOCUS MODAL) ---
    window.openFocusModal = function(id) {
        const item = state.donations.find(d => d.id === id);
        if (!item) return;

        state.activeFocusId = id;

        els.focusNick.textContent = panelNick(item.nick);
        { const old = document.getElementById('focus-rank'); if (old) old.remove();
          const rb = rankBadgeHTML(rankFor(item.nick, 'panel'));
          if (rb) { els.focusNick.insertAdjacentHTML('afterend', rb); els.focusNick.nextElementSibling.id = 'focus-rank'; } }
        // Rango dado a mano (si hay rangos "a mano" creados)
        const rs = $('focus-rank-select');
        if (rs) {
            const manual = (state.settings.ranks || []).map((r, i) => ({ r, i })).filter(x => x.r.mode === 'manual');
            const show = !!state.settings.ranksEnabled && manual.length > 0 && !item.isTest;
            rs.classList.toggle('hidden', !show);
            if (show) {
                const key = nickKey(item.nick);
                const cur = manual.find(x => manualUsers(x.r).has(key));
                rs.innerHTML = '<option value="-1">Sin rango a mano</option>' + manual.map(x => `<option value="${x.i}">${escapeHTML(x.r.name)}</option>`).join('');
                rs.value = cur ? String(cur.i) : '-1';
            }
        }
        const bb = $('btn-focus-block');
        if (bb) {
            const blk = isBlocked(item.nick);
            bb.classList.toggle('hidden', !!item.isTest);
            bb.querySelector('span').textContent = blk ? 'Desbloquear' : 'Bloquear';
            bb.classList.toggle('is-blocked', blk);
        }
        els.focusAmount.textContent = item.formattedAmount;
        els.focusAmount.style.color = amountColor(item, 'panel');
        els.focusMessage.innerHTML = item.message ? `"${messageHTML(item.message)}"` : '(Sin mensaje)';
        
        els.focusAvatar.innerHTML = item.avatar 
            ? `<img src="${item.avatar}" style="width:100%;height:100%;border-radius:50%">` 
            : escapeHTML(panelNick(item.nick).charAt(0).toUpperCase());

        const pInfo = platformInfo(item.platform);
        els.focusPlatformTag.className = `platform-tag ${platformKey(item.platform)}`;
        els.focusPlatformTag.innerHTML = `<i class="${pInfo.icon}"></i> ${pInfo.label.toUpperCase()}`;
        els.focusCardBody.style.setProperty('--focus-accent', pInfo.color);

        els.btnFocusToggleRead.innerHTML = item.isRead 
            ? `<i class="fa-solid fa-arrow-rotate-left"></i> Restaurar a Pendientes` 
            : `<i class="fa-solid fa-check-circle"></i> Marcar como Leído`;

        els.modalFocus.classList.remove('hidden');
    };

    window.closeFocusModal = function() {
        els.modalFocus.classList.add('hidden');
        state.activeFocusId = null;
    };

    els.btnCloseFocus.addEventListener('click', window.closeFocusModal);

    $('focus-rank-select').addEventListener('change', (e) => {
        const item = state.donations.find(d => d.id === state.activeFocusId);
        if (!item) return;
        const idx = parseInt(e.target.value);
        setManualRank(item.nick, idx);
        rankCache.key = '';
        render();
        refreshOverlayMessages();
        const r = (state.settings.ranks || [])[idx];
        showToast(r ? `${escapeHTML(item.nick)} ahora es ${escapeHTML(r.name)}` : `${escapeHTML(item.nick)} ya no tiene rango a mano`, 'success');
        const rb = rankBadgeHTML(rankFor(item.nick, 'panel'));
        const old = document.getElementById('focus-rank'); if (old) old.remove();
        if (rb) { els.focusNick.insertAdjacentHTML('afterend', rb); els.focusNick.nextElementSibling.id = 'focus-rank'; }
    });

    $('btn-focus-block').addEventListener('click', () => {
        const item = state.donations.find(d => d.id === state.activeFocusId);
        if (!item) return;
        toggleBlockUser(item.nick);
        window.closeFocusModal();
    });
    // Bloquear o desbloquear a alguien (desde la donación en grande o desde el menú del nombre)
    function toggleBlockUser(nick) {
        const item = { nick };
        const on = !isBlocked(item.nick);
        setBlocked(item.nick, on);
        const k = nickKey(item.nick);
        let hidden = 0;
        state.donations.forEach(d => {
            if (d.isTest || nickKey(d.nick) !== k) return;
            if (on) {
                d.blocked = true;
                if (!d.isRead) { d.isRead = true; dismissOverlayAlert(d.id); hidden++; }
            } else delete d.blocked;
        });
        saveDonationsToStorage();
        render();
        showToast(on ? `${escapeHTML(item.nick)} bloqueado${hidden ? ` (${hidden} pendiente${hidden > 1 ? 's' : ''} pasaron a Leídos)` : ''}. Se desbloquea en Opciones → Filtros.`
                     : `${escapeHTML(item.nick)} desbloqueado`, 'info');
    }

    // ---- Menú rápido al tocar el nombre de alguien en el panel ----
    function openUserMenu(id, anchor) {
        const item = state.donations.find(d => d.id === id);
        const menu = $('user-menu');
        if (!item || !menu) return;
        const key = nickKey(item.nick);
        const mine = state.donations.filter(d => !d.isTest && nickKey(d.nick) === key);
        const total = mine.reduce((a, d) => a + (toARS(d) || 0), 0);
        const blk = isBlocked(item.nick);
        const manual = (state.settings.ranks || []).map((r, i) => ({ r, i })).filter(x => x.r.mode === 'manual');
        const cur = manual.find(x => manualUsers(x.r).has(key));
        const rk = rankFor(item.nick, 'panel');
        menu.innerHTML = `
            <div class="um-head"><strong>${escapeHTML(item.nick)}</strong>${rankBadgeHTML(rk)}</div>
            <div class="um-stats">${mine.length} donaci${mine.length === 1 ? 'ón' : 'ones'} · ${formatMoney(Math.round(total), 'ARS')} en total</div>
            ${item.isTest ? '<p class="pane-note">Es una donación de prueba.</p>' : `
            <label class="um-row"><span><i class="fa-solid fa-crown"></i> Rango a mano</span>
                <select id="um-rank">${manual.length ? '<option value="-1">Ninguno</option>' + manual.map(x => `<option value="${x.i}"${cur && cur.i === x.i ? ' selected' : ''}>${escapeHTML(x.r.name)}</option>`).join('') : '<option value="-1">Creá uno en Opciones → Destacar</option>'}</select></label>
            ${!state.settings.ranksEnabled && manual.length ? '<small class="pane-note">Los rangos están apagados en Opciones → Destacar.</small>' : ''}
            <button type="button" class="um-btn" id="um-filter"><i class="fa-solid fa-magnifying-glass"></i> Ver sus donaciones</button>
            <button type="button" class="um-btn${blk ? '' : ' danger'}" id="um-block"><i class="fa-solid fa-user-slash"></i> ${blk ? 'Desbloquear' : 'Bloquear'}</button>`}`;
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        menu.classList.remove('hidden');
        const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
        menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
        menu.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
        menu.dataset.id = id;
        const rs = $('um-rank');
        if (rs) rs.addEventListener('change', () => {
            const idx = parseInt(rs.value);
            if (!manual.length) return;
            setManualRank(item.nick, idx);
            rankCache.key = '';
            render(); refreshOverlayMessages();
            const rr = (state.settings.ranks || [])[idx];
            showToast(rr ? `${escapeHTML(item.nick)} ahora es ${escapeHTML(rr.name)}` : `${escapeHTML(item.nick)} ya no tiene rango a mano`, 'success');
            closeUserMenu();
        });
        const fb = $('um-filter');
        if (fb) fb.addEventListener('click', () => { els.inputSearch.value = item.nick; state.filter.search = item.nick; render(); closeUserMenu(); els.inputSearch.focus(); });
        const bb = $('um-block');
        if (bb) bb.addEventListener('click', () => { toggleBlockUser(item.nick); closeUserMenu(); });
    }
    function closeUserMenu() { const m = $('user-menu'); if (m) m.classList.add('hidden'); }
    document.addEventListener('click', (e) => { if (!e.target.closest('#user-menu') && !e.target.closest('[data-act="user"]')) closeUserMenu(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeUserMenu();
        const t = e.target.closest && e.target.closest('.user-link');
        if (t && e.key === 'Enter') { e.preventDefault(); openUserMenu(t.dataset.id, t); }
    });

    els.btnFocusSpeak.addEventListener('click', () => {
        if (state.activeFocusId) {
            window.speakCardMessage(state.activeFocusId);
        }
    });

    els.btnFocusToggleRead.addEventListener('click', () => {
        if (state.activeFocusId) {
            window.toggleReadState(state.activeFocusId);
            window.closeFocusModal();
        }
    });

    // --- Global Exposed Functions for Inline Handlers ---
    window.toggleReadState = function(id) {
        const item = state.donations.find(d => d.id === id);
        if (item) {
            item.isRead = !item.isRead;
            if (item.isRead) {
                dismissOverlayAlert(id);
            }
            saveDonationsToStorage();
            render();
            showToast(item.isRead ? 'Chat marcado como leído' : 'Chat restaurado a pendientes', 'info');
        }
    };

    window.speakCardMessage = function(id) {
        const item = state.donations.find(d => d.id === id);
        if (item) {
            initAudioContext();
            speakDonation(item, true, true);
        }
    };

    window.deleteCard = function(id) {
        state.donations = state.donations.filter(d => d.id !== id);
        if (state.activeFocusId === id) window.closeFocusModal();
        dismissOverlayAlert(id);
        saveDonationsToStorage();
        render();
    };

    window.postDonation = function(donationData) {
        addDonation(donationData);
    };

    // --- Escucha de Donaciones desde la Extensión, Webhooks y Modo OBS ---
    // Solo se aceptan mensajes de la ventana "Modo OBS" que abrió este panel
    function fromOverlay(event) {
        const src = event.source;
        if (!src || src === window) return false;
        if (src === state.overlayWindow) return true;
        try { return src.opener === window; } catch (e) { return false; }
    }
    window.addEventListener('message', (event) => {
        if (!fromOverlay(event)) return;
        if (event.data && event.data.type === 'OBS_OVERLAY_READY') {
            state.overlayWindow = event.source;
            applyTextScales();
            console.log("📺 Ventana de Modo OBS conectada y sincronizada.");
            syncUnreadToOverlay();
        } else if (event.data && event.data.type === 'MARK_READ') {
            if (event.data.id === 'all') {
                state.donations.forEach(d => { d.isRead = true; });
                saveDonationsToStorage();
                render();
                showToast('Todas las donaciones marcadas como leídas desde OBS', 'info');
            } else {
                const item = state.donations.find(d => d.id === event.data.id);
                if (item && !item.isRead) {
                    item.isRead = true;
                    saveDonationsToStorage();
                    render();
                    showToast(`Chat de ${escapeHTML(item.nick)} marcado como leído desde OBS`, 'info');
                }
            }
        }
    });

    if (state.obsChannel) {
        state.obsChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'MARK_READ') {
                if (event.data.id === 'all') {
                    state.donations.forEach(d => { d.isRead = true; });
                    saveDonationsToStorage();
                    render();
                    showToast('Todas las donaciones marcadas como leídas desde OBS', 'info');
                } else {
                    const item = state.donations.find(d => d.id === event.data.id);
                    if (item && !item.isRead) {
                        item.isRead = true;
                        saveDonationsToStorage();
                        render();
                        showToast(`Chat de ${escapeHTML(item.nick)} marcado como leído desde OBS`, 'info');
                    }
                }
            }
        };
    }

    // --- Real-Time Simulation Engine ---
    const sampleNames = ['Agustin_Gamer', 'MatiasStreamer', 'Lucia_01', 'Gonzalo_X', 'Sofia_Live', 'Kevin_Pro', 'Valen_Perez', 'CoscuFan', 'SpreenLover', 'Lionel_M'];
    const sampleMessages = [
        '¡Un cafecito para el directo! Seguí así crack 🔥',
        '¡Aguante la transmisión! Te banco a muerte bro 🙌',
        'Acá va mi aportecito, gracias por el entretenimiento diario 🚀',
        'Un superchat de la suerte para ganar la partida 💪',
        '¡Sos un genio! Mandale un saludo a la banda de Argentina 🇦🇷',
        '¿Podés mandar un saludo a mi hermanito Facu?',
        'Donación especial por el contenido de calidad ❤️',
        '¡Mucha suerte en el stream de hoy! ¡A romperla!'
    ];
    const sampleAmounts = [150, 350, 750, 1500, 3500, 7500, 12000];

    // Aviso arriba de "Opciones" mientras el simulador está prendido
    function updateSimIndicator() {
        const el = document.getElementById('sim-indicator');
        if (el) el.classList.toggle('hidden', !state.isSimulating);
    }
    (function () {
        const el = document.getElementById('sim-indicator');
        if (el) el.addEventListener('click', () => {
            document.getElementById('btn-open-settings').click();
            setTimeout(() => { const t = document.querySelector('.settings-tab[data-pane="pruebas"]'); if (t) t.click(); }, 50);
        });
    })();

    function startSimulation() {
        if (state.isSimulating) return;
        state.isSimulating = true;
        
        if (els.cfgToggleSim) els.cfgToggleSim.checked = true;
        showToast('Simulador en vivo activado', 'info');
        updateLiveBadge();
        updateSimIndicator();

        generateSampleDonation();

        state.simInterval = setInterval(() => {
            generateSampleDonation();
        }, state.settings.simSpeed * 1000);
    }

    // clearTests = true cuando el usuario apaga el simulador: borra todas las donaciones de prueba
    function stopSimulation(clearTests = false) {
        if (!state.isSimulating) return;
        state.isSimulating = false;
        clearInterval(state.simInterval);
        
        if (els.cfgToggleSim) els.cfgToggleSim.checked = false;
        updateLiveBadge();
        updateSimIndicator();
        if (clearTests) {
            stopAllSpeech();
            const n = clearTestDonations();
            showToast(n ? `Simulador apagado: se borraron ${n} donaciones de prueba` : 'Simulador apagado', 'info');
        } else {
            showToast('Simulador pausado', 'info');
        }
    }

    // Borra todas las donaciones de prueba (simulador y botón "Probar") del panel, la base de datos y OBS
    function clearTestDonations() {
        stopAllSpeech(); // corta cualquier lectura pendiente
        const tests = state.donations.filter(d => d.isTest);
        if (!tests.length) return 0;
        tests.forEach(d => dismissOverlayAlert(d.id));
        state.donations = state.donations.filter(d => !d.isTest);
        if (state.activeFocusId && !state.donations.some(d => d.id === state.activeFocusId)) window.closeFocusModal();
        saveDonationsToStorage();
        refreshPlatformVisibility();
        render();
        updateTestCount();
        return tests.length;
    }

    function updateTestCount() {
        const el = document.getElementById('test-count');
        if (el) el.textContent = state.donations.filter(d => d.isTest).length;
    }

    // Links de prueba para el simulador: sitios conocidos, desconocidos y acortadores,
    // escritos de distintas formas (con https://, con www. o sueltos).
    // Los "desconocidos" usan dominios reservados para ejemplos (no llevan a ningún sitio real).
    const sampleLinks = {
        known: [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'youtu.be/abc123XYZ',
            'https://x.com/usuario/status/1234567890',
            'www.instagram.com/p/Cprueba123/',
            'tiktok.com/@usuario/video/7300000000000000000',
            'https://kick.com/canal-de-prueba',
            'twitch.tv/canal_prueba'
        ],
        unknown: [
            'https://premios-gratis.example.com/reclamar',
            'www.sorteo-oficial.example.net/login',
            'mi-blog.example.org/nota-sobre-el-directo'
        ],
        shortener: [
            'bit.ly/prueba-simulador',
            'https://tinyurl.com/ejemplo-prueba'
        ]
    };
    const linkPhrases = [
        l => `Mirá este video: ${l}`,
        l => `Che, fijate esto ${l} y decime qué opinás`,
        l => `${l} <- pasalo en el directo!`,
        l => `Te dejo esto: ${l}. Abrazo!`
    ];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function randomSampleLink() {
        const r = Math.random();
        const group = r < 0.55 ? 'known' : (r < 0.8 ? 'unknown' : 'shortener');
        return pick(sampleLinks[group]);
    }

    const SIM_AMOUNTS = {
        twitch: { currency: 'BITS', amounts: [100, 300, 500, 1000, 2500, 5000] },
        kick:   { currency: 'KICKS', amounts: [100, 250, 500, 1000, 5000] }
    };

    function generateSampleDonation() {
        const platform = pick(testPlatforms());
        const nick = pick(sampleNames);
        const sim = SIM_AMOUNTS[platform];
        const currency = sim ? sim.currency : 'ARS';
        const amount = sim ? pick(sim.amounts) : pick(sampleAmounts);

        // ~45% de las donaciones de prueba traen un link (a veces dos)
        let msg = pick(sampleMessages);
        const r = Math.random();
        if (r < 0.35) {
            msg = pick(linkPhrases)(randomSampleLink());
        } else if (r < 0.45) {
            msg = `${pick(linkPhrases)(randomSampleLink())} Y también ${randomSampleLink()}`;
        }

        addDonation({
            platform: platform,
            nick: nick,
            amount: amount,
            currency: currency,
            message: msg,
            isTest: true
        });
    }

    // --- Toast Notifications ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid fa-circle-info"></i> <span>${message}</span>`;
        
        els.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // --- Conexión Streamlabs (Socket API): Ceneka + YouTube Super Chats ---
    // Ceneka envía sus donaciones a Streamlabs (evento "donation").
    // Si el canal de YouTube está vinculado en Streamlabs, los Super Chats llegan como evento "superchat".
    // Estado general de todas las conexiones (Streamlabs + canales de StreamElements)
    function overallStatus() {
        const all = [];
        if ((state.settings.slToken || '').trim()) all.push(state.streamlabs.status);
        (typeof seConns !== 'undefined' ? seConns : []).forEach(c => all.push(c.status));
        if (!all.length) return 'idle';
        if (all.includes('connected')) return all.every(x => x === 'connected') ? 'connected' : 'partial';
        if (all.includes('connecting')) return 'connecting';
        return 'error';
    }

    // Indicador de conexión del encabezado:
    //  - muestra "✓ <nombre>" por cada conexión activa (si hay varias, van rotando con un fundido)
    //  - las que no están conectadas no se muestran
    //  - si no hay ninguna conectada: "SIN CONEXIÓN"
    var badgeItems = [];
    var badgeIdx = 0;
    var badgeTimer = null;

    function connectionDetails() {
        const rows = [];
        (typeof seConns !== 'undefined' ? seConns : []).forEach(c => rows.push({ label: c.label, status: c.status, text: c.text }));
        if ((state.settings.slToken || '').trim()) {
            const st = state.streamlabs.status;
            rows.push({ label: 'Streamlabs', status: st, text: st === 'connected' ? 'Conectado' : (st === 'connecting' ? 'Conectando…' : 'Sin conexión') });
        }
        return rows;
    }

    function setBadgeItems(items) {
        const badge = document.getElementById('live-badge');
        if (!badge) return;
        const span = badge.querySelector('span');
        if (items.join('|') === badgeItems.join('|')) return;
        badgeItems = items;
        badgeIdx = 0;
        if (span) span.textContent = items[0] || '';
        clearInterval(badgeTimer);
        badgeTimer = null;
        if (items.length > 1) {
            badgeTimer = setInterval(() => {
                badge.classList.add('fading');
                setTimeout(() => {
                    badgeIdx = (badgeIdx + 1) % badgeItems.length;
                    if (span) span.textContent = badgeItems[badgeIdx];
                    badge.classList.remove('fading');
                }, 350);
            }, 3000);
        }
    }

    function updateLiveBadge() {
        const badge = document.getElementById('live-badge');
        if (!badge) return;
        const rows = connectionDetails();
        const connected = rows.filter(r => r.status === 'connected');
        let cls, items;
        if (connected.length) {
            cls = 'live';
            items = connected.map(r => '✓ ' + r.label);
        } else if (state.isSimulating) {
            cls = 'connecting';
            items = ['SIMULACIÓN'];
        } else {
            cls = rows.some(r => r.status === 'connecting') ? 'connecting' : (rows.length ? 'error' : 'idle');
            items = ['SIN CONEXIÓN'];
        }
        badge.className = 'badge-live ' + cls + (badge.classList.contains('fading') ? ' fading' : '');
        badge.title = rows.length
            ? rows.map(r => `${r.label}: ${r.text}`).join('\n') + (state.isSimulating ? '\nSimulador encendido' : '')
            : 'No hay conexiones configuradas (Opciones → Conexión)';
        setBadgeItems(items);
    }

    function setStreamlabsStatus(status, text) {
        state.streamlabs.status = status;
        updateLiveBadge();
        refreshPlatformVisibility();
        ['sl-status-header', 'sl-status-settings'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.className = 'sl-status ' + status;
            const label = el.querySelector('span');
            if (label) label.textContent = text;
        });
    }

    function parseNumber(value) {
        if (typeof value === 'number') return value;
        if (!value) return 0;
        let str = String(value).replace(/[^\d.,-]/g, '');
        // "1.500,50" (formato AR) -> 1500.50 ; "1,500.50" -> 1500.50 ; "500" -> 500
        if (str.includes(',') && str.includes('.')) {
            str = str.lastIndexOf(',') > str.lastIndexOf('.')
                ? str.replace(/\./g, '').replace(',', '.')
                : str.replace(/,/g, '');
        } else if (str.includes(',')) {
            str = /,\d{1,2}$/.test(str) ? str.replace(',', '.') : str.replace(/,/g, '');
        }
        return parseFloat(str) || 0;
    }

    // Evita mostrar dos veces la misma donación si llega por Streamlabs y por StreamElements
    var recentRealDonations = [];
    function isCrossServiceDuplicate(platform, nick, amount) {
        const now = Date.now();
        recentRealDonations = recentRealDonations.filter(r => now - r.t < 30000);
        const key = platform + '|' + String(nick || '').toLowerCase().trim() + '|' + Math.round((parseFloat(amount) || 0) * 100);
        if (recentRealDonations.some(r => r.key === key)) return true;
        recentRealDonations.push({ key, t: now });
        return false;
    }

    function rememberSLPlatform(p) {
        const list = state.settings.slPlatforms || [];
        if (list.includes(p)) return;
        state.settings.slPlatforms = list.concat(p);
        persistSettings();
        refreshPlatformVisibility();
    }

    function handleStreamlabsEvent(eventData) {
        if (!eventData || !eventData.type) return;
        const items = Array.isArray(eventData.message) ? eventData.message : [eventData.message];

        items.forEach(m => {
            if (!m) return;
            const uid = m._id || m.id || (eventData.event_id ? eventData.event_id + '_' + (m.name || '') : null);
            const sid = uid ? 'sl_' + String(uid).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) : undefined;
            if (uid) {
                if (state.streamlabs.processedIds.has(uid)) return; // evita duplicados
                state.streamlabs.processedIds.add(uid);
            }

            if (eventData.type === 'donation') {
                // Donaciones de Ceneka (y cualquier otra donación que reciba Streamlabs)
                const amount = parseNumber(m.amount);
                if (isCrossServiceDuplicate('ceneka', m.from || m.name, amount)) return;
                addDonation({
                    id: sid,
                    platform: 'ceneka',
                    nick: m.from || m.name || 'Anónimo',
                    amount: amount,
                    currency: m.currency || 'ARS',
                    formattedAmount: m.formatted_amount || m.formattedAmount || `$${amount.toLocaleString('es-AR')}`,
                    message: m.message || '',
                    timestamp: Date.now()
                });
            } else if (eventData.type === 'bits') {
                rememberSLPlatform('twitch');
                // Bits de Twitch (si Twitch está vinculado en Streamlabs)
                const amount = parseNumber(m.amount);
                if (isCrossServiceDuplicate('twitch', m.name || m.display_name, amount)) return;
                addDonation({
                    id: sid,
                    platform: 'twitch',
                    nick: m.name || m.display_name || 'Usuario de Twitch',
                    amount: amount,
                    currency: 'BITS',
                    message: m.message || '',
                    timestamp: Date.now()
                });
            } else if (eventData.type === 'superchat') {
                rememberSLPlatform('youtube');
                // Super Chats de YouTube: el monto viene en "micros" (5000000 = 5)
                const raw = parseNumber(m.amount);
                const amount = raw >= 10000 ? raw / 1000000 : raw;
                if (isCrossServiceDuplicate('youtube', m.name, amount)) return;
                addDonation({
                    id: sid,
                    platform: 'youtube',
                    nick: m.name || 'Usuario de YouTube',
                    amount: amount,
                    currency: m.currency || 'ARS',
                    formattedAmount: m.displayString || `${m.currency || '$'} ${amount.toLocaleString('es-AR')}`,
                    message: m.comment || m.message || '',
                    timestamp: Date.now()
                });
            }
        });
    }

    function disconnectStreamlabs() {
        if (state.streamlabs.socket) {
            try { state.streamlabs.socket.off(); state.streamlabs.socket.disconnect(); } catch (e) {}
            state.streamlabs.socket = null;
        }
        if (state.streamlabs.native) {
            state.streamlabs.native.closed = true;
            clearInterval(state.streamlabs.native.ping);
            clearTimeout(state.streamlabs.native.retryTimer);
            try { state.streamlabs.native.ws.close(); } catch (e) {}
            state.streamlabs.native = null;
        }
    }

    // Conexión a Streamlabs sin librería (protocolo Socket.IO v2 / Engine.IO v3 sobre WebSocket)
    function connectStreamlabsNative(token) {
        const n = { closed: false, ws: null, ping: null, retry: 0, retryTimer: null };
        state.streamlabs.native = n;
        const open = () => {
            if (n.closed) return;
            setStreamlabsStatus('connecting', n.retry ? 'Reconectando…' : 'Conectando…');
            let ws;
            try {
                ws = new WebSocket(`wss://sockets.streamlabs.com/socket.io/?token=${encodeURIComponent(token)}&EIO=3&transport=websocket`);
            } catch (e) {
                setStreamlabsStatus('error', 'Error de conexión');
                return;
            }
            n.ws = ws;
            ws.onmessage = (ev) => {
                const data = String(ev.data || '');
                if (data[0] === '0') {
                    // Apertura: cada cuánto mandar "ping"
                    let interval = 25000;
                    try { interval = JSON.parse(data.slice(1)).pingInterval || interval; } catch (e) {}
                    clearInterval(n.ping);
                    n.ping = setInterval(() => { try { ws.send('2'); } catch (e) {} }, interval);
                } else if (data.startsWith('40')) {
                    const first = n.retry === 0;
                    n.retry = 0;
                    setStreamlabsStatus('connected', 'Streamlabs conectado');
                    if (first) showToast('✅ Conectado a Streamlabs', 'success');
                } else if (data.startsWith('44')) {
                    n.authError = true;
                    setStreamlabsStatus('error', 'Token inválido o error');
                    try { ws.close(); } catch (e) {}
                } else if (data.startsWith('42')) {
                    try {
                        const arr = JSON.parse(data.slice(2));
                        if (arr[0] === 'event') handleStreamlabsEvent(arr[1]);
                    } catch (e) {}
                }
            };
            ws.onerror = () => {};
            ws.onclose = () => {
                clearInterval(n.ping);
                if (n.closed || n.authError) return;
                n.retry++;
                setStreamlabsStatus('connecting', 'Reconectando…');
                n.retryTimer = setTimeout(open, Math.min(30000, 2000 * n.retry));
            };
        };
        open();
    }

    function connectStreamlabs() {
        disconnectStreamlabs();
        const token = (state.settings.slToken || '').trim();
        if (!token) {
            setStreamlabsStatus('idle', 'Sin configurar');
            return;
        }
        if (typeof io === 'undefined') {
            // Sin el archivo socket.io.js: conexión directa (no hace falta ningún archivo extra)
            connectStreamlabsNative(token);
            return;
        }

        setStreamlabsStatus('connecting', 'Conectando…');
        const socket = io(`https://sockets.streamlabs.com?token=${encodeURIComponent(token)}`, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 15000
        });
        state.streamlabs.socket = socket;

        socket.on('connect', () => {
            setStreamlabsStatus('connected', 'Streamlabs conectado');
            showToast('✅ Conectado a Streamlabs', 'success');
        });
        socket.on('disconnect', () => setStreamlabsStatus('connecting', 'Reconectando…'));
        socket.on('connect_error', () => setStreamlabsStatus('error', 'Error de conexión'));
        socket.on('error', (err) => {
            console.warn('Streamlabs error:', err);
            setStreamlabsStatus('error', 'Token inválido o error');
        });
        socket.on('event', handleStreamlabsEvent);
    }

    connectStreamlabs();

    // ==========================================================================
    // STREAMELEMENTS (Astro WebSocket) — un token (JWT) por canal
    // ==========================================================================
    var seConns = [];
    var seProcessedIds = new Set();

    function setSEStatus(c, status, text) {
        c.status = status;
        c.text = text;
        const el = document.getElementById('se-status-' + c.index);
        if (el && el.dataset.token === c.token) {
            el.className = 'sl-status ' + status;
            const label = el.querySelector('span');
            if (label) label.textContent = text;
        }
        updateLiveBadge();
        refreshPlatformVisibility();
    }

    // Guarda la plataforma detectada de un canal (para mostrar solo las conectadas)
    function setDetectedPlatform(c, provider) {
        const p = String(provider || '').toLowerCase();
        if (!c || !PLATFORMS[p] || p === 'ceneka') return;
        const ch = (state.settings.seChannels || [])[c.index];
        if (!ch || String(ch.token || '').trim() !== c.token || ch.detected === p) return;
        ch.detected = p;
        persistSettings();
        refreshPlatformVisibility();
    }

    // Pregunta a StreamElements de qué plataforma es el canal (YouTube, Twitch o Kick)
    function detectSEProvider(c) {
        if (!c || c.providerAsked) return Promise.resolve(c && c.channelId);
        c.providerAsked = true;
        return fetch('https://api.streamelements.com/kappa/v2/channels/me', { headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null)
            .then(j => {
                if (j && j.provider) setDetectedPlatform(c, j.provider);
                if (j && j._id) c.channelId = String(j._id).replace(/[^A-Za-z0-9]/g, '');
                return c.channelId;
            })
            .catch(() => null);
    }

    // --- Donaciones que llegaron con la app cerrada ---
    // Se guarda cuándo se vio cada canal por última vez; al reconectar se le pide a StreamElements
    // la actividad de ese período (hasta 7 días). La primera vez que se conecta un canal no se trae nada viejo.
    function seSeenKey(c) { return String(c.token).slice(-16); }
    function markSESeen(c) {
        if (!c || !c.token) return;
        const map = state.settings.seLastSeen || (state.settings.seLastSeen = {});
        map[seSeenKey(c)] = Date.now();
    }
    setInterval(() => {
        let any = false;
        seConns.forEach(c => { if (c.status === 'connected') { markSESeen(c); any = true; } });
        if (any) persistSettings();
    }, 60000);

    function recoverSEActivities(c) {
        if (!c || c.recoverDone || state.settings.recoverMissed === false) return;
        c.recoverDone = true;
        const map = state.settings.seLastSeen || (state.settings.seLastSeen = {});
        const last = map[seSeenKey(c)];
        markSESeen(c);
        persistSettings();
        if (!last) return; // canal nuevo: arranca desde ahora
        const after = Math.max(last - 2 * 60000, Date.now() - 7 * 24 * 3600000);
        if (Date.now() - after < 60000) return;
        detectSEProvider(c).then(channelId => {
            channelId = channelId || c.channelId;
            if (!channelId) return null;
            const q = new URLSearchParams({ after: new Date(after).toISOString(), before: new Date().toISOString(), limit: '100', origin: 'feed' });
            ['tip', 'superchat', 'cheer', 'kicks'].forEach(t => q.append('types', t));
            return fetch(`https://api.streamelements.com/kappa/v2/activities/${channelId}?${q}`, { headers: { Authorization: 'Bearer ' + c.token, Accept: 'application/json' } })
                .then(r => r.ok ? r.json() : null);
        }).then(list => {
            if (!Array.isArray(list)) return;
            let n = 0;
            list.slice().sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)).forEach(a => {
                const ts = Date.parse(a.createdAt || a.updatedAt || '');
                if (!ts || ts < after) return;
                if (handleSEActivity(a, null, c, { recovered: true, timestamp: ts })) n++;
            });
            if (n) showToast(`📥 Se recuperaron ${n} donaci${n === 1 ? 'ón' : 'ones'} que llegaron con la app cerrada (${escapeHTML(c.label)})`, 'info');
        }).catch(() => {});
    }

    function handleSEActivity(a, msgId, conn, opts) {
        if (!a || !a.type) return;
        opts = opts || {};
        if (conn && !opts.recovered) markSESeen(conn);
        if (conn) {
            const byType = { superchat: 'youtube', cheer: 'twitch', kicks: 'kick' }[a.type];
            if (byType) setDetectedPlatform(conn, byType);
            if (a.provider) setDetectedPlatform(conn, a.provider);
        }
        const id = a._id || a.activityId || msgId;
        const donationId = id ? 'se_' + String(id).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) : undefined;
        if (id) {
            if (seProcessedIds.has(id)) return;
            seProcessedIds.add(id);
        }
        // Ya está en el historial (por ejemplo, recuperada antes)
        if (donationId && state.donations.some(x => x.id === donationId)) return;
        const d = a.data || {};
        const nick = d.displayName || d.username || d.name || 'Anónimo';
        const message = d.message || '';
        const amount = parseNumber(d.amount);
        let item = null;

        switch (a.type) {
            case 'tip':       // Donaciones (Ceneka manda las suyas como "tip")
                item = { platform: 'ceneka', nick, amount, currency: d.currency || 'ARS', message };
                break;
            case 'superchat': // Super Chats de YouTube
                item = { platform: 'youtube', nick, amount, currency: d.currency || 'USD', message };
                break;
            case 'cheer':     // Bits de Twitch
                item = { platform: 'twitch', nick, amount, currency: 'BITS', message };
                break;
            case 'kicks':     // KICKs de Kick
                item = { platform: 'kick', nick, amount, currency: 'KICKS', message };
                break;
            default:
                return; // seguidores, subs, etc.: no se muestran
        }
        if (!item.amount) return;
        if (!opts.recovered && isCrossServiceDuplicate(item.platform, item.nick, item.amount)) return;
        addDonation({ ...item, id: donationId, timestamp: opts.timestamp || Date.now(), recovered: !!opts.recovered });
        return true;
    }

    function openSE(channel, index) {
        const c = {
            label: channel.label || `Canal ${index + 1}`,
            token: String(channel.token || '').trim(),
            index, status: 'connecting', text: 'Conectando…',
            retry: 0, closed: false, authError: false, ws: null, timer: null
        };

        const connect = () => {
            if (c.closed) return;
            setSEStatus(c, 'connecting', c.retry ? 'Reconectando…' : 'Conectando…');
            let ws;
            try {
                ws = new WebSocket('wss://astro.streamelements.com');
            } catch (e) {
                setSEStatus(c, 'error', 'Error de conexión');
                return;
            }
            c.ws = ws;
            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    nonce: 'activities-' + index + '-' + Date.now(),
                    data: { topic: 'channel.activities', token: c.token, token_type: 'jwt' }
                }));
            };
            ws.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }
                if (msg.type === 'response') {
                    if (msg.error) {
                        c.authError = true;
                        const why = msg.error === 'err_unauthorized' ? 'Token inválido'
                            : (msg.data && msg.data.message ? msg.data.message : msg.error);
                        setSEStatus(c, 'error', why);
                        try { ws.close(); } catch (e) {}
                    } else {
                        const first = c.retry === 0 && c.status !== 'connected';
                        c.retry = 0;
                        setSEStatus(c, 'connected', 'Conectado');
                        detectSEProvider(c).then(() => recoverSEActivities(c));
                        if (first) showToast(`✅ StreamElements conectado (${escapeHTML(c.label)})`, 'success');
                    }
                } else if (msg.type === 'message' && msg.topic === 'channel.activities') {
                    handleSEActivity(msg.data, msg.id, c);
                } else if (msg.type === 'reconnect') {
                    try { ws.close(); } catch (e) {}
                }
            };
            ws.onerror = () => {};
            ws.onclose = () => {
                if (c.closed || c.authError) return; // con token inválido no reintenta
                c.retry++;
                setSEStatus(c, 'connecting', 'Reconectando…');
                c.timer = setTimeout(connect, Math.min(30000, 2000 * c.retry));
            };
        };

        connect();
        return c;
    }

    function disconnectAllSE() {
        seConns.forEach(c => {
            c.closed = true;
            clearTimeout(c.timer);
            try { if (c.ws) c.ws.close(); } catch (e) {}
        });
        seConns = [];
    }

    function connectAllSE() {
        disconnectAllSE();
        (state.settings.seChannels || []).forEach((ch, i) => {
            if (String(ch.token || '').trim()) seConns.push(openSE(ch, i));
        });
        updateLiveBadge();
    }

    connectAllSE();

    // --- MODO OBS (Overlay Popup Engine & OBS Studio Source) ---
    function pushToOverlay(donation) {
        if (!donation) return;
        // Si hay un monto mínimo configurado y la donación es menor, no se envía a OBS
        if (belowMin(donation, state.settings.obsMinAmount)) {
            return;
        }

        const payload = overlayPayload(donation);

        const msg = { type: 'NEW_DONATION', data: payload };

        // 1. BroadcastChannel (funciona entre pestañas del mismo origen, ej: localhost)
        if (state.obsChannel) {
            try { state.obsChannel.postMessage(msg); } catch (e) {}
        }

        // 2. localStorage COLA — acumula donaciones para que obs.html las lea sin perder ninguna
        try {
            const queue = JSON.parse(localStorage.getItem('obs_donation_queue') || '[]');
            queue.push({ ...payload, _t: Date.now() });
            localStorage.setItem('obs_donation_queue', JSON.stringify(queue));
        } catch (e) {}

        // 3. Ventana directa via postMessage (funciona siempre, incluso con file://)
        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage(msg, '*'); } catch (e) {}
        }
    }

    function dismissOverlayAlert(id) {
        const msg = { type: 'DISMISS_ALERT', id: id };

        if (state.obsChannel) {
            try { state.obsChannel.postMessage(msg); } catch (e) {}
        }

        // Cola de dismiss para que obs.html las lea sin perder ninguna
        try {
            const queue = JSON.parse(localStorage.getItem('obs_dismiss_queue') || '[]');
            queue.push({ id: id, _t: Date.now() });
            localStorage.setItem('obs_dismiss_queue', JSON.stringify(queue));
        } catch (e) {}

        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage(msg, '*'); } catch (e) {}
        }
    }

    function syncUnreadToOverlay() {
        const unread = state.donations.filter(d => !d.isRead && !belowMin(d, state.settings.obsMinAmount));

        // La ventana de OBS recién abierta arranca limpia: la cola se rearma solo con las pendientes
        // (así no aparecen donaciones que ya leíste mientras la ventana estaba cerrada)
        try {
            localStorage.setItem('obs_dismiss_queue', '[]');
            localStorage.setItem('obs_donation_queue', '[]');
        } catch (e) {}
        if (unread.length === 0) return;

        // Escribir en la cola para que obs.html las cargue inmediatamente
        try {
            const queue = [];
            const existingIds = new Set();

            // Orden cronológico inverso (las más antiguas primero, para que al hacer prepend queden en orden)
            [...unread].reverse().forEach(donation => {
                if (!existingIds.has(donation.id)) {
                    queue.push({ ...overlayPayload(donation), _t: Date.now() });
                }
            });
            localStorage.setItem('obs_donation_queue', JSON.stringify(queue));
        } catch (e) {}

        // Si la ventana ya está abierta, enviar también por postMessage
        if (state.overlayWindow && !state.overlayWindow.closed) {
            [...unread].reverse().forEach(donation => {
                try {
                    state.overlayWindow.postMessage({
                        type: 'NEW_DONATION',
                        data: overlayPayload(donation)
                    }, '*');
                } catch (e) {}
            });
        }
    }

    els.btnOpenOverlay.addEventListener('click', () => {
        syncUnreadToOverlay();
        state.overlayWindow = window.open('obs.html', 'StreamDonations_Overlay', 'width=560,height=760,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
        if (!state.overlayWindow) {
            showToast('Ventana bloqueada. Por favor permite las ventanas emergentes o agrega obs.html a OBS Studio', 'info');
        } else {
            showToast('Ventana de Modo OBS abierta (obs.html)', 'success');
        }
    });

    // Polling: leer la cola de "marcar como leído" desde OBS (funciona en file://)
    setInterval(() => {
        try {
            const raw = localStorage.getItem('obs_mark_read_queue');
            if (raw) {
                const queue = JSON.parse(raw);
                if (Array.isArray(queue) && queue.length > 0) {
                    queue.forEach(data => {
                        if (data && data.id) {
                            if (data.id === 'all') {
                                // Marcar TODAS como leídas
                                state.donations.forEach(d => { d.isRead = true; });
                                saveDonationsToStorage();
                                render();
                                showToast('Todas las donaciones marcadas como leídas desde OBS', 'info');
                            } else {
                                const item = state.donations.find(d => d.id === data.id);
                                if (item && !item.isRead) {
                                    item.isRead = true;
                                    saveDonationsToStorage();
                                    render();
                                    showToast(`Chat de ${escapeHTML(item.nick)} marcado como leído desde OBS`, 'info');
                                }
                            }
                        }
                    });
                    localStorage.setItem('obs_mark_read_queue', '[]');
                }
            }
        } catch(err) {}
    }, 600);

    // --- Event Listeners & Controls ---
    els.inputSearch.addEventListener('input', (e) => {
        state.filter.search = e.target.value;
        render();
    });

    els.selectSort.addEventListener('change', (e) => {
        state.filter.sort = e.target.value;
        render();
    });

    els.selectPlatform.addEventListener('change', (e) => {
        state.filter.platform = e.target.value;
        render();
    });

    els.inputMinAmount.addEventListener('input', (e) => {
        state.filter.minAmount = parseFloat(e.target.value) || 0;
        render();
    });

    // --- Filtro de período (selector compacto + panel "Personalizado") ---
    const periodSelect = document.getElementById('select-period');
    const periodPopover = document.getElementById('period-popover');

    function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

    function fmtShort(d) {
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
               d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }

    function setCustomLabel() {
        const opt = periodSelect.querySelector('option[value="custom"]');
        const { dateFrom, dateTo } = state.filter;
        if (!dateFrom && !dateTo) { opt.textContent = 'Personalizado…'; return; }
        opt.textContent = (dateFrom ? fmtShort(dateFrom) : '…') + ' → ' + (dateTo ? fmtShort(dateTo) : 'ahora');
    }

    function applyPeriod(value) {
        const now = new Date();
        let from = null, to = null;
        switch (value) {
            case 'session': from = new Date(state.settings.sessionStart || now); break;
            case '1h': from = new Date(now.getTime() - 3600 * 1000); break;
            case 'today': from = startOfDay(now); break;
            case 'yesterday': to = startOfDay(now); from = new Date(to.getTime() - 86400 * 1000); break;
            case '7d': from = new Date(now.getTime() - 7 * 86400 * 1000); break;
        }
        state.filter.dateFrom = from;
        state.filter.dateTo = to;
        periodSelect.classList.toggle('filter-active', value !== 'all');
        render();
    }

    function toLocalInput(d) {
        if (!d) return '';
        const off = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - off).toISOString().slice(0, 16);
    }

    function openPeriodPopover() {
        els.inputDateFrom.value = toLocalInput(state.filter.dateFrom);
        els.inputDateTo.value = toLocalInput(state.filter.dateTo);
        periodPopover.classList.remove('hidden');
    }

    function closePeriodPopover() {
        periodPopover.classList.add('hidden');
    }

    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            if (periodSelect.value === 'custom') {
                openPeriodPopover();
            } else {
                closePeriodPopover();
                applyPeriod(periodSelect.value);
                const opt = periodSelect.querySelector('option[value="custom"]');
                opt.textContent = 'Personalizado…';
            }
        });
        // Volver a abrir el panel si ya estaba en "Personalizado"
        periodSelect.addEventListener('mousedown', () => {
            if (periodSelect.value === 'custom' && periodPopover.classList.contains('hidden')) {
                setTimeout(openPeriodPopover, 0);
            }
        });

        const applyCustom = () => {
            state.filter.dateFrom = els.inputDateFrom.value ? new Date(els.inputDateFrom.value) : null;
            state.filter.dateTo = els.inputDateTo.value ? new Date(els.inputDateTo.value) : null;
            const any = state.filter.dateFrom || state.filter.dateTo;
            periodSelect.value = any ? 'custom' : 'all';
            periodSelect.classList.toggle('filter-active', !!any);
            setCustomLabel();
            render();
        };
        els.inputDateFrom.addEventListener('change', applyCustom);
        els.inputDateTo.addEventListener('change', applyCustom);
        document.getElementById('btn-period-ok').addEventListener('click', () => { applyCustom(); closePeriodPopover(); });
        document.getElementById('btn-period-clear').addEventListener('click', () => {
            els.inputDateFrom.value = '';
            els.inputDateTo.value = '';
            applyCustom();
            closePeriodPopover();
        });
        // Cerrar al hacer clic afuera
        document.addEventListener('mousedown', (e) => {
            if (!periodPopover.classList.contains('hidden') && !e.target.closest('.period-group')) {
                closePeriodPopover();
                if (!state.filter.dateFrom && !state.filter.dateTo) periodSelect.value = 'all';
            }
        });
    }

    // Botón para Mostrar/Ocultar Menú del Medio (Filtros) y maximizar espacio de chats
    if (els.btnToggleToolbar) {
        els.btnToggleToolbar.addEventListener('click', () => {
            state.toolbarVisible = !state.toolbarVisible;
            if (els.mainToolbar) els.mainToolbar.classList.toggle('hidden', !state.toolbarVisible);
            syncHeaderToggles();
            try {
                localStorage.setItem('streamdonations_toolbar_visible', state.toolbarVisible);
            } catch (e) {}
            showToast(state.toolbarVisible ? 'Barra de filtros visible' : 'Barra de filtros ocultada (más espacio de chat)', 'info');
        });
    }

    // Botón para alternar entre "Chats Pendientes" e "Historial de Chats Leídos"
    if (els.btnToggleReadView) {
        els.btnToggleReadView.addEventListener('click', () => {
            state.showOnlyRead = !state.showOnlyRead;
            if (state.showOnlyRead) {
                els.btnToggleReadView.classList.add('active-archive');
                if (els.readViewIcon) els.readViewIcon.className = 'fa-solid fa-inbox';
                if (els.readViewText) els.readViewText.textContent = 'Ver Pendientes';
                showToast('Mostrando historial de chats leídos', 'info');
            } else {
                els.btnToggleReadView.classList.remove('active-archive');
                if (els.readViewIcon) els.readViewIcon.className = 'fa-solid fa-box-archive';
                if (els.readViewText) els.readViewText.textContent = 'Chats Leídos';
                showToast('Mostrando chats pendientes', 'info');
            }
            render();
        });
    }

    // Layout Switching
    function setLayout(layout) {
        state.layout = layout;
        state.settings.layout = layout;
        persistSettings();
        els.btnLayoutSplit.classList.toggle('active', layout === 'split');
        els.btnLayoutUnified.classList.toggle('active', layout === 'unified');
    }
    els.btnLayoutSplit.classList.toggle('active', state.layout === 'split');
    els.btnLayoutUnified.classList.toggle('active', state.layout === 'unified');

    // Botones para elegir qué columnas ver en la vista dividida (con la cantidad de pendientes)
    function renderColumnChips(filtered) {
        const wrap = document.getElementById('column-chips');
        if (!wrap) return;
        wrap.classList.toggle('hidden', state.layout !== 'split');
        if (state.layout !== 'split') return;
        const cols = state.settings.splitColumns || [];
        wrap.innerHTML = '<span class="chips-label">Columnas:</span>' + visiblePlatforms().map(k => {
            const n = filtered.filter(d => platformKey(d.platform) === k).length;
            return `<button type="button" class="col-chip ${k} ${cols.includes(k) ? 'active' : ''}" data-col="${k}" title="${cols.includes(k) ? 'Quitar' : 'Mostrar'} la columna de ${PLATFORMS[k].label}">
                <i class="${PLATFORMS[k].icon}"></i> ${PLATFORMS[k].label}${n ? ` <span class="chip-count">${n}</span>` : ''}</button>`;
        }).join('');
    }
    document.getElementById('column-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-col]');
        if (!chip) return;
        const k = chip.dataset.col;
        const cols = new Set(state.settings.splitColumns || []);
        if (cols.has(k)) cols.delete(k); else cols.add(k);
        state.settings.splitColumns = PLATFORM_KEYS.filter(x => cols.has(x));
        persistSettings();
        render();
    });

    els.btnLayoutSplit.addEventListener('click', () => {
        setLayout('split');
        render();
    });

    els.btnLayoutUnified.addEventListener('click', () => {
        setLayout('unified');
        render();
    });

    // Toggles for Sound & TTS (íconos del encabezado)
    function syncHeaderToggles() {
        els.btnToggleSound.classList.toggle('active', state.soundEnabled);
        els.soundIcon.className = state.soundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        els.btnToggleSound.title = 'Sonido de alerta: ' + (state.soundEnabled ? 'activado' : 'desactivado');

        els.btnToggleTts.classList.toggle('active', state.ttsEnabled);
        els.ttsIcon.className = state.ttsEnabled ? 'fa-solid fa-comment-dots' : 'fa-solid fa-comment-slash';
        els.btnToggleTts.title = 'Lectura en voz alta: ' + (state.ttsEnabled ? 'activada' : 'desactivada');

        if (els.btnToggleToolbar) {
            els.btnToggleToolbar.classList.toggle('active', state.toolbarVisible);
            els.btnToggleToolbar.title = 'Barra de filtros: ' + (state.toolbarVisible ? 'visible' : 'oculta');
        }
    }

    els.btnToggleSound.addEventListener('click', () => {
        initAudioContext();
        state.soundEnabled = !state.soundEnabled;
        state.settings.soundEnabled = state.soundEnabled;
        persistSettings();
        syncHeaderToggles();
        if (state.soundEnabled) {
            playDonationSound('tier-yellow');
            showToast('Sonido activado', 'info');
        } else {
            showToast('Sonido desactivado', 'info');
        }
    });

    els.btnToggleTts.addEventListener('click', () => {
        initAudioContext();
        state.ttsEnabled = !state.ttsEnabled;
        state.settings.ttsEnabled = state.ttsEnabled;
        persistSettings();
        syncHeaderToggles();
        if (state.ttsEnabled) {
            speakText(UI_EN ? 'Read aloud on.' : 'Lectura en voz alta activada.');
            showToast('Lectura en voz alta activada', 'info');
        } else {
            stopAllSpeech();
            showToast('Lectura en voz alta desactivada', 'info');
        }
    });

    // Toggle Simulación desde Opciones
    // (El interruptor del simulador se aplica al tocar "Guardar cambios", como el resto de las opciones)

    // Clear & Mark Read Buttons
    els.btnMarkAllRead.addEventListener('click', () => {
        if (!state.showOnlyRead) {
            const unread = state.donations.filter(d => !d.isRead);
            if (unread.length === 0) {
                showToast('No hay chats pendientes para marcar', 'info');
                return;
            }
            unread.forEach(d => d.isRead = true);
            dismissOverlayAlert('all');
            saveDonationsToStorage();
            render();
            showToast(`Se marcaron ${unread.length} chats como leídos y archivados`, 'success');
        } else {
            const read = state.donations.filter(d => d.isRead);
            if (read.length === 0) {
                showToast('No hay chats leídos en el historial', 'info');
                return;
            }
            read.forEach(d => d.isRead = false);
            saveDonationsToStorage();
            render();
            showToast(`Se restauraron ${read.length} chats a pendientes`, 'success');
        }
    });

    // "Marcar todo leído" de cada columna de plataforma
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mark-platform]');
        if (!btn) return;
        const k = btn.dataset.markPlatform;
        const info = platformInfo(k);
        const unread = state.donations.filter(d => platformKey(d.platform) === k && !d.isRead);
        if (unread.length === 0) {
            showToast(`No hay ${info.unit} de ${info.label} pendientes`, 'info');
            return;
        }
        unread.forEach(d => { d.isRead = true; dismissOverlayAlert(d.id); });
        saveDonationsToStorage();
        render();
        showToast(`Se marcaron ${unread.length} de ${info.label} como leídos`, 'success');
    });

    if (els.btnMarkUnifiedRead) {
        els.btnMarkUnifiedRead.addEventListener('click', () => {
            const unread = state.donations.filter(d => !d.isRead);
            if (unread.length === 0) {
                showToast('No hay chats pendientes para marcar', 'info');
                return;
            }
            unread.forEach(d => {
                d.isRead = true;
                dismissOverlayAlert(d.id);
            });
            dismissOverlayAlert('all');
            saveDonationsToStorage();
            render();
            showToast(`Se marcaron ${unread.length} chats como leídos`, 'success');
        });
    }

    // Modals & Settings: ver bloque "CONFIGURACIÓN" más abajo

    els.btnResetData.addEventListener('click', () => {
        if (confirm('¿Estás seguro de borrar todos los datos de donaciones registrados?')) {
            state.donations = [];
            saveDonationsToStorage();
            dismissOverlayAlert('all');
            render();
            closeSettings();
            showToast('Datos reiniciados', 'info');
        }
    });

    // ==========================================================================
    // GESTOR DE BASE DE DATOS DE CHATS (Guardar, Levantar, Editar)
    // ==========================================================================

    function openDbModal() {
        switchDbTab('visual');
        if (els.dbEditForm) els.dbEditForm.classList.add('hidden');
        renderDbList();
        renderDbJson();
        if (els.modalDb) els.modalDb.classList.remove('hidden');
    }

    function closeDbModal() {
        if (els.modalDb) els.modalDb.classList.add('hidden');
        if (els.dbEditForm) els.dbEditForm.classList.add('hidden');
    }

    function switchDbTab(tabName) {
        if (tabName === 'visual') {
            if (els.dbTabVisual) els.dbTabVisual.classList.add('active');
            if (els.dbTabJson) els.dbTabJson.classList.remove('active');
            if (els.dbViewVisual) els.dbViewVisual.classList.remove('hidden');
            if (els.dbViewJson) els.dbViewJson.classList.add('hidden');
            renderDbList();
        } else {
            if (els.dbTabJson) els.dbTabJson.classList.add('active');
            if (els.dbTabVisual) els.dbTabVisual.classList.remove('active');
            if (els.dbViewJson) els.dbViewJson.classList.remove('hidden');
            if (els.dbViewVisual) els.dbViewVisual.classList.add('hidden');
            renderDbJson();
        }
    }

    function renderDbJson() {
        if (els.dbJsonTextarea) {
            els.dbJsonTextarea.value = JSON.stringify(state.donations, null, 2);
        }
    }

    function renderDbList() {
        if (!els.dbChatsList) return;

        const searchQuery = (els.dbInputSearch ? els.dbInputSearch.value : '').toLowerCase().trim();
        const platformFilter = els.dbSelectFilterPlatform ? els.dbSelectFilterPlatform.value : 'all';
        const statusFilter = els.dbSelectFilterStatus ? els.dbSelectFilterStatus.value : 'all';

        // Filtrar donaciones para la visualización en la BD
        const filtered = state.donations.filter(d => {
            if (searchQuery) {
                const matchNick = (d.nick || '').toLowerCase().includes(searchQuery);
                const matchMsg = (d.message || '').toLowerCase().includes(searchQuery);
                if (!matchNick && !matchMsg) return false;
            }
            if (platformFilter !== 'all' && d.platform !== platformFilter) return false;
            if (statusFilter === 'unread' && d.isRead) return false;
            if (statusFilter === 'read' && !d.isRead) return false;
            return true;
        });

        // Actualizar estadísticas de la base de datos
        const total = state.donations.length;
        const unread = state.donations.filter(d => !d.isRead).length;
        const read = total - unread;
        const totalMoney = state.donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

        if (els.dbStatCount) els.dbStatCount.innerHTML = `<i class="fa-solid fa-message"></i> ${total} chats`;
        if (els.dbStatUnread) els.dbStatUnread.innerHTML = `<i class="fa-solid fa-clock"></i> ${unread} pendientes`;
        if (els.dbStatRead) els.dbStatRead.innerHTML = `<i class="fa-solid fa-check"></i> ${read} leídos`;
        if (els.dbStatTotalMoney) els.dbStatTotalMoney.innerHTML = `<i class="fa-solid fa-coins"></i> Total: $${totalMoney.toLocaleString('es-AR')}`;

        if (els.dbFooterStatus) {
            els.dbFooterStatus.innerHTML = state.settings.autoSaveDb !== false
                ? `<i class="fa-solid fa-circle-check" style="color:#10B981;"></i> <span>Auto-guardado activo: ${total} chats guardados en este navegador.</span>`
                : `<i class="fa-solid fa-circle-pause" style="color:#F59E0B;"></i> <span>Auto-guardado desactivado.</span>`;
        }

        if (filtered.length === 0) {
            els.dbChatsList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-database" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.4;"></i>
                    <p style="font-size: 0.95rem; font-weight: 600;">No se encontraron chats</p>
                    <small style="opacity: 0.7;">${state.donations.length === 0 ? 'La base de datos está vacía. Recibe donaciones o presiona "Nuevo Chat".' : 'Ningún registro coincide con los filtros aplicados.'}</small>
                </div>
            `;
            return;
        }

        els.dbChatsList.innerHTML = filtered.map(d => {
            const dateStr = d.timestamp ? new Date(d.timestamp).toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : 'Fecha desconocida';

            const platformLabel = platformInfo(d.platform).label;
            const formattedAmt = d.formattedAmount || ('$' + (d.amount || 0).toLocaleString('es-AR'));

            return `
                <div class="db-item ${platformKey(d.platform)} ${d.isRead ? 'is-read' : ''}" data-id="${d.id}">
                    <div class="db-item-left">
                        <span class="db-item-platform-tag ${platformKey(d.platform)}">${platformLabel}</span>
                        <div class="db-item-info">
                            <div class="db-item-header">
                                <span class="db-item-nick">${escapeHTML(d.nick || 'Anónimo')}</span>
                                <span class="db-item-amount">${formattedAmt}</span>
                                <span class="db-item-date">${dateStr}</span>
                            </div>
                            <div class="db-item-msg" title="${escapeHTML(d.message || '')}">
                                ${escapeHTML(d.message || '(Sin mensaje)')}
                            </div>
                        </div>
                    </div>
                    <div class="db-item-right">
                        <span class="db-status-pill ${d.isRead ? 'read' : 'unread'}" data-act="db-toggle" data-id="${d.id}" title="Clic para alternar estado">
                            ${d.isRead ? '<i class="fa-solid fa-check"></i> Leído' : '<i class="fa-solid fa-clock"></i> Pendiente'}
                        </span>
                        <button class="db-item-btn" data-act="db-edit" data-id="${d.id}" title="Editar este registro">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="db-item-btn btn-delete" data-act="db-delete" data-id="${d.id}" title="Eliminar de la base de datos">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Exportar base de datos a archivo .json descargable
    // Exportar a planilla (.csv con ; para Excel en español, con BOM para que respete las tildes)
    function csvCell(v) {
        let t = String(v == null ? '' : v).replace(/\r?\n/g, ' ');
        if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita que Excel lo tome como fórmula
        return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }
    function exportDonationsCSV(range) {
        let list = state.donations.slice();
        if (range === 'session') list = sessionDonations();
        else if (range === 'today') { const t0 = startOfDay(new Date()).getTime(); list = list.filter(d => d.timestamp >= t0); }
        else if (range === 'view') list = getFilteredDonations();
        list = list.filter(d => !d.isTest).sort((a, b) => a.timestamp - b.timestamp);
        if (!list.length) { showToast('No hay donaciones para exportar', 'info'); return; }
        const pad = n => String(n).padStart(2, '0');
        const head = ['Fecha', 'Hora', 'Plataforma', 'Usuario', 'Monto', 'Moneda', 'Monto en pesos (aprox.)', 'Mensaje', 'Leída', 'Bloqueado'];
        const rows = list.map(d => {
            const dt = new Date(d.timestamp);
            const ars = toARS(d);
            return [
                `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`,
                `${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
                platformInfo(d.platform).label, d.nick,
                String(Math.round((d.amount || 0) * 100) / 100).replace('.', ','), d.currency,
                ars == null || isNaN(ars) ? '' : String(Math.round(ars)), d.message,
                d.isRead ? 'Sí' : 'No', d.blocked ? 'Sí' : ''
            ].map(csvCell).join(';');
        });
        const csv = '﻿' + head.join(';') + '\r\n' + rows.join('\r\n') + '\r\n';
        const now = new Date();
        const filename = `donaciones_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        showToast(`Planilla "${filename}" guardada con ${list.length} donaciones`, 'success');
    }

    function exportDonationsToFile() {
        if (state.donations.length === 0) {
            showToast('No hay chats en la base de datos para exportar', 'info');
            return;
        }

        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10) + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        const filename = `donaciones_chats_${dateStr}.json`;

        const exportData = {
            appName: 'StreamDonations',
            version: '2.0',
            exportedAt: now.toISOString(),
            totalChats: state.donations.length,
            donations: state.donations
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`Archivo "${filename}" guardado con ${state.donations.length} chats`, 'success');
    }

    // Importar base de datos desde archivo .json seleccionado
    function importDonationsFromFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                let incoming = [];

                if (Array.isArray(parsed)) {
                    incoming = parsed;
                } else if (parsed && Array.isArray(parsed.donations)) {
                    incoming = parsed.donations;
                } else {
                    showToast('El archivo no contiene un formato de chats válido', 'danger');
                    return;
                }

                if (incoming.length === 0) {
                    showToast('El archivo importado no contiene ninguna donación', 'info');
                    return;
                }

                // Normalizar cada donación importada
                const normalized = incoming.filter(x => x && typeof x === 'object').map(item => {
                    const amt = parseFloat(item.amount) || 0;
                    return {
                        id: item.id || ('don_imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                        platform: platformKey(item.platform),
                        nick: item.nick || 'Anónimo',
                        amount: amt,
                        currency: item.currency || 'ARS',
                        formattedAmount: item.formattedAmount || `$${amt.toLocaleString('es-AR')}`,
                        message: item.message || '',
                        timestamp: item.timestamp || Date.now(),
                        isRead: !!item.isRead,
                        tier: item.tier || tierFor(item.platform, amt, item.currency),
                        avatar: item.avatar || null
                    };
                }).map(safeDonation);

                const replace = confirm(
                    `Se encontraron ${normalized.length} chats en el archivo.\n\n` +
                    `¿Deseas REEMPLAZAR todos los chats actuales?\n\n` +
                    `• Aceptar = REEMPLAZAR la base de datos completa con este archivo.\n` +
                    `• Cancelar = FUSIONAR (agregar solo los que no existan).`
                );

                if (replace) {
                    state.donations = normalized;
                } else {
                    const currentIds = new Set(state.donations.map(d => d.id));
                    normalized.forEach(item => {
                        if (!currentIds.has(item.id)) {
                            state.donations.push(item);
                        }
                    });
                }

                saveDonationsToStorage();
                render();
                renderDbList();
                renderDbJson();
                syncUnreadToOverlay();

                showToast(`Se levantaron correctamente ${normalized.length} chats desde el archivo`, 'success');
            } catch (err) {
                console.error('Error al leer el archivo JSON:', err);
                showToast('Error al parsear el archivo JSON: formato corrupto', 'danger');
            }
        };

        reader.readAsText(file);
    }

    // Funciones globales expuestas para los botones de la tabla BD
    window.dbToggleRead = function(id) {
        const item = state.donations.find(d => d.id === id);
        if (item) {
            item.isRead = !item.isRead;
            if (item.isRead) dismissOverlayAlert(id);
            saveDonationsToStorage();
            render();
            renderDbList();
            renderDbJson();
        }
    };

    window.dbEditChat = function(id) {
        const item = state.donations.find(d => d.id === id);
        if (!item || !els.dbEditForm) return;

        if (els.dbEditId) els.dbEditId.value = item.id;
        if (els.dbEditNick) els.dbEditNick.value = item.nick || '';
        if (els.dbEditAmount) els.dbEditAmount.value = item.amount || 0;
        if (els.dbEditPlatform) els.dbEditPlatform.value = item.platform || 'ceneka';
        if (els.dbEditStatus) els.dbEditStatus.value = item.isRead ? 'read' : 'unread';
        if (els.dbEditMsg) els.dbEditMsg.value = item.message || '';
        if (els.dbFormTitle) els.dbFormTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Chat';

        els.dbEditForm.classList.remove('hidden');
        if (els.dbEditNick) els.dbEditNick.focus();
    };

    window.dbDeleteChat = function(id) {
        const item = state.donations.find(d => d.id === id);
        const name = item ? item.nick : 'este registro';
        if (confirm(`¿Eliminar la donación de "${name}" de la base de datos?`)) {
            state.donations = state.donations.filter(d => d.id !== id);
            dismissOverlayAlert(id);
            saveDonationsToStorage();
            render();
            renderDbList();
            renderDbJson();
            showToast('Registro eliminado de la base de datos', 'info');
        }
    };

    // Event listeners para controles del Gestor de Base de Datos
    if (els.btnOpenDb) els.btnOpenDb.addEventListener('click', openDbModal);
    if (els.cfgBtnOpenDb) {
        els.cfgBtnOpenDb.addEventListener('click', () => {
            if (settingsDirty && !confirm('Tenés cambios sin guardar en la configuración.\n\n¿Abrir la base de datos sin guardarlos?')) return;
            closeSettings();
            openDbModal();
        });
    }
    if (els.btnCloseDb) els.btnCloseDb.addEventListener('click', closeDbModal);
    if (els.btnCloseDbFooter) els.btnCloseDbFooter.addEventListener('click', closeDbModal);

    if (els.dbTabVisual) els.dbTabVisual.addEventListener('click', () => switchDbTab('visual'));
    if (els.dbTabJson) els.dbTabJson.addEventListener('click', () => switchDbTab('json'));

    if (els.dbInputSearch) els.dbInputSearch.addEventListener('input', renderDbList);
    if (els.dbSelectFilterPlatform) els.dbSelectFilterPlatform.addEventListener('change', renderDbList);
    if (els.dbSelectFilterStatus) els.dbSelectFilterStatus.addEventListener('change', renderDbList);

    if (els.dbBtnExport) els.dbBtnExport.addEventListener('click', exportDonationsToFile);
    if ($('db-btn-export-csv')) $('db-btn-export-csv').addEventListener('click', () => exportDonationsCSV('all'));
    if ($('btn-export-csv')) $('btn-export-csv').addEventListener('click', () => exportDonationsCSV($('cfg-csv-range').value));
    if (els.dbBtnImportTrigger && els.dbFileInput) {
        els.dbBtnImportTrigger.addEventListener('click', () => els.dbFileInput.click());
        els.dbFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                importDonationsFromFile(e.target.files[0]);
            }
            e.target.value = '';
        });
    }

    // Agregar nuevo chat manual
    if (els.dbBtnAddChat) {
        els.dbBtnAddChat.addEventListener('click', () => {
            if (els.dbEditId) els.dbEditId.value = '';
            if (els.dbEditNick) els.dbEditNick.value = '';
            if (els.dbEditAmount) els.dbEditAmount.value = '';
            if (els.dbEditPlatform) els.dbEditPlatform.value = 'ceneka';
            if (els.dbEditStatus) els.dbEditStatus.value = 'unread';
            if (els.dbEditMsg) els.dbEditMsg.value = '';
            if (els.dbFormTitle) els.dbFormTitle.innerHTML = '<i class="fa-solid fa-plus"></i> Nuevo Chat Manual';

            if (els.dbEditForm) {
                els.dbEditForm.classList.remove('hidden');
                if (els.dbEditNick) els.dbEditNick.focus();
            }
        });
    }

    // Guardar formulario de edición/creación
    if (els.dbBtnSaveForm) {
        els.dbBtnSaveForm.addEventListener('click', () => {
            const id = (els.dbEditId ? els.dbEditId.value : '').trim();
            const nick = (els.dbEditNick ? els.dbEditNick.value.trim() : '') || 'Anónimo';
            const amountNum = parseFloat(els.dbEditAmount ? els.dbEditAmount.value : 0) || 0;
            const platform = els.dbEditPlatform ? els.dbEditPlatform.value : 'ceneka';
            const isRead = els.dbEditStatus ? els.dbEditStatus.value === 'read' : false;
            const msg = els.dbEditMsg ? els.dbEditMsg.value.trim() : '';

            // Moneda: Bits para Twitch, KICKs para Kick; si se edita y no cambia de plataforma, se conserva la que tenía
            const defaultCurrency = platform === 'twitch' ? 'BITS' : (platform === 'kick' ? 'KICKS' : 'ARS');
            const existing = id ? state.donations.find(d => d.id === id) : null;
            const currency = existing && existing.platform === platform ? (existing.currency || defaultCurrency) : defaultCurrency;
            const tier = tierFor(platform, amountNum, currency);

            if (id) {
                // Editar existente
                const item = existing;
                if (item) {
                    item.nick = nick;
                    item.amount = amountNum;
                    item.currency = currency;
                    item.formattedAmount = formatMoney(amountNum, currency);
                    item.platform = platform;
                    item.isRead = isRead;
                    item.message = msg;
                    item.tier = tier;

                    if (isRead) dismissOverlayAlert(id);
                    showToast(`Chat de "${escapeHTML(nick)}" actualizado`, 'success');
                }
            } else {
                // Crear nuevo
                const newDonation = {
                    id: 'don_manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    platform: platform,
                    nick: nick,
                    amount: amountNum,
                    currency: currency,
                    formattedAmount: formatMoney(amountNum, currency),
                    message: msg,
                    timestamp: Date.now(),
                    isRead: isRead,
                    tier: tier,
                    avatar: null
                };
                state.donations.unshift(newDonation);
                if (!isRead) pushToOverlay(newDonation);
                showToast(`Nuevo chat de "${escapeHTML(nick)}" registrado`, 'success');
            }

            saveDonationsToStorage();
            render();
            renderDbList();
            renderDbJson();

            if (els.dbEditForm) els.dbEditForm.classList.add('hidden');
        });
    }

    if (els.dbBtnCancelForm) {
        els.dbBtnCancelForm.addEventListener('click', () => {
            if (els.dbEditForm) els.dbEditForm.classList.add('hidden');
        });
    }

    if (els.dbBtnCancelEdit) {
        els.dbBtnCancelEdit.addEventListener('click', () => {
            if (els.dbEditForm) els.dbEditForm.classList.add('hidden');
        });
    }

    // Botones del editor JSON
    if (els.dbBtnSaveJson) {
        els.dbBtnSaveJson.addEventListener('click', () => {
            if (!els.dbJsonTextarea) return;
            try {
                const parsed = JSON.parse(els.dbJsonTextarea.value);
                let incoming = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.donations) ? parsed.donations : null);

                if (!incoming) {
                    showToast('El JSON debe ser un array de donaciones [ { ... } ]', 'danger');
                    return;
                }

                state.donations = incoming.filter(x => x && typeof x === 'object').map(item => {
                    const amt = parseFloat(item.amount) || 0;
                    return {
                        id: item.id || ('don_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                        platform: platformKey(item.platform),
                        nick: item.nick || 'Anónimo',
                        amount: amt,
                        currency: item.currency || 'ARS',
                        formattedAmount: item.formattedAmount || `$${amt.toLocaleString('es-AR')}`,
                        message: item.message || '',
                        timestamp: item.timestamp || Date.now(),
                        isRead: !!item.isRead,
                        tier: item.tier || tierFor(item.platform, amt, item.currency),
                        avatar: item.avatar || null
                    };
                }).map(safeDonation);

                saveDonationsToStorage();
                render();
                renderDbList();
                syncUnreadToOverlay();
                showToast(`Base de datos actualizada con ${state.donations.length} chats`, 'success');
            } catch (err) {
                console.error('Error de sintaxis JSON:', err);
                showToast('Error de sintaxis en el código JSON. Revisa comas y corchetes.', 'danger');
            }
        });
    }

    if (els.dbBtnFormatJson) {
        els.dbBtnFormatJson.addEventListener('click', () => {
            if (!els.dbJsonTextarea) return;
            try {
                const parsed = JSON.parse(els.dbJsonTextarea.value);
                els.dbJsonTextarea.value = JSON.stringify(parsed, null, 2);
                showToast('JSON formateado correctamente', 'info');
            } catch (err) {
                showToast('No se pudo formatear: el JSON tiene errores de sintaxis', 'danger');
            }
        });
    }

    if (els.dbBtnCopyJson) {
        els.dbBtnCopyJson.addEventListener('click', () => {
            if (!els.dbJsonTextarea) return;
            navigator.clipboard.writeText(els.dbJsonTextarea.value)
                .then(() => showToast('Código JSON copiado al portapapeles', 'success'))
                .catch(() => showToast('No se pudo copiar al portapapeles', 'danger'));
        });
    }

    if (els.dbBtnClearAll) {
        els.dbBtnClearAll.addEventListener('click', () => {
            if (confirm('¿Estás seguro de vaciar toda la base de datos de chats? Esta acción no se puede deshacer.')) {
                state.donations = [];
                saveDonationsToStorage();
                dismissOverlayAlert('all');
                render();
                renderDbList();
                renderDbJson();
                showToast('Base de datos vaciada por completo', 'info');
            }
        });
    }

    // ==========================================================================
    // META DE DONACIONES (opcional)
    // ==========================================================================
    function goalDonations() {
        const start = state.settings.goalStart || 0;
        return state.donations.filter(d => !d.isTest && d.timestamp >= start);
    }

    function goalState() {
        const sum = summarize(goalDonations());
        const target = parseFloat(state.settings.goalTarget) || 0;
        const current = sum.ars;
        const percent = target > 0 ? Math.floor((current / target) * 100) : 0;
        return {
            enabled: !!state.settings.goalEnabled && target > 0,
            title: state.settings.goalTitle || 'Meta',
            current: current,
            target: target,
            percent: percent,
            currentText: formatARS(current),
            targetText: formatARS(target)
        };
    }

    var lastGoalPayload = '';
    function updateGoal() {
        const g = goalState();
        const bar = document.getElementById('goal-bar');
        if (bar) {
            bar.classList.toggle('hidden', !g.enabled);
            if (g.enabled) {
                document.getElementById('goal-title').textContent = g.title;
                document.getElementById('goal-numbers').textContent = `${g.currentText} / ${g.targetText}`;
                document.getElementById('goal-percent').textContent = `${g.percent}%`;
                document.getElementById('goal-fill').style.width = Math.min(100, g.percent) + '%';
                bar.classList.toggle('complete', g.percent >= 100);
            }
        }

        // Enviar a la ventana de OBS (solo si cambió algo)
        const payload = {
            enabled: g.enabled && state.settings.goalShowInObs !== false,
            title: g.title,
            current: g.current,
            target: g.target,
            percent: g.percent,
            currentText: g.currentText,
            targetText: g.targetText
        };
        const json = JSON.stringify(payload);
        if (json === lastGoalPayload) return;
        lastGoalPayload = json;
        try { localStorage.setItem('obs_goal_state', json); } catch (e) {}
        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage({ type: 'GOAL_UPDATE', data: payload }, '*'); } catch (e) {}
        }
    }

    function forceGoalSync() {
        lastGoalPayload = '';
        updateGoal();
    }

    // ==========================================================================
    // RESUMEN DEL DIRECTO / NUEVO DIRECTO
    // ==========================================================================
    function sessionDonations() {
        const start = state.settings.sessionStart || 0;
        return state.donations.filter(d => !d.isTest && d.timestamp >= start);
    }

    function renderSessionModal() {
        const list = sessionDonations();
        const since = new Date(state.settings.sessionStart || Date.now());
        document.getElementById('session-since').textContent =
            'Desde el ' + since.toLocaleDateString('es-AR') + ' a las ' + since.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('session-count').textContent = list.length;
        const sessWrap = document.getElementById('session-platform-stats');
        if (sessWrap) {
            sessWrap.innerHTML = activePlatforms().map(k => {
                const sub = list.filter(d => platformKey(d.platform) === k);
                return `<div class="session-stat ${k}"><span class="session-stat-label">${k === 'youtube' ? 'Super Chats' : PLATFORMS[k].label}</span><span class="session-stat-value">${escapeHTML(formatSummary(summarize(sub)))}</span></div>`;
            }).join('');
        }
        document.getElementById('session-total').textContent = formatSummary(summarize(list));

        const top = topDonors(list, 5);
        const ol = document.getElementById('session-top');
        ol.innerHTML = top.length
            ? top.map(t => `<li><span class="session-top-nick">${escapeHTML(t.nick)} <span class="platform-tag ${platformKey(t.platform)}">${platformInfo(t.platform).label}</span></span><span class="session-top-amount">${escapeHTML(formatSummary(t.sum))}</span></li>`).join('')
            : '<li class="session-empty">Todavía no hay donaciones en este directo.</li>';
    }

    function sessionSummaryText() {
        const list = sessionDonations();
        const since = new Date(state.settings.sessionStart || Date.now());
        const lines = [
            `Resumen del directo (${since.toLocaleDateString('es-AR')})`,
            `Donaciones: ${list.length} · Total: ${formatSummary(summarize(list))}`,
            activePlatforms().map(k => `${k === 'youtube' ? 'Super Chats' : PLATFORMS[k].label}: ${formatSummary(summarize(list.filter(d => platformKey(d.platform) === k)))}`).join(' · ')
        ];
        const top = topDonors(list, 5);
        if (top.length) {
            lines.push('¡Gracias! ' + top.map(t => `${t.nick} (${formatSummary(t.sum)})`).join(', '));
        }
        return lines.join('\n');
    }

    function openSessionModal() {
        renderSessionModal();
        document.getElementById('modal-session').classList.remove('hidden');
    }

    function closeSessionModal() {
        document.getElementById('modal-session').classList.add('hidden');
    }

    function startNewSession() {
        if (!confirm('¿Empezar un nuevo directo?\n\nSe marcan como leídas todas las donaciones pendientes y el resumen arranca de cero. El historial no se borra.')) return;
        clearTestDonations();
        state.donations.forEach(d => { d.isRead = true; });
        dismissOverlayAlert('all');
        state.settings.sessionStart = Date.now();
        if (state.settings.goalResetOnSession) state.settings.goalStart = Date.now();
        persistSettings();
        saveDonationsToStorage();
        if (periodSelect && periodSelect.value === 'session') applyPeriod('session');
        render();
        renderSessionModal();
        showToast('¡Nuevo directo iniciado! Buen stream 🎙️', 'success');
    }

    // ==========================================================================
    // LEER SIGUIENTE (atajo: barra espaciadora) / REPETIR (R)
    // ==========================================================================
    function nextPending() {
        return state.donations
            .filter(d => !d.isRead && !belowMin(d, state.settings.minDisplayAmount)
                && (state.filter.platform === 'all' || d.platform === state.filter.platform))
            .sort((a, b) => a.timestamp - b.timestamp)[0];
    }

    function readNext() {
        initAudioContext();
        const d = nextPending();
        if (!d) {
            window.closeFocusModal();
            showToast('No hay donaciones pendientes', 'info');
            return;
        }
        d.isRead = true;
        dismissOverlayAlert(d.id);
        saveDonationsToStorage();
        render();
        state.lastReadId = d.id;
        window.openFocusModal(d.id);
        speakDonation(d, true, true);
        const left = state.donations.filter(x => !x.isRead).length;
        showToast(left ? `Quedan ${left} pendientes (Espacio = siguiente)` : 'Era la última pendiente', 'info');
    }

    function repeatLast() {
        const d = state.donations.find(x => x.id === (state.activeFocusId || state.lastReadId));
        if (d) speakDonation(d, true, true);
    }

    // ==========================================================================
    // PRUEBA DE ALERTAS
    // ==========================================================================
    const TEST_SAMPLES = {
        ceneka:  { nick: 'Prueba Ceneka',  amount: 1500, currency: 'ARS',   message: 'Esta es una donación de prueba. Si la ves y la escuchás, todo funciona. Link de prueba: youtube.com/watch?v=dQw4w9WgXcQ' },
        youtube: { nick: 'Prueba YouTube', amount: 5,    currency: 'USD',   formattedAmount: 'US$5.00', message: 'Super Chat de prueba.' },
        twitch:  { nick: 'Prueba Twitch',  amount: 500,  currency: 'BITS',  message: 'Bits de prueba.' },
        kick:    { nick: 'Prueba Kick',    amount: 1000, currency: 'KICKS', message: 'KICKs de prueba.' }
    };

    function sendTestAlerts() {
        initAudioContext();
        testPlatforms().forEach((k, i) => {
            const smp = TEST_SAMPLES[k];
            setTimeout(() => addDonation({ platform: k, ...smp, nick: T(smp.nick), message: T(smp.message), isTest: true }), i * 1500);
        });
    }

    // ==========================================================================
    // CONFIGURACIÓN (modal por secciones)
    // ==========================================================================
    function $(id) { return document.getElementById(id); }

    function populateVoices(selectedName) {
        const select = $('cfg-voice');
        if (!select || !('speechSynthesis' in window)) return;
        const voices = window.speechSynthesis.getVoices();
        const spanish = rankSpanishVoices(voices);
        const others = voices.filter(v => !spanish.includes(v));
        const opt = v => `<option value="${escapeHTML(v.name)}">${escapeHTML(v.name)} (${escapeHTML(v.lang)})</option>`;
        const auto = spanish[0];
        const autoLabel = LOCAL_VOICES.length ? LOCAL_VOICES[0].label : (auto ? auto.name : '');
        const localOpts = LOCAL_VOICES.map(v => `<option value="local:${escapeHTML(v.id)}">${escapeHTML(v.label)}</option>`).join('');
        select.innerHTML = `<option value="">Automática${autoLabel ? ' — ' + escapeHTML(autoLabel) : ' (primera voz en español)'}</option>` +
            (localOpts ? `<optgroup label="Voces incluidas (sin internet)">${localOpts}</optgroup>` : '') +
            (spanish.length ? `<optgroup label="${LOCAL_VOICES.length ? 'Voces de Windows' : 'Español'}">${spanish.map(opt).join('')}</optgroup>` : '') +
            (others.length ? `<optgroup label="Otros idiomas">${others.map(opt).join('')}</optgroup>` : '');
        select.value = selectedName || '';
        if (select.value !== (selectedName || '')) select.value = '';
    }

    function updateVoiceSliderLabels() {
        $('lbl-voice-rate').textContent = parseFloat($('cfg-voice-rate').value).toFixed(1) + 'x';
        const p = parseFloat($('cfg-voice-pitch').value);
        $('lbl-voice-pitch').textContent = p < 0.95 ? 'Más grave' : (p > 1.05 ? 'Más agudo' : 'Normal');
        $('lbl-voice-volume').textContent = $('cfg-voice-volume').value + '%';
    }

    function updateGoalFieldsState() {
        const on = $('cfg-goal-enabled').checked;
        $('goal-fields').classList.toggle('disabled', !on);
        const g = summarize(goalDonations());
        const start = new Date(state.settings.goalStart || Date.now());
        $('goal-progress-text').textContent = `${formatSummary(g)} desde el ${start.toLocaleDateString('es-AR')} ${start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // --- Conexiones en el formulario de configuración ---
    var seDraft = [];

    function renderPlatformToggles() {
        const wrap = $('platform-toggles');
        if (!wrap) return; // (ya no se usa: las columnas se eligen en la vista dividida)
        wrap.innerHTML = PLATFORM_KEYS.map(k => `
            <label class="platform-toggle ${k}">
                <input type="checkbox" id="cfg-platform-${k}" ${state.settings.platforms[k] ? 'checked' : ''}>
                <i class="${PLATFORMS[k].icon}"></i> ${PLATFORMS[k].label}
            </label>`).join('');
    }

    function renderSEList() {
        const wrap = $('se-list');
        if (!wrap) return;
        if (!seDraft.length) {
            wrap.innerHTML = '<p class="pane-note se-empty">Todavía no agregaste ningún canal de StreamElements.</p>';
            return;
        }
        wrap.innerHTML = seDraft.map((ch, i) => {
            const conn = seConns.find(c => c.index === i && c.token === String(ch.token || '').trim());
            const st = conn ? conn.status : 'idle';
            const txt = conn ? conn.text : (String(ch.token || '').trim() ? 'Se conecta al guardar' : 'Sin token');
            const det = ch.detected || guessPlatformFromLabel(ch.label);
            const autoTxt = det ? 'Automática (' + PLATFORMS[det].label + ')' : 'Automática (se detecta al conectar)';
            const pv = ch.platform || 'auto';
            const opt = (v, t) => `<option value="${v}" ${pv === v ? 'selected' : ''}>${t}</option>`;
            return `
            <div class="se-row">
                <div class="se-row-top">
                    <input type="text" class="se-label" id="cfg-se-label-${i}" data-i="${i}" maxlength="40" placeholder="Nombre (ej: YouTube, Kick)" value="${escapeHTML(ch.label || '')}">
                    <span class="sl-status ${st}" id="se-status-${i}" data-token="${escapeHTML(String(ch.token || '').trim())}"><i class="fa-solid fa-circle"></i> <span>${escapeHTML(txt)}</span></span>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-se-remove="${i}" title="Quitar este canal"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="se-platform-row">
                    <label for="cfg-se-platform-${i}">Plataforma del canal</label>
                    <select class="se-platform" id="cfg-se-platform-${i}" data-i="${i}">
                        ${opt('auto', autoTxt)}${opt('youtube', 'YouTube')}${opt('twitch', 'Twitch')}${opt('kick', 'Kick')}${opt('none', 'Solo Ceneka')}
                    </select>
                </div>
                <div class="input-with-btn">
                    <input type="password" class="se-token" id="cfg-se-token-${i}" data-i="${i}" placeholder="Pegá acá el JWT Token del canal" autocomplete="off" spellcheck="false" value="${escapeHTML(ch.token || '')}">
                    <button type="button" class="btn btn-outline" data-se-eye="${i}" title="Mostrar/ocultar token"><i class="fa-solid fa-eye"></i></button>
                </div>
            </div>`;
        }).join('');
    }

    function syncSEDraftFromInputs() {
        seDraft = seDraft.map((ch, i) => ({
            label: ($('cfg-se-label-' + i) ? $('cfg-se-label-' + i).value : ch.label || '').trim(),
            token: ($('cfg-se-token-' + i) ? $('cfg-se-token-' + i).value : ch.token || '').trim(),
            platform: $('cfg-se-platform-' + i) ? $('cfg-se-platform-' + i).value : (ch.platform || 'auto'),
            detected: ch.detected || ''
        }));
    }

    function initConnectionsForm() {
        $('btn-add-se').addEventListener('click', () => {
            syncSEDraftFromInputs();
            if (seDraft.length >= 6) { showToast('Máximo 6 canales', 'info'); return; }
            seDraft.push({ label: '', token: '' });
            renderSEList();
            setSettingsDirty(true);
            const last = $('cfg-se-label-' + (seDraft.length - 1));
            if (last) last.focus();
        });
        $('se-list').addEventListener('click', (e) => {
            const rm = e.target.closest('[data-se-remove]');
            if (rm) {
                syncSEDraftFromInputs();
                seDraft.splice(parseInt(rm.dataset.seRemove), 1);
                renderSEList();
                setSettingsDirty(true);
                return;
            }
            const eye = e.target.closest('[data-se-eye]');
            if (eye) {
                const input = $('cfg-se-token-' + eye.dataset.seEye);
                input.type = input.type === 'password' ? 'text' : 'password';
                eye.innerHTML = input.type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
            }
        });
    }

    function fillSettingsForm() {
        const st = state.settings;
        setSettingsDirty(false);
        renderPlatformToggles();
        seDraft = (st.seChannels || []).map(c => ({ label: c.label || '', token: c.token || '', platform: c.platform || 'auto', detected: c.detected || '' }));
        renderSEList();
        $('cfg-kick-usd').value = st.kickUsd ?? 0.01;
        themeDraft = st.theme || 'oscuro';
        $('cfg-custom-accent').value = st.customAccent || '#00E676';
        $('lbl-custom-accent').textContent = $('cfg-custom-accent').value.toUpperCase();
        $('custom-accent-row').classList.toggle('hidden', themeDraft !== 'custom');
        renderThemePicker(themeDraft);
        $('cfg-panel-text').value = clampNum(st.panelTextScale, 0.7, 2.5, 1);
        $('cfg-obs-text').value = clampNum(st.obsTextScale, 0.7, 2.5, 1);
        $('cfg-obs-amount').value = clampNum(st.obsAmountScale, 0.5, 1.6, 0.8);
        $('cfg-panel-head').value = clampNum(st.panelHeadScale, 0.6, 1.4, 0.85);
        $('cfg-obs-head').value = clampNum(st.obsHeadScale, 0.5, 1.4, 0.75);
        updateTextScaleLabels();
        fillLookForm();
        renderSyncForm();
        $('cfg-sl-token').value = st.slToken || '';
        $('cfg-sl-token').type = 'password';
        $('cfg-sound-enabled').checked = state.soundEnabled;
        $('cfg-sound-choice').value = st.soundChoice || 'campana';
        $('cfg-sound-volume').value = clampNum(st.soundVolume, 0, 1, 0.8);
        $('sound-file-name').textContent = st.soundFileName || 'Sin archivo';
        $('sound-file-name').dataset.file = st.soundFileName || '';
        $('sound-file-name').dataset.ver = st.soundFileVer || 0;
        $('cfg-sound-maxsecs').value = String(st.soundMaxSecs ?? 3);
        $('cfg-fx-enabled').checked = !!st.fxEnabled;
        $('cfg-fx-min').value = st.fxMin || '';
        stylesDraft = cleanStyles(st.styles).map(x => JSON.parse(JSON.stringify(x)));
        fillStyleSelect($('cfg-fx-style'), st.fxStyle || '');
        renderStyleChips();
        $('cfg-fx-panel').checked = st.fxPanel !== false;
        $('cfg-fx-obs').checked = st.fxObs !== false;
        $('cfg-obs-pstyle').value = st.obsPlatformStyle || 'tag';
        $('cfg-panel-pstyle').value = st.panelPlatformStyle || 'tag';
        { const lay = cleanObsLayout(st.obsLayout); Object.keys(LAYOUT_FIELDS).forEach(k => { $(LAYOUT_FIELDS[k]).value = lay[k]; }); }
        $('cfg-amt-enabled').checked = !!st.amtColorsEnabled;
        $('cfg-amt-panel').checked = st.amtColorsPanel !== false;
        $('cfg-amt-obs').checked = st.amtColorsObs !== false;
        amtDraft = cleanAmtColors(st.amtColors).map(r => ({ ...r }));
        renderAmtForm();
        $('cfg-ranks-enabled').checked = !!st.ranksEnabled;
        $('cfg-ranks-days').value = st.ranksDays || 30;
        $('cfg-ranks-name').checked = st.ranksShowName !== false;
        $('cfg-ranks-panel').checked = st.ranksPanel !== false;
        $('cfg-ranks-obs').checked = st.ranksObs !== false;
        // Se ordenan una sola vez al abrir (primero los "a mano", después por monto); mientras editás no se mueven
        ranksDraft = cleanRanks(st.ranks).map(r => ({ ...r }))
            .sort((a, b) => (a.mode === 'manual' ? 0 : 1) - (b.mode === 'manual' ? 0 : 1) || a.min - b.min);
        renderRanksForm();
        updateHighlightForm();
        updateAmtVisibility();
        $('cfg-big-sound-enabled').checked = !!st.bigSoundEnabled;
        $('cfg-big-sound-min').value = st.bigSoundMin || '';
        $('cfg-big-sound-choice').value = st.bigSoundChoice || 'fanfarria';
        $('cfg-big-sound-volume').value = clampNum(st.bigSoundVolume, 0, 1, 0.9);
        $('cfg-big-sound-maxsecs').value = String(st.bigSoundMaxSecs ?? 6);
        $('big-sound-file-name').textContent = st.bigSoundFileName || 'Sin archivo';
        $('big-sound-file-name').dataset.file = st.bigSoundFileName || '';
        $('big-sound-file-name').dataset.ver = st.bigSoundFileVer || 0;
        updateSoundForm();
        $('cfg-tts-enabled').checked = state.ttsEnabled;
        $('cfg-donation-toasts').checked = st.donationToasts !== false;
        populateVoices(st.voiceName);
        $('cfg-min-tts').value = st.minTts || '';
        $('cfg-toggle-amounts').checked = state.showAmounts;
        $('cfg-min-display-amount').value = st.minDisplayAmount || '';
        $('cfg-min-obs-amount').value = st.obsMinAmount || '';
        $('cfg-usd-rate').value = st.usdRate || '';
        $('cfg-obs-hide-message').checked = !!st.obsHideMessage;
        $('cfg-obs-filter-bar').checked = st.obsFilterBar !== false;
        $('cfg-show-top-donor').checked = st.showTopDonor === true;
        $('cfg-links-panel').checked = st.linksInPanel !== false;
        $('cfg-links-full').checked = !!st.panelLinkFull;
        $('cfg-obs-links').value = st.obsLinkMode || 'hide';
        $('cfg-strip-tracking').checked = st.stripTracking !== false;
        $('cfg-recover-missed').checked = st.recoverMissed !== false;
        $('cfg-language').value = window.SD_LANG === 'en' ? 'en' : 'es';
        $('cfg-hotkeys').checked = !!st.hotkeys;
        $('cfg-banned-words').value = st.bannedWords || '';
        $('cfg-censor-obs').checked = st.censorObs !== false;
        $('cfg-censor-tts').checked = st.censorTts !== false;
        $('cfg-censor-panel').checked = !!st.censorPanel;
        $('cfg-blocked-users').value = st.blockedUsers || '';
        $('cfg-censor-test').value = '';
        $('cfg-censor-result').innerHTML = '&nbsp;';
        $('cfg-tts-links').value = st.ttsLinkMode || 'domain';
        $('cfg-voice-rate').value = clampNum(st.voiceRate, 0.5, 2, 1);
        $('cfg-voice-pitch').value = clampNum(st.voicePitch, 0.5, 1.5, 1);
        $('cfg-voice-volume').value = Math.round(clampNum(st.voiceVolume, 0, 1, 1) * 100);
        updateVoiceSliderLabels();
        $('cfg-obs-duration').value = st.obsDuration || 0;
        $('cfg-goal-enabled').checked = !!st.goalEnabled;
        $('cfg-goal-title').value = st.goalTitle || '';
        $('cfg-goal-target').value = st.goalTarget || '';
        $('cfg-goal-obs').checked = st.goalShowInObs !== false;
        $('cfg-goal-reset-session').checked = !!st.goalResetOnSession;
        $('cfg-auto-save-db').checked = st.autoSaveDb !== false;
        $('cfg-sim-speed').value = st.simSpeed || 10;
        if (els.cfgToggleSim) els.cfgToggleSim.checked = state.isSimulating;
        updateTestCount();
        updateGoalFieldsState();
    }

    function switchSettingsPane(name) {
        document.querySelectorAll('#settings-nav .settings-tab[data-pane]').forEach(b => b.classList.toggle('active', b.dataset.pane === name));
        document.querySelectorAll('.settings-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === name));
    }

    function openSettings(pane) {
        fillSettingsForm();
        switchSettingsPane(pane || 'conexion');
        els.modalSettings.classList.remove('hidden');
    }

    let settingsDirty = false;
    function setSettingsDirty(v) {
        settingsDirty = v;
        const note = document.getElementById('settings-dirty');
        if (note) note.classList.toggle('hidden', !v);
        els.btnSaveSettings.classList.toggle('pulse', v);
    }

    // Cerrar preguntando si hay cambios sin guardar
    function requestCloseSettings() {
        if (settingsDirty && !confirm('Tenés cambios sin guardar.\n\n¿Salir sin guardarlos?')) return;
        closeSettings();
    }

    function closeSettings() {
        setSettingsDirty(false);
        lookDraft = null;
        obsLayoutDraft = null;
        obsPStyleDraft = null;
        applyPanelPStyle(state.settings.panelPlatformStyle);
        applyTheme();      // si había una vista previa sin guardar, vuelve a lo guardado
        applyLook();
        applyTextScales();
        els.modalSettings.classList.add('hidden');
    }

    // Si cambian las opciones de links o de mensajes en OBS, se actualizan las alertas que ya están en pantalla
    function refreshOverlayMessages() {
        const items = state.donations
            .filter(d => !d.isRead)
            .map(d => { const pl = overlayPayload(d); return { id: d.id, nick: pl.nick, message: pl.message, rank: pl.rank, sty: pl.sty || {}, obsHideMessage: !!state.settings.obsHideMessage }; });
        const payload = { ts: Date.now(), items };
        try { localStorage.setItem('obs_alerts_update', JSON.stringify(payload)); } catch (e) {}
        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage({ type: 'UPDATE_ALERTS', data: payload }, '*'); } catch (e) {}
        }
    }

    function saveSettings() {
        const st = state.settings;
        const seBefore = JSON.stringify(st.seChannels || []);
        syncSEDraftFromInputs();
        const oldDetected = {};
        JSON.parse(seBefore).forEach(c => { if (c.token && c.detected) oldDetected[c.token] = c.detected; });
        st.seChannels = seDraft.filter(c => c.token).map((c, i) => ({
            label: c.label || `Canal ${i + 1}`, token: c.token,
            platform: c.platform || 'auto',
            detected: oldDetected[c.token] || ''
        }));
        st.kickUsd = Math.max(0, parseFloat($('cfg-kick-usd').value) || 0);
        st.theme = THEMES[themeDraft] ? themeDraft : 'oscuro';
        st.customAccent = $('cfg-custom-accent').value || '#00E676';
        st.panelTextScale = clampNum($('cfg-panel-text').value, 0.7, 2.5, 1);
        st.obsTextScale = clampNum($('cfg-obs-text').value, 0.7, 2.5, 1);
        st.obsAmountScale = clampNum($('cfg-obs-amount').value, 0.5, 1.6, 0.8);
        st.panelHeadScale = clampNum($('cfg-panel-head').value, 0.6, 1.4, 0.85);
        st.obsHeadScale = clampNum($('cfg-obs-head').value, 0.5, 1.4, 0.75);
        Object.assign(st, readLookForm());
        lookDraft = null;
        const obsBefore = JSON.stringify([st.obsLinkMode, st.obsHideMessage, st.stripTracking, st.bannedWords, st.censorObs]);
        const langBefore = window.SD_LANG || 'es';
        st.language = $('cfg-language').value === 'en' ? 'en' : 'es';
        st.hotkeys = $('cfg-hotkeys').checked;
        document.documentElement.classList.toggle('hotkeys-off', !st.hotkeys);
        st.bannedWords = $('cfg-banned-words').value.slice(0, 20000);
        st.censorObs = $('cfg-censor-obs').checked;
        st.censorTts = $('cfg-censor-tts').checked;
        st.censorPanel = $('cfg-censor-panel').checked;
        st.blockedUsers = $('cfg-blocked-users').value.slice(0, 20000);
        const simSpeedBefore = st.simSpeed;
        const newToken = $('cfg-sl-token').value.trim();
        const tokenChanged = newToken !== (st.slToken || '');
        st.slToken = newToken;

        state.soundEnabled = st.soundEnabled = $('cfg-sound-enabled').checked;
        st.soundChoice = $('cfg-sound-choice').value || 'campana';
        st.soundVolume = clampNum($('cfg-sound-volume').value, 0, 1, 0.8);
        st.soundFileVer = parseInt($('sound-file-name').dataset.ver) || 0;
        st.soundFileName = $('sound-file-name').dataset.file || '';
        st.soundMaxSecs = clampNum($('cfg-sound-maxsecs').value, 0, 10, 3);
        st.fxEnabled = $('cfg-fx-enabled').checked;
        st.fxMin = Math.max(0, parseFloat($('cfg-fx-min').value) || 0);
        st.styles = cleanStyles(stylesDraft);
        st.fxStyle = st.styles.some(x => x.id === $('cfg-fx-style').value) ? $('cfg-fx-style').value : '';
        st.fxPanel = $('cfg-fx-panel').checked;
        st.fxObs = $('cfg-fx-obs').checked;
        st.obsLayout = readObsLayoutForm();
        st.obsPlatformStyle = ['tag', 'color', 'both'].includes($('cfg-obs-pstyle').value) ? $('cfg-obs-pstyle').value : 'tag';
        st.panelPlatformStyle = ['tag', 'color', 'both'].includes($('cfg-panel-pstyle').value) ? $('cfg-panel-pstyle').value : 'tag';
        st.amtColorsEnabled = $('cfg-amt-enabled').checked;
        st.amtColorsPanel = $('cfg-amt-panel').checked;
        st.amtColorsObs = $('cfg-amt-obs').checked;
        syncAmtDraft();
        st.amtColors = cleanAmtColors(amtDraft);
        st.ranksEnabled = $('cfg-ranks-enabled').checked;
        st.ranksDays = Math.min(3650, Math.max(1, parseInt($('cfg-ranks-days').value) || 30));
        st.ranksShowName = $('cfg-ranks-name').checked;
        st.ranksPanel = $('cfg-ranks-panel').checked;
        st.ranksObs = $('cfg-ranks-obs').checked;
        syncRanksDraft();
        st.ranks = cleanRanks(ranksDraft);
        rankCache.key = '';
        setTimeout(refreshOverlayMessages, 50); // los rangos de las alertas que ya están en OBS se actualizan
        st.bigSoundEnabled = $('cfg-big-sound-enabled').checked;
        st.bigSoundMin = Math.max(0, parseFloat($('cfg-big-sound-min').value) || 0);
        st.bigSoundChoice = $('cfg-big-sound-choice').value || 'fanfarria';
        st.bigSoundVolume = clampNum($('cfg-big-sound-volume').value, 0, 1, 0.9);
        st.bigSoundMaxSecs = clampNum($('cfg-big-sound-maxsecs').value, 0, 10, 6);
        st.bigSoundFileVer = parseInt($('big-sound-file-name').dataset.ver) || 0;
        st.bigSoundFileName = $('big-sound-file-name').dataset.file || '';
        state.ttsEnabled = st.ttsEnabled = $('cfg-tts-enabled').checked;
        st.donationToasts = $('cfg-donation-toasts').checked;
        st.voiceName = $('cfg-voice').value || '';
        st.minTts = Math.max(0, parseFloat($('cfg-min-tts').value) || 0);

        state.showAmounts = st.showAmounts = $('cfg-toggle-amounts').checked;
        st.minDisplayAmount = Math.max(0, parseFloat($('cfg-min-display-amount').value) || 0);
        st.obsMinAmount = Math.max(0, parseFloat($('cfg-min-obs-amount').value) || 0);
        st.usdRate = Math.max(0, parseFloat($('cfg-usd-rate').value) || 0);
        st.obsHideMessage = $('cfg-obs-hide-message').checked;
        st.obsFilterBar = $('cfg-obs-filter-bar').checked;
        st.showTopDonor = $('cfg-show-top-donor').checked;
        applyTopDonorVisibility();
        st.linksInPanel = $('cfg-links-panel').checked;
        st.panelLinkFull = $('cfg-links-full').checked;
        st.obsLinkMode = $('cfg-obs-links').value;
        st.stripTracking = $('cfg-strip-tracking').checked;
        st.recoverMissed = $('cfg-recover-missed').checked;
        st.ttsLinkMode = $('cfg-tts-links').value;
        st.voiceRate = clampNum($('cfg-voice-rate').value, 0.5, 2, 1);
        st.voicePitch = clampNum($('cfg-voice-pitch').value, 0.5, 1.5, 1);
        st.voiceVolume = clampNum($('cfg-voice-volume').value / 100, 0, 1, 1);
        st.obsDuration = Math.min(600, Math.max(0, parseInt($('cfg-obs-duration').value) || 0));

        st.goalEnabled = $('cfg-goal-enabled').checked;
        st.goalTitle = $('cfg-goal-title').value.trim();
        st.goalTarget = Math.max(0, parseFloat($('cfg-goal-target').value) || 0);
        st.goalShowInObs = $('cfg-goal-obs').checked;
        st.goalResetOnSession = $('cfg-goal-reset-session').checked;

        st.autoSaveDb = $('cfg-auto-save-db').checked;
        st.simSpeed = Math.min(30, Math.max(1, parseFloat($('cfg-sim-speed').value) || 10));

        if (st.goalEnabled && !st.goalTarget) {
            switchSettingsPane('meta');
            $('cfg-goal-target').focus();
            showToast('Poné un objetivo en pesos para la meta', 'info');
            return;
        }

        if (els.inputMinAmount) els.inputMinAmount.value = st.minDisplayAmount || '';
        persistSettings();
        if (st.autoSaveDb) saveDonationsToStorage();

        const wantSim = !!(els.cfgToggleSim && els.cfgToggleSim.checked);
        if (wantSim && !state.isSimulating) {
            initAudioContext();
            startSimulation();
        } else if (!wantSim && state.isSimulating) {
            stopSimulation(true);
        } else if (wantSim && state.isSimulating && simSpeedBefore !== st.simSpeed) {
            stopSimulation(); startSimulation();
        }
        if (tokenChanged || state.streamlabs.status !== 'connected') connectStreamlabs();
        if (JSON.stringify(st.seChannels) !== seBefore || seConns.some(c => c.status !== 'connected')) connectAllSE();
        lastVisibleKey = '';
        refreshPlatformVisibility();

        syncHeaderToggles();
        updateAudioUnlockBanner();
        forceGoalSync();
        if (JSON.stringify([st.obsLinkMode, st.obsHideMessage, st.stripTracking, st.bannedWords, st.censorObs]) !== obsBefore) { refreshOverlayMessages(); render(); }
        render();
        closeSettings();
        if (st.language !== langBefore) { setTimeout(() => location.reload(), 150); return; }
        showToast('Configuración guardada', 'success');
    }

    // ==========================================================================
    // AVISO DE SONIDO BLOQUEADO
    // ==========================================================================
    function updateAudioUnlockBanner() {
        const banner = $('audio-unlock');
        if (!banner) return;
        const needs = !state.audioUnlocked && (state.soundEnabled || state.ttsEnabled);
        banner.classList.toggle('hidden', !needs);
    }

    function unlockAudio(e) {
        const wasLocked = !state.audioUnlocked;
        state.audioUnlocked = true;
        const banner = $('audio-unlock');
        if (wasLocked && banner && !banner.classList.contains('hidden')) {
            showToast('🔔 Sonidos y notificaciones activos', 'success');
        }
        initAudioContext();
        updateAudioUnlockBanner();
    }

    // ==========================================================================
    // INICIALIZACIÓN DE TODO LO NUEVO
    // ==========================================================================
    function initExtras() {
        // Sonido: cualquier clic o tecla habilita el audio (en el programa de escritorio ya viene habilitado)
        if (DESKTOP_TTS) { state.audioUnlocked = true; try { initAudioContext(); } catch (e) {} }
        // Si Chrome ya permite el sonido sin hacer clic (perfil propio del programa), no hace falta el aviso
        try {
            initAudioContext();
            if (audioCtx && audioCtx.state === 'running') state.audioUnlocked = true;
        } catch (e) {}
        updateAudioUnlockBanner();
        document.addEventListener('pointerdown', unlockAudio, true);
        document.addEventListener('keydown', unlockAudio, true);
        $('audio-unlock').addEventListener('click', () => {
            unlockAudio();
            if (state.soundEnabled) playDonationSound('tier-green');
        });

        // Configuración
        els.btnOpenSettings.addEventListener('click', () => openSettings());
        els.btnCloseSettings.addEventListener('click', requestCloseSettings);
        $('btn-cancel-settings').addEventListener('click', requestCloseSettings);
        const panes = document.querySelector('.settings-panes');
        ['input', 'change'].forEach(ev => panes.addEventListener(ev, (e) => {
            if (e.target && e.target.id && e.target.id.startsWith('cfg-')) setSettingsDirty(true);
        }));
        els.btnSaveSettings.addEventListener('click', saveSettings);
        document.querySelectorAll('#settings-nav .settings-tab[data-pane]').forEach(b =>
            b.addEventListener('click', () => switchSettingsPane(b.dataset.pane)));
        $('btn-toggle-token').addEventListener('click', () => {
            const input = $('cfg-sl-token');
            input.type = input.type === 'password' ? 'text' : 'password';
            $('btn-toggle-token').innerHTML = input.type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        });
        $('btn-test-alerts').addEventListener('click', sendTestAlerts);
        $('btn-clear-tests').addEventListener('click', () => {
            const n = clearTestDonations();
            showToast(n ? `Se borraron ${n} donaciones de prueba` : 'No hay donaciones de prueba', 'info');
        });
        document.querySelectorAll('.goto-montos').forEach(b => b.addEventListener('click', () => switchSettingsPane('montos')));
        $('btn-test-voice').addEventListener('click', () => {
            initAudioContext();
            const st = state.settings;
            const prev = { voiceName: st.voiceName, voiceRate: st.voiceRate, voicePitch: st.voicePitch, voiceVolume: st.voiceVolume, ttsLinkMode: st.ttsLinkMode };
            st.voiceName = $('cfg-voice').value || '';
            st.voiceRate = $('cfg-voice-rate').value;
            st.voicePitch = $('cfg-voice-pitch').value;
            st.voiceVolume = $('cfg-voice-volume').value / 100;
            st.ttsLinkMode = $('cfg-tts-links').value;
            speakDonation({ nick: T('Prueba de voz'), amount: 1500, currency: 'ARS', message: UI_EN ? 'This is how donations will sound. Check out this video: youtube.com/watch?v=abc123' : 'Así se van a escuchar las donaciones. Miren este video: youtube.com/watch?v=abc123' }, true, true);
            Object.assign(st, prev);
        });
        ['cfg-voice-rate', 'cfg-voice-pitch', 'cfg-voice-volume'].forEach(id => $(id).addEventListener('input', updateVoiceSliderLabels));
        $('cfg-goal-enabled').addEventListener('change', updateGoalFieldsState);
        $('btn-goal-reset').addEventListener('click', () => {
            if (!confirm('¿Reiniciar la meta? El progreso vuelve a cero desde ahora.')) return;
            state.settings.goalStart = Date.now();
            persistSettings();
            updateGoalFieldsState();
            forceGoalSync();
            showToast('Meta reiniciada', 'info');
        });
        if ('speechSynthesis' in window) {
            window.speechSynthesis.addEventListener('voiceschanged', () => {
                if (!els.modalSettings.classList.contains('hidden')) populateVoices($('cfg-voice').value);
            });
        }

        // Directo
        $('btn-open-session').addEventListener('click', openSessionModal);
        $('btn-close-session').addEventListener('click', closeSessionModal);
        $('btn-session-new').addEventListener('click', startNewSession);
        $('btn-session-copy').addEventListener('click', () => {
            const text = sessionSummaryText();
            const done = () => showToast('Resumen copiado al portapapeles', 'success');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
            } else {
                fallbackCopy(text, done);
            }
        });

        // Leer siguiente
        $('btn-read-next').addEventListener('click', readNext);

        // Probar el filtro de palabras con lo que está escrito (sin guardar)
        const censorPreview = () => {
            const txt = $('cfg-censor-test').value;
            const saved = state.settings.bannedWords;
            state.settings.bannedWords = $('cfg-banned-words').value;
            const out = txt ? censorText(txt, 'obs', true) : '';
            state.settings.bannedWords = saved;
            $('cfg-censor-result').textContent = txt ? 'En OBS: ' + out : '\u00a0';
        };
        $('cfg-censor-test').addEventListener('input', censorPreview);
        $('cfg-banned-words').addEventListener('input', censorPreview);

        // Cerrar modales tocando el fondo oscuro
        ['modal-settings', 'modal-session', 'modal-focus'].forEach(id => {
            const overlay = $(id);
            overlay.addEventListener('mousedown', (e) => {
                if (e.target !== overlay) return;
                if (id === 'modal-settings') requestCloseSettings();
                else if (id === 'modal-session') closeSessionModal();
                else window.closeFocusModal();
            });
        });

        // Atajos de teclado
        document.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target && e.target.isContentEditable)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const settingsOpen = !els.modalSettings.classList.contains('hidden');
            const sessionOpen = !$('modal-session').classList.contains('hidden');
            const dbOpen = els.modalDb && !els.modalDb.classList.contains('hidden');

            if (e.key === 'Escape') {
                if (!$('modal-link').classList.contains('hidden')) closeLinkModal();
                else if (settingsOpen) requestCloseSettings();
                else if (sessionOpen) closeSessionModal();
                else if (dbOpen) closeDbModal();
                else window.closeFocusModal();
                return;
            }
            if (settingsOpen || sessionOpen || dbOpen || !$('modal-link').classList.contains('hidden')) return;
            if (!state.settings.hotkeys || !$('tour').classList.contains('hidden')) return; // atajos apagados

            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault(); // evita que la barra "aprete" el último botón tocado
                readNext();
            } else if (e.key === 'r' || e.key === 'R') {
                repeatLast();
            } else if (e.key === 'm' || e.key === 'M') {
                const id = state.activeFocusId;
                if (id) { window.toggleReadState(id); window.closeFocusModal(); }
                else showToast('Abrí una donación (o usá Espacio) para marcarla con M', 'info');
            } else if (e.key === 's' || e.key === 'S') {
                stopAllSpeech(); if (typeof stopLocalSpeech === 'function') stopLocalSpeech();
                showToast('Voz callada', 'info');
            } else if (e.key === 'v' || e.key === 'V') {
                els.btnToggleTts.click();
            } else if (e.key === 'b' || e.key === 'B') {
                els.btnToggleSound.click();
            }
        });

        forceGoalSync();
    }

    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { showToast('No se pudo copiar', 'info'); }
        ta.remove();
    }

    // ==========================================================================
    // LINKS EN LOS MENSAJES
    // ==========================================================================
    // Detecta http(s)://..., www.... y dominios sueltos tipo "youtube.com/..." o "x.com/..."
    const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|tv|ar|io|gg|ly|be|me|co|app|link|live|xyz|info)\b(?:\/[^\s<>"']*)?)/gi;

    const KNOWN_SITES = ['youtube.com', 'youtu.be', 'x.com', 'twitter.com', 'instagram.com', 'tiktok.com',
        'kick.com', 'twitch.tv', 'facebook.com', 'fb.watch', 'ceneka.net', 'spotify.com', 'open.spotify.com', 'reddit.com'];
    const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'goo.gl', 'is.gd', 'ow.ly', 'shorturl.at', 'rebrand.ly', 'tiny.cc', 'rb.gy'];

    // --- Protección contra el "doxxing accidental": parámetros que identifican a quien compartió el link ---
    const SHARE_PARAMS = ['si', 'pp', 'feature', 'igsh', 'igshid', 'img_index', 'fbclid', 'mibextid', 'rdid', 'share_url',
        'sfnsn', 'xmt', 'slof', 'gclid', 'dclid', 'msclkid', 'yclid', 'mc_eid', 'mc_cid', 'ref', 'ref_src', 'ref_url',
        'share_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_name',
        '_r', '_t', 'is_from_webapp', 'sender_device', 'share_app_id', 'share_item_id', 'share_link_id',
        'u_code', 'sec_uid', 'tt_from', 'share_author_id', 'social_sharing', 'dl_branch', 'cmpid', 'utm_id'];
    // Parámetros que en algunos sitios son datos útiles (minuto de un video, etc.) y solo se quitan donde son de rastreo
    const SITE_PARAMS = { 'x.com': ['s', 't'], 'twitter.com': ['s', 't'], 'reddit.com': ['context'], 'open.spotify.com': ['context'] };
    function stripTracking(href) {
        try {
            const u = new URL(href);
            const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
            // En YouTube "t" es el minuto del video: se deja. "pp" y "si" se sacan.
            const extra = SITE_PARAMS[host] || [];
            [...u.searchParams.keys()].forEach(k => {
                const kl = k.toLowerCase();
                if (SHARE_PARAMS.includes(kl) || extra.includes(kl) || kl.startsWith('utm_')) u.searchParams.delete(k);
            });
            let out = u.toString();
            if (!u.search) out = out.replace('?', '');
            return out;
        } catch (e) { return href; }
    }
    function trackingOn() { return state.settings.stripTracking !== false; }
    // Links que esconden al que comparte dentro del propio link (no se pueden limpiar sin abrirlos)
    function isShareShortLink(href) {
        try {
            const u = new URL(href);
            const h = u.hostname.toLowerCase().replace(/^www\./, '');
            return /^(vm|vt)\.tiktok\.com$/.test(h) || (h.endsWith('tiktok.com') && /^\/t\//.test(u.pathname)) ||
                (h.endsWith('facebook.com') && /^\/share\//.test(u.pathname)) || (h.endsWith('instagram.com') && /^\/share\//.test(u.pathname)) ||
                h === 'on.soundcloud.com' || h === 'spotify.link';
        } catch (e) { return false; }
    }

    function cleanUrlMatch(raw) {
        // Quita signos de puntuación pegados al final ("mirá esto: youtube.com/xyz).")
        return raw.replace(/[.,;:!?)\]]+$/, '');
    }

    function parseLink(raw) {
        let href = cleanUrlMatch(raw);
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        try {
            const u = new URL(href);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
            const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
            const known = KNOWN_SITES.some(d => host === d || host.endsWith('.' + d));
            const shortener = SHORTENERS.includes(host);
            const finalHref = trackingOn() ? stripTracking(u.href) : u.href;
            return { href: finalHref, host, known, shortener, shareShort: isShareShortLink(u.href) };
        } catch (e) {
            return null;
        }
    }

    // Mensaje para el panel: texto escapado + links como botón
    function messageHTML(msg) {
        if (!msg) return '';
        msg = censorText(msg, 'panel');
        if (state.settings.linksInPanel === false) return escapeHTML(msg);
        let out = '', last = 0;
        String(msg).replace(URL_RE, (match, _g, offset) => {
            const clean = cleanUrlMatch(match);
            const link = parseLink(clean);
            out += escapeHTML(msg.slice(last, offset));
            if (link) {
                const cls = link.known ? 'known' : 'unknown';
                const icon = link.known ? 'fa-solid fa-link' : 'fa-solid fa-triangle-exclamation';
                const label = state.settings.panelLinkFull ? link.href.replace(/^https?:\/\//i, '') : link.host;
                out += `<button type="button" class="msg-link ${cls}${state.settings.panelLinkFull ? ' full' : ''}" data-url="${escapeHTML(link.href)}" title="${escapeHTML(link.href)}"><i class="${icon}"></i> ${escapeHTML(label)}</button>`;
                out += escapeHTML(match.slice(clean.length));
            } else {
                out += escapeHTML(match);
            }
            last = offset + match.length;
            return match;
        });
        out += escapeHTML(msg.slice(last));
        return out;
    }

    // Mensaje para OBS según la opción elegida: "🔗 link", "🔗 youtube.com" o la dirección completa
    function obsMessage(msg) {
        if (!msg) return '';
        const mode = state.settings.obsLinkMode || 'hide';
        if (mode === 'full') {
            if (!trackingOn()) return msg;
            // Se muestra la dirección, pero sin los datos de quién la compartió
            return String(msg).replace(URL_RE, m => {
                const clean = cleanUrlMatch(m), tail = m.slice(clean.length);
                const hadScheme = /^https?:\/\//i.test(clean);
                let out = stripTracking(hadScheme ? clean : 'https://' + clean);
                if (!hadScheme) out = out.replace(/^https:\/\//i, '');
                return out + tail;
            });
        }
        return String(msg).replace(URL_RE, m => {
            const tail = m.slice(cleanUrlMatch(m).length);
            if (mode === 'domain') {
                const l = parseLink(m);
                return '🔗 ' + (l ? l.host : 'link') + tail;
            }
            return '🔗 link' + tail;
        });
    }

    // Mensaje para la voz: NUNCA lee la dirección completa (aunque se muestre en pantalla)
    function spokenMessage(msg) {
        if (!msg) return '';
        const omit = state.settings.ttsLinkMode === 'omit';
        return String(msg).replace(URL_RE, m => {
            const tail = m.slice(cleanUrlMatch(m).length);
            if (omit) return tail + ' ';
            const l = parseLink(m);
            return (UI_EN ? (l ? ` ${l.host} link` : ' a link') : (l ? ` link de ${l.host}` : ' un link')) + tail + ' ';
        }).replace(/\s{2,}/g, ' ').trim();
    }

    let pendingLink = null;
    function openLinkModal(href) {
        const link = parseLink(href);
        if (!link) return;
        pendingLink = link;
        $('link-host').textContent = link.host;
        $('link-url').textContent = link.href;
        const warn = $('link-warning');
        if (link.shortener) {
            warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Es un <strong>link acortado</strong>: no se sabe a qué sitio lleva realmente. Abrilo solo si confiás en quien lo mandó.';
            warn.className = 'link-warning danger';
        } else if (link.shareShort) {
            warn.innerHTML = '<i class="fa-solid fa-user-secret"></i> Es un <strong>link para compartir</strong> que guarda adentro quién lo compartió: al abrirlo, la red puede mostrar "Fulano te compartió esto" con su perfil. No lo abras en una pantalla que esté saliendo al aire.';
            warn.className = 'link-warning danger';
        } else if (!link.known) {
            warn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <strong>Sitio no reconocido.</strong> Revisá la dirección antes de abrirlo y no lo abras en una pantalla que esté saliendo al aire.';
            warn.className = 'link-warning';
        } else {
            warn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Sitio conocido. Igual revisalo antes de mostrarlo en vivo.';
            warn.className = 'link-warning ok';
        }
        $('modal-link').classList.remove('hidden');
    }

    function closeLinkModal() {
        $('modal-link').classList.add('hidden');
        pendingLink = null;
    }

    function initLinks() {
        // Clic en un link de una tarjeta o de la vista en grande (sin abrir la tarjeta)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.msg-link');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            openLinkModal(btn.dataset.url);
        }, true);

        $('btn-link-cancel').addEventListener('click', closeLinkModal);
        $('btn-close-link').addEventListener('click', closeLinkModal);
        $('modal-link').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-link') closeLinkModal(); });
        $('btn-link-open').addEventListener('click', () => {
            if (!pendingLink) return;
            window.open(pendingLink.href, '_blank', 'noopener,noreferrer');
            closeLinkModal();
        });
        $('btn-link-copy').addEventListener('click', () => {
            if (!pendingLink) return;
            const text = pendingLink.href;
            const done = () => showToast('Link copiado', 'success');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
            } else {
                fallbackCopy(text, done);
            }
        });
    }

    // ==========================================================================
    // TEMAS DE COLORES (panel y ventana de OBS)
    // ==========================================================================
    const THEMES = {
        oscuro:  { label: 'Oscuro',        mode: 'dark',  accent: '#8B5CF6', accent2: '#FF2E4D', classic: true },
        claro:   { label: 'Claro',         mode: 'light', accent: '#7C3AED', accent2: '#E11D48' },
        verde:   { label: 'Verde neón',    mode: 'dark',  accent: '#00E676', accent2: '#00BFA5' },
        violeta: { label: 'Violeta',       mode: 'dark',  accent: '#B14CFF', accent2: '#FF3CAC' },
        fuego:   { label: 'Rojo / Naranja', mode: 'dark', accent: '#FF5A1F', accent2: '#FFB300' },
        cyan:    { label: 'Cyan / Azul',   mode: 'dark',  accent: '#00C2FF', accent2: '#00FFC8' },
        xfiles:  { label: 'OVNI',          mode: 'dark',  accent: '#00FF41', accent2: '#39FF14', fx: 'xfiles' },
        custom:  { label: 'Personalizado', mode: 'dark',  accent: null,      accent2: null }
    };

    function hexToRgb(hex) {
        let h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        const n = parseInt(h, 16);
        if (isNaN(n) || h.length !== 6) return [139, 92, 246];
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgbToHex(rgb) { return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
    function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); }
    function rgbStr(hex) { return hexToRgb(hex).join(', '); }

    // Texto oscuro sobre acentos muy claros (verde fluo, amarillo...) para que se lea bien
    function onAccentColor(hex) {
        const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return L > 0.4 ? '#04140A' : '#FFFFFF';
    }

    // Arma todos los colores del tema a partir del color de acento
    function resolveTheme(key, customAccent) {
        const t = THEMES[key] || THEMES.oscuro;
        const accent = key === 'custom' ? (/^#[0-9a-fA-F]{6}$/.test(customAccent || '') ? customAccent : '#00E676') : t.accent;
        const accent2 = key === 'custom' ? mix(accent, '#FFFFFF', 0.35) : t.accent2;
        const light = t.mode === 'light';
        let bg, card, header, toolbar, modal, obsBg;
        if (t.fx === 'xfiles') {
            // Negro puro para que se vean las estrellas
            bg = '#000000'; card = '#03120A'; header = '#000000'; toolbar = '#010805'; modal = '#04110A'; obsBg = '#010A05';
        } else if (t.classic) {
            bg = '#0B0E14'; card = '#161B26'; header = '#0F141E'; toolbar = '#121823'; modal = '#121722'; obsBg = '#0E121C';
        } else if (light) {
            bg = mix('#EEF0F5', accent, 0.04); card = '#FFFFFF'; header = '#FFFFFF'; toolbar = '#FFFFFF'; modal = '#FFFFFF'; obsBg = '#FFFFFF';
        } else {
            bg = mix('#07090D', accent, 0.06); card = mix('#141922', accent, 0.07); header = mix('#0D1118', accent, 0.06);
            toolbar = mix('#10141C', accent, 0.06); modal = mix('#11151F', accent, 0.06); obsBg = mix('#0B0F17', accent, 0.08);
        }
        return {
            key, mode: t.mode, accent, accent2, fx: t.fx || '',
            onAccent: onAccentColor(accent),
            accentRgb: rgbStr(accent),
            accentSoft: light ? mix(accent, '#000000', 0.15) : mix(accent, '#FFFFFF', 0.45),
            accentDark: mix(accent, '#000000', 0.3),
            glow2Rgb: rgbStr(accent2),
            bg, card, header, toolbar, modal, obsBgRgb: rgbStr(obsBg)
        };
    }

    function applyTheme(key, customAccent) {
        const th = resolveTheme(key ?? state.settings.theme, customAccent ?? state.settings.customAccent);
        const r = document.documentElement;
        r.dataset.theme = th.mode;
        r.dataset.fx = th.fx;
        if (window.XFilesFX) { if (th.fx === 'xfiles') window.XFilesFX.start(); else window.XFilesFX.stop(); }
        const set = (k, v) => r.style.setProperty(k, v);
        set('--accent', th.accent);
        set('--accent-rgb', th.accentRgb);
        set('--on-accent', th.onAccent);
        set('--accent-soft', th.accentSoft);
        set('--accent-dark', th.accentDark);
        set('--glow2-rgb', th.glow2Rgb);
        set('--modal-bg', th.modal);
        if (th.mode === 'light') {
            ['--bg-dark', '--bg-card', '--bg-card-hover', '--bg-header', '--bg-toolbar'].forEach(k => r.style.removeProperty(k));
            set('--bg-dark', th.bg);
        } else {
            set('--bg-dark', th.bg);
            set('--bg-card', `rgba(${rgbStr(th.card)}, ${th.fx ? 0.32 : 0.85})`);
            set('--bg-card-hover', `rgba(${rgbStr(mix(th.card, '#FFFFFF', 0.05))}, ${th.fx ? 0.72 : 0.95})`);
            set('--bg-header', `rgba(${rgbStr(th.header)}, ${th.fx ? 0.55 : 0.9})`);
            set('--bg-toolbar', `rgba(${rgbStr(th.toolbar)}, ${th.fx ? 0.5 : 0.85})`);
        }
        if (th.mode === 'light' || THEMES[th.key].classic) {
            r.style.removeProperty('--item-bg');
            r.style.removeProperty('--field-bg');
        } else {
            set('--item-bg', `rgba(${rgbStr(mix(th.card, '#FFFFFF', 0.05))}, ${th.fx ? 0.62 : 0.92})`);
            set('--field-bg', mix(th.modal, '#000000', 0.15));
        }
        currentThemeForObs = th;
        sendObsStyle();
    }
    var currentThemeForObs = null;

    function renderThemePicker(selected) {
        const wrap = $('theme-picker');
        if (!wrap) return;
        wrap.innerHTML = Object.keys(THEMES).map(k => {
            const t = THEMES[k];
            const acc = k === 'custom' ? ($('cfg-custom-accent') ? $('cfg-custom-accent').value : state.settings.customAccent) : t.accent;
            const th = resolveTheme(k, acc);
            const bg = t.mode === 'light' ? '#F4F5F8' : th.bg;
            return `<button type="button" class="theme-swatch ${k === selected ? 'active' : ''}" data-theme-key="${k}" title="${t.label}">
                <span class="swatch-preview" style="background:${bg}">
                    <span class="swatch-bar" style="background:${th.accent}"></span>
                    <span class="swatch-bar short" style="background:${th.accent2}"></span>
                </span>
                <span class="swatch-label">${k === 'custom' ? '<i class="fa-solid fa-palette"></i> ' : ''}${t.label}</span>
            </button>`;
        }).join('');
    }

    // ==========================================================================
    // APARIENCIA: colores por plataforma, fondo del panel, tema y fondo de OBS
    // ==========================================================================
    const PLATFORM_COLOR_DEFAULTS = { ceneka: '#8B5CF6', youtube: '#FF2E4D', twitch: '#9146FF', kick: '#53FC18' };
    const PLATFORM_COLOR_VARS = { ceneka: '--ceneka-purple', youtube: '--youtube-red', twitch: '--twitch-purple', kick: '--kick-green' };
    const MAX_BG_BYTES = 8 * 1024 * 1024;
    const CHROMA_COLORS = ['#FF00FF', '#00FF00', '#0000FF'];
    var lookDraft = null; // vista previa sin guardar

    function cleanColor(c, def) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : def; }
    function platformColorsFrom(src) {
        const pc = src || {};
        const out = {};
        PLATFORM_KEYS.forEach(k => { out[k] = cleanColor(pc[k], PLATFORM_COLOR_DEFAULTS[k]); });
        return out;
    }
    function look() {
        const st = state.settings;
        const base = {
            platformColors: platformColorsFrom(st.platformColors),
            panelBg: Object.assign({ type: 'theme', color: '#0B0E14', dim: 0.5, ver: 0, name: '' }, st.panelBg || {}),
            obsTheme: st.obsTheme || 'same',
            obsCustomAccent: cleanColor(st.obsCustomAccent, '#00E676'),
            obsBg: Object.assign({ type: 'theme', color: '#000000', fit: 'cover', dim: 0.3, ver: 0, name: '' }, st.obsBg || {})
        };
        return Object.assign(base, lookDraft || {});
    }

    function applyPlatformColors(pc) {
        const r = document.documentElement.style;
        PLATFORM_KEYS.forEach(k => {
            r.setProperty(PLATFORM_COLOR_VARS[k], pc[k]);
            r.setProperty('--pc-' + k + '-rgb', rgbStr(pc[k]));
        });
    }

    var panelBgUrl = null, panelBgVer = -1;
    function applyPanelBackground(bg) {
        const r = document.documentElement, b = document.body;
        const clear = () => { r.style.removeProperty('background'); b.style.removeProperty('background'); r.classList.remove('custom-bg'); };
        if (!bg || bg.type === 'theme') { clear(); return; }
        if (bg.type === 'color') {
            r.style.setProperty('background', cleanColor(bg.color, '#0B0E14'), 'important');
            b.style.setProperty('background', 'transparent', 'important');
            r.classList.add('custom-bg');
            return;
        }
        if (bg.type === 'image' && window.SDStore) {
            const paint = () => {
                if (!panelBgUrl) { clear(); return; }
                const d = clampNum(bg.dim, 0, 0.85, 0.5);
                r.style.setProperty('background', `linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d})), url("${panelBgUrl}") center / cover no-repeat fixed`, 'important');
                b.style.setProperty('background', 'transparent', 'important');
                r.classList.add('custom-bg');
            };
            if (panelBgVer === bg.ver && panelBgUrl) { paint(); return; }
            SDStore.get('panelBg').then(blob => {
                if (panelBgUrl) URL.revokeObjectURL(panelBgUrl);
                panelBgUrl = blob ? URL.createObjectURL(blob) : null;
                panelBgVer = bg.ver;
                paint();
            });
        }
    }

    function applyLook() {
        const lk = look();
        applyPlatformColors(lk.platformColors);
        applyPanelBackground(lk.panelBg);
        sendObsStyle();
    }

    function fillLookForm() {
        const lk = look();
        PLATFORM_KEYS.forEach(k => { $('cfg-color-' + k).value = lk.platformColors[k]; });
        $('cfg-panel-bg-type').value = lk.panelBg.type;
        $('cfg-panel-bg-color').value = cleanColor(lk.panelBg.color, '#0B0E14');
        $('cfg-panel-bg-dim').value = clampNum(lk.panelBg.dim, 0, 0.85, 0.5);
        $('panel-bg-name').textContent = lk.panelBg.name || 'Sin imagen';
        $('panel-bg-name').dataset.ver = lk.panelBg.ver || 0;
        const sel = $('cfg-obs-theme');
        sel.innerHTML = '<option value="same">Igual que el panel</option>' +
            Object.keys(THEMES).map(k => `<option value="${k}">${THEMES[k].label}</option>`).join('');
        sel.value = THEMES[lk.obsTheme] ? lk.obsTheme : 'same';
        $('cfg-obs-custom-accent').value = lk.obsCustomAccent;
        $('cfg-obs-bg-type').value = lk.obsBg.type;
        $('cfg-obs-bg-color').value = cleanColor(lk.obsBg.color, '#000000');
        $('cfg-obs-bg-fit').value = lk.obsBg.fit || 'cover';
        $('cfg-obs-chroma').value = CHROMA_COLORS.includes(lk.obsBg.chroma) ? lk.obsBg.chroma : '#FF00FF';
        $('cfg-obs-bg-dim').value = clampNum(lk.obsBg.dim, 0, 0.85, 0.3);
        $('obs-bg-name').textContent = lk.obsBg.name || 'Sin imagen';
        $('obs-bg-name').dataset.ver = lk.obsBg.ver || 0;
        updateLookFormState();
    }

    function readLookForm() {
        const pc = {};
        PLATFORM_KEYS.forEach(k => { pc[k] = cleanColor($('cfg-color-' + k).value, PLATFORM_COLOR_DEFAULTS[k]); });
        return {
            platformColors: pc,
            panelBg: {
                type: $('cfg-panel-bg-type').value, color: $('cfg-panel-bg-color').value,
                dim: clampNum($('cfg-panel-bg-dim').value, 0, 0.85, 0.5),
                ver: parseInt($('panel-bg-name').dataset.ver) || 0,
                name: $('panel-bg-name').textContent === 'Sin imagen' ? '' : $('panel-bg-name').textContent
            },
            obsTheme: $('cfg-obs-theme').value || 'same',
            obsCustomAccent: cleanColor($('cfg-obs-custom-accent').value, '#00E676'),
            obsBg: {
                type: $('cfg-obs-bg-type').value, color: $('cfg-obs-bg-color').value,
                fit: $('cfg-obs-bg-fit').value || 'cover',
                chroma: CHROMA_COLORS.includes($('cfg-obs-chroma').value) ? $('cfg-obs-chroma').value : '#FF00FF',
                dim: clampNum($('cfg-obs-bg-dim').value, 0, 0.85, 0.3),
                ver: parseInt($('obs-bg-name').dataset.ver) || 0,
                name: $('obs-bg-name').textContent === 'Sin imagen' ? '' : $('obs-bg-name').textContent
            }
        };
    }

    function updateLookFormState() {
        const pt = $('cfg-panel-bg-type').value, ot = $('cfg-obs-bg-type').value;
        $('cfg-panel-bg-color').classList.toggle('hidden', pt !== 'color');
        $('panel-bg-file-row').classList.toggle('hidden', pt !== 'image');
        $('panel-bg-dim-row').classList.toggle('hidden', pt !== 'image');
        $('cfg-obs-bg-color').classList.toggle('hidden', ot !== 'color');
        $('obs-bg-file-row').classList.toggle('hidden', ot !== 'image');
        $('obs-bg-fit-row').classList.toggle('hidden', ot !== 'image');
        $('obs-bg-dim-row').classList.toggle('hidden', ot !== 'image');
        $('obs-chroma-row').classList.toggle('hidden', ot !== 'chroma');
        $('obs-chroma-help').classList.toggle('hidden', ot !== 'chroma');
        $('obs-custom-accent-row').classList.toggle('hidden', $('cfg-obs-theme').value !== 'custom');
        $('lbl-panel-bg-dim').textContent = Math.round($('cfg-panel-bg-dim').value * 100) + '%';
        $('lbl-obs-bg-dim').textContent = Math.round($('cfg-obs-bg-dim').value * 100) + '%';
    }

    // Vista previa en vivo mientras se cambian los controles
    function previewLook() {
        updateLookFormState();
        lookDraft = readLookForm();
        applyLook();
    }

    function pickBackground(fileInput, key, nameEl, typeSel) {
        const f = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!f) return;
        if (!/^image\//.test(f.type)) { showToast('Elegí una imagen (JPG, PNG, WEBP o GIF)', 'warning'); return; }
        if (f.size > MAX_BG_BYTES) { showToast('La imagen pesa ' + (f.size / 1048576).toFixed(1) + ' MB. El máximo es 8 MB.', 'warning'); return; }
        SDStore.put(key, f).then(() => {
            nameEl.textContent = f.name;
            nameEl.dataset.ver = Date.now();
            typeSel.value = 'image';
            setSettingsDirty(true);
            previewLook();
        }).catch(() => showToast('No se pudo guardar la imagen', 'warning'));
    }

    function updateSoundForm() {
        const pc = $('cfg-sound-choice').value === 'pc';
        $('sound-file-row').classList.toggle('hidden', !pc);
        $('sound-file-hint').classList.toggle('hidden', !pc);
        $('cfg-sound-maxsecs-row').classList.toggle('hidden', !pc);
        $('lbl-sound-volume').textContent = Math.round($('cfg-sound-volume').value * 100) + '%';
        const bigOn = $('cfg-big-sound-enabled').checked;
        $('big-sound-picker').classList.toggle('hidden', !bigOn);
        const bpc = $('cfg-big-sound-choice').value === 'pc';
        $('big-sound-file-row').classList.toggle('hidden', !bpc);
        $('cfg-big-sound-maxsecs-row').classList.toggle('hidden', !bpc);
        $('lbl-big-sound-volume').textContent = Math.round($('cfg-big-sound-volume').value * 100) + '%';
    }
    // Un selector de sonido (el normal o el especial): opciones, probar y archivo de la PC
    function wireSoundPicker(o) {
        const test = () => playSoundChoice($(o.choice).value, o.tier, $(o.volume).value, parseInt($(o.name).dataset.ver) || 0, o.key, $(o.maxsecs).value);
        $(o.choice).addEventListener('change', () => {
            updateSoundForm();
            if ($(o.choice).value !== 'pc' || $(o.name).dataset.file) test();
        });
        $(o.volume).addEventListener('input', updateSoundForm);
        $(o.maxsecs).addEventListener('change', () => { if ($(o.name).dataset.file) test(); });
        $(o.testBtn).addEventListener('click', test);
        $(o.pickBtn).addEventListener('click', () => $(o.file).click());
        $(o.file).addEventListener('change', () => {
            const f = $(o.file).files && $(o.file).files[0];
            $(o.file).value = '';
            if (!f) return;
            if (!/^audio\//.test(f.type) && !/\.(wav|mp3|ogg)$/i.test(f.name)) { showToast('Elegí un archivo de sonido (WAV, MP3 u OGG)', 'warning'); return; }
            if (f.size > 3 * 1024 * 1024) { showToast('El sonido pesa más de 3 MB', 'warning'); return; }
            SDStore.put(o.key, f).then(() => {
                $(o.name).textContent = f.name; $(o.name).dataset.file = f.name;
                $(o.name).dataset.ver = Date.now();
                $(o.choice).value = 'pc';
                updateSoundForm();
                setSettingsDirty(true);
                test();
            }).catch(() => showToast('No se pudo guardar el sonido', 'warning'));
        });
    }
    function initSoundPicker() {
        wireSoundPicker({ key: 'alertSound', tier: 'tier-green', choice: 'cfg-sound-choice', volume: 'cfg-sound-volume', maxsecs: 'cfg-sound-maxsecs',
            name: 'sound-file-name', testBtn: 'btn-test-sound', pickBtn: 'btn-pick-sound', file: 'sound-file' });
        wireSoundPicker({ key: 'alertSoundBig', tier: 'tier-red', choice: 'cfg-big-sound-choice', volume: 'cfg-big-sound-volume', maxsecs: 'cfg-big-sound-maxsecs',
            name: 'big-sound-file-name', testBtn: 'btn-test-big-sound', pickBtn: 'btn-pick-big-sound', file: 'big-sound-file' });
        $('cfg-big-sound-enabled').addEventListener('change', updateSoundForm);
    }

    function initLook() {
        initSoundPicker();
        applyLook();
        const ids = ['cfg-color-ceneka', 'cfg-color-youtube', 'cfg-color-twitch', 'cfg-color-kick',
            'cfg-panel-bg-type', 'cfg-panel-bg-color', 'cfg-panel-bg-dim',
            'cfg-obs-theme', 'cfg-obs-custom-accent', 'cfg-obs-bg-type', 'cfg-obs-bg-color', 'cfg-obs-bg-fit', 'cfg-obs-bg-dim', 'cfg-obs-chroma'];
        ids.forEach(id => { const el = $(id); if (el) { el.addEventListener('input', previewLook); el.addEventListener('change', previewLook); } });
        $('btn-reset-platform-colors').addEventListener('click', () => {
            PLATFORM_KEYS.forEach(k => { $('cfg-color-' + k).value = PLATFORM_COLOR_DEFAULTS[k]; });
            setSettingsDirty(true);
            previewLook();
        });
        $('btn-panel-bg-pick').addEventListener('click', () => $('panel-bg-file').click());
        $('btn-obs-bg-pick').addEventListener('click', () => $('obs-bg-file').click());
        $('panel-bg-file').addEventListener('change', () => pickBackground($('panel-bg-file'), 'panelBg', $('panel-bg-name'), $('cfg-panel-bg-type')));
        $('obs-bg-file').addEventListener('change', () => pickBackground($('obs-bg-file'), 'obsBg', $('obs-bg-name'), $('cfg-obs-bg-type')));
    }

    var themeDraft = null;
    function initThemePicker() {
        $('theme-picker').addEventListener('click', (e) => {
            const b = e.target.closest('[data-theme-key]');
            if (!b) return;
            themeDraft = b.dataset.themeKey;
            renderThemePicker(themeDraft);
            $('custom-accent-row').classList.toggle('hidden', themeDraft !== 'custom');
            setSettingsDirty(true);
            applyTheme(themeDraft, $('cfg-custom-accent').value); // vista previa
        });
        $('cfg-custom-accent').addEventListener('input', () => {
            $('lbl-custom-accent').textContent = $('cfg-custom-accent').value.toUpperCase();
            if (themeDraft === 'custom') {
                renderThemePicker('custom');
                applyTheme('custom', $('cfg-custom-accent').value);
            }
        });
    }

    // ==========================================================================
    // TAMAÑO DEL TEXTO (panel y ventana de OBS)
    // ==========================================================================
    function applyTextScales(panelScale, obsScale, amountScale, panelHead, obsHead) {
        const ps = clampNum(panelScale ?? state.settings.panelTextScale, 0.7, 2.5, 1);
        const os = clampNum(obsScale ?? state.settings.obsTextScale, 0.7, 2.5, 1);
        document.documentElement.style.setProperty('--panel-scale', ps);
        document.documentElement.style.setProperty('--panel-head-scale', clampNum(panelHead ?? state.settings.panelHeadScale, 0.6, 1.4, 0.85));
        lastObsHead = clampNum(obsHead ?? state.settings.obsHeadScale, 0.5, 1.4, 0.75);
        lastObsScale = os;
        lastObsAmount = clampNum(amountScale ?? state.settings.obsAmountScale, 0.5, 1.6, 0.8);
        sendObsStyle();
    }

    var lastObsScale = 1, lastObsAmount = 0.8, lastObsHead = 0.75;
    var obsLayoutDraft = null; // vista previa sin guardar de "qué se ve y dónde"
    var obsPStyleDraft = null;
    $('cfg-obs-pstyle').addEventListener('change', () => { obsPStyleDraft = $('cfg-obs-pstyle').value; sendObsStyle(); });
    $('cfg-panel-pstyle').addEventListener('change', () => applyPanelPStyle($('cfg-panel-pstyle').value));
    function applyPanelPStyle(v) {
        const root = document.documentElement;
        root.classList.toggle('pstyle-color', v === 'color');
        root.classList.toggle('pstyle-both', v === 'both');
    }
    applyPanelPStyle(state.settings.panelPlatformStyle);
    const LAYOUT_FIELDS = { amount: 'cfg-lay-amount', platform: 'cfg-lay-platform', rankIcons: 'cfg-lay-rankicons', rankName: 'cfg-lay-rankname' };
    function readObsLayoutForm() {
        const o = {};
        Object.keys(LAYOUT_FIELDS).forEach(k => { o[k] = $(LAYOUT_FIELDS[k]).value; });
        return cleanObsLayout(o);
    }
    Object.values(LAYOUT_FIELDS).forEach(id => $(id).addEventListener('change', () => { obsLayoutDraft = readObsLayoutForm(); sendObsStyle(); }));
    function sendObsStyle() {
        let lk = {};
        try { lk = look(); } catch (e) {}
        const payload = {
            scale: lastObsScale, amountScale: lastObsAmount, headScale: lastObsHead,
            theme: (!lk.obsTheme || lk.obsTheme === 'same' || !THEMES[lk.obsTheme]) ? currentThemeForObs : resolveTheme(lk.obsTheme, lk.obsCustomAccent),
            platformColors: lk.platformColors,
            obsBg: lk.obsBg,
            filterBar: state.settings.obsFilterBar !== false,
            platforms: visiblePlatforms(),
            layout: cleanObsLayout(obsLayoutDraft || state.settings.obsLayout),
            platformStyle: obsPStyleDraft || state.settings.obsPlatformStyle || 'tag',
            ts: Date.now()
        };
        try { localStorage.setItem('obs_style', JSON.stringify(payload)); } catch (e) {}
        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage({ type: 'STYLE_UPDATE', data: payload }, '*'); } catch (e) {}
        }
    }

    function updateTextScaleLabels() {
        const p = $('cfg-panel-text'), o = $('cfg-obs-text');
        if (p) $('lbl-panel-text').textContent = Math.round(p.value * 100) + '%';
        if (o) $('lbl-obs-text').textContent = Math.round(o.value * 100) + '%';
        const a = $('cfg-obs-amount');
        if (a) $('lbl-obs-amount').textContent = Math.round(a.value * 100) + '%';
        if ($('cfg-panel-head')) $('lbl-panel-head').textContent = Math.round($('cfg-panel-head').value * 100) + '%';
        if ($('cfg-obs-head')) $('lbl-obs-head').textContent = Math.round($('cfg-obs-head').value * 100) + '%';
    }

    function initTextScales() {
        applyTextScales();
        ['cfg-panel-text', 'cfg-obs-text', 'cfg-obs-amount', 'cfg-panel-head', 'cfg-obs-head'].forEach(id => {
            $(id).addEventListener('input', () => {
                updateTextScaleLabels();
                // Vista previa en vivo (se confirma con "Guardar cambios"; con "Cancelar" vuelve atrás)
                applyTextScales($('cfg-panel-text').value, $('cfg-obs-text').value, $('cfg-obs-amount').value, $('cfg-panel-head').value, $('cfg-obs-head').value);
            });
        });
        $('btn-obs-preview').addEventListener('click', () => {
            if (!state.overlayWindow || state.overlayWindow.closed) {
                showToast('Abrí primero la ventana "Modo OBS" para ver el ejemplo', 'info');
            }
            const sample = {
                id: 'preview_' + Date.now(), platform: 'ceneka', nick: 'Ejemplo', amount: 1500, currency: 'ARS',
                formattedAmount: '$1.500', message: 'Así se ve una alerta con este tamaño de texto.',
                obsHideMessage: false, obsDuration: 6, _t: Date.now()
            };
            try {
                const queue = JSON.parse(localStorage.getItem('obs_donation_queue') || '[]');
                queue.push(sample);
                localStorage.setItem('obs_donation_queue', JSON.stringify(queue));
            } catch (e) {}
            if (state.overlayWindow && !state.overlayWindow.closed) {
                try { state.overlayWindow.postMessage({ type: 'NEW_DONATION', data: sample }, '*'); } catch (e) {}
            }
        });
        document.querySelectorAll('[data-scale-reset]').forEach(btn => btn.addEventListener('click', () => {
            $(btn.dataset.scaleReset).value = btn.dataset.scaleDefault || 1;
            $(btn.dataset.scaleReset).dispatchEvent(new Event('input', { bubbles: true }));
        }));
    }

    // ==========================================================================
    // RESTABLECER (configuración / de fábrica)
    // ==========================================================================
    const APP_STORAGE_KEYS = [
        'streamdonations_settings', 'streamdonations_chats_db', 'streamdonations_toolbar_visible',
        'obs_donation_queue', 'obs_dismiss_queue', 'obs_mark_read_queue', 'obs_goal_state', 'obs_alerts_update'
    ];

    function clearOverlayForReset() {
        dismissOverlayAlert('all');
        const goalOff = { enabled: false };
        try { localStorage.setItem('obs_goal_state', JSON.stringify(goalOff)); } catch (e) {}
        if (state.overlayWindow && !state.overlayWindow.closed) {
            try { state.overlayWindow.postMessage({ type: 'GOAL_UPDATE', data: goalOff }, '*'); } catch (e) {}
        }
    }

    function resetConfig() {
        const keepToken = $('reset-keep-token').checked;
        if (!confirm('¿Restablecer toda la configuración a como venía de fábrica?\n\nEl historial de donaciones no se borra.' + (keepToken ? '\nLos tokens (StreamElements y Streamlabs) se conservan.' : '\nTambién se borran los tokens de StreamElements y Streamlabs.'))) return;
        if (state.isSimulating) stopSimulation(true);
        const token = state.settings.slToken || '';
        const seChannels = state.settings.seChannels || [];
        try {
            localStorage.removeItem('streamdonations_settings');
            localStorage.removeItem('streamdonations_toolbar_visible');
            if (keepToken) localStorage.setItem('streamdonations_settings', JSON.stringify({ slToken: token, seChannels }));
        } catch (e) {}
        clearOverlayForReset();
        disconnectStreamlabs();
        disconnectAllSE();
        setTimeout(() => location.reload(), 300);
    }

    function factoryReset() {
        if ($('reset-confirm-input').value.trim().toUpperCase() !== 'BORRAR') return;
        if (!confirm('ÚLTIMA CONFIRMACIÓN\n\nSe borra TODO: configuración, token e historial de donaciones. No se puede deshacer.\n\n¿Continuar?')) return;
        if (state.isSimulating) stopSimulation(true);
        const realCount = state.donations.filter(d => !d.isTest).length;
        if ($('reset-backup').checked && realCount > 0) {
            exportDonationsToFile();
        }
        clearOverlayForReset();
        disconnectStreamlabs();
        disconnectAllSE();
        // Esperar un momento para que se descargue la copia y OBS reciba la limpieza
        setTimeout(() => {
            try { APP_STORAGE_KEYS.forEach(k => localStorage.removeItem(k)); } catch (e) {}
            // Imágenes y sonidos elegidos (guardados aparte)
            if (window.SDStore) ['panelBg', 'obsBg', 'alertSound', 'alertSoundBig', ...(state.settings.customIcons || []).map(ic => 'icon:' + ic.id)].forEach(k => { try { SDStore.del(k).catch(() => {}); } catch (e) {} });
            // La ventana de OBS necesita saber que tiene que limpiar todo
            try { localStorage.setItem('obs_dismiss_queue', JSON.stringify([{ id: 'all', _t: Date.now() }])); } catch (e) {}
            location.reload();
        }, 1200);
    }

    function initReset() {
        $('btn-reset-config').addEventListener('click', resetConfig);
        $('reset-confirm-input').addEventListener('input', (e) => {
            $('btn-factory-reset').disabled = e.target.value.trim().toUpperCase() !== 'BORRAR';
        });
        $('btn-factory-reset').addEventListener('click', factoryReset);
    }

    // --- Helpers ---
    function formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Hace un momento';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Hace ${minutes}m`;
        const hours = Math.floor(minutes / 60);
        return `Hace ${hours}h`;
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    // ==========================================================================
    // DESTACAR: formulario del efecto y de los rangos
    // ==========================================================================
    let ranksDraft = [];
    function updateHighlightForm() {
        $('fx-picker').classList.toggle('hidden', !$('cfg-fx-enabled').checked);
        $('ranks-box').classList.toggle('hidden', !$('cfg-ranks-enabled').checked);

    }
    function syncRanksDraft() {
        const v = (id, d) => $(id) ? $(id).value : d;
        ranksDraft = ranksDraft.map((r, i) => ({
            ...r,
            name: v('rank-name-' + i, r.name),
            mode: v('rank-mode-' + i, r.mode),
            min: v('rank-min-' + i, r.min),
            users: v('rank-users-' + i, r.users),
            color: v('rank-color-' + i, r.color),
            count: v('rank-count-' + i, r.count),
            badgeColor: $('rank-bgon-' + i) ? ($('rank-bgon-' + i).checked ? v('rank-bg-' + i, r.badgeColor) : '') : r.badgeColor,
            badgeFx: r.badgeFx,
            style: v('rank-style-' + i, r.style || '')
        }));
    }
    function rankPreviewHTML(r) {
        const color = HEX_RE.test(r.color || '') ? r.color : '#60A5FA';
        return rankBadgeHTML({ name: r.name || 'Rango', icon: cleanIcon(r.icon), color,
            count: Math.min(5, Math.max(1, parseInt(r.count) || 1)), total: 0, manual: r.mode === 'manual',
            badgeColor: HEX_RE.test(r.badgeColor || '') ? r.badgeColor : '', badgeFx: RANK_FX.includes(r.badgeFx) ? r.badgeFx : 'none', showName: true },
            (styleById(r.style, stylesDraft) || { parts: {} }).parts.rank);
    }
    const RANK_FX_LABELS = { none: 'Sin efecto', shine: 'Destello', pulse: 'Latido', glow: 'Brillo', rainbow: 'Arcoíris' };
    function renderRanksForm() {
        const wrap = $('ranks-list');
        if (!ranksDraft.length) { wrap.innerHTML = '<p class="pane-note">No hay rangos. Agregá uno.</p>'; return; }
        const order = ranksDraft.map((r, i) => i); // en el mismo orden: no se mueven mientras editás
        wrap.innerHTML = order.map(i => {
            const r = ranksDraft[i];
            const icon = cleanIcon(r.icon);
            const color = HEX_RE.test(r.color || '') ? r.color : '#60A5FA';
            const cnt = Math.min(5, Math.max(1, parseInt(r.count) || 1));
            const manual = r.mode === 'manual';
            const bg = HEX_RE.test(r.badgeColor || '') ? r.badgeColor : '';
            const fx = RANK_FX.includes(r.badgeFx) ? r.badgeFx : 'none';
            const nUsers = String(r.users || '').split(/\n+/).filter(x => x.trim()).length;
            return `
            <div class="rank-row rank-card" style="--rank-color:${color}">
                <div class="rank-line">
                    <button type="button" class="rank-icon-btn" data-rank-icon="${i}" title="Elegir ícono">${iconHTML(icon, 1)}</button>
                    <input type="text" id="rank-name-${i}" class="rank-name-input" maxlength="24" value="${escapeHTML(r.name)}" placeholder="Nombre del rango" aria-label="Nombre del rango">
                    <label class="rank-field"><span>íconos</span><select id="rank-count-${i}" aria-label="Cantidad de íconos">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${n === cnt ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
                    <input type="color" id="rank-color-${i}" class="bg-color-input" value="${color}" title="Color de los íconos">
                    <button type="button" class="btn btn-outline-danger btn-sm" data-rank-remove="${i}" title="Quitar este rango"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="rank-line">
                    <label class="rank-field"><span>Cómo se gana</span><select id="rank-mode-${i}" data-rank-mode="${i}">
                        <option value="auto"${manual ? '' : ' selected'}>Por lo que donó</option>
                        <option value="manual"${manual ? ' selected' : ''}>Lo doy yo a mano</option></select></label>
                    ${manual ? `<span class="pane-note rank-users-count">${nUsers} persona${nUsers === 1 ? '' : 's'}</span>`
                             : `<label class="rank-field"><span>desde $</span><input type="number" id="rank-min-${i}" min="0" step="500" value="${Math.max(0, parseInt(r.min) || 0)}" aria-label="Monto mínimo en pesos"></label>`}
                </div>
                ${manual ? `<textarea id="rank-users-${i}" class="rank-users" rows="3" spellcheck="false" placeholder="Un nombre por línea, tal como aparece en la donación">${escapeHTML(r.users || '')}</textarea>` : ''}
                <div class="rank-line">
                    <label class="rank-field rank-check"><input type="checkbox" id="rank-bgon-${i}"${bg ? ' checked' : ''}><span>Color del cartel</span></label>
                    <input type="color" id="rank-bg-${i}" class="bg-color-input" value="${bg || color}" title="Color de fondo del cartel con el nombre"${bg ? '' : ' disabled'}>
                    <label class="rank-field"><span>Estilo</span><select id="rank-style-${i}" class="style-select" aria-label="Estilo del rango">${styleOptionsHTML(r.style || '')}</select></label>
                    <span class="rank-preview" id="rank-preview-${i}">${rankPreviewHTML(r)}</span>
                </div>
            </div>`;
        }).join('');
    }
    // ---- Selector de íconos: buscador, marcas, emojis e imágenes propias ----
    let iconPopTab = 'fa', iconPopQuery = '', iconPopRank = -1;
    const normTxt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    function searchIcons(list, q) {
        if (!q) return list;
        const nq = normTxt(q);
        const tokens = new Set();
        Object.entries(ICON_LIB.es || {}).forEach(([k, v]) => { const nk = normTxt(k); if (nk.startsWith(nq) || (nq.length >= 4 && nq.startsWith(nk))) v.split(' ').forEach(t => t && tokens.add(t)); });
        // Una palabra coincide con una parte entera del nombre ("cat" sí con "cat", no con "certificate")
        const partMatch = (n, t) => n === t || n.startsWith(t + '-') || n.endsWith('-' + t) || n.includes('-' + t + '-');
        const exact = [], byEs = [], byName = [];
        const nq2 = nq.replace(/\s+/g, '-');
        list.forEach(e => {
            const names = e.split('|');
            if (names.some(n => tokens.has(n) || n === nq2)) exact.push(e);
            else if ([...tokens].some(t => names.some(n => partMatch(n, t)))) byEs.push(e);
            else if (names.some(n => n.includes(nq2))) byName.push(e);
        });
        return exact.concat(byEs, byName);
    }
    function renderIconPop() {
        const pop = $('icon-pop');
        const cur = iconPopRank >= 0 && ranksDraft[iconPopRank] ? cleanIcon(ranksDraft[iconPopRank].icon) : '';
        const tabs = [['fa', 'fa-icons', 'Íconos'], ['fab', 'fa-hashtag', 'Marcas'], ['emoji', 'fa-face-smile', 'Emojis'], ['img', 'fa-image', 'Mis imágenes']]
            .map(([k, ic, t]) => `<button type="button" class="icon-tab${iconPopTab === k ? ' active' : ''}" data-icon-tab="${k}"><i class="fa-solid ${ic}"></i> ${t}</button>`).join('');
        let body = '';
        if (iconPopTab === 'fa' || iconPopTab === 'fab') {
            const list = searchIcons(iconPopTab === 'fa' ? ICON_LIB.solid : ICON_LIB.brands, iconPopQuery);
            const cls = iconPopTab === 'fa' ? 'fa-solid' : 'fa-brands';
            body = list.length ? list.map(e => { const n = e.split('|')[0]; const v = iconPopTab + ':' + n;
                return `<button type="button" class="icon-choice${cur === v ? ' active' : ''}" data-pick-icon="${v}" title="${escapeHTML(n)}"><i class="${cls} fa-${n}"></i></button>`; }).join('')
                : '<p class="pane-note icon-empty">No encontré íconos con esa palabra. Probá con otra (por ejemplo "fuego", "gato", "corona").</p>';
        } else if (iconPopTab === 'emoji') {
            body = (ICON_LIB.emojis || []).map(em => { const v = 'emoji:' + em;
                return `<button type="button" class="icon-choice emoji${cur === v ? ' active' : ''}" data-pick-icon="${escapeHTML(v)}">${escapeHTML(em)}</button>`; }).join('');
        } else {
            const list = Array.isArray(state.settings.customIcons) ? state.settings.customIcons : [];
            body = list.map(ic => { const v = 'img:' + ic.id;
                return `<div class="icon-custom"><button type="button" class="icon-choice${cur === v ? ' active' : ''}" data-pick-icon="${v}" title="${escapeHTML(ic.name)}">${customIconUrls[ic.id] ? `<img src="${customIconUrls[ic.id]}" alt="">` : '<i class="fa-solid fa-image"></i>'}</button>
                    <button type="button" class="icon-del" data-del-icon="${ic.id}" title="Borrar esta imagen"><i class="fa-solid fa-xmark"></i></button></div>`; }).join('') +
                `<button type="button" class="icon-choice icon-upload" id="btn-icon-upload" title="Subir imagen"><i class="fa-solid fa-plus"></i></button>`;
        }
        const searchBar = (iconPopTab === 'fa' || iconPopTab === 'fab')
            ? `<input type="search" id="icon-search" class="icon-search" placeholder="Buscar: fuego, gato, corona, dinero…" value="${escapeHTML(iconPopQuery)}" autocomplete="off">` : '';
        const foot = iconPopTab === 'emoji'
            ? `<div class="icon-foot"><input type="text" id="icon-emoji-own" maxlength="16" placeholder="O pegá cualquier emoji acá" autocomplete="off"><button type="button" class="btn btn-outline btn-sm" id="btn-icon-emoji-own">Usar</button></div>`
            : iconPopTab === 'img' ? '<small class="pane-note icon-foot-note">PNG, GIF (animado), WebP, JPG o SVG, hasta 200 KB. Se guardan en esta PC. Se ven en el panel y en OBS.</small>' : '';
        pop.innerHTML = `<div class="icon-tabs">${tabs}</div>${searchBar}<div class="icon-grid">${body}</div>${foot}`;
        const sb = $('icon-search');
        if (sb) { sb.addEventListener('input', () => { iconPopQuery = sb.value; const pos = sb.selectionStart; renderIconPop(); const nb = $('icon-search'); nb.focus(); nb.setSelectionRange(pos, pos); }); }
    }
    function openIconPop(i, btn) {
        iconPopRank = i;
        const cur = cleanIcon(ranksDraft[i] && ranksDraft[i].icon);
        iconPopTab = cur.split(':')[0];
        const pop = $('icon-pop');
        if (pop.parentElement !== document.body) document.body.appendChild(pop); // así nunca queda cortado dentro de Opciones
        renderIconPop();
        pop.classList.remove('hidden');
        const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
        pop.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
        const sb = $('icon-search'); if (sb) sb.focus();
    }
    function pickIcon(v) {
        if (iconPopRank < 0 || !ranksDraft[iconPopRank]) return;
        ranksDraft[iconPopRank].icon = cleanIcon(v);
        $('icon-pop').classList.add('hidden');
        renderRanksForm();
        setSettingsDirty(true);
    }
    function uploadCustomIcon() {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/png,image/gif,image/webp,image/jpeg,image/svg+xml';
        inp.addEventListener('change', () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            if (!/^image\/(png|gif|webp|jpeg|svg\+xml)$/.test(f.type)) { showToast('Elegí una imagen PNG, GIF, WebP, JPG o SVG', 'warning'); return; }
            if (f.size > 200 * 1024) { showToast('La imagen pesa más de 200 KB. Achicala un poco.', 'warning'); return; }
            const list = Array.isArray(state.settings.customIcons) ? state.settings.customIcons : (state.settings.customIcons = []);
            if (list.length >= 40) { showToast('Máximo 40 imágenes propias', 'info'); return; }
            const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
            SDStore.put('icon:' + id, f).then(() => {
                customIconUrls[id] = URL.createObjectURL(f);
                list.push({ id, name: String(f.name || 'imagen').replace(/[<>]/g, '').slice(0, 60) });
                persistSettings();
                pickIcon('img:' + id);
                showToast('Imagen agregada', 'success');
            }).catch(() => showToast('No se pudo guardar la imagen', 'warning'));
        });
        inp.click();
    }
    function deleteCustomIcon(id) {
        if (!confirm('¿Borrar esta imagen? Los rangos que la usan vuelven a un ícono común.')) return;
        state.settings.customIcons = (state.settings.customIcons || []).filter(ic => ic.id !== id);
        ranksDraft.forEach(r => { if (r.icon === 'img:' + id) r.icon = 'fa:star'; });
        (state.settings.ranks || []).forEach(r => { if (r.icon === 'img:' + id) r.icon = 'fa:star'; });
        persistSettings();
        try { SDStore.del('icon:' + id); } catch (e) {}
        if (customIconUrls[id]) { URL.revokeObjectURL(customIconUrls[id]); delete customIconUrls[id]; }
        renderIconPop(); renderRanksForm(); render();
    }
    function initHighlightForm() {
        ['cfg-fx-enabled', 'cfg-ranks-enabled'].forEach(id => { $(id).addEventListener('input', updateHighlightForm); $(id).addEventListener('change', updateHighlightForm); });
        $('btn-add-rank').addEventListener('click', () => {
            syncRanksDraft();
            if (ranksDraft.length >= 10) { showToast('Máximo 10 rangos', 'info'); return; }
            const top = ranksDraft.reduce((m, r) => Math.max(m, parseFloat(r.min) || 0), 0);
            ranksDraft.push({ name: 'Nuevo rango', mode: 'auto', min: top ? top * 2 : 5000, users: '', icon: 'medal', color: '#34D399', count: 1, badgeColor: '', badgeFx: 'none' });
            renderRanksForm();
            setSettingsDirty(true);
        });
        $('ranks-list').addEventListener('click', (e) => {
            const rm = e.target.closest('[data-rank-remove]');
            if (rm) { syncRanksDraft(); ranksDraft.splice(parseInt(rm.dataset.rankRemove), 1); renderRanksForm(); setSettingsDirty(true); return; }
            const ib = e.target.closest('[data-rank-icon]');
            if (ib) { e.stopPropagation(); syncRanksDraft(); openIconPop(parseInt(ib.dataset.rankIcon), ib); }
        });
        const onRankInput = (e) => {
            const m = /^rank-(name|color|count|mode|bgon|bg|fx|users|min|style)-(\d+)$/.exec(e.target.id || '');
            if (!m) return;
            syncRanksDraft();
            const i = +m[2], r = ranksDraft[i];
            if (m[1] === 'mode') { renderRanksForm(); return; }
            if (m[1] === 'bgon') { const c = $('rank-bg-' + i); if (c) c.disabled = !e.target.checked; syncRanksDraft(); }
            const row = e.target.closest('.rank-row');
            if (row && HEX_RE.test(r.color)) row.style.setProperty('--rank-color', r.color);
            const pv = $('rank-preview-' + i);
            if (pv) pv.innerHTML = rankPreviewHTML(ranksDraft[i]);
        };
        $('ranks-list').addEventListener('input', onRankInput);
        $('ranks-list').addEventListener('change', onRankInput);
        $('icon-pop').addEventListener('click', (e) => {
            e.stopPropagation();
            const t = e.target.closest('[data-icon-tab]');
            if (t) { iconPopTab = t.dataset.iconTab; iconPopQuery = ''; renderIconPop(); const sb = $('icon-search'); if (sb) sb.focus(); return; }
            const del = e.target.closest('[data-del-icon]');
            if (del) { deleteCustomIcon(del.dataset.delIcon); return; }
            if (e.target.closest('#btn-icon-upload')) { uploadCustomIcon(); return; }
            if (e.target.closest('#btn-icon-emoji-own')) {
                const v = ($('icon-emoji-own').value || '').trim();
                if (!EMOJI_RE.test(v)) { showToast('Pegá un emoji (sin letras ni números)', 'info'); return; }
                pickIcon('emoji:' + v); return;
            }
            const b = e.target.closest('[data-pick-icon]');
            if (b) pickIcon(b.dataset.pickIcon);
        });
        $('icon-pop').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); $('icon-pop').classList.add('hidden'); } });
        document.addEventListener('click', (e) => { if (!e.target.closest('#icon-pop')) $('icon-pop').classList.add('hidden'); });
    }
    initHighlightForm();

    // Color del monto: filas "desde $X → color"
    let amtDraft = [];
    function syncAmtDraft() {
        amtDraft = amtDraft.map((r, i) => ({
            min: $('amt-min-' + i) ? $('amt-min-' + i).value : r.min,
            color: $('amt-color-' + i) ? $('amt-color-' + i).value : r.color
        }));
    }
    function renderAmtForm() {
        const wrap = $('amt-list');
        if (!amtDraft.length) { wrap.innerHTML = '<p class="pane-note">No hay colores. Agregá uno.</p>'; return; }
        const order = amtDraft.map((r, i) => i).sort((a, b) => (parseFloat(amtDraft[a].min) || 0) - (parseFloat(amtDraft[b].min) || 0));
        wrap.innerHTML = order.map(i => {
            const r = amtDraft[i];
            const color = HEX_RE.test(r.color || '') ? r.color : '#34D399';
            const min = Math.max(0, parseInt(r.min) || 0);
            return `
            <div class="rank-row amt-row" style="--rank-color:${color}">
                <label class="rank-field"><span>desde $</span><input type="number" id="amt-min-${i}" min="0" step="500" value="${min}" aria-label="Monto desde, en pesos"></label>
                <input type="color" id="amt-color-${i}" class="bg-color-input" value="${color}" title="Color del monto">
                <span class="amount-badge amt-preview" id="amt-preview-${i}" style="--accent-color:${color}">${escapeHTML(formatMoney(min || 1000, 'ARS'))}</span>
                <button type="button" class="btn btn-outline-danger btn-sm" data-amt-remove="${i}" title="Quitar este color"><i class="fa-solid fa-xmark"></i></button>
            </div>`;
        }).join('');
    }
    function updateAmtVisibility() { $('amt-box').classList.toggle('hidden', !$('cfg-amt-enabled').checked); }
    function initAmtForm() {
        $('cfg-amt-enabled').addEventListener('change', updateAmtVisibility);
        $('btn-add-amt').addEventListener('click', () => {
            syncAmtDraft();
            if (amtDraft.length >= 10) { showToast('Máximo 10 colores', 'info'); return; }
            const top = amtDraft.reduce((m, r) => Math.max(m, parseFloat(r.min) || 0), 0);
            amtDraft.push({ min: top ? top * 2 : 1000, color: '#E879F9' });
            renderAmtForm();
            setSettingsDirty(true);
        });
        $('amt-list').addEventListener('click', (e) => {
            const rm = e.target.closest('[data-amt-remove]');
            if (rm) { syncAmtDraft(); amtDraft.splice(parseInt(rm.dataset.amtRemove), 1); renderAmtForm(); setSettingsDirty(true); }
        });
        $('amt-list').addEventListener('input', (e) => {
            const m = /^amt-(min|color)-(\d+)$/.exec(e.target.id || '');
            if (!m) return;
            syncAmtDraft();
            const i = +m[2], r = amtDraft[i], pv = $('amt-preview-' + i);
            const color = HEX_RE.test(r.color) ? r.color : '#34D399';
            if (pv) { pv.style.setProperty('--accent-color', color); pv.textContent = formatMoney(Math.max(0, parseInt(r.min) || 0) || 1000, 'ARS'); }
            const row = e.target.closest('.rank-row'); if (row) row.style.setProperty('--rank-color', color);
        });
    }
    initAmtForm();

    // ==========================================================================
    // ESTILOS: menús para elegirlos y la ventana para crearlos/editarlos
    // ==========================================================================
    let stylesDraft = [];
    const PART_LABELS = { card: ['fa-square', 'Tarjeta'], msg: ['fa-message', 'Mensaje'], nick: ['fa-user', 'Nick'], rank: ['fa-crown', 'Rango'], amount: ['fa-coins', 'Monto'] };
    const FX_NAMES = { none: 'Nada', pulse: 'Latido', glow: 'Brillo', breathe: 'Respiración', neon: 'Neón', rainbow: 'Arcoíris', gradient: 'Degradado',
        snake: 'Serpiente', 'snake-left': 'Serpiente (al revés)', snake2: 'Serpiente doble', dash: 'Guiones', tick: 'Reloj', shine: 'Destello', double: 'Borde doble' };
    function styleOptionsHTML(sel) {
        return '<option value="">Sin estilo</option>' + stylesDraft.map(x => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${escapeHTML(x.name)}</option>`).join('');
    }
    function fillStyleSelect(el, sel) { if (el) el.innerHTML = styleOptionsHTML(sel); }
    function renderStyleChips() {
        const wrap = $('styles-chips');
        if (!wrap) return;
        wrap.innerHTML = stylesDraft.map(x => `<span class="style-chip" data-edit-style="${x.id}" title="Editar">${escapeHTML(x.name)}</span>`).join('') || '<span class="pane-note">No hay estilos todavía.</span>';
    }
    function refreshStyleSelects() {
        const fs = $('cfg-fx-style'); fillStyleSelect(fs, fs.value);
        renderStyleChips();
        syncRanksDraft(); renderRanksForm();
    }

    let edStyle = null, edPart = 'card';
    // Tarjeta de ejemplo que usa exactamente el mismo dibujo que el panel
    function stylePreviewHTML(x) {
        const pr = x.parts || {};
        const ring = (p) => p ? ringHTML(p) : '';
        const nk = tfxAttr(pr.nick), am = tfxAttr(pr.amount);
        const badge = rankBadgeHTML({ name: 'Rango', icon: 'fa:crown', color: '#FBBF24', count: 2, total: 0, manual: true, badgeColor: '', badgeFx: 'none', showName: true }, pr.rank);
        return `<div class="donation-card pf-ceneka style-demo${pr.card ? ' sfx-host' : ''}">${ring(pr.card)}
            <div class="card-header"><div class="donor-info"><div class="donor-avatar">A</div><div class="donor-meta"><div class="donor-nick">
                <span class="donor-nick-text${nk.cls}"${nk.style ? ` style="${nk.style}"` : ''}>Alguien</span>${badge}
                <span class="amount-badge${am.cls}"${am.style ? ` style="${am.style}"` : ''}>$5.000</span>
            </div></div></div></div>
            <div class="card-message${pr.msg ? ' sfx-host' : ''}">${ring(pr.msg)}¡Así se ve una donación con este estilo!</div></div>`;
    }
    function tileHTML(part, fx, cur) {
        const p = { fx, c1: cur ? cur.c1 : '#FFD700', c2: cur ? cur.c2 : '#FF4D00', gi: 1, sp: 1 };
        let demo;
        if (fx === 'none') demo = '<span class="tile-none"><i class="fa-solid fa-ban"></i></span>';
        else if (part === 'card' || part === 'msg') demo = `<span class="tile-box sfx-host">${ringHTML(p)}</span>`;
        else if (part === 'rank') demo = `<span class="rank-name bfx bfx-${fx}" style="${partVars(p)}">Rango</span>`;
        else demo = `<span class="tile-text tfx tfx-${fx}" style="${partVars(p)}">Aa</span>`;
        const on = (cur ? cur.fx : 'none') === fx;
        return `<button type="button" class="style-tile${on ? ' active' : ''}" data-tile-fx="${fx}" aria-pressed="${on}">${demo}<span class="tile-label">${FX_NAMES[fx]}</span></button>`;
    }
    function renderStyleEditor() {
        const list = $('styles-list');
        list.innerHTML = stylesDraft.map(x => `<button type="button" class="styles-item${edStyle && edStyle.id === x.id ? ' active' : ''}" data-pick-style="${x.id}">${escapeHTML(x.name)}</button>`).join('');
        const main = document.querySelector('.styles-main');
        main.classList.toggle('hidden', !edStyle);
        if (!edStyle) return;
        $('style-name').value = edStyle.name;
        $('style-preview').innerHTML = stylePreviewHTML(edStyle);
        $('style-parts').innerHTML = STYLE_PARTS.map(k => {
            const has = !!(edStyle.parts[k]);
            return `<button type="button" role="tab" class="style-part-tab${edPart === k ? ' active' : ''}" data-part="${k}" aria-selected="${edPart === k}"><i class="fa-solid ${PART_LABELS[k][0]}"></i> ${PART_LABELS[k][1]}${has ? ' <span class="part-dot"></span>' : ''}</button>`;
        }).join('');
        const cur = edStyle.parts[edPart] || null;
        $('style-tiles').innerHTML = PART_FX[edPart].map(fx => tileHTML(edPart, fx, cur)).join('');
        const fx = cur ? cur.fx : 'none';
        $('style-colors').classList.toggle('hidden', NO_COLOR_FX.has(fx));
        $('style-c2-wrap').classList.toggle('hidden', !TWO_COLOR_FX.has(fx) && !(fx === 'gradient'));
        $('style-more').classList.toggle('hidden', fx === 'none');
        $('style-glow-note').classList.toggle('hidden', !GLOW_FX.has(fx));
        if (cur) {
            $('style-c1').value = cur.c1; $('style-c2').value = cur.c2;
            $('style-gi').value = cur.gi; $('style-sp').value = cur.sp;
            $('lbl-style-gi').textContent = cur.gi.toFixed(1) + '×'; $('lbl-style-sp').textContent = cur.sp.toFixed(1) + '×';
        }
    }
    function openStyleEditor(id) {
        edStyle = styleById(id, stylesDraft) || stylesDraft[0] || null;
        edPart = edStyle ? (STYLE_PARTS.find(k => edStyle.parts[k]) || 'card') : 'card';
        renderStyleEditor();
        $('modal-styles').classList.remove('hidden');
    }
    function closeStyleEditor() {
        $('modal-styles').classList.add('hidden');
        refreshStyleSelects();
    }
    function styleChanged() { setSettingsDirty(true); renderStyleEditor(); }
    function newStyleId(base) {
        const b = (normTxt(base).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'estilo').slice(0, 30);
        let id = b, n = 2;
        while (stylesDraft.some(x => x.id === id)) id = b + '-' + n++;
        return id;
    }
    function initStyleEditor() {
        $('btn-edit-styles').addEventListener('click', () => openStyleEditor(stylesDraft[0] && stylesDraft[0].id));
        $('styles-chips').addEventListener('click', (e) => { const c = e.target.closest('[data-edit-style]'); if (c) openStyleEditor(c.dataset.editStyle); });
        $('btn-close-styles').addEventListener('click', closeStyleEditor);
        $('btn-styles-done').addEventListener('click', closeStyleEditor);
        $('modal-styles').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeStyleEditor(); } });
        $('styles-list').addEventListener('click', (e) => {
            const b = e.target.closest('[data-pick-style]'); if (!b) return;
            edStyle = styleById(b.dataset.pickStyle, stylesDraft);
            edPart = STYLE_PARTS.find(k => edStyle.parts[k]) || 'card';
            renderStyleEditor();
        });
        $('btn-style-new').addEventListener('click', () => {
            if (stylesDraft.length >= 30) { showToast('Máximo 30 estilos', 'info'); return; }
            const x = { id: newStyleId('Mi estilo'), name: 'Mi estilo', parts: { card: { fx: 'glow', c1: '#8B5CF6', c2: '#22D3EE', gi: 1, sp: 1 } } };
            stylesDraft.push(x); edStyle = x; edPart = 'card'; styleChanged();
            $('style-name').focus(); $('style-name').select();
        });
        $('btn-style-dup').addEventListener('click', () => {
            if (!edStyle || stylesDraft.length >= 30) return;
            const x = JSON.parse(JSON.stringify(edStyle)); x.name = (edStyle.name + ' (copia)').slice(0, 30); x.id = newStyleId(x.name);
            stylesDraft.push(x); edStyle = x; styleChanged();
        });
        $('btn-style-del').addEventListener('click', () => {
            if (!edStyle) return;
            if (!confirm(`¿Borrar el estilo "${edStyle.name}"? Los rangos y las donaciones grandes que lo usan quedan sin estilo.`)) return;
            const id = edStyle.id;
            stylesDraft = stylesDraft.filter(x => x.id !== id);
            ranksDraft.forEach(r => { if (r.style === id) r.style = ''; });
            if ($('cfg-fx-style').value === id) fillStyleSelect($('cfg-fx-style'), '');
            edStyle = stylesDraft[0] || null; styleChanged();
        });
        $('style-name').addEventListener('input', () => {
            if (!edStyle) return;
            edStyle.name = $('style-name').value.replace(/[<>]/g, '').slice(0, 30) || 'Estilo';
            setSettingsDirty(true);
            const it = document.querySelector(`[data-pick-style="${edStyle.id}"]`); if (it) it.textContent = edStyle.name;
        });
        $('style-parts').addEventListener('click', (e) => { const t = e.target.closest('[data-part]'); if (t) { edPart = t.dataset.part; renderStyleEditor(); } });
        $('style-tiles').addEventListener('click', (e) => {
            const t = e.target.closest('[data-tile-fx]'); if (!t || !edStyle) return;
            const fx = t.dataset.tileFx;
            if (fx === 'none') delete edStyle.parts[edPart];
            else {
                const old = edStyle.parts[edPart];
                edStyle.parts[edPart] = { fx, c1: old ? old.c1 : '#FFD700', c2: old ? old.c2 : '#FF4D00', gi: old ? old.gi : 1, sp: old ? old.sp : 1 };
            }
            styleChanged();
        });
        const live = (k, conv) => (e) => {
            const p = edStyle && edStyle.parts[edPart]; if (!p) return;
            p[k] = conv(e.target.value);
            setSettingsDirty(true);
            $('style-preview').innerHTML = stylePreviewHTML(edStyle);
            if (k === 'gi') $('lbl-style-gi').textContent = p.gi.toFixed(1) + '×';
            if (k === 'sp') $('lbl-style-sp').textContent = p.sp.toFixed(1) + '×';
            if (k === 'c1' || k === 'c2') $('style-tiles').innerHTML = PART_FX[edPart].map(fx => tileHTML(edPart, fx, p)).join('');
        };
        $('style-c1').addEventListener('input', live('c1', v => HEX_RE.test(v) ? v : '#FFD700'));
        $('style-c2').addEventListener('input', live('c2', v => HEX_RE.test(v) ? v : '#FF4D00'));
        $('style-gi').addEventListener('input', live('gi', v => Math.min(2.5, Math.max(0.3, parseFloat(v) || 1))));
        $('style-sp').addEventListener('input', live('sp', v => Math.min(2.5, Math.max(0.3, parseFloat(v) || 1))));
    }
    initStyleEditor();

    // Clics en tarjetas y en la base de datos (sin código dentro del HTML, así la página puede prohibir scripts sueltos)
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el) return;
        const id = el.dataset.id;
        switch (el.dataset.act) {
            case 'toggle-read': e.stopPropagation(); window.toggleReadState(id); break;
            case 'user': e.stopPropagation(); openUserMenu(id, el); break;
            case 'focus': if (!e.target.closest('.card-read-action, .msg-link')) window.openFocusModal(id); break;
            case 'db-toggle': window.dbToggleRead(id); break;
            case 'db-edit': window.dbEditChat(id); break;
            case 'db-delete': window.dbDeleteChat(id); break;
        }
    });

    syncHeaderToggles();
    updateLiveBadge();
    initExtras();
    loadCustomIcons();
    if (document.getElementById('about-version')) document.getElementById('about-version').textContent = APP_VERSION;
    initLinks();
    applyTheme();
    initThemePicker();
    initLook();
    initTextScales();
    initConnectionsForm();
    initReset();

    // --- Render inicial (carga automática desde base de datos persistente) ---
    render();
});
