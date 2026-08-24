/* =====================================================
   DRAGON // DUAS TELAS
   demo/gerar-demo.js  —  gera o GIF demonstrativo

       cd demo && npm install && npm run gerar

   IMPORTANTE: isto NAO e' uma animacao feita a parte.
   O script carrega os modulos REAIS do projeto
   (config.js, world.js, dragon.js, dragon-render.js, fx.js)
   e desenha os DOIS recortes do mundo lado a lado, com a
   moldura fisica no meio — exatamente a mesma matematica
   que as duas janelas usam em tela cheia.

   O que o script substitui e' so' a orquestracao entre as
   janelas (screen.js): aqui uma unica simulacao alimenta os
   dois recortes diretamente, em vez de atravessar o
   BroadcastChannel.
===================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { createCanvas } = require("@napi-rs/canvas");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");


/* -----------------------------------------------------
   1. CARREGA OS MODULOS DO PROJETO
----------------------------------------------------- */

const RAIZ = path.join(__dirname, "..");

const sandbox = {
    console,
    Math,
    Date,
    Number,
    Array,
    Object,
    JSON,
    Float32Array,
    Float64Array,

    /* config.js le a calibracao daqui */
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    }
};

vm.createContext(sandbox);

for (const arquivo of ["js/config.js", "js/world.js", "js/dragon.js",
                       "js/dragon-render.js", "js/fx.js"]) {

    const codigo = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
    vm.runInContext(codigo, sandbox, { filename: arquivo });
}

/* `const` no topo de um script vai para o escopo lexical
   global, nao para o objeto global — igual ao navegador,
   onde `const X` nao vira `window.X`. Os modulos enxergam
   uns aos outros, mas para trazer os simbolos para ca' e'
   preciso avaliar uma expressao dentro do mesmo contexto. */

const { DISPLAY_CONFIG, WorldMap, Dragon, DragonRender,
        ParticleField, ParticleEmitter, RingField, Ambient,
        SeamFX, SEGMENT_COUNT, SEGMENT_REST } =
    vm.runInContext(`({
        DISPLAY_CONFIG, WorldMap, Dragon, DragonRender,
        ParticleField, ParticleEmitter, RingField, Ambient,
        SeamFX, SEGMENT_COUNT, SEGMENT_REST
    })`, sandbox);


/* -----------------------------------------------------
   2. AS DUAS TELAS

   Resolucoes diferentes de proposito: e' o caso real de
   um monitor 16:9 grande ao lado de um notebook menor.
----------------------------------------------------- */

const ESCALA_SAIDA = 0.72;        // reducao final, para o GIF
const FPS = 18;
const DURACAO = 7.6;              // segundos

const MOLDURA = 26;               // vao fisico entre as telas, em px

const TELAS = {
    monitor:  { W: 960, H: 540 },
    notebook: { W: 683, H: 384 }
};

const ALTURA = Math.max(TELAS.monitor.H, TELAS.notebook.H);
const LARGURA = TELAS.notebook.W + MOLDURA + TELAS.monitor.W;


/* a moldura, em unidades do mundo (usa a escala do monitor) */
const escalaMonitor = TELAS.monitor.H / DISPLAY_CONFIG.referenceHeight;

const calibracao = {
    seamGap: Math.round(MOLDURA / escalaMonitor),
    monitor:  { scale: null, offsetY: 0 },
    notebook: { scale: null, offsetY: 0 }
};


function montarTela(papel) {

    const { W, H } = TELAS[papel];

    const map = new WorldMap(papel);
    map.setCalibration(calibracao);
    map.setViewport(W, H, 1);

    return {
        papel, W, H, map,
        fundo: createCanvas(W, H),
        palco: createCanvas(W, H),
        ambiente: new Ambient()
    };
}

const monitor = montarTela("monitor");
const notebook = montarTela("notebook");

console.log("  monitor   mundo [" + Math.round(monitor.map.worldLeft) +
            " .. " + Math.round(monitor.map.worldRight) + "]  escala " +
            monitor.map.scale.toFixed(3));

console.log("  notebook  mundo [" + Math.round(notebook.map.worldLeft) +
            " .. " + Math.round(notebook.map.worldRight) + "]  escala " +
            notebook.map.scale.toFixed(3));


/* -----------------------------------------------------
   3. A CRIATURA  (uma so')
----------------------------------------------------- */

const nasce = {
    x: monitor.map.worldLeft + SEGMENT_COUNT * SEGMENT_REST + 120,
    y: -40
};

const dragao = new Dragon(nasce.x, nasce.y);
dragao.setTarget(nasce.x, nasce.y);

const particulas = new ParticleField(2600);
const emissor = new ParticleEmitter();
const aneis = new RingField(24);

/* os dois "cliques" da demonstracao */

const destino = {                       // um ponto no notebook
    x: notebook.map.toWorldX(notebook.W * 0.40),
    y: notebook.map.toWorldY(notebook.H * 0.54)
};

const regresso = {                      // e a volta, no monitor
    x: monitor.map.toWorldX(monitor.W * 0.62),
    y: monitor.map.toWorldY(monitor.H * 0.42)
};


/* -----------------------------------------------------
   4. ROTEIRO
----------------------------------------------------- */

const T_IDA   = 1.2;              // s: clique no notebook
const T_VOLTA = 4.5;              // s: clique de volta no monitor

let ida = false;
let volta = false;
let ultimoLado = 1;               // +1 monitor, -1 notebook


function encenar(t, dt, tempoMundo) {

    /* antes do primeiro clique: pairando no monitor */
    if (t < T_IDA) {
        dragao.setTarget(
            nasce.x + Math.sin(t * 1.5) * 90,
            nasce.y + Math.cos(t * 1.1) * 60
        );
    }

    /* clique no notebook */
    if (!ida && t >= T_IDA) {
        ida = true;
        dragao.travelTo(destino.x, destino.y);
    }

    /* clique de volta no monitor */
    if (!volta && t >= T_VOLTA) {
        volta = true;
        dragao.travelTo(regresso.x, regresso.y);
    }

    dragao.step(dt, tempoMundo);
    emissor.emit(dragao, tempoMundo, dt);

    /* Estouro e anel NA COSTURA, toda vez que a cabeca
       troca de lado — nos dois sentidos.                */

    const lado = dragao.segments[0].x >= 0 ? 1 : -1;

    if (lado !== ultimoLado) {

        const y = dragao.segments[0].y;

        emissor.burst(0, y, tempoMundo, 1, lado);
        aneis.pushRaw(new Float64Array([0, y, tempoMundo, 1.5, 1]));

        ultimoLado = lado;
    }

    const novas = emissor.flush();
    if (novas) particulas.pushRaw(novas);
}


/* -----------------------------------------------------
   5. DESENHO DE UM RECORTE
----------------------------------------------------- */

function desenharTela(tela, tempoMundo) {

    /* energia da costura: mesma formula do runtime */
    let perto = Infinity;
    for (let i = 0; i < dragao.segments.length; i += 3) {
        perto = Math.min(perto, Math.abs(dragao.segments[i].x));
    }

    const costura = Math.min(1,
        Math.max(0, 1 - perto / 620) * (0.30 + 0.70 * dragao.energy));

    /* fundo */
    const fctx = tela.fundo.getContext("2d");
    tela.ambiente.draw(fctx, tela.W, tela.H, tempoMundo, costura * 0.9);

    /* palco, em coordenadas do mundo */
    const ctx = tela.palco.getContext("2d");

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, tela.W, tela.H);

    tela.map.applyTransform(ctx);

    aneis.draw(ctx, tela.map, tempoMundo);
    particulas.draw(ctx, tela.map, tempoMundo);

    DragonRender.draw(ctx, dragao, { time: tempoMundo });

    /* pos-processamento em espaco de tela */
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    SeamFX.distort(ctx, tela.palco, tela.map, tela.W, tela.H, costura, tempoMundo, 1);
    SeamFX.glow(ctx, tela.map, tela.W, tela.H, costura, tempoMundo);
    SeamFX.grade(ctx, tela.W, tela.H, tempoMundo, costura);
}


/* -----------------------------------------------------
   6. COMPOSICAO DAS DUAS TELAS
----------------------------------------------------- */

const composto = createCanvas(LARGURA, ALTURA);
const cctx = composto.getContext("2d");

const saidaW = Math.round(LARGURA * ESCALA_SAIDA);
const saidaH = Math.round(ALTURA * ESCALA_SAIDA);

const saida = createCanvas(saidaW, saidaH);
const sctx = saida.getContext("2d");


/* onde cada tela fica no quadro composto.
   offsetY 0 alinha o CENTRO VERTICAL das duas.  */
const posMonitor = { x: TELAS.notebook.W + MOLDURA, y: (ALTURA - TELAS.monitor.H) / 2 };
const posNotebook = { x: 0, y: (ALTURA - TELAS.notebook.H) / 2 };


function rotular(texto, x, y, alinhamento) {
    cctx.font = "600 13px Arial, sans-serif";
    cctx.textAlign = alinhamento;
    cctx.fillStyle = "rgba(184,250,255,.55)";
    cctx.fillText(texto, x, y);
}


function compor() {

    /* a moldura fisica: o vao morto entre os monitores */
    cctx.fillStyle = "#000";
    cctx.fillRect(0, 0, LARGURA, ALTURA);

    for (const [tela, pos] of [[notebook, posNotebook], [monitor, posMonitor]]) {
        cctx.drawImage(tela.fundo, pos.x, pos.y);
        cctx.drawImage(tela.palco, pos.x, pos.y);
    }

    /* contorno das telas, para o olho entender que sao duas */
    cctx.strokeStyle = "rgba(0,245,255,.14)";
    cctx.lineWidth = 1;

    for (const [tela, pos] of [[notebook, posNotebook], [monitor, posMonitor]]) {
        cctx.strokeRect(pos.x + .5, pos.y + .5, tela.W - 1, tela.H - 1);
    }

    rotular("TELA 2 . NOTEBOOK (esquerda)",
            posNotebook.x + 14, posNotebook.y + 24, "left");

    rotular("TELA 1 . MONITOR (direita)",
            posMonitor.x + TELAS.monitor.W - 14, posMonitor.y + 24, "right");

    /* reducao final */
    sctx.drawImage(composto, 0, 0, saidaW, saidaH);

    return sctx.getImageData(0, 0, saidaW, saidaH).data;
}


/* -----------------------------------------------------
   7. GERA OS QUADROS
----------------------------------------------------- */

const TOTAL = Math.round(DURACAO * FPS);
const DT = 1 / FPS;
const BASE = 1000000;             // relogio do mundo, em ms

console.log("\n  gerando " + TOTAL + " quadros de " + saidaW + "x" + saidaH + "...");

/* Quadros-chave em PNG.
   O da travessia nao e' um numero chutado: capturamos o
   primeiro quadro em que o corpo esta' NAS DUAS TELAS. */

const PARADAS = { 12: 'antes', 78: 'chegada' };

let pegouTravessia = false;

const quadros = [];

for (let i = 0; i < TOTAL; i++) {

    const t = i * DT;
    const tempoMundo = BASE + t * 1000;

    /* passos menores que o quadro: a fisica da corrente fica
       instavel com dt grande, e o resultado e' o mesmo        */
    const SUB = 3;
    for (let k = 0; k < SUB; k++) {
        encenar(t + (k * DT) / SUB, DT / SUB, tempoMundo + (k * DT * 1000) / SUB);
    }

    desenharTela(monitor, tempoMundo);
    desenharTela(notebook, tempoMundo);

    quadros.push(compor());

    /* alguns quadros soltos, para conferir a qualidade e
       servir de capa no README                            */
    let nome = PARADAS[i];

    if (!pegouTravessia &&
        dragao.segments[0].x < 0 &&
        dragao.segments[SEGMENT_COUNT - 1].x > 0) {
        nome = 'atravessando';
        pegouTravessia = true;
    }

    if (nome) {
        const png = path.join(__dirname, '..', 'docs', nome + '.png');
        fs.mkdirSync(path.dirname(png), { recursive: true });
        fs.writeFileSync(png, saida.toBuffer('image/png'));
        console.log('  -> docs/' + nome + '.png  (quadro ' + i + ')');
    }

    if (i % 20 === 0) {
        process.stdout.write("  " + i + "/" + TOTAL +
            "   cabeca vx " + Math.round(dragao.segments[0].x) +
            "   modo " + dragao.mode + "\n");
    }
}


/* -----------------------------------------------------
   8. CODIFICA O GIF

   Paleta global amostrada ao longo da animacao: mantem as
   cores estaveis entre os quadros e o arquivo pequeno.
----------------------------------------------------- */

console.log("\n  montando a paleta...");

const amostra = [];
for (let i = 0; i < quadros.length; i += Math.ceil(quadros.length / 12)) {
    const q = quadros[i];
    for (let p = 0; p < q.length; p += 4 * 7) {
        amostra.push(q[p], q[p + 1], q[p + 2], 255);
    }
}

const paleta = quantize(new Uint8ClampedArray(amostra), 256, { format: "rgb444" });

console.log("  paleta com " + paleta.length + " cores");
console.log("  codificando...");

const gif = GIFEncoder();

for (let i = 0; i < quadros.length; i++) {

    const indexado = applyPalette(quadros[i], paleta, "rgb444");

    gif.writeFrame(indexado, saidaW, saidaH, {
        palette: i === 0 ? paleta : undefined,
        delay: Math.round(1000 / FPS),
        repeat: 0
    });
}

gif.finish();

const destinoArquivo = path.join(__dirname, "..", "docs", "travessia.gif");
fs.mkdirSync(path.dirname(destinoArquivo), { recursive: true });
fs.writeFileSync(destinoArquivo, Buffer.from(gif.bytes()));

const kb = (fs.statSync(destinoArquivo).size / 1024).toFixed(0);

console.log("\n  pronto: docs/travessia.gif  (" + kb + " KB)");
