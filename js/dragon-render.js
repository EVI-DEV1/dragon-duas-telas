/* =====================================================
   DRAGON // DUAS TELAS
   dragon-render.js  —  desenho da criatura

   Tudo aqui desenha em COORDENADAS DO MUNDO.
   A janela ja' aplicou a transformacao (WorldMap.applyTransform),
   entao o mesmo codigo produz o mesmo dragao nas duas telas —
   e' isso que garante que a metade que sai e a metade que
   entra sejam visualmente a mesma criatura.
===================================================== */


const DragonRender = {

    /* ---------------------------------------------
       ENTRADA PRINCIPAL
       pose  : { segments, energy, flapPhase, vx, vy }
       opts  : { time, blurScale }
    --------------------------------------------- */

    draw(ctx, pose, opts) {

        const time = opts.time;
        const e = pose.energy;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        this.aura(ctx, pose, e);

        /* asa de tras (lado -1) */
        for (const idx of WING_SEGMENTS) {
            this.wing(ctx, pose, idx, -1, time, e, true);
        }

        this.bodyGlow(ctx, pose, e);
        this.tailFin(ctx, pose, time, e);
        this.plates(ctx, pose, time, e);
        this.core(ctx, pose, time, e);

        /* asa da frente (lado +1) */
        for (const idx of WING_SEGMENTS) {
            this.wing(ctx, pose, idx, +1, time, e, false);
        }

        this.head(ctx, pose, time, e);

        ctx.restore();
    },


    /* =============================================
       AURA  —  halo geral que aumenta com a energia
    ============================================= */

    aura(ctx, pose, e) {

        const segs = pose.segments;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < segs.length; i += 6) {

            const s = segs[i];
            const r = s.size * (5.5 + e * 5);

            const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);

            const hue = 185 + (i / segs.length) * 78;

            g.addColorStop(0,    "hsla(" + hue + ",100%,62%," + (0.055 + e * 0.075) + ")");
            g.addColorStop(0.45, "hsla(" + hue + ",100%,55%," + (0.020 + e * 0.030) + ")");
            g.addColorStop(1,    "hsla(" + hue + ",100%,50%,0)");

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    },


    /* =============================================
       BRILHO DO CORPO  —  faixas grossas somadas
       (substitui shadowBlur por segmento: mesma
        aparencia, muito mais barato a 60fps)
    ============================================= */

    bodyGlow(ctx, pose, e) {

        const segs = pose.segments;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        const passes = [
            { w: 4.2, a: 0.035 + e * 0.045 },
            { w: 2.4, a: 0.055 + e * 0.070 },
            { w: 1.2, a: 0.090 + e * 0.110 }
        ];

        for (const p of passes) {

            ctx.beginPath();
            ctx.moveTo(segs[0].x, segs[0].y);

            for (let i = 1; i < segs.length; i++) {
                ctx.lineTo(segs[i].x, segs[i].y);
            }

            const grad = ctx.createLinearGradient(
                segs[0].x, segs[0].y,
                segs[segs.length - 1].x, segs[segs.length - 1].y
            );

            grad.addColorStop(0,   "rgba(0,245,255," + p.a + ")");
            grad.addColorStop(0.5, "rgba(36,119,255," + p.a * 0.9 + ")");
            grad.addColorStop(1,   "rgba(139,92,246," + p.a * 0.7 + ")");

            ctx.strokeStyle = grad;
            ctx.lineWidth = segs[0].size * p.w;
            ctx.stroke();
        }

        ctx.restore();
    },


    /* =============================================
       ESCAMAS / SEGMENTOS LUMINOSOS
    ============================================= */

    plates(ctx, pose, time, e) {

        const segs = pose.segments;

        for (let i = segs.length - 1; i >= 1; i--) {

            const s = segs[i];
            const f = i / segs.length;

            const hue = 185 + f * 80;

            /* pulso de energia correndo da cauda para a cabeca */
            const pulse = 0.5 + 0.5 * Math.sin(time * 0.006 - i * 0.42);
            const bright = 42 + pulse * 22 + e * 12;

            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.angle);

            const w = s.size;
            const h = s.size * 0.82;

            /* placa hexagonal */
            ctx.beginPath();
            ctx.moveTo(-w * 1.05, 0);
            ctx.lineTo(-w * 0.35, -h);
            ctx.lineTo( w * 0.45, -h * 0.86);
            ctx.lineTo( w * 1.05, 0);
            ctx.lineTo( w * 0.45,  h * 0.86);
            ctx.lineTo(-w * 0.35,  h);
            ctx.closePath();

            const g = ctx.createLinearGradient(0, -h, 0, h);
            g.addColorStop(0,   "hsla(" + hue + ",70%," + (bright * 0.30) + "%,0.95)");
            g.addColorStop(0.5, "hsla(" + hue + ",85%,8%,0.95)");
            g.addColorStop(1,   "hsla(" + hue + ",70%," + (bright * 0.16) + "%,0.95)");

            ctx.fillStyle = g;
            ctx.fill();

            ctx.strokeStyle = "hsla(" + hue + ",100%," + bright + "%," + (0.55 + e * 0.35) + ")";
            ctx.lineWidth = 1.1;
            ctx.stroke();

            /* nervura interna */
            ctx.beginPath();
            ctx.moveTo(-w * 0.5, 0);
            ctx.lineTo( w * 0.6, 0);
            ctx.strokeStyle = "hsla(" + hue + ",100%," + (bright + 18) + "%," + (0.16 + e * 0.22) + ")";
            ctx.lineWidth = 0.8;
            ctx.stroke();

            /* CRISTA DORSAL */
            if (i % 3 === 0 && i < segs.length - 6) {

                const cr = h * (1.9 + pulse * 0.35);

                ctx.beginPath();
                ctx.moveTo(-w * 0.3, -h * 0.55);
                ctx.lineTo(-w * 0.05, -cr);
                ctx.lineTo( w * 0.5, -h * 0.45);
                ctx.closePath();

                const cg = ctx.createLinearGradient(0, -cr, 0, 0);
                cg.addColorStop(0, "hsla(" + (hue + 20) + ",100%,70%," + (0.42 + e * 0.4) + ")");
                cg.addColorStop(1, "rgba(6,14,26,0.9)");

                ctx.fillStyle = cg;
                ctx.fill();

                ctx.strokeStyle = "hsla(" + (hue + 20) + ",100%,72%," + (0.5 + e * 0.3) + ")";
                ctx.lineWidth = 0.9;
                ctx.stroke();
            }

            ctx.restore();
        }
    },


    /* =============================================
       NUCLEO DE ENERGIA  —  linha viva por dentro
    ============================================= */

    core(ctx, pose, time, e) {

        const segs = pose.segments;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        ctx.beginPath();
        ctx.moveTo(segs[0].x, segs[0].y);
        for (let i = 1; i < segs.length; i++) {
            ctx.lineTo(segs[i].x, segs[i].y);
        }

        ctx.strokeStyle = "rgba(184,250,255," + (0.30 + e * 0.45) + ")";
        ctx.lineWidth = 1.6 + e * 1.4;
        ctx.stroke();

        /* pulsos correndo pelo nucleo */
        for (let k = 0; k < 3; k++) {

            const p = ((time * 0.00055 + k / 3) % 1);
            const idx = Math.floor(p * (segs.length - 2)) + 1;
            const s = segs[segs.length - 1 - idx];

            const r = s.size * (1.6 + e);

            const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
            g.addColorStop(0, "rgba(220,255,255," + (0.5 + e * 0.4) + ")");
            g.addColorStop(1, "rgba(0,245,255,0)");

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    },


    /* =============================================
       ASAS  —  membrana + ossos, com batida
    ============================================= */

    wing(ctx, pose, idx, side, time, e, behind) {

        const segs = pose.segments;
        if (idx >= segs.length) return;

        const s = segs[idx];

        /* fase deslocada por asa: o par de tras bate atrasado */
        const flap = Math.sin(pose.flapPhase - idx * 0.22);
        const flap01 = (flap + 1) / 2;

        const spread = 0.52 + 0.48 * flap01;
        const u = s.size / 22;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);

        /* asa de tras: menor e mais apagada (falso 3D) */
        const depth = behind ? 0.86 : 1;
        ctx.scale(depth, depth);
        ctx.globalAlpha = behind ? 0.55 : 1;

        const S = (v) => v * u * spread;

        const shoulder = { x: 0, y: 0 };
        const elbow    = { x: S(38),  y: side * S(50) };
        const wrist    = { x: S(96),  y: side * S(112) };
        const tip      = { x: S(168), y: side * S(84) };

        /* ---- MEMBRANA ---- */

        ctx.beginPath();
        ctx.moveTo(shoulder.x, shoulder.y);
        ctx.quadraticCurveTo(S(24), side * S(18), elbow.x, elbow.y);
        ctx.quadraticCurveTo(S(70), side * S(96), wrist.x, wrist.y);
        ctx.quadraticCurveTo(S(140), side * S(120), tip.x, tip.y);

        /* borda de fuga recortada */
        ctx.quadraticCurveTo(S(120), side * S(44), S(96), side * S(58));
        ctx.quadraticCurveTo(S(74),  side * S(26), S(52), side * S(34));
        ctx.quadraticCurveTo(S(32),  side * S(10), shoulder.x, shoulder.y);
        ctx.closePath();

        const g = ctx.createLinearGradient(0, 0, tip.x, tip.y);
        g.addColorStop(0,   "rgba(0,245,255," + (0.10 + e * 0.10) + ")");
        g.addColorStop(0.5, "rgba(36,119,255," + (0.07 + e * 0.08) + ")");
        g.addColorStop(1,   "rgba(139,92,246," + (0.04 + e * 0.07) + ")");

        ctx.fillStyle = g;
        ctx.fill();

        ctx.strokeStyle = "rgba(0,245,255," + (0.42 + e * 0.32) + ")";
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();

        /* ---- OSSOS ---- */

        ctx.strokeStyle = "rgba(184,250,255," + (0.50 + e * 0.35) + ")";
        ctx.lineWidth = 1.9 * u;

        ctx.beginPath();
        ctx.moveTo(shoulder.x, shoulder.y);
        ctx.lineTo(elbow.x, elbow.y);
        ctx.lineTo(wrist.x, wrist.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();

        /* dedos */
        ctx.strokeStyle = "rgba(0,245,255," + (0.30 + e * 0.30) + ")";
        ctx.lineWidth = 1.1 * u;

        const fingers = [
            { x: S(96),  y: side * S(58) },
            { x: S(52),  y: side * S(34) },
            { x: S(126), y: side * S(70) }
        ];

        for (const f of fingers) {
            ctx.beginPath();
            ctx.moveTo(wrist.x * 0.55, wrist.y * 0.55);
            ctx.lineTo(f.x, f.y);
            ctx.stroke();
        }

        /* garra na ponta */
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x + S(16), tip.y + side * S(4));
        ctx.strokeStyle = "rgba(139,92,246," + (0.6 + e * 0.3) + ")";
        ctx.lineWidth = 1.6 * u;
        ctx.stroke();

        ctx.restore();
    },


    /* =============================================
       CAUDA  —  leme articulado
    ============================================= */

    tailFin(ctx, pose, time, e) {

        const segs = pose.segments;
        const t = segs[segs.length - 1];
        const u = 1;

        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);

        const sway = Math.sin(time * 0.005) * 0.18;
        ctx.rotate(sway);

        const L = 74;

        /* tres laminas */
        const blades = [
            { a: -0.42, l: 0.78 },
            { a:  0.00, l: 1.00 },
            { a:  0.42, l: 0.78 }
        ];

        ctx.globalCompositeOperation = "lighter";

        for (const b of blades) {

            ctx.save();
            ctx.rotate(b.a);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-L * 0.5 * b.l, -9, -L * b.l, 0);
            ctx.quadraticCurveTo(-L * 0.5 * b.l,  9, 0, 0);
            ctx.closePath();

            const g = ctx.createLinearGradient(0, 0, -L * b.l, 0);
            g.addColorStop(0, "rgba(0,245,255," + (0.32 + e * 0.30) + ")");
            g.addColorStop(1, "rgba(139,92,246,0)");

            ctx.fillStyle = g;
            ctx.fill();

            ctx.strokeStyle = "rgba(0,245,255," + (0.34 + e * 0.28) + ")";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    },


    /* =============================================
       CABECA
    ============================================= */

    head(ctx, pose, time, e) {

        const h = pose.segments[0];
        const u = h.size / 22;

        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.angle);

        const U = (v) => v * u;

        /* ---- halo ---- */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, U(86));
        hg.addColorStop(0, "rgba(0,245,255," + (0.16 + e * 0.20) + ")");
        hg.addColorStop(1, "rgba(0,245,255,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, 0, U(86), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* ---- bigodes / antenas de energia ---- */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(0,245,255," + (0.28 + e * 0.30) + ")";
        ctx.lineWidth = 1.2 * u;

        for (const side of [-1, 1]) {
            const wob = Math.sin(time * 0.004 + side) * U(10);
            ctx.beginPath();
            ctx.moveTo(U(22), side * U(8));
            ctx.quadraticCurveTo(U(-16), side * U(30) + wob, U(-64), side * U(26) + wob * 1.6);
            ctx.stroke();
        }
        ctx.restore();

        /* ---- mandibula ---- */
        ctx.beginPath();
        ctx.moveTo(U(34), U(3));
        ctx.lineTo(U(6), U(19));
        ctx.lineTo(U(-18), U(14));
        ctx.closePath();
        ctx.fillStyle = "rgba(5,16,26,0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,245,255,0.5)";
        ctx.lineWidth = 1.1 * u;
        ctx.stroke();

        /* ---- cranio ---- */
        ctx.beginPath();
        ctx.moveTo(U(40), 0);
        ctx.lineTo(U(18), U(-9));
        ctx.lineTo(U(4), U(-20));
        ctx.lineTo(U(-20), U(-17));
        ctx.lineTo(U(-30), U(-4));
        ctx.lineTo(U(-26), U(9));
        ctx.lineTo(U(-2), U(16));
        ctx.lineTo(U(20), U(9));
        ctx.closePath();

        const g = ctx.createLinearGradient(0, U(-20), 0, U(16));
        g.addColorStop(0,   "rgba(20,58,80,0.98)");
        g.addColorStop(0.55, "rgba(5,17,28,0.98)");
        g.addColorStop(1,   "rgba(10,30,46,0.98)");

        ctx.fillStyle = g;
        ctx.fill();

        ctx.strokeStyle = "rgba(0,245,255," + (0.72 + e * 0.25) + ")";
        ctx.lineWidth = 1.7 * u;
        ctx.stroke();

        /* ---- placas faciais ---- */
        ctx.beginPath();
        ctx.moveTo(U(30), U(-2));
        ctx.lineTo(U(6), U(-12));
        ctx.lineTo(U(-14), U(-9));
        ctx.strokeStyle = "rgba(184,250,255," + (0.25 + e * 0.25) + ")";
        ctx.lineWidth = 0.9 * u;
        ctx.stroke();

        /* ---- CHIFRES ---- */
        ctx.strokeStyle = "rgba(139,92,246," + (0.85 + e * 0.15) + ")";
        ctx.lineWidth = 3 * u;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(U(-8), U(-14));
        ctx.quadraticCurveTo(U(-26), U(-30), U(-44), U(-40));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(U(-14), U(-10));
        ctx.quadraticCurveTo(U(-34), U(-18), U(-52), U(-20));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(U(-18), U(10));
        ctx.quadraticCurveTo(U(-34), U(24), U(-48), U(30));
        ctx.strokeStyle = "rgba(36,119,255," + (0.7 + e * 0.2) + ")";
        ctx.lineWidth = 2.2 * u;
        ctx.stroke();

        /* ---- OLHOS ---- */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (const ey of [U(-7), U(6)]) {

            const r = U(6.5);

            const eg = ctx.createRadialGradient(U(9), ey, 0, U(9), ey, r * 3.4);
            eg.addColorStop(0,   "rgba(255,255,255,1)");
            eg.addColorStop(0.28, "rgba(150,250,255,0.9)");
            eg.addColorStop(1,   "rgba(0,245,255,0)");

            ctx.fillStyle = eg;
            ctx.beginPath();
            ctx.arc(U(9), ey, r * 3.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(U(9), ey, r * 0.62, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        /* ---- sopro / faisca da boca ---- */
        if (e > 0.35) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const bg = ctx.createRadialGradient(U(42), U(2), 0, U(42), U(2), U(26) * e);
            bg.addColorStop(0, "rgba(220,255,255," + (e * 0.55) + ")");
            bg.addColorStop(1, "rgba(0,245,255,0)");
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(U(42), U(2), U(26) * e, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }
};
