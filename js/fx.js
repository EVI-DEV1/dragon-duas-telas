/* =====================================================
   DRAGON // DUAS TELAS
   fx.js  —  particulas, rastro, costura e atmosfera

   As particulas vivem no MUNDO, nao na tela.
   Elas sao geradas apenas pelo dono da simulacao e
   transmitidas; as duas janelas guardam a MESMA lista.
   Por isso uma faisca criada no monitor continua sua
   trajetoria e aparece entrando no notebook.

   Posicao analitica:   p(t) = p0 + v*a + (a*a)/2 * acc
   Sem integracao por frame => zero deriva entre telas.
===================================================== */


const PARTICLE_STRIDE = 11;
/* [ x0, y0, vx, vy, ax, ay, t0, life, hue, size, kind ] */

const RING_STRIDE = 5;
/* [ x, y, t0, life, strength ] */

const KIND_SPARK  = 0;
const KIND_EMBER  = 1;
const KIND_BURST  = 2;
const KIND_STREAK = 3;


/* =====================================================
   DEPOSITO DE PARTICULAS (identico nas duas telas)
===================================================== */

class ParticleField {

    constructor(max) {
        this.max = max || 1600;
        this.data = new Float64Array(this.max * PARTICLE_STRIDE);
        this.count = 0;
        this.write = 0;
    }


    pushRaw(buf) {

        const n = buf.length / PARTICLE_STRIDE;

        for (let i = 0; i < n; i++) {

            const base = this.write * PARTICLE_STRIDE;

            for (let k = 0; k < PARTICLE_STRIDE; k++) {
                this.data[base + k] = buf[i * PARTICLE_STRIDE + k];
            }

            this.write = (this.write + 1) % this.max;
            if (this.count < this.max) this.count++;
        }
    }


    draw(ctx, map, worldTime) {

        const d = this.data;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < this.count; i++) {

            const b = i * PARTICLE_STRIDE;

            const life = d[b + 7];
            if (life <= 0) continue;

            const age = (worldTime - d[b + 6]) / 1000;
            if (age < 0 || age > life) continue;

            const x = d[b] + d[b + 2] * age + 0.5 * d[b + 4] * age * age;
            const y = d[b + 1] + d[b + 3] * age + 0.5 * d[b + 5] * age * age;

            if (!map.isVisible(x, y, 120)) continue;

            const k = 1 - age / life;
            const alpha = k * k;

            const hue = d[b + 8];
            const size = d[b + 9] * (0.35 + k * 0.65);
            const kind = d[b + 10];

            if (kind === KIND_STREAK) {

                const vx = d[b + 2] + d[b + 4] * age;
                const vy = d[b + 3] + d[b + 5] * age;
                const m = Math.hypot(vx, vy) || 1;

                const len = size * 9;

                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - (vx / m) * len, y - (vy / m) * len);
                ctx.strokeStyle = "hsla(" + hue + ",100%,75%," + (alpha * 0.55) + ")";
                ctx.lineWidth = size * 0.5;
                ctx.stroke();

                continue;
            }

            const r = size * (kind === KIND_BURST ? 3.4 : 2.2);

            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0,   "hsla(" + hue + ",100%,86%," + alpha + ")");
            g.addColorStop(0.35, "hsla(" + hue + ",100%,62%," + (alpha * 0.55) + ")");
            g.addColorStop(1,   "hsla(" + hue + ",100%,50%,0)");

            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}


/* =====================================================
   EMISSOR  (roda somente no dono da simulacao)
===================================================== */

class ParticleEmitter {

    constructor() {
        this.pending = [];
        this.acc = 0;
    }


    _add(x, y, vx, vy, ax, ay, t0, life, hue, size, kind) {
        this.pending.push(x, y, vx, vy, ax, ay, t0, life, hue, size, kind);
    }


    emit(dragon, worldTime, dt) {

        const e = dragon.energy;
        const segs = dragon.segments;

        /* ---- FAISCAS AO LONGO DO CORPO ---- */

        this.acc += dt * (14 + e * 90);

        while (this.acc >= 1) {

            this.acc -= 1;

            const i = 1 + Math.floor(Math.pow(Math.random(), 0.6) * (segs.length - 2));
            const s = segs[i];

            const spread = 10 + e * 16;

            this._add(
                s.x + (Math.random() - 0.5) * s.size * 1.4,
                s.y + (Math.random() - 0.5) * s.size * 1.4,
                -dragon.vx * (0.10 + Math.random() * 0.22) + (Math.random() - 0.5) * spread,
                -dragon.vy * (0.10 + Math.random() * 0.22) + (Math.random() - 0.5) * spread,
                0,
                -8 - Math.random() * 22,
                worldTime,
                0.7 + Math.random() * 1.4,
                180 + (i / segs.length) * 85 + Math.random() * 14,
                1.4 + Math.random() * 2.6 + e * 1.8,
                KIND_SPARK
            );
        }


        /* ---- BRASAS DAS ASAS (a cada batida) ---- */

        const flapNow = Math.sin(dragon.flapPhase);

        if (this._lastFlap !== undefined && this._lastFlap < 0 && flapNow >= 0) {

            for (const idx of WING_SEGMENTS) {

                const s = segs[idx];

                for (let k = 0; k < 10 + Math.floor(e * 16); k++) {

                    const a = Math.random() * Math.PI * 2;
                    const sp = 40 + Math.random() * 150 * (0.4 + e);

                    this._add(
                        s.x, s.y,
                        Math.cos(a) * sp - dragon.vx * 0.18,
                        Math.sin(a) * sp - dragon.vy * 0.18,
                        0, 20,
                        worldTime,
                        0.5 + Math.random() * 0.9,
                        190 + Math.random() * 70,
                        1.2 + Math.random() * 2.2,
                        KIND_EMBER
                    );
                }
            }
        }

        this._lastFlap = flapNow;


        /* ---- LINHAS DE VELOCIDADE ---- */

        if (e > 0.45) {

            const n = Math.floor(1 + e * 3);

            for (let k = 0; k < n; k++) {

                const i = Math.floor(Math.random() * segs.length);
                const s = segs[i];

                this._add(
                    s.x + (Math.random() - 0.5) * 90,
                    s.y + (Math.random() - 0.5) * 150,
                    -dragon.vx * (0.55 + Math.random() * 0.4),
                    -dragon.vy * (0.55 + Math.random() * 0.4),
                    0, 0,
                    worldTime,
                    0.28 + Math.random() * 0.35,
                    185 + Math.random() * 60,
                    2 + Math.random() * 3,
                    KIND_STREAK
                );
            }
        }
    }


    /* Explosao no ponto exato da travessia */

    burst(x, y, worldTime, power, direction) {

        const n = Math.floor(90 * power);

        for (let k = 0; k < n; k++) {

            const a = Math.random() * Math.PI * 2;
            const sp = 60 + Math.random() * 480 * power;

            this._add(
                x, y,
                Math.cos(a) * sp + direction * 120 * Math.random(),
                Math.sin(a) * sp * 0.75,
                0, 30,
                worldTime,
                0.6 + Math.random() * 1.5,
                180 + Math.random() * 90,
                2 + Math.random() * 4.5,
                KIND_BURST
            );
        }
    }


    flush() {

        if (!this.pending.length) return null;

        const buf = new Float64Array(this.pending);
        this.pending.length = 0;

        return buf;
    }
}


/* =====================================================
   ANEIS DE CHOQUE  —  nascem na costura e crescem.
   Como estao em vx = 0, cada tela mostra METADE do anel:
   juntas, formam um circulo unico atravessando a moldura.
===================================================== */

class RingField {

    constructor(max) {
        this.max = max || 24;
        this.data = new Float64Array(this.max * RING_STRIDE);
        this.count = 0;
        this.write = 0;
    }


    pushRaw(buf) {

        const n = buf.length / RING_STRIDE;

        for (let i = 0; i < n; i++) {
            const base = this.write * RING_STRIDE;
            for (let k = 0; k < RING_STRIDE; k++) {
                this.data[base + k] = buf[i * RING_STRIDE + k];
            }
            this.write = (this.write + 1) % this.max;
            if (this.count < this.max) this.count++;
        }
    }


    draw(ctx, map, worldTime) {

        const d = this.data;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (let i = 0; i < this.count; i++) {

            const b = i * RING_STRIDE;

            const life = d[b + 3];
            if (life <= 0) continue;

            const age = (worldTime - d[b + 2]) / 1000;
            if (age < 0 || age > life) continue;

            const k = age / life;
            const strength = d[b + 4];

            const r = 40 + k * 900 * strength;
            const alpha = Math.pow(1 - k, 1.7) * 0.75 * strength;

            ctx.beginPath();
            ctx.arc(d[b], d[b + 1], r, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0,245,255," + alpha + ")";
            ctx.lineWidth = 10 * (1 - k) * strength + 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(d[b], d[b + 1], r * 0.72, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(139,92,246," + (alpha * 0.6) + ")";
            ctx.lineWidth = 5 * (1 - k) * strength + 1;
            ctx.stroke();
        }

        ctx.restore();
    }
}


/* =====================================================
   ATMOSFERA  —  fundo da cena (espaco de tela)
===================================================== */

class Ambient {

    constructor() {
        this.stars = [];
        this.seed();
    }


    seed() {
        this.stars.length = 0;
        for (let i = 0; i < 170; i++) {
            this.stars.push({
                x: Math.random(),
                y: Math.random(),
                r: Math.random() * 1.5 + 0.3,
                p: Math.random() * Math.PI * 2,
                s: 0.4 + Math.random() * 1.6
            });
        }
    }


    draw(ctx, W, H, time, glow) {

        ctx.clearRect(0, 0, W, H);

        /* nebulosas */
        const blobs = [
            { x: 0.5, y: 0.5, r: 0.62, c: "0,245,255", a: 0.075 },
            { x: 0.15, y: 0.82, r: 0.5, c: "139,92,246", a: 0.085 },
            { x: 0.85, y: 0.2, r: 0.45, c: "36,119,255", a: 0.06 }
        ];

        for (const b of blobs) {

            const pulse = 1 + Math.sin(time * 0.0006 + b.x * 9) * 0.08;
            const r = Math.max(W, H) * b.r * pulse;

            const g = ctx.createRadialGradient(
                W * b.x, H * b.y, 0,
                W * b.x, H * b.y, r
            );

            g.addColorStop(0, "rgba(" + b.c + "," + (b.a * (1 + glow)) + ")");
            g.addColorStop(1, "rgba(" + b.c + ",0)");

            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }

        /* estrelas */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        for (const s of this.stars) {

            const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 0.0016 * s.s + s.p));

            ctx.fillStyle = "rgba(184,250,255," + (tw * 0.6) + ")";
            ctx.beginPath();
            ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}


/* =====================================================
   COSTURA  —  o brilho da borda fisica

   Desenhado em ESPACO DE TELA, na borda que encosta na
   outra tela. E' o que faz parecer que a luz vaza de um
   monitor para o outro.
===================================================== */

const SeamFX = {

    /* Brilho da borda */
    glow(ctx, map, W, H, intensity, time) {

        if (intensity <= 0.001) return;

        const seamX = map.toLocalX(0);
        const onRight = map.side === "left";     // costura na direita da tela

        const width = Math.min(W * 0.42, 340) * (0.5 + intensity * 0.5);

        const g = ctx.createLinearGradient(
            seamX, 0,
            seamX + (onRight ? -width : width), 0
        );

        const a = intensity;

        g.addColorStop(0,    "rgba(184,250,255," + (0.42 * a) + ")");
        g.addColorStop(0.12, "rgba(0,245,255," + (0.26 * a) + ")");
        g.addColorStop(0.45, "rgba(36,119,255," + (0.10 * a) + ")");
        g.addColorStop(1,    "rgba(139,92,246,0)");

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(
            onRight ? seamX - width : seamX,
            0, width, H
        );

        /* filete branco na borda exata */
        const line = ctx.createLinearGradient(0, 0, 0, H);
        line.addColorStop(0,   "rgba(0,245,255,0)");
        line.addColorStop(0.5, "rgba(220,255,255," + (0.75 * a) + ")");
        line.addColorStop(1,   "rgba(0,245,255,0)");

        ctx.fillStyle = line;
        ctx.fillRect(onRight ? seamX - 3 : seamX, 0, 3, H);

        ctx.restore();
    },


    /* Distorcao: a faixa junto da costura e' redesenhada em
       fatias deslocadas -> sensacao de rasgo entre as telas. */

    distort(ctx, canvas, map, W, H, intensity, time, dpr) {

        if (intensity <= 0.02) return;

        const seamX = map.toLocalX(0);
        const onRight = map.side === "left";

        const band = Math.min(W * 0.5, 420);
        const x0 = onRight ? Math.max(0, seamX - band) : Math.max(0, seamX);
        const bw = Math.min(band, W - x0);

        if (bw <= 2) return;

        const slices = 26;
        const sh = H / slices;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.10 + intensity * 0.30;

        for (let i = 0; i < slices; i++) {

            const y = i * sh;

            const off = Math.sin(time * 0.011 + i * 0.9) *
                        (2 + intensity * 16) *
                        (onRight ? -1 : 1);

            const chroma = Math.sin(time * 0.007 + i * 0.5) * intensity * 5;

            ctx.drawImage(
                canvas,
                x0 * dpr, y * dpr, bw * dpr, sh * dpr,
                x0 + off, y, bw, sh + 1
            );

            ctx.drawImage(
                canvas,
                x0 * dpr, y * dpr, bw * dpr, sh * dpr,
                x0 + off + chroma, y, bw, sh + 1
            );
        }

        ctx.restore();
    },


    /* Vinheta + varredura, o acabamento da cena */

    grade(ctx, W, H, time, intensity) {

        const g = ctx.createRadialGradient(
            W / 2, H / 2, Math.min(W, H) * 0.25,
            W / 2, H / 2, Math.max(W, H) * 0.78
        );

        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.55)");

        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        if (intensity > 0.05) {
            const y = ((time * 0.22) % (H + 300)) - 150;
            const s = ctx.createLinearGradient(0, y - 150, 0, y + 150);
            s.addColorStop(0,   "rgba(0,245,255,0)");
            s.addColorStop(0.5, "rgba(0,245,255," + (0.035 * intensity) + ")");
            s.addColorStop(1,   "rgba(0,245,255,0)");
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = s;
            ctx.fillRect(0, y - 150, W, 300);
        }

        ctx.restore();
    }
};
