/* ==========================================================================
   Temas y fondos animados (panel y OBS). El OVNI está aparte, en xfiles-fx.js.
   Todo se dibuja con figuras propias (nada de emojis): copos de cristal, guirnaldas con
   luces, murciélagos que aletean, pétalos que giran, billetes y monedas, rayos, etc.
   Liviano: ~30 cuadros por segundo, las figuras se dibujan una vez y después se copian,
   y la cantidad depende del tamaño de la ventana.
   Superposición: una parte de las partículas puede pasar por DELANTE de las tarjetas
   (SDAnimFX.setFront(0..1)); esas van en un segundo lienzo, arriba de todo.
   ========================================================================== */
(function () {
    'use strict';
    var back = null, bctx = null, front = null, fctx = null, g = null;
    var raf = null, kind = '', W = 0, H = 0, DPR = 1, last = 0, acc = 0, T = 0, frontFrac = 0, TOP = 0;
    // Fondo de los efectos: 'auto' = como viene cada uno · 'on' = todos con fondo · 'off' = ninguno pinta fondo
    var BGMODE = 'auto';
    function noBg() { return BGMODE === 'off'; }
    var parts = [], extra = {};
    var SPR = {};

    function rand(a, b) { return a + Math.random() * (b - a); }
    function pick(a) { return a[(Math.random() * a.length) | 0]; }
    function scaleN(n) { return Math.max(6, Math.round(n * Math.min(1.4, (W * H) / (1280 * 720)))); }
    function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
    function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
    // Algunas partículas van por delante de las tarjetas
    function tagFront(p) { p.front = frontFrac > 0 && Math.random() < frontFrac; return p; }
    function use(p) { g = (p && p.front && fctx) ? fctx : bctx; return g; }

    // ---------------- Figuras (se dibujan una vez) ----------------
    function glow(color, r) {
        var k = 'g' + color + r; if (SPR[k]) return SPR[k];
        var c = mk(r * 2, r * 2), x = c.getContext('2d'), gr = x.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.25, rgba(color, 0.55)); gr.addColorStop(1, rgba(color, 0));
        x.fillStyle = gr; x.fillRect(0, 0, r * 2, r * 2);
        return (SPR[k] = c);
    }
    function flake(v) {
        var k = 'f' + v; if (SPR[k]) return SPR[k];
        var S = 64, c = mk(S, S), x = c.getContext('2d');
        x.translate(S / 2, S / 2); x.strokeStyle = '#fff'; x.lineCap = 'round';
        x.shadowColor = 'rgba(170,215,255,0.9)'; x.shadowBlur = 4;
        for (var i = 0; i < 6; i++) {
            x.save(); x.rotate(i * Math.PI / 3);
            x.lineWidth = 2.6; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -26); x.stroke();
            x.lineWidth = 1.8;
            var br = v === 0 ? [[-9, 7], [-17, 6]] : v === 1 ? [[-12, 8], [-20, 5], [-6, 4]] : [[-14, 10]];
            br.forEach(function (b) { x.beginPath(); x.moveTo(0, b[0]); x.lineTo(-b[1], b[0] - b[1]); x.moveTo(0, b[0]); x.lineTo(b[1], b[0] - b[1]); x.stroke(); });
            if (v === 2) { x.beginPath(); x.moveTo(-5, -20); x.lineTo(0, -25); x.lineTo(5, -20); x.stroke(); }
            x.restore();
        }
        x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 3, 0, 6.283); x.fill();
        return (SPR[k] = c);
    }
    function heart(color) {
        var k = 'h' + color; if (SPR[k]) return SPR[k];
        var S = 64, c = mk(S, S), x = c.getContext('2d');
        x.translate(32, 34);
        x.beginPath(); x.moveTo(0, 18);
        x.bezierCurveTo(-30, -2, -18, -26, 0, -12); x.bezierCurveTo(18, -26, 30, -2, 0, 18); x.closePath();
        var gr = x.createLinearGradient(-20, -24, 20, 18); gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, color); gr.addColorStop(1, rgba(color, 0.85));
        x.shadowColor = rgba(color, 0.7); x.shadowBlur = 8; x.fillStyle = gr; x.fill();
        x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,0.45)';
        x.beginPath(); x.ellipse(-9, -10, 5, 3, -0.6, 0, 6.283); x.fill();
        return (SPR[k] = c);
    }
    function petal(color) {
        var k = 'p' + color; if (SPR[k]) return SPR[k];
        var c = mk(40, 40), x = c.getContext('2d');
        x.translate(20, 20);
        x.beginPath(); x.moveTo(0, 15); x.bezierCurveTo(-14, 6, -11, -12, -3, -15); x.lineTo(0, -10); x.lineTo(3, -15); x.bezierCurveTo(11, -12, 14, 6, 0, 15); x.closePath();
        var gr = x.createLinearGradient(0, 15, 0, -15); gr.addColorStop(0, '#fff3f7'); gr.addColorStop(1, color);
        x.fillStyle = gr; x.fill();
        x.strokeStyle = 'rgba(200,80,120,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 13); x.lineTo(0, -6); x.stroke();
        return (SPR[k] = c);
    }
    function flower(color) {
        var k = 'fl' + color; if (SPR[k]) return SPR[k];
        var c = mk(64, 64), x = c.getContext('2d'), p = petal(color);
        x.translate(32, 32);
        for (var i = 0; i < 5; i++) { x.save(); x.rotate(i * 1.2566); x.drawImage(p, -12, -26, 24, 24); x.restore(); }
        var gr = x.createRadialGradient(0, 0, 0, 0, 0, 7); gr.addColorStop(0, '#FFF6A8'); gr.addColorStop(1, '#F2B705');
        x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 6, 0, 6.283); x.fill();
        return (SPR[k] = c);
    }
    function leaf(color) {
        var k = 'l' + color; if (SPR[k]) return SPR[k];
        var c = mk(64, 64), x = c.getContext('2d');
        x.translate(32, 34);
        // Hoja de arce: 5 puntas
        var pts = [[0, -28], [6, -14], [18, -20], [14, -6], [27, -4], [16, 4], [20, 14], [6, 10], [2, 22], [-2, 22], [-6, 10], [-20, 14], [-16, 4], [-27, -4], [-14, -6], [-18, -20], [-6, -14]];
        x.beginPath(); pts.forEach(function (q, i) { if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }); x.closePath();
        var gr = x.createRadialGradient(-6, -8, 2, 0, 0, 30); gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(1, rgba(color, 0.78));
        x.fillStyle = gr; x.fill();
        x.strokeStyle = 'rgba(60,25,5,0.45)'; x.lineWidth = 1.3; x.beginPath();
        x.moveTo(0, 26); x.lineTo(0, -24); x.moveTo(0, 2); x.lineTo(20, -14); x.moveTo(0, 2); x.lineTo(-20, -14); x.moveTo(0, 8); x.lineTo(14, 10); x.moveTo(0, 8); x.lineTo(-14, 10);
        x.stroke();
        return (SPR[k] = c);
    }
    function bill() {
        if (SPR.bill) return SPR.bill;
        var c = mk(84, 44), x = c.getContext('2d');
        var gr = x.createLinearGradient(0, 0, 84, 44); gr.addColorStop(0, '#9BE7A8'); gr.addColorStop(0.5, '#4CB86A'); gr.addColorStop(1, '#2E8B4E');
        x.fillStyle = gr; x.beginPath(); x.roundRect ? x.roundRect(2, 2, 80, 40, 4) : x.rect(2, 2, 80, 40); x.fill();
        x.strokeStyle = 'rgba(15,70,35,0.8)'; x.lineWidth = 2; x.strokeRect(7, 7, 70, 30);
        x.fillStyle = 'rgba(230,255,235,0.55)'; x.beginPath(); x.ellipse(42, 22, 12, 11, 0, 0, 6.283); x.fill();
        x.fillStyle = '#145A2E'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 42, 23);
        x.font = 'bold 9px Arial'; x.fillText('100', 16, 15); x.fillText('100', 68, 31);
        return (SPR.bill = c);
    }
    function coin() {
        if (SPR.coin) return SPR.coin;
        var c = mk(48, 48), x = c.getContext('2d'), gr = x.createRadialGradient(18, 16, 2, 24, 24, 24);
        gr.addColorStop(0, '#FFF7C2'); gr.addColorStop(0.45, '#F6C744'); gr.addColorStop(1, '#B8860B');
        x.fillStyle = gr; x.beginPath(); x.arc(24, 24, 22, 0, 6.283); x.fill();
        x.strokeStyle = '#A0740A'; x.lineWidth = 2; x.beginPath(); x.arc(24, 24, 17, 0, 6.283); x.stroke();
        x.fillStyle = '#9A6B00'; x.font = 'bold 20px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 24, 25);
        return (SPR.coin = c);
    }
    function ornament(color) {
        var k = 'o' + color; if (SPR[k]) return SPR[k];
        var c = mk(48, 60), x = c.getContext('2d');
        x.fillStyle = '#C9A227'; x.fillRect(19, 2, 10, 8);
        var gr = x.createRadialGradient(18, 26, 2, 24, 34, 22); gr.addColorStop(0, '#fff'); gr.addColorStop(0.15, color); gr.addColorStop(1, rgba(color, 0.7));
        x.fillStyle = gr; x.beginPath(); x.arc(24, 34, 20, 0, 6.283); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2; x.beginPath(); x.ellipse(24, 34, 20, 6, 0, 0, 6.283); x.stroke();
        return (SPR[k] = c);
    }
    function ghost() {
        if (SPR.ghost) return SPR.ghost;
        var c = mk(60, 72), x = c.getContext('2d');
        x.beginPath(); x.moveTo(6, 66); x.lineTo(6, 28); x.bezierCurveTo(6, 4, 54, 4, 54, 28); x.lineTo(54, 66);
        for (var i = 0; i < 4; i++) x.quadraticCurveTo(54 - i * 12 - 6, 56 + (i % 2 ? 10 : -2), 54 - (i + 1) * 12, 66);
        x.closePath();
        var gr = x.createLinearGradient(0, 0, 0, 72); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(220,225,255,0.35)');
        x.shadowColor = 'rgba(200,210,255,0.9)'; x.shadowBlur = 10; x.fillStyle = gr; x.fill();
        x.shadowBlur = 0; x.fillStyle = '#1b1530';
        x.beginPath(); x.ellipse(22, 28, 4, 6, 0, 0, 6.283); x.ellipse(38, 28, 4, 6, 0, 0, 6.283); x.fill();
        x.beginPath(); x.ellipse(30, 42, 5, 4, 0, 0, 6.283); x.fill();
        return (SPR.ghost = c);
    }
    function bubbleSpr() {
        if (SPR.bubble) return SPR.bubble;
        var c = mk(80, 80), x = c.getContext('2d');
        var gr = x.createRadialGradient(40, 40, 28, 40, 40, 38);
        gr.addColorStop(0, 'rgba(255,255,255,0.02)'); gr.addColorStop(0.7, 'rgba(160,220,255,0.18)'); gr.addColorStop(0.9, 'rgba(255,170,240,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(40, 40, 38, 0, 6.283); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1.2; x.beginPath(); x.arc(40, 40, 36, 0, 6.283); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(27, 25, 9, 5, -0.7, 0, 6.283); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.arc(54, 56, 3, 0, 6.283); x.fill();
        return (SPR.bubble = c);
    }
    function sparkle(color) {
        var k = 's' + color; if (SPR[k]) return SPR[k];
        var c = mk(32, 32), x = c.getContext('2d');
        x.drawImage(glow(color, 10), 6, 6);
        x.fillStyle = '#fff'; x.translate(16, 16);
        x.beginPath(); x.moveTo(0, -15); x.quadraticCurveTo(1.5, -1.5, 15, 0); x.quadraticCurveTo(1.5, 1.5, 0, 15); x.quadraticCurveTo(-1.5, 1.5, -15, 0); x.quadraticCurveTo(-1.5, -1.5, 0, -15); x.fill();
        return (SPR[k] = c);
    }
    function auroraCol(color) {
        var k = 'a' + color; if (SPR[k]) return SPR[k];
        var c = mk(1, 200), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 200);
        gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.55, rgba(color, 0.55)); gr.addColorStop(0.8, rgba(color, 0.9)); gr.addColorStop(1, rgba(color, 0));
        x.fillStyle = gr; x.fillRect(0, 0, 1, 200);
        return (SPR[k] = c);
    }

    // ---------------- Piezas comunes ----------------
    function draw(img, x, y, w, h, rot, a, sx) {
        g.save(); g.globalAlpha = a; g.translate(x, y); if (rot) g.rotate(rot); if (sx !== undefined) g.scale(sx, 1);
        g.drawImage(img, -w / 2, -h / 2, w, h); g.restore();
    }
    function skyFill(c1, c2, c3) {
        if (noBg()) return;
        var gr = bctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c1); gr.addColorStop(0.6, c2); gr.addColorStop(1, c3);
        bctx.fillStyle = gr; bctx.fillRect(0, 0, W, H);
    }
    function makeStars(n, full) {
        var cols = ['#FFFFFF', '#FFFFFF', '#CFE3FF', '#FFE9B8'];
        extra.stars = [];
        for (var i = 0; i < scaleN(n); i++) extra.stars.push({ x: rand(0, W), y: rand(0, H * (full ? 1 : 0.6)), r: rand(0.6, 2), ph: rand(0, 6.28), sp: rand(0.6, 2), c: pick(cols) });
    }
    function drawStars() {
        g = bctx;
        extra.stars.forEach(function (s) {
            var a = 0.45 + 0.4 * Math.sin(T * s.sp + s.ph);
            if (s.r > 1.6) { g.globalAlpha = a * 0.8; g.drawImage(glow(s.c, 6), s.x - 6, s.y - 6); }
            g.globalAlpha = a; g.fillStyle = s.c; g.beginPath(); g.arc(s.x, s.y, s.r * 0.6, 0, 6.283); g.fill();
        });
        g.globalAlpha = 1;
    }
    // Copos: lejos chiquitos y lentos, cerca grandes y con forma de cristal
    function newSnow(initial) {
        var z = Math.pow(Math.random(), 1.6), big = z > 0.78;
        return tagFront({ t: 'snow', z: z, x: rand(0, W), y: initial ? rand(-H, H) : rand(-40, -8), s: big ? rand(12, 24) : 1.2 + z * 4,
            vy: 16 + z * 60, sway: rand(8, 26), ph: rand(0, 6.28), rot: rand(0, 6.28), vr: rand(-0.8, 0.8), v: (Math.random() * 3) | 0, big: big, a: 0.45 + z * 0.5 });
    }
    function stepSnow(p, dt, wind) {
        p.y += p.vy * dt; p.x += (Math.sin(T * 0.9 + p.ph) * p.sway + wind * (0.3 + p.z)) * dt; p.rot += p.vr * dt;
        if (p.x > W + 20) p.x = -20; else if (p.x < -20) p.x = W + 20;
        if (p.y > H + 30) return false;
        use(p);
        if (p.big) draw(flake(p.v), p.x, p.y, p.s, p.s, p.rot, p.a);
        else { g.globalAlpha = p.a; g.drawImage(glow('#FFFFFF', 8), p.x - p.s * 1.6, p.y - p.s * 1.6, p.s * 3.2, p.s * 3.2); }
        return true;
    }
    // Papelitos con giro en 3D
    function newConfetti(colors, initial, circles) {
        return tagFront({ t: 'conf', x: rand(0, W), y: initial ? rand(-H * 0.2, H) : rand(-60, -10), w: rand(6, 11), h: rand(10, 16), vy: rand(45, 95), vx: rand(-20, 20),
            ph: rand(0, 6.28), fs: rand(4, 9), rot: rand(0, 6.28), vr: rand(-3, 3), c: pick(colors), round: circles && Math.random() < 0.3, a: rand(0.8, 1) });
    }
    function stepConfetti(p, dt) {
        p.y += p.vy * dt; p.x += (p.vx + Math.sin(T * 2 + p.ph) * 22) * dt; p.rot += p.vr * dt;
        if (p.y > H + 20) return false;
        use(p); g.save(); g.globalAlpha = p.a; g.translate(p.x, p.y); g.rotate(p.rot);
        var f = Math.cos(T * p.fs + p.ph);
        g.scale(1, Math.abs(f) * 0.9 + 0.1);
        g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 6.283); g.fill(); }
        else { g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); if (f < 0) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); } }
        g.restore();
        return true;
    }
    // Cosas que caen girando y dándose vuelta (hojas, pétalos, billetes)
    function newTumble(img, size, initial, speed) {
        return tagFront({ t: 'tumble', img: img, s: rand(size[0], size[1]), x: rand(0, W), y: initial ? rand(-H * 0.25, H) : rand(-80, -20), vy: rand(speed[0], speed[1]),
            sway: rand(25, 60), ph: rand(0, 6.28), rot: rand(0, 6.28), vr: rand(-1.6, 1.6), fs: rand(1.2, 3), a: rand(0.85, 1) });
    }
    function stepTumble(p, dt, wind) {
        p.y += p.vy * dt; p.x += (Math.sin(T * 1.1 + p.ph) * p.sway + (wind || 0)) * dt; p.rot += p.vr * dt;
        if (p.x > W + 60) p.x = -60; else if (p.x < -60) p.x = W + 60;
        if (p.y > H + 60) return false;
        use(p);
        var r = p.img.height / p.img.width;
        draw(p.img, p.x, p.y, p.s, p.s * r, p.rot, p.a, Math.cos(T * p.fs + p.ph));
        return true;
    }
    // Fuegos artificiales con estela y brillo
    function launch(colors) {
        extra.rockets.push({ x: rand(W * 0.12, W * 0.88), y: H + 10, vy: -rand(H * 0.8, H * 1.1), vx: rand(-40, 40), top: rand(H * 0.1, H * 0.42), c: pick(colors), colors: colors });
    }
    function burst(r) {
        var type = Math.random(), n = type < 0.25 ? 70 : 54, multi = Math.random() < 0.35;
        for (var i = 0; i < n; i++) {
            var a = i / n * 6.283 + rand(-0.04, 0.04), v = type < 0.25 ? 170 : rand(70, 200);
            extra.sparks.push(tagFront({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(1.2, 2), c: multi ? pick(r.colors) : r.c, tw: Math.random() < 0.4 }));
        }
        extra.flash = Math.max(extra.flash || 0, 0.12);
    }
    function stepFireworks(colors, dt) {
        if (T > extra.nextRocket) { launch(colors); if (Math.random() < 0.3) launch(colors); extra.nextRocket = T + rand(0.8, 2.2); }
        bctx.globalCompositeOperation = 'lighter';
        for (var r = extra.rockets.length - 1; r >= 0; r--) {
            var ro = extra.rockets[r];
            ro.x += ro.vx * dt; ro.y += ro.vy * dt; ro.vy += 280 * dt;
            bctx.globalAlpha = 0.9; bctx.drawImage(glow(ro.c, 6), ro.x - 6, ro.y - 6);
            bctx.globalAlpha = 0.35; bctx.drawImage(glow('#FFD9A0', 4), ro.x - 4 - ro.vx * 0.03, ro.y - 4 - ro.vy * 0.03);
            if (ro.y <= ro.top || ro.vy >= -30) { burst(ro); extra.rockets.splice(r, 1); }
        }
        bctx.globalCompositeOperation = 'source-over';
        for (var s = extra.sparks.length - 1; s >= 0; s--) {
            var sp = extra.sparks[s];
            sp.life += dt;
            if (sp.life > sp.max) { extra.sparks.splice(s, 1); continue; }
            sp.vx *= (1 - 1.4 * dt); sp.vy = sp.vy * (1 - 1.4 * dt) + 75 * dt;
            sp.x += sp.vx * dt; sp.y += sp.vy * dt;
            use(sp); g.globalCompositeOperation = 'lighter';
            var a = Math.max(0, 1 - sp.life / sp.max);
            if (sp.tw && sp.life > sp.max * 0.5) a *= 0.5 + 0.5 * Math.sin(T * 40 + s);
            g.globalAlpha = a; g.drawImage(glow(sp.c, 7), sp.x - 7, sp.y - 7);
            g.globalAlpha = a * 0.5; g.drawImage(glow(sp.c, 4), sp.x - sp.vx * 0.04 - 4, sp.y - sp.vy * 0.04 - 4);
            g.globalCompositeOperation = 'source-over';
        }
        if (extra.flash > 0) { if (!noBg()) { bctx.globalAlpha = extra.flash * 0.4; bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, W, H); } extra.flash -= dt * 0.6; }
        bctx.globalAlpha = 1;
    }
    // Lluvia con salpicaduras
    function newDrop(initial, heavy) {
        var z = Math.random();
        return tagFront({ t: 'drop', z: z, x: rand(-W * 0.2, W * 1.1), y: initial ? rand(-H, H) : rand(-120, -20), len: 10 + z * (heavy ? 26 : 18), v: 650 + z * (heavy ? 650 : 450), a: 0.18 + z * 0.4 });
    }
    function stepRain(dt, heavy) {
        var ang = heavy ? 0.28 + Math.sin(T * 0.3) * 0.06 : 0.12;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            p.y += p.v * dt; p.x += p.v * ang * dt;
            if (p.y > H - rand(0, 40) && p.y > H * 0.85) {
                if (Math.random() < 0.5) extra.splash.push({ x: p.x, y: Math.min(H - 2, p.y), life: 0, s: 2 + p.z * 4 });
                parts[i] = newDrop(false, heavy); continue;
            }
            use(p); g.globalAlpha = p.a; g.strokeStyle = '#C9DDF2'; g.lineWidth = 0.8 + p.z * 1.2;
            g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.len * ang, p.y - p.len); g.stroke();
        }
        g = bctx; g.strokeStyle = '#D9E8F7';
        for (var s = extra.splash.length - 1; s >= 0; s--) {
            var sp = extra.splash[s]; sp.life += dt;
            if (sp.life > 0.3) { extra.splash.splice(s, 1); continue; }
            g.globalAlpha = 0.5 * (1 - sp.life / 0.3); g.lineWidth = 1;
            g.beginPath(); g.ellipse(sp.x, sp.y, sp.s * (1 + sp.life * 8), sp.s * 0.35 * (1 + sp.life * 6), 0, Math.PI, 6.283); g.stroke();
        }
        if (noBg()) return;
        var mist = bctx.createLinearGradient(0, H * 0.8, 0, H);
        mist.addColorStop(0, 'rgba(200,215,235,0)'); mist.addColorStop(1, 'rgba(200,215,235,' + (heavy ? 0.16 : 0.1) + ')');
        bctx.globalAlpha = 1; bctx.fillStyle = mist; bctx.fillRect(0, H * 0.8, W, H * 0.2);
    }
    // Rayo con ramas
    function bolt(x0, y0, len) {
        var pts = [[x0, y0]], x = x0, y = y0, branches = [];
        while (y < y0 + len) {
            x += rand(-28, 28); y += rand(14, 34); pts.push([x, y]);
            if (Math.random() < 0.18) branches.push(boltBranch(x, y, rand(60, 160)));
        }
        return { main: pts, branches: branches };
    }
    function boltBranch(x, y, len) {
        var pts = [[x, y]], dir = Math.random() < 0.5 ? -1 : 1, y1 = y + len;
        while (y < y1) { x += dir * rand(4, 22); y += rand(10, 24); pts.push([x, y]); }
        return pts;
    }
    function strokePath(pts, w, a, color) {
        g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.beginPath();
        pts.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke();
    }

    // ---------------- Cada efecto ----------------
    var KINDS = {
        nieve: {
            init: function () { for (var i = 0; i < scaleN(190); i++) parts.push(newSnow(true)); },
            step: function (dt) {
                var wind = Math.sin(T * 0.22) * 30 + Math.sin(T * 0.07) * 18;
                for (var i = 0; i < parts.length; i++) if (!stepSnow(parts[i], dt, wind)) parts[i] = newSnow(false);
                if (noBg()) return;
                var gg = bctx.createLinearGradient(0, H - 60, 0, H);
                gg.addColorStop(0, 'rgba(235,245,255,0)'); gg.addColorStop(1, 'rgba(235,245,255,0.25)');
                bctx.globalAlpha = 1; bctx.fillStyle = gg; bctx.fillRect(0, H - 60, W, 60);
            }
        },
        navidad: {
            init: function () {
                for (var i = 0; i < scaleN(120); i++) parts.push(newSnow(true));
                // Guirnalda: tramos colgantes con luces y bolas
                var sw = Math.max(3, Math.round(W / 300)), seg = W / sw;
                extra.swags = []; extra.bulbs = []; extra.balls = [];
                for (var s = 0; s < sw; s++) extra.swags.push({ x0: s * seg, x1: (s + 1) * seg, sag: rand(26, 40) });
                var cols = ['#FF3B3B', '#2EE66B', '#FFD43B', '#4DABF7', '#FF7AE0'], nb = Math.round(W / 34);
                for (var b = 0; b < nb; b++) extra.bulbs.push({ u: (b + 0.5) / nb, c: cols[b % cols.length], ph: b * 0.7 });
                var bc = ['#D62828', '#F6C744', '#2A9D8F', '#C0C0FF'];
                for (var o = 0; o < sw; o++) extra.balls.push({ s: o, c: bc[o % bc.length], len: rand(30, 60), ph: rand(0, 6.28) });
                extra.spark = []; for (var k = 0; k < scaleN(16); k++) extra.spark.push({ x: rand(0, W), y: rand(H * 0.15, H), ph: rand(0, 6.28), sp: rand(1, 2.5) });
            },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) if (!stepSnow(parts[i], dt, Math.sin(T * 0.2) * 15)) parts[i] = newSnow(false);
                g = bctx;
                extra.spark.forEach(function (s) { var a = Math.max(0, Math.sin(T * s.sp + s.ph)); if (a > 0.05) { g.globalAlpha = a * 0.8; g.drawImage(sparkle('#FFD54A'), s.x - 10, s.y - 10, 20, 20); } });
                function yAt(u) { var x = u * W, sw = extra.swags[Math.min(extra.swags.length - 1, Math.floor(u * extra.swags.length))], t = (x - sw.x0) / (sw.x1 - sw.x0); return { x: x, y: TOP + 8 + Math.sin(t * Math.PI) * sw.sag }; }
                // Bolas colgando del punto más bajo de cada tramo
                extra.balls.forEach(function (b) {
                    var sw = extra.swags[b.s], mx = (sw.x0 + sw.x1) / 2, my = TOP + 8 + sw.sag, ang = Math.sin(T * 1.3 + b.ph) * 0.12;
                    var bx = mx + Math.sin(ang) * b.len, by = my + Math.cos(ang) * b.len;
                    g.globalAlpha = 0.8; g.strokeStyle = '#C9A227'; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, my); g.lineTo(bx, by); g.stroke();
                    draw(ornament(b.c), bx, by + 22, 30, 37, ang, 1);
                });
                // Cable
                g.globalAlpha = 1; g.strokeStyle = '#1F4D2B'; g.lineWidth = 3; g.beginPath();
                for (var x = 0; x <= W; x += 6) { var q = yAt(x / W); if (x) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }
                g.stroke(); g.strokeStyle = 'rgba(80,140,80,0.6)'; g.lineWidth = 1; g.stroke();
                // Luces que se prenden en cadena
                extra.bulbs.forEach(function (b, i) {
                    var q = yAt(b.u), on = 0.35 + 0.65 * Math.max(0, Math.sin(T * 2.4 - i * 0.55));
                    g.globalAlpha = on; g.drawImage(glow(b.c, 14), q.x - 14, q.y + 8 - 14);
                    g.globalAlpha = 1; g.fillStyle = '#2b2b2b'; g.fillRect(q.x - 2, q.y, 4, 4);
                    g.fillStyle = b.c; g.beginPath(); g.ellipse(q.x, q.y + 9, 3.6, 6, 0, 0, 6.283); g.fill();
                });
                g.globalAlpha = 1;
            }
        },
        halloween: {
            init: function () {
                extra.bats = []; for (var i = 0; i < scaleN(9); i++) extra.bats.push(newBat(true));
                for (var j = 0; j < Math.max(2, scaleN(3)); j++) parts.push(tagFront({ t: 'ghost', x: rand(0, W), y: rand(H * 0.3, H * 0.85), vx: rand(12, 30) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, 6.28), s: rand(36, 60) }));
                extra.embers = []; for (var k = 0; k < scaleN(26); k++) extra.embers.push(newEmber(true));
            },
            step: function (dt) {
                g = bctx;
                // Luna con brillo
                var mx = W - 110, my = 100;
                g.globalAlpha = 0.5; g.drawImage(glow('#FFE7A3', 110), mx - 110, my - 110);
                g.globalAlpha = 0.95; var mg = g.createRadialGradient(mx - 12, my - 12, 4, mx, my, 44); mg.addColorStop(0, '#FFF8DC'); mg.addColorStop(1, '#E8C872');
                g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 42, 0, 6.283); g.fill();
                g.fillStyle = 'rgba(160,120,60,0.25)'; [[-12, -6, 8], [10, 10, 6], [14, -14, 4]].forEach(function (c) { g.beginPath(); g.arc(mx + c[0], my + c[1], c[2], 0, 6.283); g.fill(); });
                // Niebla que se mueve
                for (var f = 0; f < 3; f++) {
                    var fx = ((T * (12 + f * 6)) % (W + 600)) - 300, fy = H - 40 - f * 30;
                    g.globalAlpha = 0.22; g.drawImage(glow(f === 1 ? '#5B2A86' : '#2F6B4F', 300), fx - 300, fy - 120, 600, 240);
                    g.drawImage(glow('#5B2A86', 300), ((fx + W / 2) % (W + 600)) - 300, fy - 100, 600, 200);
                }
                // Brasas
                extra.embers.forEach(function (e, i) {
                    e.y -= e.vy * dt; e.x += Math.sin(T + e.ph) * 12 * dt; if (e.y < H * 0.3) extra.embers[i] = newEmber(false);
                    g.globalAlpha = 0.5 + 0.4 * Math.sin(T * 6 + e.ph); g.drawImage(glow('#FF8C1A', 5), e.x - 5, e.y - 5);
                });
                // Fantasmas
                parts.forEach(function (p) {
                    p.x += p.vx * dt; if (p.x < -80) p.x = W + 80; if (p.x > W + 80) p.x = -80;
                    use(p); draw(ghost(), p.x, p.y + Math.sin(T * 1.4 + p.ph) * 14, p.s, p.s * 1.2, Math.sin(T + p.ph) * 0.12, 0.55 + 0.3 * Math.sin(T * 0.7 + p.ph), p.vx < 0 ? -1 : 1);
                });
                // Murciélagos
                extra.bats.forEach(function (b, i) {
                    b.x += b.vx * dt; b.y += Math.sin(T * 2 + b.ph) * 20 * dt;
                    if (b.x < -60 || b.x > W + 60) { extra.bats[i] = newBat(false); return; }
                    use(b); drawBat(b);
                });
                g = bctx; g.globalAlpha = 1;
            }
        },
        argentina: {
            init: function () { for (var i = 0; i < scaleN(80); i++) parts.push(newConfetti(['#74ACDF', '#FFFFFF', '#74ACDF', '#F6B40E', '#FFFFFF'], true)); },
            step: function (dt) {
                drawSun(90, H - 90, 34);
                for (var i = 0; i < parts.length; i++) if (!stepConfetti(parts[i], dt)) parts[i] = newConfetti(['#74ACDF', '#FFFFFF', '#74ACDF', '#F6B40E', '#FFFFFF'], false);
            }
        },
        julio4: {
            init: function () { makeStars(70); extra.rockets = []; extra.sparks = []; extra.nextRocket = 0.3; for (var i = 0; i < scaleN(45); i++) parts.push(newConfetti(USA, true)); },
            step: function (dt) {
                drawStars(); stepFireworks(['#E63946', '#FFFFFF', '#3C6EF0', '#7FA8FF'], dt);
                for (var i = 0; i < parts.length; i++) if (!stepConfetti(parts[i], dt)) parts[i] = newConfetti(USA, false);
            }
        },
        anionuevo: {
            init: function () { makeStars(40); extra.rockets = []; extra.sparks = []; extra.nextRocket = 0.3; for (var i = 0; i < scaleN(40); i++) parts.push(newConfetti(['#F6C744', '#FFFFFF', '#C0C0C0', '#FFE8A3'], true)); },
            step: function (dt) {
                drawStars(); stepFireworks(['#F6C744', '#FFFFFF', '#FF5DA2', '#5DE2FF', '#B388FF'], dt);
                for (var i = 0; i < parts.length; i++) if (!stepConfetti(parts[i], dt)) parts[i] = newConfetti(['#F6C744', '#FFFFFF', '#C0C0C0', '#FFE8A3'], false);
            }
        },
        sanvalentin: {
            init: function () {
                for (var i = 0; i < scaleN(30); i++) parts.push(newHeart(true));
                extra.bokeh = []; for (var j = 0; j < scaleN(14); j++) extra.bokeh.push({ x: rand(0, W), y: rand(0, H), r: rand(20, 60), ph: rand(0, 6.28), c: pick(['#FF4D8D', '#FF99C2', '#FFC2D9']) });
            },
            step: function (dt) {
                g = bctx;
                extra.bokeh.forEach(function (b) { b.y -= 6 * dt; if (b.y < -60) b.y = H + 60; g.globalAlpha = 0.12 + 0.08 * Math.sin(T + b.ph); g.drawImage(glow(b.c, 60), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); });
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.y -= p.vy * dt; p.x += Math.sin(T * 1.3 + p.ph) * 20 * dt;
                    if (p.y < -50) { parts[i] = newHeart(false); continue; }
                    use(p); var beat = 1 + 0.08 * Math.max(0, Math.sin(T * 5 + p.ph));
                    draw(heart(p.c), p.x, p.y, p.s * beat, p.s * beat, Math.sin(T + p.ph) * 0.25, p.a);
                }
            }
        },
        primavera: {
            init: function () { for (var i = 0; i < scaleN(52); i++) parts.push(newSpring(true)); },
            step: function (dt) { var w = Math.sin(T * 0.3) * 25; for (var i = 0; i < parts.length; i++) if (!stepTumble(parts[i], dt, w)) parts[i] = newSpring(false); }
        },
        plata: {
            init: function () { for (var i = 0; i < scaleN(26); i++) parts.push(newMoney(true)); extra.spark = []; for (var k = 0; k < scaleN(14); k++) extra.spark.push({ x: rand(0, W), y: rand(0, H), ph: rand(0, 6.28), sp: rand(1, 3) }); },
            step: function (dt) {
                g = bctx; extra.spark.forEach(function (s) { var a = Math.max(0, Math.sin(T * s.sp + s.ph)); if (a > 0.05) { g.globalAlpha = a * 0.7; g.drawImage(sparkle('#F6C744'), s.x - 9, s.y - 9, 18, 18); } });
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    if (p.coin) {
                        p.y += p.vy * dt; p.x += Math.sin(T + p.ph) * 10 * dt;
                        if (p.y > H + 40) { parts[i] = newMoney(false); continue; }
                        use(p); draw(coin(), p.x, p.y, p.s, p.s, 0, p.a, Math.cos(T * p.fs + p.ph));
                    } else if (!stepTumble(p, dt, 0)) parts[i] = newMoney(false);
                }
            }
        },
        estrellas: {
            init: function () { makeStars(190, true); extra.shoot = null; extra.next = 1.5; extra.neb = [[0.3, 0.35, '#3A2A7A'], [0.7, 0.55, '#1E4B7A'], [0.5, 0.2, '#5A2A6A']]; },
            step: function (dt) {
                skyFill('#050816', '#0b1233', '#1a1440');
                g = bctx;
                if (!noBg()) extra.neb.forEach(function (n, i) { g.globalAlpha = 0.28 + 0.06 * Math.sin(T * 0.3 + i); var R = Math.max(W, H) * 0.45; g.drawImage(glow(n[2], 200), n[0] * W - R, n[1] * H - R, R * 2, R * 2); });
                drawStars(); shooting(dt);
            }
        },
        // ---- Nuevos ----
        lluvia: {
            init: function () { for (var i = 0; i < scaleN(170); i++) parts.push(newDrop(true, false)); extra.splash = []; },
            step: function (dt) { stepRain(dt, false); }
        },
        tormenta: {
            init: function () { for (var i = 0; i < scaleN(300); i++) parts.push(newDrop(true, true)); extra.splash = []; extra.bolt = null; extra.next = rand(1.5, 3); extra.flash = 0; extra.cloud = 0; },
            step: function (dt) {
                // Nubes oscuras arriba (se iluminan con los relámpagos)
                if (!noBg()) {
                    var cg = bctx.createLinearGradient(0, 0, 0, H * 0.45);
                    cg.addColorStop(0, 'rgba(10,14,24,0.85)'); cg.addColorStop(1, 'rgba(10,14,24,0)');
                    bctx.globalAlpha = 1; bctx.fillStyle = cg; bctx.fillRect(0, 0, W, H * 0.45);
                }
                if (extra.cloud > 0 && !noBg()) { bctx.globalAlpha = extra.cloud; bctx.drawImage(glow('#B8C8FF', 200), extra.cx - 300, -150, 600, 380); extra.cloud -= dt * 1.5; }
                if (T > extra.next) {
                    if (Math.random() < 0.55) { extra.bolt = bolt(rand(W * 0.1, W * 0.9), 0, rand(H * 0.45, H * 0.8)); extra.life = 0; extra.flash = 0.5; }
                    extra.cx = rand(0, W); extra.cloud = 0.6; extra.next = T + rand(2, 6);
                }
                if (extra.bolt) {
                    extra.life += dt;
                    var on = extra.life < 0.08 || (extra.life > 0.14 && extra.life < 0.22) || (extra.life > 0.3 && extra.life < 0.36);
                    if (on) {
                        g = bctx; g.globalCompositeOperation = 'lighter';
                        strokePath(extra.bolt.main, 10, 0.18, '#9DB4FF'); strokePath(extra.bolt.main, 4, 0.5, '#C9D6FF'); strokePath(extra.bolt.main, 1.6, 1, '#FFFFFF');
                        extra.bolt.branches.forEach(function (b) { strokePath(b, 4, 0.25, '#9DB4FF'); strokePath(b, 1, 0.8, '#FFFFFF'); });
                        g.globalCompositeOperation = 'source-over';
                    }
                    if (extra.life > 0.45) extra.bolt = null;
                }
                if (extra.flash > 0) { if (!noBg()) { bctx.globalAlpha = extra.flash * 0.35; bctx.fillStyle = '#E8EEFF'; bctx.fillRect(0, 0, W, H); } extra.flash -= dt * 2; }
                bctx.globalAlpha = 1;
                stepRain(dt, true);
            }
        },
        otono: {
            init: function () { for (var i = 0; i < scaleN(44); i++) parts.push(newLeaf(true)); },
            step: function (dt) { var w = Math.sin(T * 0.25) * 45 + 20; for (var i = 0; i < parts.length; i++) if (!stepTumble(parts[i], dt, w)) parts[i] = newLeaf(false); }
        },
        burbujas: {
            init: function () { for (var i = 0; i < scaleN(30); i++) parts.push(newBubble(true)); extra.pops = []; },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.y -= p.vy * dt; p.x += Math.sin(T * 1.2 + p.ph) * 18 * dt;
                    if (p.y < p.popY) { extra.pops.push({ x: p.x, y: p.y, r: p.s / 2, life: 0, front: p.front }); parts[i] = newBubble(false); continue; }
                    use(p); var wob = 1 + 0.05 * Math.sin(T * 3 + p.ph);
                    draw(bubbleSpr(), p.x, p.y, p.s * wob, p.s / wob, 0, 0.9);
                }
                for (var j = extra.pops.length - 1; j >= 0; j--) {
                    var q = extra.pops[j]; q.life += dt; if (q.life > 0.25) { extra.pops.splice(j, 1); continue; }
                    use(q); g.globalAlpha = 0.6 * (1 - q.life / 0.25); g.strokeStyle = '#E6F4FF'; g.lineWidth = 1.2;
                    for (var k = 0; k < 8; k++) { var a = k * 0.785, r1 = q.r * (1 + q.life * 3), r2 = r1 + 5; g.beginPath(); g.moveTo(q.x + Math.cos(a) * r1, q.y + Math.sin(a) * r1); g.lineTo(q.x + Math.cos(a) * r2, q.y + Math.sin(a) * r2); g.stroke(); }
                }
                g = bctx; g.globalAlpha = 1;
            }
        },
        luciernagas: {
            init: function () {
                for (var i = 0; i < scaleN(46); i++) parts.push(tagFront({ t: 'ff', x: rand(0, W), y: rand(H * 0.25, H), ph: rand(0, 6.28), f1: rand(0.2, 0.6), f2: rand(0.3, 0.8), sp: rand(18, 40), pulse: rand(1.2, 3), c: pick(['#D8FF6A', '#F4FF9A', '#B7FF5A']) }));
                // Pasto de silueta abajo
                var c = mk(W, 90), x = c.getContext('2d'); x.fillStyle = '#06140C';
                x.beginPath(); x.moveTo(0, 90);
                for (var b = 0; b <= W; b += 5) { var h = rand(25, 80); x.lineTo(b, 90 - h * 0.35); x.quadraticCurveTo(b + rand(-6, 6), 90 - h, b + rand(0, 4), 90 - h); x.lineTo(b + 2.5, 90 - h * 0.35); }
                x.lineTo(W, 90); x.closePath(); x.fill();
                extra.grass = c;
            },
            step: function (dt) {
                if (!noBg()) {
                    var vg = bctx.createLinearGradient(0, H * 0.5, 0, H); vg.addColorStop(0, 'rgba(4,18,10,0)'); vg.addColorStop(1, 'rgba(4,18,10,0.55)');
                    bctx.globalAlpha = 1; bctx.fillStyle = vg; bctx.fillRect(0, H * 0.5, W, H * 0.5);
                }
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.x += (Math.sin(T * p.f1 + p.ph) + 0.5 * Math.sin(T * p.f2 * 2.3 + p.ph * 2)) * p.sp * dt;
                    p.y += (Math.cos(T * p.f2 + p.ph) + 0.4 * Math.sin(T * p.f1 * 1.7)) * p.sp * 0.7 * dt;
                    if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20; if (p.y < H * 0.15) p.y = H * 0.15; if (p.y > H - 10) p.y = H - 10;
                    var a = Math.pow(Math.max(0, Math.sin(T * p.pulse + p.ph)), 2);
                    use(p); g.globalCompositeOperation = 'lighter';
                    g.globalAlpha = 0.15 + a * 0.85; g.drawImage(glow(p.c, 14), p.x - 14, p.y - 14);
                    g.globalAlpha = 0.6 + a * 0.4; g.fillStyle = '#FFFFE0'; g.beginPath(); g.arc(p.x, p.y, 1.6, 0, 6.283); g.fill();
                    g.globalCompositeOperation = 'source-over';
                }
                bctx.globalAlpha = 1; if (extra.grass && !noBg()) bctx.drawImage(extra.grass, 0, H - 90);
            }
        },
        aurora: {
            init: function () { makeStars(150, true); extra.ribbons = [{ c: '#3DFFB0', y: 0.22, amp: 60, f: 1.6, sp: 0.25, h: 220 }, { c: '#7A5CFF', y: 0.3, amp: 45, f: 2.3, sp: -0.18, h: 170 }, { c: '#2EE6D6', y: 0.16, amp: 35, f: 3.1, sp: 0.35, h: 140 }]; },
            step: function (dt) {
                skyFill('#020611', '#061428', '#0A1F2E');
                drawStars();
                g = bctx; g.globalCompositeOperation = 'lighter';
                extra.ribbons.forEach(function (r, ri) {
                    var col = auroraCol(r.c);
                    for (var x = 0; x < W; x += 4) {
                        var u = x / W, y = r.y * H + Math.sin(u * r.f * 3.14 + T * r.sp) * r.amp + Math.sin(u * 7 + T * 0.6 + ri) * 12;
                        var a = 0.25 + 0.35 * Math.max(0, Math.sin(u * 5 + T * 0.4 + ri * 2)) * (0.6 + 0.4 * Math.sin(T * 0.7 + x * 0.01));
                        g.globalAlpha = a; g.drawImage(col, x, y - r.h * 0.8, 6, r.h);
                    }
                });
                g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
            }
        },
        fiesta: {
            init: function () {
                for (var i = 0; i < scaleN(90); i++) parts.push(newConfetti(PARTY, true, true));
                extra.ribbons = []; for (var j = 0; j < scaleN(9); j++) extra.ribbons.push(newStreamer(true));
            },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) if (!stepConfetti(parts[i], dt)) parts[i] = newConfetti(PARTY, false, true);
                extra.ribbons.forEach(function (r, i) {
                    r.y += r.vy * dt; r.x += Math.sin(T * 0.8 + r.ph) * 20 * dt; r.rot += r.vr * dt;
                    if (r.y > H + 120) { extra.ribbons[i] = newStreamer(false); return; }
                    use(r); g.save(); g.translate(r.x, r.y); g.rotate(r.rot); g.globalAlpha = 0.95; g.strokeStyle = r.c; g.lineWidth = 4; g.lineCap = 'round';
                    g.beginPath(); for (var k = 0; k <= 30; k++) { var yy = k * 3.2, xx = Math.sin(k * 0.55 + T * 4 + r.ph) * 8; if (k) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke();
                    g.restore();
                });
            }
        }
    };
    // ---- Efectos "sin fondo": no pintan nada de fondo, van encima de tu imagen, tu juego o tu cámara ----
    var OVERLAY = {
        lluviafuerte: {
            init: function () { for (var i = 0; i < scaleN(320); i++) parts.push(newDrop(true, true)); extra.splash = []; },
            step: function (dt) { stepRain(dt, true); }
        },
        papelitos: {
            init: function () { for (var i = 0; i < scaleN(110); i++) parts.push(newConfetti(PARTY, true, true)); },
            step: function (dt) { for (var i = 0; i < parts.length; i++) if (!stepConfetti(parts[i], dt)) parts[i] = newConfetti(PARTY, false, true); }
        },
        brillos: {
            init: function () { for (var i = 0; i < scaleN(40); i++) parts.push(newTwinkle()); },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i]; p.life += dt;
                    if (p.life > p.max) { parts[i] = newTwinkle(); continue; }
                    var k = Math.sin(p.life / p.max * Math.PI);
                    use(p); g.globalCompositeOperation = 'lighter';
                    draw(sparkle(p.c), p.x, p.y, p.s * (0.4 + k * 0.6), p.s * (0.4 + k * 0.6), p.life * 1.5, k);
                    g.globalCompositeOperation = 'source-over';
                }
            }
        },
        polvo: {
            init: function () { for (var i = 0; i < scaleN(70); i++) parts.push(tagFront({ x: rand(0, W), y: rand(0, H), r: rand(1.5, 4), vx: rand(-6, 6), vy: rand(-10, -2), ph: rand(0, 6.28), a: rand(0.4, 0.85) })); },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.x += (p.vx + Math.sin(T * 0.5 + p.ph) * 8) * dt; p.y += p.vy * dt;
                    if (p.y < -10) { p.y = H + 10; p.x = rand(0, W); } if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
                    use(p); g.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(T * 1.3 + p.ph)); g.drawImage(glow('#FFF3D6', 6), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4);
                }
                g = bctx; g.globalAlpha = 1;
            }
        },
        bokeh: {
            init: function () { for (var i = 0; i < scaleN(22); i++) parts.push(tagFront({ x: rand(0, W), y: rand(0, H), r: rand(18, 60), vx: rand(-8, 8), vy: rand(-8, 8), ph: rand(0, 6.28), c: pick(['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#F78C6B', '#C77DFF']) })); },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.x += p.vx * dt; p.y += p.vy * dt;
                    if (p.x < -70) p.x = W + 70; if (p.x > W + 70) p.x = -70; if (p.y < -70) p.y = H + 70; if (p.y > H + 70) p.y = -70;
                    use(p); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3 + 0.14 * Math.sin(T * 0.8 + p.ph);
                    g.drawImage(glow(p.c, 60), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
                    g.globalCompositeOperation = 'source-over';
                }
                g = bctx; g.globalAlpha = 1;
            }
        },
        fugaces: {
            init: function () { extra.shoot = null; extra.next = 0.6; },
            step: function (dt) { shooting(dt); if (!extra.shoot && extra.next - T > 2.2) extra.next = T + rand(0.8, 2.2); }
        },
        niebla: {
            init: function () { extra.fog = []; for (var i = 0; i < 7; i++) extra.fog.push({ x: rand(-300, W), y: rand(H * 0.35, H * 0.95), r: rand(220, 380), v: rand(8, 22) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, 6.28) }); },
            step: function (dt) {
                g = bctx;
                extra.fog.forEach(function (f) {
                    f.x += f.v * dt; if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
                    g.globalAlpha = 0.16 + 0.06 * Math.sin(T * 0.4 + f.ph); g.drawImage(glow('#DDE6F0', 200), f.x - f.r, f.y - f.r * 0.45, f.r * 2, f.r * 0.9);
                });
                g.globalAlpha = 1;
            }
        },
        rayos: {
            init: function () { extra.bolt = null; extra.next = rand(1, 2.5); extra.flash = 0; },
            step: function (dt) {
                if (T > extra.next) { extra.bolt = bolt(rand(W * 0.1, W * 0.9), 0, rand(H * 0.4, H * 0.8)); extra.life = 0; extra.flash = 0.35; extra.next = T + rand(2.5, 6); }
                if (extra.bolt) {
                    extra.life += dt;
                    if (extra.life < 0.08 || (extra.life > 0.14 && extra.life < 0.22)) {
                        g = bctx; g.globalCompositeOperation = 'lighter';
                        strokePath(extra.bolt.main, 10, 0.18, '#9DB4FF'); strokePath(extra.bolt.main, 4, 0.5, '#C9D6FF'); strokePath(extra.bolt.main, 1.6, 1, '#FFFFFF');
                        extra.bolt.branches.forEach(function (b) { strokePath(b, 4, 0.25, '#9DB4FF'); strokePath(b, 1, 0.8, '#FFFFFF'); });
                        g.globalCompositeOperation = 'source-over';
                    }
                    if (extra.life > 0.35) extra.bolt = null;
                }
                if (extra.flash > 0) { if (!noBg()) { bctx.globalAlpha = extra.flash * 0.25; bctx.fillStyle = '#E8EEFF'; bctx.fillRect(0, 0, W, H); } extra.flash -= dt * 2; }
                bctx.globalAlpha = 1;
            }
        },
        corazones: {
            init: function () { for (var i = 0; i < scaleN(34); i++) parts.push(newHeart(true)); },
            step: function (dt) {
                for (var i = 0; i < parts.length; i++) {
                    var p = parts[i];
                    p.y -= p.vy * dt; p.x += Math.sin(T * 1.3 + p.ph) * 20 * dt;
                    if (p.y < -50) { parts[i] = newHeart(false); continue; }
                    use(p); draw(heart(p.c), p.x, p.y, p.s, p.s, Math.sin(T + p.ph) * 0.25, p.a);
                }
            }
        }
    };
    function newTwinkle() { return tagFront({ x: rand(0, W), y: rand(0, H), s: rand(10, 26), life: 0, max: rand(0.8, 2.2), c: pick(['#FFFFFF', '#FFE9A8', '#CDE7FF', '#FFD1F0']) }); }
    // ---- 2.9.0: fuego, código, globos, monedas, notas y corazones de 8 bits ----
    function balloon(color) {
        var k = 'bl' + color; if (SPR[k]) return SPR[k];
        var c = mk(64, 110), x = c.getContext('2d');
        x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(32, 70); x.bezierCurveTo(26, 82, 38, 92, 32, 108); x.stroke();
        var gr = x.createRadialGradient(22, 22, 3, 32, 34, 34); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.22, color); gr.addColorStop(1, rgba(color, 0.82));
        x.fillStyle = gr; x.beginPath(); x.ellipse(32, 34, 26, 32, 0, 0, 6.283); x.fill();
        x.fillStyle = color; x.beginPath(); x.moveTo(32, 64); x.lineTo(26, 72); x.lineTo(38, 72); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.ellipse(21, 20, 6, 10, -0.5, 0, 6.283); x.fill();
        return (SPR[k] = c);
    }
    function noteSpr(ch, color) {
        var k = 'nt' + ch + color; if (SPR[k]) return SPR[k];
        var c = mk(72, 72), x = c.getContext('2d');
        x.font = 'bold 54px "Segoe UI Symbol","Noto Sans Symbols2","DejaVu Sans",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.shadowColor = rgba(color, 0.8); x.shadowBlur = 10; x.fillStyle = color; x.fillText(ch, 36, 38);
        return (SPR[k] = c);
    }
    var PXH = ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000'];
    function pixelHeart(color) {
        var k = 'ph' + color; if (SPR[k]) return SPR[k];
        var u = 8, c = mk(7 * u + 4, 7 * u + 4), x = c.getContext('2d');
        for (var r = 0; r < 7; r++) for (var q = 0; q < 7; q++) if (PXH[r][q] === '1') {
            x.fillStyle = '#000'; x.fillRect(q * u, r * u, u + 4, u + 4);
        }
        for (r = 0; r < 7; r++) for (q = 0; q < 7; q++) if (PXH[r][q] === '1') {
            x.fillStyle = color; x.fillRect(q * u + 2, r * u + 2, u, u);
        }
        x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(u + 2, u + 2, u, u);
        return (SPR[k] = c);
    }
    var MX_CH = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789$+<>*';
    function mxCol(i, initial) {
        return tagFront({ x: i * 22 + 11, y: initial ? rand(-H, H) : rand(-H * 0.6, -40), v: rand(140, 320), n: 8 + ((Math.random() * 12) | 0), ch: [], t: 0 });
    }
    function newFlame(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(H * 0.25, H) : H + rand(5, 40), vy: rand(50, 150), ph: rand(0, 6.28), s: rand(8, 34), life: 0, max: rand(1.6, 3.6), c: pick(['#FF7A1A', '#FFB02E', '#FF4D1A', '#FFD98A']) }); }
    function newBalloon(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(0, H * 1.3) : H + 90, vy: rand(28, 62), ph: rand(0, 6.28), s: rand(34, 64), c: pick(PARTY), a: rand(0.85, 1) }); }
    function newCoin(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(-H * 0.2, H) : rand(-90, -30), vy: rand(90, 190), ph: rand(0, 6.28), sp: rand(3, 7), s: rand(20, 40), a: rand(0.85, 1) }); }
    function newNote(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(0, H * 1.2) : H + 40, vy: rand(26, 60), ph: rand(0, 6.28), s: rand(24, 50), ch: pick(['♪', '♫', '♩', '♬']), c: pick(['#FFD166', '#FF7AC8', '#7AD7FF', '#B79CFF', '#8CFFB0']), a: rand(0.7, 1) }); }
    function newPxHeart(initial) { return tagFront({ x: Math.round(rand(0, W) / 8) * 8, y: initial ? rand(0, H * 1.2) : H + 40, vy: rand(30, 70), s: pick([24, 32, 40, 48]), c: pick(['#FF3B5C', '#FF7AC8', '#FF9F1C', '#B79CFF', '#3DE0FF']), a: rand(0.8, 1), ph: rand(0, 6.28) }); }
    OVERLAY.fuego = {
        init: function () { for (var i = 0; i < scaleN(90); i++) parts.push(newFlame(true)); },
        step: function (dt) {
            // resplandor de las llamas abajo
            bctx.globalCompositeOperation = 'lighter';
            for (var b = 0; b < 7; b++) {
                var bx = (b + 0.5) * W / 7 + Math.sin(T * 1.7 + b * 2.1) * 30, br = H * (0.20 + 0.05 * Math.sin(T * 3.1 + b * 1.3));
                bctx.globalAlpha = 0.42; bctx.drawImage(glow(b % 2 ? '#FF5A1A' : '#FF9A2E', 200), bx - br * 1.3, H - br, br * 2.6, br * 2);
            }
            bctx.globalCompositeOperation = 'source-over'; bctx.globalAlpha = 1;
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.life += dt; p.y -= p.vy * dt; p.x += Math.sin(T * 2.2 + p.ph) * 26 * dt;
                if (p.life > p.max || p.y < -30) { parts[i] = newFlame(false); continue; }
                var k = 1 - p.life / p.max;
                use(p); g.globalCompositeOperation = 'lighter';
                draw(glow(p.c, 200), p.x, p.y, p.s * (0.5 + k), p.s * (0.5 + k), 0, k * 0.9);
                g.globalCompositeOperation = 'source-over';
            }
        }
    };
    OVERLAY.matrix = {
        init: function () { var n = Math.ceil(W / 22); for (var i = 0; i < n; i++) parts.push(mxCol(i, true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.y += p.v * dt; p.t += dt;
                if (p.y - p.n * 20 > H) { parts[i] = mxCol(i, false); continue; }
                if (p.t > 0.09 || !p.ch.length) { p.t = 0; p.ch.unshift(MX_CH[(Math.random() * MX_CH.length) | 0]); if (p.ch.length > p.n) p.ch.pop(); }
                use(p); g.font = 'bold 17px "MS Gothic","Noto Sans Mono CJK JP",Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
                var hy = Math.floor(p.y / 20) * 20;
                for (var j = 0; j < p.ch.length; j++) {
                    var yy = hy - j * 20; if (yy < -20 || yy > H + 20) continue;
                    g.globalAlpha = j === 0 ? 1 : Math.max(0, 0.85 * (1 - j / p.n));
                    g.fillStyle = j === 0 ? '#E8FFE8' : '#00FF41';
                    g.fillText(p.ch[j], p.x, yy);
                }
                g.globalAlpha = 1;
            }
        }
    };
    OVERLAY.globos = {
        init: function () { for (var i = 0; i < scaleN(22); i++) parts.push(newBalloon(true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.y -= p.vy * dt; p.x += Math.sin(T * 0.9 + p.ph) * 18 * dt;
                if (p.y < -110) { parts[i] = newBalloon(false); continue; }
                use(p); draw(balloon(p.c), p.x, p.y, p.s, p.s * 110 / 64, Math.sin(T * 1.1 + p.ph) * 0.12, p.a);
            }
        }
    };
    OVERLAY.monedas = {
        init: function () { for (var i = 0; i < scaleN(46); i++) parts.push(newCoin(true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.y += p.vy * dt; p.x += Math.sin(T + p.ph) * 10 * dt;
                if (p.y > H + 40) { parts[i] = newCoin(false); continue; }
                var sx = Math.cos(T * p.sp + p.ph);
                use(p); draw(coin(), p.x, p.y, p.s, p.s, 0, p.a, Math.abs(sx) < 0.12 ? 0.12 : sx);
            }
        }
    };
    OVERLAY.notas = {
        init: function () { for (var i = 0; i < scaleN(30); i++) parts.push(newNote(true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.y -= p.vy * dt; p.x += Math.sin(T * 1.6 + p.ph) * 34 * dt;
                if (p.y < -50) { parts[i] = newNote(false); continue; }
                use(p); draw(noteSpr(p.ch, p.c), p.x, p.y, p.s, p.s, Math.sin(T * 1.4 + p.ph) * 0.3, p.a);
            }
        }
    };
    OVERLAY.pixelhearts = {
        init: function () { for (var i = 0; i < scaleN(30); i++) parts.push(newPxHeart(true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i]; p.y -= p.vy * dt;
                if (p.y < -50) { parts[i] = newPxHeart(false); continue; }
                // movimiento a saltos y sin suavizado, como en un juego de 8 bits
                use(p); var sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
                var beat = (Math.floor(T * 2 + p.ph) % 2) ? 1 : 0.86;
                draw(pixelHeart(p.c), p.x, Math.round(p.y / 4) * 4, p.s * beat, p.s * beat, 0, p.a);
                g.imageSmoothingEnabled = sm;
            }
        }
    };
    Object.keys(OVERLAY).forEach(function (k) { KINDS[k] = OVERLAY[k]; });
    var USA = ['#E63946', '#FFFFFF', '#3C6EF0', '#FFFFFF', '#B22234'];
    var PARTY = ['#FF4D6D', '#FFD60A', '#3A86FF', '#06D6A0', '#FF8FAB', '#8338EC', '#FB5607'];

    function newBat(initial) {
        var left = Math.random() < 0.5;
        return tagFront({ x: initial ? rand(0, W) : (left ? -50 : W + 50), y: rand(H * 0.08, H * 0.6), vx: (left ? 1 : -1) * rand(50, 120), ph: rand(0, 6.28), s: rand(18, 34), fl: rand(9, 14) });
    }
    function drawBat(b) {
        var w = Math.sin(T * b.fl + b.ph), s = b.s;
        g.save(); g.translate(b.x, b.y + Math.sin(T * 2 + b.ph) * 6); if (b.vx < 0) g.scale(-1, 1);
        g.globalAlpha = 0.9; g.fillStyle = '#120A1C';
        g.beginPath(); g.ellipse(0, 0, s * 0.16, s * 0.24, 0, 0, 6.283); g.fill();
        g.beginPath(); g.moveTo(-s * 0.08, -s * 0.2); g.lineTo(-s * 0.12, -s * 0.36); g.lineTo(-s * 0.02, -s * 0.24); g.lineTo(s * 0.02, -s * 0.24); g.lineTo(s * 0.12, -s * 0.36); g.lineTo(s * 0.08, -s * 0.2); g.fill();
        [-1, 1].forEach(function (d) {
            g.beginPath(); g.moveTo(d * s * 0.1, -s * 0.05);
            g.quadraticCurveTo(d * s * 0.5, -s * 0.55 * w, d * s * 0.95, -s * 0.2 * w);
            g.quadraticCurveTo(d * s * 0.75, s * 0.05, d * s * 0.62, s * 0.12 - s * 0.1 * w);
            g.quadraticCurveTo(d * s * 0.45, s * 0.02, d * s * 0.32, s * 0.15 - s * 0.05 * w);
            g.quadraticCurveTo(d * s * 0.2, s * 0.05, d * s * 0.1, s * 0.12); g.closePath(); g.fill();
        });
        g.fillStyle = '#FF9F1C'; g.beginPath(); g.arc(-s * 0.05, -s * 0.12, 1.2, 0, 6.283); g.arc(s * 0.05, -s * 0.12, 1.2, 0, 6.283); g.fill();
        g.restore();
    }
    function newEmber(initial) { return { x: rand(0, W), y: initial ? rand(H * 0.3, H) : H + 10, vy: rand(15, 40), ph: rand(0, 6.28) }; }
    function drawSun(x, y, R) {
        g = bctx; g.save(); g.translate(x, y);
        g.globalAlpha = 0.35; g.drawImage(glow('#F6B40E', R * 3), -R * 3, -R * 3);
        g.rotate(T * 0.06); g.globalAlpha = 0.55; g.fillStyle = '#F6B40E'; g.strokeStyle = '#F6B40E'; g.lineWidth = 2.5;
        for (var i = 0; i < 32; i++) {
            var a = i * Math.PI / 16;
            g.save(); g.rotate(a);
            if (i % 2) { g.beginPath(); g.moveTo(R * 1.05, 0); for (var k = 0; k <= 8; k++) g.lineTo(R * 1.05 + k * R * 0.14, Math.sin(k * 1.4 + T * 2) * 3); g.stroke(); }
            else { g.beginPath(); g.moveTo(R * 1.02, -4); g.lineTo(R * 2.3, 0); g.lineTo(R * 1.02, 4); g.fill(); }
            g.restore();
        }
        g.globalAlpha = 0.75; var gr = g.createRadialGradient(-R * 0.3, -R * 0.3, 2, 0, 0, R); gr.addColorStop(0, '#FFE58A'); gr.addColorStop(1, '#E09A00');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 6.283); g.fill();
        g.restore(); g.globalAlpha = 1;
    }
    function shooting(dt) {
        if (!extra.shoot && T > extra.next) { var a0 = rand(0.35, 0.7), d = Math.random() < 0.5 ? -1 : 1, v = rand(500, 850); extra.shoot = { x: rand(W * 0.1, W * 0.9), y: rand(0, H * 0.4), vx: Math.cos(a0) * v * d, vy: Math.sin(a0) * v, life: 0, max: rand(0.6, 1.1) }; }
        var s = extra.shoot; if (!s) return;
        s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        var fade = Math.max(0, 1 - s.life / s.max), tl = 0.14;
        var gr = bctx.createLinearGradient(s.x, s.y, s.x - s.vx * tl, s.y - s.vy * tl);
        gr.addColorStop(0, 'rgba(255,255,255,' + fade + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        bctx.globalAlpha = 1; bctx.strokeStyle = gr; bctx.lineWidth = 2.2; bctx.beginPath(); bctx.moveTo(s.x, s.y); bctx.lineTo(s.x - s.vx * tl, s.y - s.vy * tl); bctx.stroke();
        bctx.globalAlpha = fade; bctx.drawImage(glow('#FFFFFF', 6), s.x - 6, s.y - 6);
        if (s.life > s.max) { extra.shoot = null; extra.next = T + rand(2.5, 6); }
        bctx.globalAlpha = 1;
    }
    function newHeart(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(0, H * 1.3) : H + 40, vy: rand(25, 55), ph: rand(0, 6.28), s: rand(16, 40), c: pick(['#FF4D8D', '#FF2E63', '#FF7EB3', '#E0115F']), a: rand(0.65, 0.95) }); }
    function newSpring(initial) {
        var r = Math.random();
        var img = r < 0.7 ? petal(pick(['#FFB7CE', '#FF9EC0', '#FFC9DA'])) : r < 0.85 ? flower(pick(['#FFB7CE', '#FFFFFF', '#FFD1E0'])) : leaf('#7CC46A');
        return newTumble(img, r < 0.7 ? [12, 22] : r < 0.85 ? [22, 34] : [16, 24], initial, [28, 60]);
    }
    function newLeaf(initial) { return newTumble(leaf(pick(['#E8590C', '#D9480F', '#F59F00', '#C92A2A', '#A0522D', '#FAB005'])), [20, 38], initial, [35, 75]); }
    function newMoney(initial) {
        if (Math.random() < 0.45) return tagFront({ coin: true, x: rand(0, W), y: initial ? rand(-H, H) : -30, vy: rand(70, 130), ph: rand(0, 6.28), fs: rand(4, 8), s: rand(18, 30), a: 1 });
        return newTumble(bill(), [44, 70], initial, [40, 80]);
    }
    function newBubble(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(0, H * 1.2) : H + 50, vy: rand(25, 60), ph: rand(0, 6.28), s: rand(18, 64), popY: rand(-40, H * 0.35) }); }
    function newStreamer(initial) { return tagFront({ x: rand(0, W), y: initial ? rand(-H, H) : -120, vy: rand(50, 90), ph: rand(0, 6.28), rot: rand(-0.4, 0.4), vr: rand(-0.6, 0.6), c: pick(PARTY) }); }

    // Fondo propio de cada efecto (cuando se elige "Con fondo"); los que ya traen cielo no lo necesitan
    // ---- Fondos de cada efecto (cuando "Mostrar el fondo del efecto" está prendido) ----
    // Se pintan una vez en una imagen aparte (al cambiar de tamaño) y después solo se copian: no gastan PC.
    var bgCache = null, bgCacheKey = '';
    function vgrad(x, cols) { var g2 = x.createLinearGradient(0, 0, 0, H); cols.forEach(function (c, i) { g2.addColorStop(i / (cols.length - 1), c); }); x.fillStyle = g2; x.fillRect(0, 0, W, H); }
    function blob(x, cx, cy, r, col, a) { x.globalAlpha = a; x.drawImage(glow(col, 200), cx - r, cy - r, r * 2, r * 2); x.globalAlpha = 1; }
    function hills(x, base, amp, col, seed, freq) {
        x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
        for (var i = 0; i <= W; i += 8) x.lineTo(i, base - amp * (0.55 + 0.45 * Math.sin(i * (freq || 0.004) + seed) * Math.sin(i * 0.0017 + seed * 2)));
        x.lineTo(W, H); x.closePath(); x.fill();
    }
    function mountains(x, base, col, seed) {
        x.fillStyle = col; x.beginPath(); x.moveTo(0, H); var y = base;
        for (var i = 0; i <= W; i += 40) { var h = base - (60 + 90 * Math.abs(Math.sin(i * 0.007 + seed)) * (0.6 + 0.4 * Math.sin(i * 0.013 + seed * 3))); x.lineTo(i, h); }
        x.lineTo(W, H); x.closePath(); x.fill();
    }
    function skyline(x, base, col, seed) {
        x.fillStyle = col; var i = 0, r = seed;
        while (i < W) { r = (r * 9301 + 49297) % 233280; var w = 30 + (r / 233280) * 60; r = (r * 9301 + 49297) % 233280; var h = 40 + (r / 233280) * (H * 0.22); x.fillRect(i, base - h, w - 4, h + H); i += w; }
        // ventanitas
        x.fillStyle = 'rgba(255,214,120,0.35)'; r = seed * 3;
        for (var k = 0; k < W / 6; k++) { r = (r * 9301 + 49297) % 233280; var wx = (r / 233280) * W; r = (r * 9301 + 49297) % 233280; var wy = base - (r / 233280) * H * 0.2; x.fillRect(wx, wy, 3, 4); }
    }
    function rays(x, ox, oy, col, n, a) {
        x.save(); x.globalCompositeOperation = 'lighter';
        for (var i = 0; i < n; i++) {
            var ang = Math.PI / 2 + (i - n / 2) * 0.16 + 0.3, len = Math.max(W, H) * 1.3, wd = 0.05;
            var g2 = x.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
            g2.addColorStop(0, col.replace('A', a)); g2.addColorStop(1, col.replace('A', 0));
            x.fillStyle = g2; x.beginPath(); x.moveTo(ox, oy);
            x.lineTo(ox + Math.cos(ang - wd) * len, oy + Math.sin(ang - wd) * len); x.lineTo(ox + Math.cos(ang + wd) * len, oy + Math.sin(ang + wd) * len); x.closePath(); x.fill();
        }
        x.restore();
    }
    function clouds(x, y, col, a, n) { for (var i = 0; i < n; i++) blob(x, (i + 0.5) * W / n + Math.sin(i * 7) * 60, y + Math.sin(i * 3) * 30, 160 + 60 * Math.abs(Math.sin(i * 5)), col, a); }
    function staticStars(x, n, maxY) { for (var i = 0; i < n; i++) { var sx = (Math.sin(i * 12.9898) * 43758.5453) % 1, sy = (Math.sin(i * 78.233) * 12345.678) % 1; x.globalAlpha = 0.3 + 0.5 * Math.abs((Math.sin(i * 3.1) * 1000) % 1); x.fillStyle = '#fff'; x.fillRect(Math.abs(sx) * W, Math.abs(sy) * H * (maxY || 0.7), 1.5, 1.5); } x.globalAlpha = 1; }
    function vignette(x, a) { var g2 = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,' + a + ')'); x.fillStyle = g2; x.fillRect(0, 0, W, H); }
    var BGS = {
        nieve: function (x) { vgrad(x, ['#0A1630', '#1B3352', '#3B5878']); blob(x, W * 0.78, H * 0.2, 140, '#DDEBFF', 0.35); staticStars(x, 90, 0.5); mountains(x, H * 0.82, '#22385A', 1); hills(x, H * 0.92, 40, '#E8F1FB', 2); vignette(x, 0.35); },
        navidad: function (x) { vgrad(x, ['#06170E', '#0E2A1A', '#2A0E12']); for (var i = 0; i < 16; i++) blob(x, (i * 137) % W, H * (0.3 + ((i * 53) % 60) / 100), 50 + (i % 4) * 20, ['#FF4D4D', '#FFD54A', '#4DFF88', '#FF8A3D'][i % 4], 0.18); vignette(x, 0.5); },
        halloween: function (x) { vgrad(x, ['#0E0618', '#2A0F3D', '#5A2208']); blob(x, W * 0.5, H, W * 0.6, '#FF7A1A', 0.35); hills(x, H * 0.86, 50, '#0B0610', 4, 0.006); vignette(x, 0.5); },
        argentina: function (x) { vgrad(x, ['#3D7FC2', '#74ACDF', '#D7ECFA']); clouds(x, H * 0.25, '#FFFFFF', 0.35, 5); blob(x, W * 0.15, H * 0.15, 120, '#FFE58A', 0.35); },
        julio4: function (x) { vgrad(x, ['#040822', '#0C1A4A', '#2A1032']); staticStars(x, 120, 0.6); skyline(x, H, '#05060E', 7); },
        anionuevo: function (x) { vgrad(x, ['#05031A', '#160C38', '#3A1A0A']); staticStars(x, 100, 0.6); blob(x, W * 0.5, H, W * 0.5, '#FFB84D', 0.25); skyline(x, H, '#07050F', 3); },
        sanvalentin: function (x) { vgrad(x, ['#2A0518', '#55102F', '#2A0518']); for (var i = 0; i < 12; i++) blob(x, (i * 211) % W, (i * 97) % H, 60 + (i % 3) * 30, '#FF6FA5', 0.16); vignette(x, 0.45); },
        primavera: function (x) { vgrad(x, ['#7DC6F7', '#BCE5FF', '#EAF9E2']); clouds(x, H * 0.22, '#FFFFFF', 0.45, 4); hills(x, H * 0.85, 60, '#9FD98A', 5); hills(x, H * 0.93, 40, '#7CC46A', 9); },
        plata: function (x) { vgrad(x, ['#04170B', '#0B3A1C', '#05200F']); x.globalAlpha = 0.06; x.strokeStyle = '#9BE7A8'; for (var i = -H; i < W; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H, H); x.stroke(); } x.globalAlpha = 1; blob(x, W * 0.5, H * 0.45, Math.min(W, H) * 0.5, '#F6C744', 0.12); vignette(x, 0.6); },
        lluvia: function (x) { vgrad(x, ['#18212C', '#2A3646', '#3C4858']); clouds(x, H * 0.12, '#5A6878', 0.45, 6); vignette(x, 0.4); },
        lluviafuerte: function (x) { vgrad(x, ['#0E141C', '#1C2632', '#2A3644']); clouds(x, H * 0.1, '#3A4656', 0.55, 7); vignette(x, 0.5); },
        otono: function (x) { vgrad(x, ['#3A1A08', '#8A3F12', '#F0A04B']); blob(x, W * 0.5, H * 0.75, 260, '#FFD08A', 0.35); hills(x, H * 0.88, 50, '#3A1A08', 3); vignette(x, 0.35); },
        burbujas: function (x) { vgrad(x, ['#0A6E9C', '#06486E', '#02223A']); rays(x, W * 0.5, -40, 'rgba(180,230,255,A)', 9, 0.18); blob(x, W * 0.5, 0, W * 0.5, '#9FE4FF', 0.2); },
        brillos: function (x) { vgrad(x, ['#0C0620', '#1E0F45', '#08061A']); blob(x, W * 0.3, H * 0.35, 260, '#7A3CFF', 0.25); blob(x, W * 0.75, H * 0.65, 240, '#FF4DD8', 0.18); vignette(x, 0.5); },
        polvo: function (x) { vgrad(x, ['#140E08', '#2A1C10', '#0E0A06']); rays(x, W * 0.15, -60, 'rgba(255,214,150,A)', 6, 0.16); vignette(x, 0.55); },
        bokeh: function (x) { vgrad(x, ['#07070F', '#121226', '#07070F']); vignette(x, 0.4); },
        fugaces: function (x) { vgrad(x, ['#040716', '#0B1233', '#1A1440']); staticStars(x, 160, 1); blob(x, W * 0.3, H * 0.3, 220, '#3A2A7A', 0.3); },
        niebla: function (x) { vgrad(x, ['#1A222C', '#2C3540', '#3E4854']); mountains(x, H * 0.8, '#232C36', 2); for (var t = 0; t < 30; t++) { var tx = (t * 97) % W, th = 60 + (t % 5) * 18; x.fillStyle = '#1A222A'; x.beginPath(); x.moveTo(tx, H * 0.86 - th); x.lineTo(tx - 16, H * 0.86); x.lineTo(tx + 16, H * 0.86); x.fill(); } hills(x, H * 0.9, 20, '#151B22', 6); },
        rayos: function (x) { vgrad(x, ['#070A12', '#121A2A', '#0A0E18']); clouds(x, H * 0.08, '#2A3550', 0.6, 7); vignette(x, 0.5); },
        corazones: function (x) { BGS.sanvalentin(x); },
        papelitos: function (x) { vgrad(x, ['#14062A', '#2A0F45', '#0A1430']); rays(x, W * 0.2, -40, 'rgba(255,90,200,A)', 3, 0.15); rays(x, W * 0.8, -40, 'rgba(80,180,255,A)', 3, 0.15); vignette(x, 0.5); },
        fiesta: function (x) { BGS.papelitos(x); },
        fuego: function (x) { vgrad(x, ['#0A0303', '#2A0A04', '#6A1C06']); blob(x, W * 0.5, H, W * 0.7, '#FF6A1A', 0.4); vignette(x, 0.55); },
        matrix: function (x) { vgrad(x, ['#000000', '#020A04', '#000000']); blob(x, W * 0.5, H * 0.5, Math.min(W, H) * 0.6, '#00FF41', 0.06); vignette(x, 0.6); },
        globos: function (x) { vgrad(x, ['#4FA8E8', '#9FD4F7', '#E8F6FF']); clouds(x, H * 0.3, '#FFFFFF', 0.5, 5); clouds(x, H * 0.7, '#FFFFFF', 0.3, 4); },
        monedas: function (x) { vgrad(x, ['#120C02', '#3A2806', '#120C02']); blob(x, W * 0.5, H * 0.35, Math.min(W, H) * 0.6, '#F6C744', 0.22); rays(x, W * 0.5, -60, 'rgba(255,220,120,A)', 7, 0.12); vignette(x, 0.55); },
        notas: function (x) { vgrad(x, ['#10062A', '#2A0F55', '#0A0620']); rays(x, W * 0.25, -40, 'rgba(255,120,220,A)', 3, 0.16); rays(x, W * 0.75, -40, 'rgba(120,200,255,A)', 3, 0.16); blob(x, W * 0.5, H, W * 0.5, '#B79CFF', 0.2); vignette(x, 0.5); },
        pixelhearts: function (x) { vgrad(x, ['#0A0A2A', '#16124A', '#0A0A2A']); x.globalAlpha = 0.09; x.strokeStyle = '#7AD7FF'; x.lineWidth = 1; for (var i = 0; i < W; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (var j = 0; j < H; j += 32) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); } x.globalAlpha = 1; vignette(x, 0.5); },
        propio: function (x) { vgrad(x, ['#0E0B22', '#1C1640', '#0A0818']); blob(x, W * 0.5, H * 0.4, Math.min(W, H) * 0.55, '#7A5CFF', 0.18); vignette(x, 0.5); }
    };
    function paintKindBg() {
        if (BGMODE !== 'on' || !BGS[kind]) return;
        var key = kind + W + 'x' + H;
        if (key !== bgCacheKey || !bgCache) {
            bgCache = mk(W, H); var x = bgCache.getContext('2d');
            try { BGS[kind](x); } catch (e) {}
            bgCacheKey = key;
        }
        bctx.globalAlpha = 1; bctx.drawImage(bgCache, 0, 0, W, H);
    }

    // ---- Tu efecto: de 1 a 3 emojis que caen, suben, flotan o cruzan ----
    var CUSTOM = { emojis: ['⭐'], motion: 'fall', amount: 'normal', size: 'm' };
    function emojiSpr(e) {
        var k = 'e' + e; if (SPR[k]) return SPR[k];
        var c = mk(72, 72), x = c.getContext('2d');
        x.font = '56px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(e, 36, 40);
        return (SPR[k] = c);
    }
    function newCustom(initial) {
        var sz = { s: [14, 24], m: [24, 40], l: [40, 64], random: [12, 66] }[CUSTOM.size] || [24, 40];
        // "Al azar": cada emoji elige su propio movimiento
        var m = CUSTOM.motion === 'random' ? pick(['fall', 'rise', 'float', 'side']) : CUSTOM.motion, p = { m: m, img: emojiSpr(pick(CUSTOM.emojis)), s: rand(sz[0], sz[1]), ph: rand(0, 6.28), rot: rand(-0.4, 0.4), vr: rand(-0.8, 0.8), a: rand(0.85, 1) };
        if (m === 'rise') { p.x = rand(0, W); p.y = initial ? rand(0, H * 1.2) : H + 40; p.vy = -rand(30, 70); p.vx = 0; }
        else if (m === 'float') { p.x = rand(0, W); p.y = rand(0, H); p.vx = rand(-18, 18); p.vy = rand(-14, 14); p.vr *= 0.3; }
        else if (m === 'side') { var l = Math.random() < 0.5; p.x = initial ? rand(0, W) : (l ? -40 : W + 40); p.y = rand(0, H); p.vx = (l ? 1 : -1) * rand(60, 130); p.vy = 0; }
        else { p.x = rand(0, W); p.y = initial ? rand(-H * 0.2, H) : rand(-80, -30); p.vy = rand(40, 90); p.vx = 0; }
        return tagFront(p);
    }
    KINDS.propio = {
        init: function () { var n = { few: 14, normal: 28, many: 50 }[CUSTOM.amount] || 28; for (var i = 0; i < scaleN(n); i++) parts.push(newCustom(true)); },
        step: function (dt) {
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i], m = p.m;
                p.x += (p.vx + (m === 'fall' || m === 'rise' ? Math.sin(T * 1.2 + p.ph) * 25 : 0)) * dt;
                p.y += (p.vy + (m === 'side' ? Math.sin(T * 2 + p.ph) * 30 : 0)) * dt;
                p.rot += p.vr * dt;
                if (m === 'float') { if (p.x < -40) p.x = W + 40; if (p.x > W + 40) p.x = -40; if (p.y < -40) p.y = H + 40; if (p.y > H + 40) p.y = -40; }
                else if (p.y > H + 60 || p.y < -80 || p.x < -80 || p.x > W + 80) { parts[i] = newCustom(false); continue; }
                use(p); draw(p.img, p.x, p.y, p.s, p.s, p.rot, m === 'float' ? p.a * (0.7 + 0.3 * Math.sin(T + p.ph)) : p.a);
            }
        }
    };

    // ---------------- Motor ----------------
    function size(c, x) {
        c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
        c.style.width = W + 'px'; c.style.height = H + 'px';
        x.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth; H = window.innerHeight;
        size(back, bctx); if (front) size(front, fctx);
        build();
    }
    function build() {
        parts = []; extra = { rockets: [], sparks: [], splash: [], pops: [] };
        if (KINDS[kind]) KINDS[kind].init();
    }
    function ensureFront() {
        if (frontFrac > 0 && kind) {
            if (!front) {
                front = document.createElement('canvas'); front.id = 'anim-fx-front'; front.setAttribute('aria-hidden', 'true');
                front.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
                fctx = front.getContext('2d');
            }
            if (!front.parentNode) { document.body.appendChild(front); size(front, fctx); }
        } else if (front && front.parentNode) front.parentNode.removeChild(front);
    }
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!last) last = now;
        var dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        if (acc < 1 / 31) return; // ~30 cuadros por segundo alcanzan y cuidan la PC
        dt = Math.min(0.1, acc); acc = 0; T += dt;
        var k = KINDS[kind]; if (!k) return;
        bctx.setTransform(DPR, 0, 0, DPR, 0, 0); bctx.clearRect(0, 0, W, H); bctx.globalAlpha = 1;
        if (fctx && front.parentNode) { fctx.setTransform(DPR, 0, 0, DPR, 0, 0); fctx.clearRect(0, 0, W, H); }
        g = bctx;
        paintKindBg();
        try { k.step(dt); } catch (e) {}
        bctx.globalAlpha = 1; if (fctx) fctx.globalAlpha = 1;
    }
    function start(k) {
        if (!KINDS[k]) { stop(); return; }
        if (kind === k && raf) return;
        kind = k;
        if (!back) {
            back = document.createElement('canvas'); back.id = 'anim-fx'; back.setAttribute('aria-hidden', 'true');
            back.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
            bctx = back.getContext('2d');
            window.addEventListener('resize', function () { if (kind) resize(); });
        }
        if (!back.parentNode) document.body.prepend(back);
        ensureFront();
        resize();
        last = 0; T = 0;
        if (!raf) raf = requestAnimationFrame(frame);
    }
    function stop() {
        kind = '';
        if (raf) cancelAnimationFrame(raf);
        raf = null; parts = []; extra = {};
        if (back && back.parentNode) back.parentNode.removeChild(back);
        if (front && front.parentNode) front.parentNode.removeChild(front);
    }
    // Qué parte pasa por delante de las tarjetas (0 = nada, 1 = todo)
    function setFront(f) {
        f = Math.min(1, Math.max(0, Number(f) || 0));
        if (f === frontFrac) return;
        frontFrac = f;
        ensureFront();
        if (kind) build();
    }
    // Alto de la barra de arriba (en OBS): la guirnalda se cuelga debajo
    function setTop(px) { TOP = Math.max(0, Math.min(400, Number(px) || 0)); }
    function setBgMode(m) { BGMODE = m === 'on' || m === 'off' ? m : 'auto'; }
    function setCustom(c) {
        c = c || {};
        var em = (Array.isArray(c.emojis) ? c.emojis : []).filter(function (e) { return typeof e === 'string' && e.length <= 8; }).slice(0, 3);
        var next = { emojis: em.length ? em : ['⭐'], motion: ['fall', 'rise', 'float', 'side', 'random'].indexOf(c.motion) >= 0 ? c.motion : 'fall',
            amount: ['few', 'normal', 'many'].indexOf(c.amount) >= 0 ? c.amount : 'normal', size: ['s', 'm', 'l', 'random'].indexOf(c.size) >= 0 ? c.size : 'm' };
        var changed = JSON.stringify(next) !== JSON.stringify(CUSTOM);
        CUSTOM = next;
        if (changed && kind === 'propio') build();
    }
    window.SDAnimFX = { start: start, stop: stop, setFront: setFront, setTop: setTop, setBgMode: setBgMode, setCustom: setCustom, kinds: Object.keys(KINDS) };
})();
