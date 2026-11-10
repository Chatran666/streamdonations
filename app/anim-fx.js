/* ==========================================================================
   Temas animados (panel y ventana de OBS): Navidad, Halloween, Argentina, 4 de Julio,
   Año Nuevo, San Valentín, Primavera y Lluvia de plata. (El OVNI está en xfiles-fx.js.)
   Un solo lienzo de fondo, liviano: pocas partículas, ~30 cuadros por segundo y se frena
   solo cuando la ventana está minimizada.
   ========================================================================== */
(function () {
    'use strict';
    var canvas = null, ctx = null, raf = null, kind = '', W = 0, H = 0, DPR = 1, last = 0, acc = 0, T = 0;
    var parts = [], rockets = [], sparks = [], bulbs = [], nextRocket = 0, nextSpawn = 0;
    var sprites = {};
    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }

    // Los emojis se dibujan una vez en un lienzo chico y después se copian (mucho más rápido)
    function sprite(ch) {
        if (sprites[ch]) return sprites[ch];
        var c = document.createElement('canvas'); c.width = c.height = 64;
        var x = c.getContext('2d');
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = '48px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
        x.fillText(ch, 32, 36);
        return (sprites[ch] = c);
    }

    // ---- Qué tiene cada tema ----
    var KINDS = {
        navidad: { fall: { n: 70, type: 'snow' }, bulbs: true, emoji: { set: ['🎄', '🎁', '⭐'], n: 4, mode: 'fall', size: [18, 28], alpha: 0.5 } },
        halloween: { emoji: { set: ['🦇', '🦇', '🦇', '👻', '🎃'], n: 9, mode: 'fly', size: [18, 34], alpha: 0.75 }, fog: '#6b2fa0' },
        argentina: { fall: { n: 60, type: 'confetti', colors: ['#74ACDF', '#FFFFFF', '#74ACDF', '#F6B40E'] }, sun: true },
        julio4: { fireworks: ['#E63946', '#FFFFFF', '#3C6EF0'], stars: 50 },
        anionuevo: { fireworks: ['#F6C744', '#FFFFFF', '#FF5DA2', '#5DE2FF', '#B388FF'], fall: { n: 35, type: 'confetti', colors: ['#F6C744', '#FFFFFF', '#C0C0C0'] } },
        sanvalentin: { emoji: { set: ['❤️', '💖', '💕', '💗'], n: 16, mode: 'rise', size: [14, 30], alpha: 0.6 } },
        primavera: { emoji: { set: ['🌸', '🌼', '🌸', '🍃'], n: 18, mode: 'fall', size: [14, 26], alpha: 0.75 } },
        plata: { emoji: { set: ['💵', '💸', '🪙', '💰'], n: 18, mode: 'fall', size: [18, 32], alpha: 0.8 } }
    };

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        build();
    }
    // Cantidad según el tamaño de la ventana (ventanas chicas = menos cosas)
    function scaleN(n) { return Math.max(4, Math.round(n * Math.min(1.4, (W * H) / (1280 * 720)))); }

    function newFall(cfg, initial) {
        return { kind: cfg.type, x: rand(0, W), y: initial ? rand(-H, H) : rand(-60, -10),
            r: cfg.type === 'snow' ? rand(1, 3.2) : rand(3, 6), vy: cfg.type === 'snow' ? rand(18, 50) : rand(35, 80),
            sway: rand(10, 35), ph: rand(0, 6.28), rot: rand(0, 6.28), vr: rand(-3, 3), color: cfg.colors ? pick(cfg.colors) : '#fff', a: rand(0.5, 0.95) };
    }
    function newEmoji(cfg, initial) {
        var s = rand(cfg.size[0], cfg.size[1]), e = { ch: pick(cfg.set), s: s, a: cfg.alpha * rand(0.7, 1), ph: rand(0, 6.28), rot: rand(-0.4, 0.4), vr: rand(-0.6, 0.6) };
        if (cfg.mode === 'fall') { e.x = rand(0, W); e.y = initial ? rand(-H, H) : -40; e.vx = rand(-12, 12); e.vy = rand(25, 60); }
        else if (cfg.mode === 'rise') { e.x = rand(0, W); e.y = initial ? rand(0, H * 1.5) : H + 40; e.vx = rand(-8, 8); e.vy = -rand(20, 45); }
        else { var left = Math.random() < 0.5; e.x = initial ? rand(0, W) : (left ? -40 : W + 40); e.y = rand(H * 0.05, H * 0.85); e.vx = (left ? 1 : -1) * rand(40, 110); e.vy = 0; e.flap = rand(6, 10); }
        return e;
    }
    function build() {
        var k = KINDS[kind]; parts = []; bulbs = []; rockets = []; sparks = [];
        if (!k) return;
        if (k.fall) for (var i = 0; i < scaleN(k.fall.n); i++) parts.push(newFall(k.fall, true));
        if (k.emoji) for (var j = 0; j < scaleN(k.emoji.n); j++) parts.push(Object.assign(newEmoji(k.emoji, true), { emoji: true }));
        if (k.stars) for (var s = 0; s < scaleN(k.stars); s++) parts.push({ star: true, x: rand(0, W), y: rand(0, H * 0.7), r: rand(0.5, 1.5), ph: rand(0, 6.28), sp: rand(0.5, 1.5) });
        if (k.bulbs) { var n = Math.max(8, Math.round(W / 46)); for (var b = 0; b < n; b++) bulbs.push({ x: (b + 0.5) * W / n, c: ['#FF3B3B', '#2ECC71', '#FFD43B', '#4DABF7'][b % 4], ph: rand(0, 6.28) }); }
    }

    function drawSun(t) {
        var x = 90, y = H - 90, R = 34; // abajo a la izquierda (arriba tapan los botones)
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.08); ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#F6B40E'; ctx.strokeStyle = '#F6B40E'; ctx.lineWidth = 3;
        for (var i = 0; i < 32; i++) {
            var a = i * Math.PI / 16, L = i % 2 ? R * 2.0 : R * 2.5;
            ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
        ctx.restore();
    }
    function drawBulbs(t) {
        ctx.save();
        ctx.strokeStyle = 'rgba(40,70,40,0.9)'; ctx.lineWidth = 2; ctx.beginPath();
        for (var i = 0; i <= 40; i++) { var x = i * W / 40; ctx.lineTo(x, 10 + Math.sin(i / 40 * Math.PI * (W / 230)) * 6); }
        ctx.stroke();
        bulbs.forEach(function (b, i) {
            var on = Math.sin(t * 2.2 + b.ph) > -0.2, y = 14 + Math.sin(b.x / W * Math.PI * (W / 230)) * 6;
            ctx.globalAlpha = on ? 1 : 0.35;
            ctx.fillStyle = b.c; ctx.shadowColor = b.c; ctx.shadowBlur = on ? 12 : 0;
            ctx.beginPath(); ctx.ellipse(b.x, y + 6, 4, 6.5, 0, 0, 6.283); ctx.fill();
        });
        ctx.restore();
    }
    function launch(colors) {
        rockets.push({ x: rand(W * 0.15, W * 0.85), y: H + 10, vy: -rand(H * 0.75, H * 1.05), vx: rand(-30, 30), top: rand(H * 0.12, H * 0.45), c: pick(colors), colors: colors });
    }
    function burst(r) {
        var n = 46, multi = Math.random() < 0.35;
        for (var i = 0; i < n; i++) {
            var a = i / n * 6.283 + rand(-0.05, 0.05), v = rand(90, 190);
            sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(1.1, 1.7), c: multi ? pick(r.colors) : r.c });
        }
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!last) last = now;
        var dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        if (acc < 1 / 31) return; // ~30 cuadros por segundo alcanzan y cuidan la PC
        dt = acc; acc = 0; T += dt;
        var k = KINDS[kind]; if (!k) return;
        ctx.clearRect(0, 0, W, H);
        if (k.fog) {
            var g = ctx.createLinearGradient(0, H * 0.65, 0, H);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, k.fog + '55');
            ctx.fillStyle = g; ctx.fillRect(0, H * 0.65, W, H * 0.35);
        }
        if (k.sun) drawSun(T);
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (p.star) {
                ctx.globalAlpha = 0.35 + 0.35 * Math.sin(T * p.sp + p.ph); ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); continue;
            }
            if (p.emoji) {
                var cfg = k.emoji;
                p.x += (p.vx + (cfg.mode === 'fly' ? 0 : Math.sin(T + p.ph) * 14)) * dt;
                p.y += (cfg.mode === 'fly' ? Math.sin(T * 2 + p.ph) * 18 : p.vy) * dt;
                p.rot += p.vr * dt;
                var out = cfg.mode === 'fall' ? p.y > H + 50 : cfg.mode === 'rise' ? p.y < -50 : (p.x < -60 || p.x > W + 60);
                if (out) { parts[i] = Object.assign(newEmoji(cfg, false), { emoji: true }); continue; }
                var sc = cfg.mode === 'fly' && p.flap ? 0.75 + 0.25 * Math.abs(Math.sin(T * p.flap + p.ph)) : 1;
                ctx.save(); ctx.globalAlpha = p.a; ctx.translate(p.x, p.y); ctx.rotate(cfg.mode === 'fly' ? 0 : p.rot);
                if (cfg.mode === 'fly' && p.vx < 0) ctx.scale(-1, 1);
                ctx.drawImage(sprite(p.ch), -p.s / 2, -p.s * sc / 2, p.s, p.s * sc);
                ctx.restore();
                continue;
            }
            // nieve y papelitos
            p.y += p.vy * dt; p.x += Math.sin(T * 1.3 + p.ph) * p.sway * dt; p.rot += p.vr * dt;
            if (p.y > H + 10) { parts[i] = newFall(k.fall, false); continue; }
            ctx.globalAlpha = p.a; ctx.fillStyle = p.color;
            if (p.kind === 'snow') { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
            else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2 * Math.abs(Math.cos(T * 3 + p.ph))); ctx.restore(); }
        }
        ctx.globalAlpha = 1;
        if (k.fireworks) {
            if (T > nextRocket) { launch(k.fireworks); nextRocket = T + rand(0.9, 2.4); }
            ctx.globalCompositeOperation = 'lighter';
            for (var r = rockets.length - 1; r >= 0; r--) {
                var ro = rockets[r];
                ro.x += ro.vx * dt; ro.y += ro.vy * dt; ro.vy += 260 * dt;
                ctx.fillStyle = ro.c; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(ro.x, ro.y, 1.8, 0, 6.283); ctx.fill();
                if (ro.y <= ro.top || ro.vy >= -20) { burst(ro); rockets.splice(r, 1); }
            }
            ctx.lineWidth = 1.6;
            for (var s = sparks.length - 1; s >= 0; s--) {
                var sp = sparks[s];
                sp.life += dt;
                if (sp.life > sp.max) { sparks.splice(s, 1); continue; }
                sp.px = sp.x; sp.py = sp.y;
                sp.vx *= (1 - 1.6 * dt); sp.vy = sp.vy * (1 - 1.6 * dt) + 70 * dt;
                sp.x += sp.vx * dt; sp.y += sp.vy * dt;
                ctx.globalAlpha = Math.max(0, 1 - sp.life / sp.max); ctx.strokeStyle = sp.c;
                ctx.beginPath(); ctx.moveTo(sp.px - sp.vx * 0.05, sp.py - sp.vy * 0.05); ctx.lineTo(sp.x, sp.y); ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
        if (k.bulbs) drawBulbs(T);
    }

    function start(k) {
        if (!KINDS[k]) { stop(); return; }
        if (kind === k && raf) return;
        kind = k;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'anim-fx';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
            ctx = canvas.getContext('2d');
            window.addEventListener('resize', function () { if (kind) resize(); });
        }
        if (!canvas.parentNode) document.body.prepend(canvas);
        resize();
        last = 0; T = 0; nextRocket = 0.3;
        if (!raf) raf = requestAnimationFrame(frame);
    }
    function stop() {
        kind = '';
        if (raf) cancelAnimationFrame(raf);
        raf = null; parts = []; sparks = []; rockets = [];
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
    window.SDAnimFX = { start: start, stop: stop, kinds: Object.keys(KINDS) };
})();
