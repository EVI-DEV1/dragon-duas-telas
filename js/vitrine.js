/* =====================================================
   DRAGON // DUAS TELAS
   vitrine.js  —  a previa que roda numa tela so'

   Quem abre o link publicado quase sempre tem UM monitor.
   Sem isto, a primeira coisa que a pessoa ve' e' um painel
   de configuracao — e nenhum dragao.

   Aqui as duas telas viram dois canvas lado a lado, com a
   moldura entre eles, alimentados pela MESMA simulacao e
   pelo MESMO renderizador que as janelas de verdade usam.
   Nao e' um video nem uma animacao a parte.

   Clicar em qualquer um dos dois lados chama o dragao —
   exatamente como na experiencia completa.
===================================================== */


const Vitrine = {

    MOLDURA: 14,          // vao entre as telas, em px de tela
    PROPORCAO: 9 / 16,
    FATIA_MONITOR: 0.585, // quanto da largura cabe ao monitor


    iniciar(container) {

        this.container = container;
        if (!container) return;

        this.telas = {
            notebook: this._montar("notebook"),
            monitor: this._montar("monitor")
        };

        /* ordem fisica: notebook a esquerda, monitor a direita */
        container.appendChild(this.telas.notebook.wrap);
        container.appendChild(this.telas.monitor.wrap);

        this.particulas = new ParticleField(1400);
        this.emissor = new ParticleEmitter();
        this.aneis = new RingField(16);

        this.ultimoLado = 1;
        this.proximoSalto = 0;
        this.tempoAnterior = 0;
        this.visivel = true;

        this.medir();

        window.addEventListener("resize", () => this.medir());

        /* nasce no monitor */
        const m = this.telas.monitor.map;
        const berco = {
            x: m.worldLeft + SEGMENT_COUNT * SEGMENT_REST + 100,
            y: 0
        };

        this.dragao = new Dragon(berco.x, berco.y);
        this.dragao.setTarget(berco.x, berco.y);

        this._ligarCliques();
        this._pausarQuandoForaDaTela();

        requestAnimationFrame((t) => this.quadro(t));
    },


    _montar(papel) {

        const wrap = document.createElement("div");
        wrap.className = "vitrine-tela " + papel;

        const canvas = document.createElement("canvas");
        wrap.appendChild(canvas);

        const marca = document.createElement("span");
        marca.className = "vitrine-marca";
        marca.textContent = papel === "monitor"
            ? "MONITOR . direita"
            : "NOTEBOOK . esquerda";
        wrap.appendChild(marca);

        return {
            papel, wrap, canvas,
            ctx: canvas.getContext("2d"),
            map: new WorldMap(papel),
            ambiente: new Ambient()
        };
    },


    /* -------------------------------------------------
       DIMENSOES  —  as duas telas dividem a largura
    ------------------------------------------------- */

    medir() {

        const total = this.container.clientWidth;
        if (!total) return;

        const util = total - this.MOLDURA;

        const larguras = {
            monitor: Math.round(util * this.FATIA_MONITOR),
            notebook: Math.round(util * (1 - this.FATIA_MONITOR))
        };

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let maiorAltura = 0;

        for (const papel of ["notebook", "monitor"]) {

            const tela = this.telas[papel];

            const W = larguras[papel];
            const H = Math.round(W * this.PROPORCAO);

            tela.W = W;
            tela.H = H;
            tela.dpr = dpr;

            tela.canvas.width = Math.round(W * dpr);
            tela.canvas.height = Math.round(H * dpr);
            tela.canvas.style.width = W + "px";
            tela.canvas.style.height = H + "px";

            tela.map.setViewport(W, H, dpr);

            maiorAltura = Math.max(maiorAltura, H);
        }

        void maiorAltura;   // o flex ja' dimensiona pelo canvas

        /* a moldura em unidades do mundo, para que o vao
           desenhado e o vao do mundo sejam o mesmo vao     */
        const escalaMonitor = this.telas.monitor.map.scale || 1;

        const cal = {
            seamGap: Math.round(this.MOLDURA / escalaMonitor),
            monitor: { scale: null, offsetY: 0 },
            notebook: { scale: null, offsetY: 0 }
        };

        for (const papel of ["notebook", "monitor"]) {
            this.telas[papel].map.setCalibration(cal);
        }
    },


    /* -------------------------------------------------
       INTERACAO  —  o clique real
    ------------------------------------------------- */

    _ligarCliques() {

        for (const papel of ["notebook", "monitor"]) {

            const tela = this.telas[papel];

            tela.canvas.addEventListener("click", (ev) => {

                const r = tela.canvas.getBoundingClientRect();

                this.dragao.travelTo(
                    tela.map.toWorldX(ev.clientX - r.left),
                    tela.map.toWorldY(ev.clientY - r.top)
                );

                /* adia o proximo salto automatico: quem manda
                   agora e' a pessoa                           */
                this.proximoSalto = this.tempoAnterior + 7000;
            });
        }
    },


    _pausarQuandoForaDaTela() {

        if (!window.IntersectionObserver) return;

        const obs = new IntersectionObserver((entradas) => {
            this.visivel = entradas[0].isIntersecting;
        }, { threshold: 0.05 });

        obs.observe(this.container);
    },


    /* -------------------------------------------------
       ROTEIRO AUTOMATICO
    ------------------------------------------------- */

    _saltar(agora) {

        /* vai para um ponto aleatorio da tela oposta */
        const destinoPapel = this.dragao.segments[0].x >= 0 ? "notebook" : "monitor";
        const tela = this.telas[destinoPapel];

        this.dragao.travelTo(
            tela.map.toWorldX(tela.W * (0.3 + Math.random() * 0.4)),
            tela.map.toWorldY(tela.H * (0.3 + Math.random() * 0.4))
        );

        this.proximoSalto = agora + 4200 + Math.random() * 1800;
    },


    /* -------------------------------------------------
       QUADRO
    ------------------------------------------------- */

    quadro(t) {

        requestAnimationFrame((n) => this.quadro(n));

        if (!this.visivel || !this.container.clientWidth) {
            this.tempoAnterior = t;
            return;
        }

        let dt = (t - this.tempoAnterior) / 1000;
        this.tempoAnterior = t;

        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.05);

        if (!this.proximoSalto) this.proximoSalto = t + 1800;
        if (t >= this.proximoSalto) this._saltar(t);

        this.dragao.step(dt, t);
        this.emissor.emit(this.dragao, t, dt);

        /* estouro e anel na costura, nos dois sentidos */
        const lado = this.dragao.segments[0].x >= 0 ? 1 : -1;

        if (lado !== this.ultimoLado) {
            const y = this.dragao.segments[0].y;
            this.emissor.burst(0, y, t, 0.5, lado);
            this.aneis.pushRaw(new Float64Array([0, y, t, 1.3, 0.6]));
            this.ultimoLado = lado;
        }

        const novas = this.emissor.flush();
        if (novas) this.particulas.pushRaw(novas);

        for (const papel of ["notebook", "monitor"]) {
            this._desenhar(this.telas[papel], t);
        }
    },


    _desenhar(tela, t) {

        let perto = Infinity;
        for (let i = 0; i < this.dragao.segments.length; i += 4) {
            perto = Math.min(perto, Math.abs(this.dragao.segments[i].x));
        }

        const costura = Math.min(1,
            Math.max(0, 1 - perto / 620) * (0.30 + 0.70 * this.dragao.energy));

        const ctx = tela.ctx;

        ctx.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);
        ctx.clearRect(0, 0, tela.W, tela.H);

        tela.ambiente.draw(ctx, tela.W, tela.H, t, costura * 0.8);

        tela.map.applyTransform(ctx);

        this.aneis.draw(ctx, tela.map, t);
        this.particulas.draw(ctx, tela.map, t);

        DragonRender.draw(ctx, this.dragao, { time: t });

        ctx.setTransform(tela.dpr, 0, 0, tela.dpr, 0, 0);

        SeamFX.glow(ctx, tela.map, tela.W, tela.H, costura, t);
        SeamFX.grade(ctx, tela.W, tela.H, t, costura * 0.6);
    }
};
