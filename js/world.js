/* =====================================================
   DRAGON // DUAS TELAS
   world.js  —  mapeamento MUNDO VIRTUAL  <->  TELA FISICA

   Cada janela e' um recorte do mesmo mundo.
   A costura (borda fisica entre os monitores) e' vx = 0.
===================================================== */


class WorldMap {

    constructor(role) {

        this.role = role;                 // "monitor" | "notebook"
        this.cal = loadCalibration();

        this.W = 1;                       // largura CSS da janela
        this.H = 1;
        this.dpr = 1;

        this.recompute();
    }


    /* Qual lado fisico esta esta tela? */
    get side() {
        return this.role === "monitor"
            ? DISPLAY_CONFIG.monitorPosition
            : DISPLAY_CONFIG.notebookPosition;
    }


    setViewport(W, H, dpr) {
        /* janela minimizada / aba oculta reporta 0:
           sem esta trava a escala zeraria e todas as
           coordenadas do mundo virariam NaN            */
        this.W = Math.max(1, W || 0);
        this.H = Math.max(1, H || 0);
        this.dpr = dpr || 1;
        this.recompute();
    }


    setCalibration(cal) {
        this.cal = cal;
        this.recompute();
    }


    /* -------------------------------------------------
       ESCALA  —  aqui mora a solucao para a diferenca
       de resolucao entre notebook e monitor.
    ------------------------------------------------- */

    recompute() {

        const mine = this.cal[this.role] || { scale: null, offsetY: 0 };

        let s;

        if (DISPLAY_CONFIG.scaleMode === "manual") {
            s = mine.scale || 1;

        } else if (DISPLAY_CONFIG.scaleMode === "auto") {
            /* densidade de pixels: telas mais densas recebem
               mais CSS px por pixel virtual                     */
            s = (mine.scale || 1) * (this.dpr / 1);

        } else {
            /* "height": o dragao ocupa a MESMA fracao da altura
               em qualquer tela. 1080p e 768p ficam coerentes.   */
            s = (this.H / DISPLAY_CONFIG.referenceHeight);
            if (mine.scale) s *= mine.scale;
        }

        this.scale = Math.max(0.05, s * DISPLAY_CONFIG.dragonScale);

        this.offsetY = mine.offsetY || 0;
        this.gap = this.cal.seamGap || 0;

        /* Origem: onde fica vx=0, vy=0 em pixels locais */
        if (this.side === "left") {
            /* a costura esta na borda DIREITA desta tela */
            this.originX = this.W + (this.gap / 2) * this.scale;
        } else {
            /* a costura esta na borda ESQUERDA desta tela */
            this.originX = -(this.gap / 2) * this.scale;
        }

        this.originY = this.H / 2 - this.offsetY * this.scale;

        /* Faixa do mundo visivel nesta janela */
        this.worldLeft  = this.toWorldX(0);
        this.worldRight = this.toWorldX(this.W);
        this.worldTop    = this.toWorldY(0);
        this.worldBottom = this.toWorldY(this.H);
    }


    /* mundo -> local */
    toLocalX(vx) { return this.originX + vx * this.scale; }
    toLocalY(vy) { return this.originY + vy * this.scale; }

    /* local -> mundo */
    toWorldX(lx) { return (lx - this.originX) / this.scale; }
    toWorldY(ly) { return (ly - this.originY) / this.scale; }


    /* Aplica a transformacao: depois disto pode-se desenhar
       usando coordenadas do MUNDO diretamente.               */
    applyTransform(ctx) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.translate(this.originX, this.originY);
        ctx.scale(this.scale, this.scale);
    }


    /* Esta coordenada do mundo esta dentro desta janela? */
    isVisible(vx, vy, margin) {
        const m = margin || 0;
        return vx > this.worldLeft - m && vx < this.worldRight + m &&
               vy > this.worldTop - m && vy < this.worldBottom + m;
    }


    /* Direcao da travessia a partir desta tela:
       -1 = o dragao sai pela ESQUERDA, +1 = pela DIREITA     */
    get exitDirection() {
        return this.side === "right" ? -1 : +1;
    }


    /* Ponto de pouso desta tela, em coordenadas do mundo */
    landingPoint() {
        return {
            x: this.toWorldX(this.W * DISPLAY_CONFIG.landing.x),
            y: this.toWorldY(this.H * DISPLAY_CONFIG.landing.y)
        };
    }


    /* Centro da janela no mundo */
    center() {
        return {
            x: this.toWorldX(this.W / 2),
            y: this.toWorldY(this.H / 2)
        };
    }


    describe() {
        return this.role.toUpperCase() +
               "  " + this.side +
               "  " + this.W + "x" + this.H +
               "  dpr " + this.dpr.toFixed(2) +
               "  scale " + this.scale.toFixed(3) +
               "  vx [" + Math.round(this.worldLeft) +
               " .. " + Math.round(this.worldRight) + "]";
    }
}
