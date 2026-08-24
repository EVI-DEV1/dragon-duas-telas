/* =====================================================
   DRAGON // DUAS TELAS
   demo/gerar-capa.js  —  capa 1280x800 para o portfolio

       cd demo && node gerar-capa.js

   Mesma abordagem do gerar-demo.js: carrega os modulos
   reais e desenha os dois recortes. Aqui o script avanca
   a simulacao ate' o instante em que o corpo esta' NAS
   DUAS TELAS e congela nesse quadro.
===================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { createCanvas } = require("@napi-rs/canvas");

const RAIZ = path.join(__dirname, "..");

const sandbox = {
    console, Math, Date, Number, Array, Object, JSON,
    Float32Array, Float64Array,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};

vm.createContext(sandbox);

for (const arquivo of ["js/config.js", "js/world.js", "js/dragon.js",
                       "js/dragon-render.js", "js/fx.js"]) {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), "utf8"),
                    sandbox, { filename: arquivo });
}

const { DISPLAY_CONFIG, WorldMap, Dragon, DragonRender,
        ParticleField, ParticleEmitter, RingField, Ambient,
        SeamFX, SEGMENT_COUNT, SEGMENT_REST } =
    vm.runInContext(`({
        DISPLAY_CONFIG, WorldMap, Dragon, DragonRender,
        ParticleField, ParticleEmitter, RingField, Ambient,
        SeamFX, SEGMENT_COUNT, SEGMENT_REST
    })`, sandbox);


/* -----------------------------------------------------
   CAPA
----------------------------------------------------- */

const CAPA_W = 1280;
const CAPA_H = 800;          // 16:10, igual as outras capas do portfolio

const MOLDURA = 22;
const MARGEM = 60;

const util = CAPA_W - MARGEM * 2 - MOLDURA;

const TELAS = {
    monitor:  { W: Math.round(util * 0.585) },
    notebook: { W: Math.round(util * 0.415) }
};

for (const t of Object.values(TELAS)) t.H = Math.round(t.W * 9 / 16);

const escalaMonitor = TELAS.monitor.H / DISPLAY_CONFIG.referenceHeight;

const calibracao = {
    seamGap: Math.round(MOLDURA / escalaMonitor),
    monitor: { scale: null, offsetY: 0 },
    notebook: { scale: null, offsetY: 0 }
};

function montar(papel) {
    const { W, H } = TELAS[papel];
    const map = new WorldMap(papel);
    map.setCalibration(calibracao);
    map.setViewport(W, H, 1);
    return { papel, W, H, map, canvas: createCanvas(W, H), ambiente: new Ambient() };
}

const monitor = montar("monitor");
const notebook = montar("notebook");


/* -----------------------------------------------------
   SIMULA ATE' O CORPO ESTAR NAS DUAS TELAS
----------------------------------------------------- */

const berco = {
    x: monitor.map.worldLeft + SEGMENT_COUNT * SEGMENT_REST + 100,
    y: -20
};

const dragao = new Dragon(berco.x, berco.y);
dragao.setTarget(berco.x, berco.y);

const particulas = new ParticleField(2400);
const emissor = new ParticleEmitter();
const aneis = new RingField(16);

const BASE = 1000000;
const DT = 1 / 90;

let t = 0;
let lancou = false;
let estourou = false;
let extra = 0;

const destino = {
    x: notebook.map.toWorldX(notebook.W * 0.34),
    y: notebook.map.toWorldY(notebook.H * 0.50)
};

while (extra < 26) {

    t += DT;
    const mundo = BASE + t * 1000;

    if (!lancou && t > 0.9) { lancou = true; dragao.travelTo(destino.x, destino.y); }

    dragao.step(DT, mundo);
    emissor.emit(dragao, mundo, DT);

    if (lancou && !estourou && dragao.segments[0].x <= 0) {
        estourou = true;
        emissor.burst(0, dragao.segments[0].y, mundo, 1, -1);
        aneis.pushRaw(new Float64Array([0, dragao.segments[0].y, mundo, 1.5, 1]));
    }

    const novas = emissor.flush();
    if (novas) particulas.pushRaw(novas);

    /* o instante da capa: cabeca ja' do outro lado, cauda ainda aqui.
       Segura mais alguns passos para o corpo entrar bem no quadro.  */
    if (dragao.segments[0].x < -260 && dragao.segments[SEGMENT_COUNT - 1].x > 60) {
        extra++;
    }

    if (t > 12) break;
}

const mundoFinal = BASE + t * 1000;

console.log("  quadro escolhido: cabeca " + Math.round(dragao.segments[0].x) +
            "   cauda " + Math.round(dragao.segments[SEGMENT_COUNT - 1].x));


/* -----------------------------------------------------
   DESENHA
----------------------------------------------------- */

function desenhar(tela) {

    let perto = Infinity;
    for (let i = 0; i < dragao.segments.length; i += 3) {
        perto = Math.min(perto, Math.abs(dragao.segments[i].x));
    }

    const costura = Math.min(1,
        Math.max(0, 1 - perto / 620) * (0.30 + 0.70 * dragao.energy));

    const ctx = tela.canvas.getContext("2d");

    tela.ambiente.draw(ctx, tela.W, tela.H, mundoFinal, costura * 0.9);

    tela.map.applyTransform(ctx);

    aneis.draw(ctx, tela.map, mundoFinal);
    particulas.draw(ctx, tela.map, mundoFinal);
    DragonRender.draw(ctx, dragao, { time: mundoFinal });

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    SeamFX.glow(ctx, tela.map, tela.W, tela.H, costura, mundoFinal);
    SeamFX.grade(ctx, tela.W, tela.H, mundoFinal, costura);
}

desenhar(monitor);
desenhar(notebook);


const capa = createCanvas(CAPA_W, CAPA_H);
const c = capa.getContext("2d");

/* fundo */
const g = c.createLinearGradient(0, 0, CAPA_W, CAPA_H);
g.addColorStop(0, "#02030a");
g.addColorStop(0.5, "#050b18");
g.addColorStop(1, "#02030a");
c.fillStyle = g;
c.fillRect(0, 0, CAPA_W, CAPA_H);

const halo = c.createRadialGradient(CAPA_W / 2, CAPA_H / 2, 0,
                                    CAPA_W / 2, CAPA_H / 2, CAPA_W * 0.6);
halo.addColorStop(0, "rgba(0,245,255,.10)");
halo.addColorStop(1, "rgba(0,245,255,0)");
c.fillStyle = halo;
c.fillRect(0, 0, CAPA_W, CAPA_H);

/* as duas telas, com o eixo um pouco acima do centro:
   sobra o rodape para o titulo sem deixar o topo vazio */
const eixo = Math.round(CAPA_H * 0.44);
const topoMon = eixo - Math.round(monitor.H / 2);
const topoNot = eixo - Math.round(notebook.H / 2);

const xNot = MARGEM;
const xMon = MARGEM + notebook.W + MOLDURA;

c.drawImage(notebook.canvas, xNot, topoNot);
c.drawImage(monitor.canvas, xMon, topoMon);

c.strokeStyle = "rgba(0,245,255,.20)";
c.lineWidth = 1;
c.strokeRect(xNot + .5, topoNot + .5, notebook.W - 1, notebook.H - 1);
c.strokeRect(xMon + .5, topoMon + .5, monitor.W - 1, monitor.H - 1);

/* legendas */
c.font = "600 15px Arial, sans-serif";
c.fillStyle = "rgba(184,250,255,.5)";

c.textAlign = "left";
c.fillText("NOTEBOOK", xNot, topoNot - 18);

c.textAlign = "right";
c.fillText("MONITOR", xMon + monitor.W, topoMon - 18);

/* titulo */
c.textAlign = "center";
c.font = "300 34px Arial, sans-serif";
c.fillStyle = "rgba(220,250,255,.92)";
c.fillText("um dragão, dois monitores", CAPA_W / 2, CAPA_H - 96);

c.font = "500 14px Arial, sans-serif";
c.fillStyle = "rgba(139,92,246,.85)";
c.fillText("A CABEÇA JÁ ESTÁ NA OUTRA TELA  ·  A CAUDA AINDA NÃO SAIU",
           CAPA_W / 2, CAPA_H - 62);

const saida = path.join(RAIZ, "docs", "capa.png");
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, capa.toBuffer("image/png"));

console.log("  pronto: docs/capa.png  (" +
            (fs.statSync(saida).size / 1024).toFixed(0) + " KB)");
