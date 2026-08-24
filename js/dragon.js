/* =====================================================
   DRAGON // DUAS TELAS
   dragon.js  —  a criatura

   IMPORTANTE: existe UM dragao.
   A simulacao roda em coordenadas do MUNDO (nao da tela).
   Quem e' dono (owner) simula e transmite o corpo inteiro;
   a outra janela apenas DESENHA o mesmo corpo.
===================================================== */


const SEGMENT_COUNT = 78;
const SEGMENT_REST  = 11;      // distancia entre vertebras (vpx)

const WING_SEGMENTS = [11, 22];

const MODE_CODE = { follow: 0, flight: 1, settle: 2, idle: 3, travel: 4 };
const CODE_MODE = ["follow", "flight", "settle", "idle", "travel"];


/* Perfil de espessura: cabeca grossa, cauda fina, leve
   volume no peitoral (onde nascem as asas).            */
function segmentSize(i) {

    const f = i / (SEGMENT_COUNT - 1);

    const taper = Math.pow(1 - f, 0.72);
    const bulge = 1 + 0.34 * Math.exp(-Math.pow((f - 0.16) / 0.15, 2));

    return (4 + 18 * taper) * bulge;
}


/* =====================================================
   MOTOR
===================================================== */

class Dragon {

    constructor(startX, startY) {

        this.segments = [];

        for (let i = 0; i < SEGMENT_COUNT; i++) {

            this.segments.push({
                bx: startX - i * SEGMENT_REST,   // base (fisica)
                by: startY,
                x:  startX - i * SEGMENT_REST,   // final (com ondulacao)
                y:  startY,
                angle: 0,
                size: segmentSize(i)
            });
        }

        this.vx = 0;
        this.vy = 0;

        this.mode = "follow";
        this.target = { x: startX, y: startY };

        this.dir = -1;              // sentido da travessia
        this.flightT = 0;           // tempo dentro do modo flight
        this.energy = 0;            // 0..1 -> brilho / rastro / velocidade
        this.flapPhase = 0;

        this.landing = null;
    }


    get head() { return this.segments[0]; }
    get tail() { return this.segments[SEGMENT_COUNT - 1]; }


    setTarget(x, y) {
        this.target.x = x;
        this.target.y = y;
    }


    launch(direction) {
        this.mode = "flight";
        this.dir = direction;
        this.flightT = 0;
    }


    /* Voa ate' um ponto do MUNDO — que pode estar na outra
       tela. E' o que responde ao clique do usuario.        */

    travelTo(x, y) {

        this.mode = "travel";
        this.dest = { x: x, y: y };
        this.flightT = 0;

        this.dir = Math.sign(x - this.segments[0].bx) || -1;
    }


    settleAt(x, y) {
        this.mode = "settle";
        this.landing = { x: x, y: y };
    }


    /* -------------------------------------------------
       PASSO DA SIMULACAO
       dt em segundos, worldTime em ms (relogio partilhado)
    ------------------------------------------------- */

    step(dt, worldTime) {

        dt = Math.min(dt, 0.05);          // trava contra travadas de aba

        const head = this.segments[0];

        if (this.mode === "flight") {

            this.flightT += dt * 1000;

            /* aceleracao suave ate a velocidade de cruzeiro */
            const k = Math.min(1, this.flightT / DISPLAY_CONFIG.transitionDuration);
            const ease = k * k * (3 - 2 * k);

            const speed = DISPLAY_CONFIG.cruiseSpeed *
                          (0.55 + 0.45 * ease) *
                          (1 + (DISPLAY_CONFIG.speedBoost - 1) * ease);

            this.vx += (this.dir * speed - this.vx) * Math.min(1, dt * 3.2);

            /* ondulacao vertical do voo */
            const wantVy = Math.cos(worldTime * 0.0022) *
                           DISPLAY_CONFIG.weaveAmplitude * 2.2 * ease;

            this.vy += (wantVy - this.vy) * Math.min(1, dt * 2.4);

            this.energy = Math.min(1, this.energy + dt * 1.6);

        } else if (this.mode === "travel") {

            /* rumo a um ponto: acelera igual ao voo livre,
               ondula no caminho e freia ao se aproximar     */

            const dx = this.dest.x - head.bx;
            const dy = this.dest.y - head.by;

            const dist = Math.hypot(dx, dy) || 0.0001;

            this.flightT += dt * 1000;

            const k = Math.min(1, this.flightT / DISPLAY_CONFIG.transitionDuration);
            const ease = k * k * (3 - 2 * k);

            const cruzeiro = DISPLAY_CONFIG.cruiseSpeed *
                             (0.55 + 0.45 * ease) *
                             (1 + (DISPLAY_CONFIG.speedBoost - 1) * ease);

            /* 0..1: quanto ainda falta (freia perto do alvo) */
            const chegando = Math.min(1, dist / 520);

            const alvo = cruzeiro * Math.max(0.10, chegando);

            const ux = dx / dist;
            const uy = dy / dist;

            /* ondulacao perpendicular ao rumo */
            const onda = Math.sin(worldTime * 0.0022) *
                         DISPLAY_CONFIG.weaveAmplitude * ease * chegando;

            const querVx = ux * alvo - uy * onda;
            const querVy = uy * alvo + ux * onda;

            this.vx += (querVx - this.vx) * Math.min(1, dt * 3.0);
            this.vy += (querVy - this.vy) * Math.min(1, dt * 3.0);

            this.energy = chegando > 0.35
                ? Math.min(1, this.energy + dt * 1.8)
                : Math.max(0.2, this.energy - dt * 0.9);

            if (dist < 46 && Math.hypot(this.vx, this.vy) < 140) {
                this.mode = "follow";
                this.target.x = this.dest.x;
                this.target.y = this.dest.y;
            }

        } else if (this.mode === "settle") {

            const dx = this.landing.x - head.bx;
            const dy = this.landing.y - head.by;

            this.vx += dx * 3.4 * dt;
            this.vy += dy * 3.4 * dt;

            this.vx *= Math.pow(0.03, dt);     // freio forte
            this.vy *= Math.pow(0.03, dt);

            this.energy = Math.max(0.18, this.energy - dt * 0.55);

            if (Math.hypot(dx, dy) < 26 && Math.hypot(this.vx, this.vy) < 60) {
                this.mode = "follow";
                this.target.x = this.landing.x;
                this.target.y = this.landing.y;
            }

        } else {
            /* follow: persegue o alvo (ponteiro de QUALQUER uma
               das duas telas, convertido para coordenadas do mundo) */

            const dx = this.target.x - head.bx;
            const dy = this.target.y - head.by;

            this.vx += dx * 2.6 * dt;
            this.vy += dy * 2.6 * dt;

            this.vx *= Math.pow(0.02, dt);
            this.vy *= Math.pow(0.02, dt);

            this.energy = Math.max(0.16, this.energy - dt * 0.6);
        }


        head.bx += this.vx * dt;
        head.by += this.vy * dt;

        head.angle = Math.atan2(this.vy, this.vx);


        /* --------- corrente: cada vertebra segue a anterior --------- */

        for (let i = 1; i < SEGMENT_COUNT; i++) {

            const c = this.segments[i];
            const p = this.segments[i - 1];

            const dx = p.bx - c.bx;
            const dy = p.by - c.by;

            const d = Math.hypot(dx, dy) || 0.0001;

            const pull = (d - SEGMENT_REST) / d;

            c.bx += dx * pull;
            c.by += dy * pull;

            c.angle = Math.atan2(p.by - c.by, p.bx - c.bx);
        }


        this.applyWave(worldTime);


        /* batida das asas: mais rapida com energia */
        this.flapPhase += dt * (3.4 + this.energy * 4.2);
    }


    /* Ondulacao serpentina: deslocamento PERPENDICULAR aplicado
       sobre a base. E' puramente visual, entao nao acumula erro. */

    applyWave(worldTime) {

        const amp = 3.2 + this.energy * 7.5;

        for (let i = 0; i < SEGMENT_COUNT; i++) {

            const s = this.segments[i];

            if (i === 0) {
                s.x = s.bx;
                s.y = s.by;
                continue;
            }

            const w = Math.sin(worldTime * 0.0052 - i * 0.29) *
                      amp * (i / SEGMENT_COUNT);

            const nx = -Math.sin(s.angle);
            const ny =  Math.cos(s.angle);

            s.x = s.bx + nx * w;
            s.y = s.by + ny * w;
        }
    }


    /* -------------------------------------------------
       SERIALIZACAO  (o corpo inteiro viaja entre as telas)
       6 floats de cabecalho + 3 por vertebra
    ------------------------------------------------- */

    serialize() {

        const buf = new Float32Array(6 + SEGMENT_COUNT * 3);

        buf[0] = this.vx;
        buf[1] = this.vy;
        buf[2] = this.energy;
        buf[3] = this.flapPhase;
        buf[4] = MODE_CODE[this.mode] !== undefined ? MODE_CODE[this.mode] : 0;
        buf[5] = SEGMENT_COUNT;

        let k = 6;

        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const s = this.segments[i];
            buf[k++] = s.x;
            buf[k++] = s.y;
            buf[k++] = s.angle;
        }

        return buf;
    }


    /* Reconstroi o estado exato (usado no HANDOFF de dominio,
       para que a outra tela CONTINUE o mesmo corpo)           */

    adopt(pose) {

        this.vx = pose.vx;
        this.vy = pose.vy;
        this.energy = pose.energy;
        this.flapPhase = pose.flapPhase;
        this.mode = pose.mode;

        for (let i = 0; i < SEGMENT_COUNT; i++) {
            const s = this.segments[i];
            const p = pose.segments[i];
            s.x = s.bx = p.x;
            s.y = s.by = p.y;
            s.angle = p.angle;
        }
    }


    pose() {
        return {
            vx: this.vx,
            vy: this.vy,
            energy: this.energy,
            flapPhase: this.flapPhase,
            mode: this.mode,
            segments: this.segments.map(s => ({
                x: s.x, y: s.y, angle: s.angle, size: s.size
            }))
        };
    }
}


/* =====================================================
   POSE  —  o que o renderizador consome
===================================================== */

function decodePose(buf) {

    const n = buf[5] | 0;

    const segments = new Array(n);
    let k = 6;

    for (let i = 0; i < n; i++) {
        segments[i] = {
            x: buf[k++],
            y: buf[k++],
            angle: buf[k++],
            size: segmentSize(i)
        };
    }

    return {
        vx: buf[0],
        vy: buf[1],
        energy: buf[2],
        flapPhase: buf[3],
        mode: CODE_MODE[buf[4] | 0] || "follow",
        segments: segments
    };
}


function lerpAngle(a, b, t) {
    let d = b - a;
    while (d >  Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}


/* Interpola duas poses: e' isso que faz o corpo deslizar
   liso mesmo se um frame de rede se perder.              */

function lerpPose(a, b, t) {

    const n = a.segments.length;
    const segments = new Array(n);

    for (let i = 0; i < n; i++) {
        const sa = a.segments[i];
        const sb = b.segments[i];

        segments[i] = {
            x: sa.x + (sb.x - sa.x) * t,
            y: sa.y + (sb.y - sa.y) * t,
            angle: lerpAngle(sa.angle, sb.angle, t),
            size: sa.size
        };
    }

    return {
        vx: a.vx + (b.vx - a.vx) * t,
        vy: a.vy + (b.vy - a.vy) * t,
        energy: a.energy + (b.energy - a.energy) * t,
        flapPhase: a.flapPhase + (b.flapPhase - a.flapPhase) * t,
        mode: b.mode,
        segments: segments
    };
}


/* Extrapola (dead reckoning) quando o stream atrasa */

function extrapolatePose(p, ms) {

    if (!DISPLAY_CONFIG.latencyCompensation || ms <= 0) return p;

    const dt = Math.min(ms, 120) / 1000;
    const ox = p.vx * dt;
    const oy = p.vy * dt;

    return {
        vx: p.vx, vy: p.vy,
        energy: p.energy,
        flapPhase: p.flapPhase,
        mode: p.mode,
        segments: p.segments.map(s => ({
            x: s.x + ox, y: s.y + oy, angle: s.angle, size: s.size
        }))
    };
}
