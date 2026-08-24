/* =====================================================
   DRAGON // DUAS TELAS
   config.js  —  configuracao + calibracao das telas
   =====================================================

   O mundo e' UM SO. As duas telas sao duas janelas
   olhando para o mesmo espaco virtual.

   Eixo X virtual (vpx = virtual pixels):

        NOTEBOOK (esquerda)          MONITOR (direita)
   [ -gap/2 - Wn ........ -gap/2 ] | [ +gap/2 ........ +gap/2 + Wm ]
                                   ^
                              COSTURA  vx = 0
                        (a borda fisica entre os monitores)

   Eixo Y virtual: vy = 0 e' o centro vertical de cada
   tela (ajustavel pela calibracao offsetY).
===================================================== */


/* -----------------------------------------------------
   CONFIGURACAO PRINCIPAL
   Troque monitorPosition / notebookPosition para inverter
   qual tela esta a esquerda e qual esta a direita.
----------------------------------------------------- */

const DISPLAY_CONFIG = {

    /* Posicao fisica de cada tela */
    monitorPosition: "right",   // "right" | "left"
    notebookPosition: "left",   // "right" | "left"

    /* Duracao (ms) da aceleracao ate a costura */
    transitionDuration: 1200,

    /* Escala global do dragao */
    dragonScale: 1,


    /* ---- SINCRONIZACAO ---- */

    channelName: "dragon-bridge",   // nome do BroadcastChannel

    streamHz: 60,        // frames de estado por segundo
    renderDelay: 26,     // ms de buffer; AS DUAS telas desenham
                         // o mesmo instante do mundo (anti-descolamento)

    latencyCompensation: true,


    /* ---- GEOMETRIA / RESOLUCAO ---- */

    /* Como resolver a diferenca de resolucao entre as telas:
       "height" -> o dragao ocupa a MESMA fracao da altura em
                   cada tela (recomendado, resolve 1080p x 768p)
       "auto"   -> usa devicePixelRatio detectado por tela
       "manual" -> usa somente calibracao.<tela>.scale        */
    scaleMode: "height",

    referenceHeight: 900,   // altura de referencia para scaleMode "height"

    /* Espaco morto entre as telas (moldura/bezel), em vpx.
       Aumente se as bordas fisicas forem grossas.            */
    seamGap: 0,


    /* ---- VOO ---- */

    cruiseSpeed: 760,    // vpx/s de cruzeiro rumo a costura
    speedBoost: 1.45,    // "aumenta levemente de velocidade"
    weaveAmplitude: 70,  // ondulacao vertical durante a travessia

    /* Onde ele para depois de atravessar (fracao da tela destino) */
    landing: { x: 0.42, y: 0.50 },

    /* Quando avisar a outra tela:
       "head" -> no instante em que a CABECA cruza a borda
                 (a cauda ainda aparece na tela de origem =
                  continuidade fisica real, recomendado)
       "full" -> so quando o ultimo segmento sai              */
    exitPolicy: "head",


    /* ---- DEBUG ---- */
    debug: false
};


/* -----------------------------------------------------
   CALIBRACAO  (persistida em localStorage, compartilhada
   entre as duas janelas pelo canal)
----------------------------------------------------- */

const CALIBRATION_KEY = "dragon.calibration.v2";

function defaultCalibration() {

    return {
        seamGap: DISPLAY_CONFIG.seamGap,

        monitor: {
            scale: null,    // null = derivado do scaleMode
            offsetY: 0      // vpx: sobe/desce a janela no mundo
        },

        notebook: {
            scale: null,
            offsetY: 0
        }
    };
}


function loadCalibration() {

    try {
        const raw = localStorage.getItem(CALIBRATION_KEY);
        if (!raw) return defaultCalibration();

        const parsed = JSON.parse(raw);
        const base = defaultCalibration();

        return {
            seamGap: Number.isFinite(parsed.seamGap) ? parsed.seamGap : base.seamGap,
            monitor: Object.assign(base.monitor, parsed.monitor || {}),
            notebook: Object.assign(base.notebook, parsed.notebook || {})
        };

    } catch (e) {
        return defaultCalibration();
    }
}


function saveCalibration(cal) {

    try {
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify(cal));
    } catch (e) { /* modo privado: ignora */ }
}


/* -----------------------------------------------------
   PALETA
----------------------------------------------------- */

const PALETTE = {
    cyan:   "#00f5ff",
    blue:   "#2477ff",
    purple: "#8b5cf6",
    ice:    "#b8faff",
    deep:   "#02030a"
};


/* -----------------------------------------------------
   OVERRIDES vindos do launcher (index.html).
   Ficam em localStorage para que monitor.html e
   notebook.html carreguem exatamente a mesma configuracao.
----------------------------------------------------- */

const CONFIG_KEY = "dragon.config.v1";

(function applyStoredConfig() {

    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) Object.assign(DISPLAY_CONFIG, JSON.parse(raw));
    } catch (e) { /* ignora */ }
})();


function saveConfigOverrides(partial) {

    Object.assign(DISPLAY_CONFIG, partial);

    const keep = [
        "monitorPosition", "notebookPosition",
        "transitionDuration", "dragonScale",
        "scaleMode", "referenceHeight",
        "cruiseSpeed", "speedBoost", "exitPolicy",
        "streamHz", "renderDelay", "debug"
    ];

    const out = {};
    for (const k of keep) out[k] = DISPLAY_CONFIG[k];

    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(out));
    } catch (e) { /* ignora */ }

    return out;
}
