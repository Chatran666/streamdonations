/* ==========================================================================
   Tema "OVNI": fondo negro con estrellas que titilan lento, cometas al azar
   y un ovni que pasa de vez en cuando.
   Lo usan el panel (index.html) y la ventana de OBS (obs.html).
   ========================================================================== */
(function () {
    var canvas = null, ctx = null, raf = null, running = false;
    var stars = [], comets = [], ufo = null, nextUfo = 0;
    var W = 0, H = 0, DPR = 1, last = 0, nextComet = 0;

    function rand(a, b) { return a + Math.random() * (b - a); }

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * DPR; canvas.height = H * DPR;
        canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        // Estrellas: cantidad según el tamaño de la pantalla
        var n = Math.round((W * H) / 5500);
        stars = [];
        for (var i = 0; i < n; i++) {
            stars.push({
                x: Math.random() * W, y: Math.random() * H,
                r: Math.random() < 0.85 ? rand(0.4, 1.1) : rand(1.2, 1.8),
                base: rand(0.15, 0.7),
                speed: rand(0.15, 0.6),      // titilan lento
                phase: rand(0, Math.PI * 2),
                green: Math.random() < 0.35  // algunas verdosas
            });
        }
    }

    function spawnComet() {
        var fromLeft = Math.random() < 0.5;
        var angle = rand(0.25, 0.6); // inclinación hacia abajo
        var speed = rand(450, 750);
        comets.push({
            x: fromLeft ? rand(-100, W * 0.5) : rand(W * 0.5, W + 100),
            y: rand(-60, H * 0.35),
            vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0, max: rand(1.4, 2.2), tail: rand(120, 220)
        });
    }

    // --- OVNI: cruza lento, se bambolea, a veces se frena, tira el rayo y sale disparado ---
    function spawnUfo() {
        var fromLeft = Math.random() < 0.5;
        var y = rand(H * 0.12, H * 0.6);
        ufo = {
            x: fromLeft ? -80 : W + 80, y: y, baseY: y,
            dir: fromLeft ? 1 : -1,
            v: rand(45, 80),
            size: rand(0.7, 1.15),
            t: 0,
            stopAt: Math.random() < 0.6 ? rand(W * 0.25, W * 0.75) : null, // se frena en algún punto
            phase: 'cruise', hold: 0, beam: 0
        };
    }

    function drawUfo(u, sec) {
        var sz = u.size, x = u.x, y = u.y + Math.sin(u.t * 1.6) * 6;
        var tilt = Math.sin(u.t * 1.1) * 0.08 + (u.phase === 'zoom' ? u.dir * 0.18 : 0);
        ctx.save();
        ctx.translate(x, y); ctx.rotate(tilt); ctx.scale(sz, sz);
        ctx.globalAlpha = 0.85;

        // Rayo de luz hacia abajo
        if (u.beam > 0) {
            var bh = 220 * u.beam;
            var bg = ctx.createLinearGradient(0, 6, 0, bh);
            bg.addColorStop(0, 'rgba(120,255,140,' + (0.22 * u.beam) + ')');
            bg.addColorStop(1, 'rgba(0,255,65,0)');
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(12, 6); ctx.lineTo(55, bh); ctx.lineTo(-55, bh); ctx.closePath(); ctx.fill();
        }
        // Halo
        var halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 60);
        halo.addColorStop(0, 'rgba(0,255,65,0.18)'); halo.addColorStop(1, 'rgba(0,255,65,0)');
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
        // Cúpula
        var dome = ctx.createLinearGradient(0, -22, 0, -4);
        dome.addColorStop(0, 'rgba(200,255,210,0.75)'); dome.addColorStop(1, 'rgba(0,160,60,0.35)');
        ctx.fillStyle = dome;
        ctx.beginPath(); ctx.ellipse(0, -5, 14, 15, 0, Math.PI, 0); ctx.fill();
        // Plato
        var body = ctx.createLinearGradient(0, -8, 0, 10);
        body.addColorStop(0, '#5f7466'); body.addColorStop(0.5, '#2a3a30'); body.addColorStop(1, '#0d1510');
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.ellipse(0, 0, 42, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,65,0.55)'; ctx.lineWidth = 1; ctx.stroke();
        // Base
        ctx.fillStyle = '#16231b';
        ctx.beginPath(); ctx.ellipse(0, 6, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
        // Lucecitas que se encienden en ronda
        for (var i = 0; i < 7; i++) {
            var lx = -33 + i * 11;
            var on = (Math.floor(sec * 6) % 7) === i;
            ctx.fillStyle = on ? 'rgba(220,255,220,1)' : 'rgba(0,255,65,0.45)';
            ctx.beginPath(); ctx.arc(lx, 2, on ? 2.4 : 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    function updateUfo(dt, sec) {
        if (!ufo) {
            if (sec > nextUfo) spawnUfo();
            return;
        }
        var u = ufo; u.t += dt;
        if (u.phase === 'cruise') {
            u.x += u.dir * u.v * dt;
            if (u.stopAt !== null && ((u.dir > 0 && u.x >= u.stopAt) || (u.dir < 0 && u.x <= u.stopAt))) {
                u.phase = 'hover'; u.hold = rand(3, 6);
            }
        } else if (u.phase === 'hover') {
            u.hold -= dt;
            u.beam = Math.min(1, u.beam + dt * 0.8);
            if (u.hold <= 0) u.phase = 'leave';
        } else if (u.phase === 'leave') {
            u.beam = Math.max(0, u.beam - dt * 1.5);
            if (u.beam <= 0) { u.phase = 'zoom'; }
        } else if (u.phase === 'zoom') {
            u.v = Math.min(1400, u.v * (1 + dt * 4) + 20);
            u.x += u.dir * u.v * dt;
            u.y -= u.v * 0.25 * dt;
        }
        drawUfo(u, sec);
        if (u.x < -150 || u.x > W + 150 || u.y < -150) {
            ufo = null;
            nextUfo = sec + rand(35, 75); // el próximo, en un rato
        }
    }

    function frame(t) {
        if (!running) return;
        raf = requestAnimationFrame(frame);
        var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
        // ~30 cuadros por segundo alcanzan y cuidan la compu
        if (t - last < 30) return;
        last = t;
        var sec = t / 1000;

        ctx.clearRect(0, 0, W, H);

        // Estrellas que titilan
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            var tw = s.base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(sec * s.speed * 2 + s.phase)));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.green ? 'rgba(140,255,160,' + tw + ')' : 'rgba(235,255,240,' + tw + ')';
            ctx.fill();
            if (s.r > 1.2 && tw > 0.5) {
                ctx.fillStyle = 'rgba(0,255,65,' + (tw * 0.12) + ')';
                ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2); ctx.fill();
            }
        }

        updateUfo(dt, sec);

        // Cometas al azar (uno cada 6 a 18 segundos)
        if (sec > nextComet) { spawnComet(); nextComet = sec + rand(6, 18); }
        for (var j = comets.length - 1; j >= 0; j--) {
            var c = comets[j];
            c.life += dt; c.x += c.vx * dt; c.y += c.vy * dt;
            var fade = Math.min(1, c.life / 0.25) * Math.max(0, 1 - c.life / c.max);
            var sp = Math.hypot(c.vx, c.vy);
            var tx = c.x - (c.vx / sp) * c.tail, ty = c.y - (c.vy / sp) * c.tail;
            var g = ctx.createLinearGradient(c.x, c.y, tx, ty);
            g.addColorStop(0, 'rgba(220,255,225,' + (0.95 * fade) + ')');
            g.addColorStop(0.25, 'rgba(0,255,65,' + (0.45 * fade) + ')');
            g.addColorStop(1, 'rgba(0,255,65,0)');
            ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,' + fade + ')';
            ctx.beginPath(); ctx.arc(c.x, c.y, 1.8, 0, Math.PI * 2); ctx.fill();
            if (c.life > c.max) comets.splice(j, 1);
        }
    }

    function start() {
        if (running) return;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'xfiles-sky';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
            ctx = canvas.getContext('2d');
            window.addEventListener('resize', function () { if (running) resize(); });
        }
        if (!canvas.parentNode) document.body.prepend(canvas);
        running = true; last = 0;
        resize();
        nextComet = performance.now() / 1000 + rand(2, 5); // el primero aparece enseguida
        nextUfo = performance.now() / 1000 + rand(8, 15);
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null; comets = []; ufo = null;
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    window.XFilesFX = { start: start, stop: stop, isOn: function () { return running; } };
})();
