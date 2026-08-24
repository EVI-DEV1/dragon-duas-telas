/* =====================================================
   DRAGON // DUAS TELAS
   screen.js  —  runtime compartilhado pelas duas janelas

   monitor.html e notebook.html carregam ESTE mesmo runtime,
   mudando apenas o papel (role). Isso e' proposital:
   duas copias de codigo produziriam duas animacoes
   independentes, que e' exatamente o que nao queremos.

   ---------------------------------------------------
   MODELO
   ---------------------------------------------------
   . existe UM mundo virtual atravessando as duas telas
   . existe UM dragao, simulado por UMA janela (o "dono")
   . o dono transmite o CORPO INTEIRO a 60Hz
   . a outra janela NAO simula: ela desenha o mesmo corpo
   . as duas desenham o mesmo instante do mundo
     (worldNow - renderDelay), entao a metade que sai e a
     metade que entra estao sempre alinhadas
   . quando a cauda termina de passar, o dominio muda de
     janela (DRAGON_HANDOFF) sem cortar o movimento
===================================================== */


const DragonScreen = {

    /* =============================================
       BOOT
    ============================================= */

    start(role) {

        this.role = role;
        this.peerRole = role === "monitor" ? "notebook" : "monitor";

        this.map = new WorldMap(role);
        this.bridge = new Bridge(role);

        this.ambientCanvas = document.getElementById("ambient");
        this.stageCanvas = document.getElementById("stage");

        this.actx = this.ambientCanvas.getContext("2d");
        this.sctx = this.stageCanvas.getContext("2d");

        this.ambient = new Ambient();
        this.particles = new ParticleField(1800);
        this.rings = new RingField(24);
        this.emitter = new ParticleEmitter();

        this.history = [];          // [{ t, buf }]
        this.maxHistory = 140;

        this.isOwner = (role === "monitor");   // monitor comeca dono
        this.state = "idle";                   // idle | flight | crossing | arrived
        this.flash = 0;
        this.lastStep = worldNow();
        this.lastStream = 0;

        this.exitFired = false;
        this.handoffFired = false;
        this.enterAcked = false;
        this.crossingArmed = false;
        this.destination = null;

        this.calibrating = false;
        this.cal = loadCalibration();
        this.map.setCalibration(this.cal);

        this.resize();
        window.addEventListener("resize", () => this.resize());

        const born = this.birthPoint();

        this.dragon = new Dragon(born.x, born.y);
        this.dragon.setTarget(born.x, born.y);

        this.wireBridge();
        this.wireInput();
        this.wireUI();

        this.loop();
    },


    /* =============================================
       VIEWPORT
    ============================================= */

    resize() {

        const W = window.innerWidth;
        const H = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (const c of [this.ambientCanvas, this.stageCanvas]) {
            c.width = Math.round(W * dpr);
            c.height = Math.round(H * dpr);
            c.style.width = W + "px";
            c.style.height = H + "px";
        }

        this.W = W;
        this.H = H;
        this.dpr = dpr;

        this.map.setViewport(W, H, dpr);

        /* Geometria real do desktop.
           screen.availLeft / availTop dizem ONDE este monitor
           esta no desktop virtual do Windows — e' com isso que
           o launcher calibra as duas telas automaticamente.    */

        const sl = (typeof screen.availLeft === "number")
            ? screen.availLeft : window.screenX;

        const st = (typeof screen.availTop === "number")
            ? screen.availTop : window.screenY;

        this.bridge.setGeometry({
            role: this.role,
            side: this.map.side,
            w: W, h: H, dpr: dpr,
            winX: window.screenX,
            winY: window.screenY,
            screenLeft: sl,
            screenTop: st,
            availW: screen.availWidth,
            availH: screen.availHeight,
            screenW: screen.width,
            screenH: screen.height
        });
    },


    /* Onde o dragao nasce.

       O corpo nasce esticado para tras (-x), entao a cabeca
       precisa estar pelo menos um comprimento de corpo a
       frente da borda: senao a cauda ja' apareceria na outra
       tela antes de o usuario clicar em ENTRAR.              */

    birthPoint() {

        if (this.role !== "monitor") return { x: 0, y: 0 };

        const c = this.map.center();
        const bodyLen = SEGMENT_COUNT * SEGMENT_REST;

        const min = this.map.worldLeft + bodyLen + 90;
        const max = this.map.worldRight - 60;

        return { x: Math.min(Math.max(c.x, min), Math.max(min, max)), y: c.y };
    },


    /* =============================================
       SINCRONIZACAO
    ============================================= */

    wireBridge() {

        const b = this.bridge;

        /* ---------- estado do corpo ---------- */

        b.on("DRAGON_SYNC", (p, msg) => {

            if (this.isOwner) return;          // dono ignora eco

            this.pushHistory(msg.t, p.buf);

            if (p.particles) this.particles.pushRaw(p.particles);
            if (p.rings) this.rings.pushRaw(p.rings);

            if (p.state) this.state = p.state;
        });


        /* ---------- o dragao saiu da tela de origem ---------- */

        b.on("DRAGON_EXIT", (p, msg) => {

            /* Isto NAO cria um dragao aqui.
               O corpo ja' esta chegando pelo stream.
               O evento serve para: acender a costura,
               responder o ACK e assumir o estado.        */

            this.state = "crossing";
            this.flash = 1;

            if (!this.enterAcked) {
                this.enterAcked = true;

                b.send("DRAGON_ENTER", {
                    type: "DRAGON_ENTER",
                    from: this.role,
                    matchedTimestamp: p.timestamp,
                    timestamp: worldNow()
                });
            }

            this.showPanel("intro", false);
            this.setStatus("TRAVESSIA EM CURSO");
        });


        b.on("DRAGON_ENTER", () => {
            this.setStatus("RECEBIDO PELA OUTRA TELA");
        });


        /* ---------- troca de dominio ---------- */

        b.on("DRAGON_HANDOFF", (p, msg) => {

            if (p.owner !== this.role) {
                /* eu perdi o dominio */
                this.isOwner = false;
                return;
            }

            /* eu assumo: adoto o corpo EXATO e continuo
               o mesmo movimento, sem recriar nada        */

            const pose = decodePose(p.buf);

            this.dragon.adopt(pose);
            this.dragon.vx = p.velocityX;
            this.dragon.vy = p.velocityY;
            this.dragon.flightT = p.flightT || 0;
            this.dragon.dir = p.dir;

            if (p.dest) {
                /* continua rumo ao ponto clicado */
                this.destination = p.dest;
                this.dragon.dest = p.dest;
                this.dragon.mode = "travel";
            } else {
                /* veio pelo botao ENTRAR: pousa no ponto padrao */
                this.destination = null;
                this.dragon.mode = "flight";
            }

            /* sincroniza a base fisica da corrente */
            for (const s of this.dragon.segments) {
                s.bx = s.x;
                s.by = s.y;
            }

            this.isOwner = true;
            this.crossingArmed = false;
            this.state = "arriving";
            this.lastStep = worldNow();

            this.setStatus("DRAGAO SOB CONTROLE DESTA TELA");
        });


        /* ---------- ponteiro compartilhado ---------- */

        /* clique vindo da OUTRA tela */
        b.on("SUMMON", (p) => {
            if (this.isOwner) this.beginTravel(p.x, p.y);
        });


        b.on("POINTER", (p) => {
            if (this.isOwner && this.dragon.mode === "follow") {
                this.dragon.setTarget(p.x, p.y);
            }
        });


        /* ---------- calibracao ---------- */

        b.on("CALIBRATION", (p) => {
            this.cal = p.cal;
            saveCalibration(this.cal);
            this.map.setCalibration(this.cal);
            this.refreshCalibrationUI();
        });


        b.on("CONFIG", (p) => {
            Object.assign(DISPLAY_CONFIG, p.config || {});
            this.map.recompute();
        });


        /* ---------- reinicio ---------- */

        b.on("RESET", () => this.applyReset());


        /* lancamento remoto: o botao unico do painel.
           So' quem esta' com o dragao obedece.        */

        b.on("LAUNCH_REQUEST", (p) => {

            /* A contagem roda NAS DUAS TELAS, a partir do
               relogio compartilhado — nao no painel, que fica
               escondido atras das janelas em tela cheia.      */

            if (p && p.at) {
                this.startCountdown(p.at);
            } else if (this.isOwner) {
                this.requestLaunch();
            }
        });


        b.on("SEQUENCE_START", () => {
            this.state = "flight";
            this.setStatus("DRAGAO A CAMINHO");
            this.showPanel("intro", false);
        });
    },


    pushHistory(t, buf) {

        this.history.push({ t: t, buf: buf });

        if (this.history.length > this.maxHistory) {
            this.history.splice(0, this.history.length - this.maxHistory);
        }
    },


    /* =============================================
       ENTRADA DO USUARIO
    ============================================= */

    wireInput() {

        /* -------------------------------------------------
           CLIQUE = "vem para ca'"

           Funciona nas DUAS telas. O ponto clicado e'
           convertido para coordenadas do MUNDO, entao clicar
           no notebook manda o dragao atravessar de volta sem
           nenhum codigo especial de direcao.
        ------------------------------------------------- */

        window.addEventListener("click", (ev) => {

            /* Nao rouba o clique da interface: clicar dentro de
               um cartao mandaria o dragao voar para tras dele.  */
            if (ev.target.closest(
                "button, input, select, label, textarea, .panel, .calibration"
            )) return;

            const x = this.map.toWorldX(ev.clientX);
            const y = this.map.toWorldY(ev.clientY);

            this.summon(x, y);
        });


        window.addEventListener("mousemove", (ev) => {

            const x = this.map.toWorldX(ev.clientX);
            const y = this.map.toWorldY(ev.clientY);

            if (this.isOwner) {
                if (this.dragon.mode === "follow") this.dragon.setTarget(x, y);
            } else {
                this.bridge.send("POINTER", { x: x, y: y });
            }
        });


        window.addEventListener("keydown", (ev) => {

            const k = ev.key.toLowerCase();

            if (k === "c") this.toggleCalibration();
            if (k === "escape") this.closeCalibration();
            if (k === "d") { DISPLAY_CONFIG.debug = !DISPLAY_CONFIG.debug; }
            if (k === "r") this.requestReset();
            if (k === "f") this.toggleFullscreen();

            if (k === "t" || k === " " || k === "enter") {
                ev.preventDefault();
                this.requestLaunch();
            }

            if (this.calibrating) {
                const step = ev.shiftKey ? 20 : 4;
                if (k === "arrowup")   this.nudge("offsetY", -step);
                if (k === "arrowdown") this.nudge("offsetY",  step);
                if (k === "arrowleft")  this.nudge("seamGap", -step);
                if (k === "arrowright") this.nudge("seamGap",  step);
                if (k === "+" || k === "=") this.nudge("scale",  0.01);
                if (k === "-" || k === "_") this.nudge("scale", -0.01);
            }
        });
    },


    wireUI() {

        const enter = document.getElementById("enterButton");
        if (enter) enter.addEventListener("click", () => this.requestLaunch());

        const ret = document.getElementById("returnButton");
        if (ret) ret.addEventListener("click", () => this.requestLaunch());

        const rst = document.getElementById("resetButton");
        if (rst) rst.addEventListener("click", () => this.requestReset());

        const fs = document.getElementById("fullscreenButton");
        if (fs) fs.addEventListener("click", () => this.toggleFullscreen());

        const calBtn = document.getElementById("calibrateButton");
        if (calBtn) calBtn.addEventListener("click", () => this.toggleCalibration());

        /* o X do painel. Sem ele, quando o painel de entrada
           some (o dragao comecou a se mover), o botao CALIBRAR
           some junto e so' restava a tecla C — que ninguem
           adivinha.                                            */
        const calClose = document.getElementById("calClose");
        if (calClose) calClose.addEventListener("click", () => this.closeCalibration());

        this.bindCalibrationControls();
        this.refreshCalibrationUI();
    },


    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    },


    /* =============================================
       LANCAR A TRAVESSIA
    ============================================= */

    /* =============================================
       CHAMAR O DRAGAO ATE' UM PONTO

       Quem nao tem o dominio so' pede; quem tem executa.
       Se o ponto estiver do outro lado da costura, a
       travessia inteira (EXIT / ENTER / HANDOFF) acontece
       sozinha — e' a mesma mecanica do botao ENTRAR.
    ============================================= */

    summon(wx, wy) {

        if (!this.isOwner) {
            this.bridge.send("SUMMON", { x: wx, y: wy });
            return;
        }

        this.beginTravel(wx, wy);
    },


    beginTravel(wx, wy) {

        const head = this.dragon.segments[0];

        /* o alvo esta' do outro lado da borda fisica? */
        const atravessa = (head.x > 0 && wx < 0) || (head.x < 0 && wx > 0);

        this.exitFired = false;
        this.handoffFired = false;
        this.enterAcked = false;
        this.crossingArmed = atravessa;

        this.destination = { x: wx, y: wy };
        this.dragon.travelTo(wx, wy);

        this.state = atravessa ? "flight" : "moving";

        this.showPanel("intro", false);
        this.showPanel("arrival", false);

        this.setStatus(atravessa
            ? "ATRAVESSANDO PARA A OUTRA TELA"
            : "INDO ATE' O PONTO");

        this.bridge.send("SEQUENCE_START", { timestamp: worldNow() });
    },


    markArrived(atravessou) {

        this.state = "arrived";

        if (atravessou) {
            this.showPanel("intro", false);
            this.showPanel("arrival", true);
        }

        this.setStatus(atravessou
            ? "CHEGADA CONFIRMADA"
            : "NO PONTO . CLIQUE EM QUALQUER TELA");
    },


    requestLaunch() {

        if (!this.isOwner) return;                       // so' quem tem o dragao
        if (this.dragon.mode === "flight") return;

        this.exitFired = false;
        this.handoffFired = false;
        this.enterAcked = false;
        this.crossingArmed = true;
        this.destination = null;      // rota direcional, sem ponto alvo

        this.dragon.launch(this.map.exitDirection);

        this.state = "flight";
        this.showPanel("intro", false);
        this.showPanel("arrival", false);
        this.setStatus("DRAGAO A CAMINHO DA BORDA");

        this.bridge.send("SEQUENCE_START", { timestamp: worldNow() });
    },


    /* =============================================
       CONTAGEM REGRESSIVA

       As duas telas contam a partir do MESMO instante do
       relogio compartilhado, entao os numeros trocam juntos.
       Quem manda a mensagem so' informa o horario do disparo.
    ============================================= */

    startCountdown(at) {

        this.countdownAt = at;
        this.countdownShown = null;

        this.showPanel("intro", false);
        this.showPanel("arrival", false);

        /* a moldura pulsa: e' para la' que o olho tem que ir */
        const edge = document.getElementById("seamEdge");
        if (edge) edge.classList.add("alert");

        this.setStatus(this.isOwner
            ? "PREPARANDO A PARTIDA"
            : "PREPARE-SE: ELE VEM PELA BORDA");
    },


    updateCountdown(now) {

        const el = document.getElementById("countdown");
        if (!el || !this.countdownAt) return;

        const restam = this.countdownAt - now;

        if (restam <= 0) {

            this.countdownAt = null;
            el.classList.add("hidden");

            const edge = document.getElementById("seamEdge");
            if (edge) edge.classList.remove("alert");

            if (this.isOwner) this.requestLaunch();
            return;
        }

        const n = Math.ceil(restam / 1000);

        if (n === this.countdownShown) return;

        this.countdownShown = n;

        el.classList.remove("hidden");

        const num = el.querySelector(".n");
        const txt = el.querySelector(".t");

        num.textContent = n;

        txt.textContent = this.isOwner
            ? "ELE PARTE DESTA TELA"
            : "ELE CHEGA POR ESTA BORDA";

        /* reinicia a animacao do numero a cada segundo */
        num.style.animation = "none";
        void num.offsetWidth;
        num.style.animation = "";
    },


    requestReset() {
        this.bridge.send("RESET", {});
        this.applyReset();
    },


    applyReset() {

        this.isOwner = (this.role === "monitor");
        this.state = "idle";
        this.exitFired = false;
        this.handoffFired = false;
        this.enterAcked = false;
        this.crossingArmed = false;
        this.countdownAt = null;
        this.destination = null;
        this.flash = 0;

        const cd = document.getElementById("countdown");
        if (cd) cd.classList.add("hidden");

        const edge = document.getElementById("seamEdge");
        if (edge) edge.classList.remove("alert");

        this.history.length = 0;
        this.particles.count = 0;
        this.particles.write = 0;
        this.rings.count = 0;
        this.rings.write = 0;
        this.pendingRings = null;
        this.emitter.pending.length = 0;

        const c = this.birthPoint();

        this.dragon = new Dragon(c.x, c.y);
        this.dragon.setTarget(c.x, c.y);

        /* o painel de entrada volta nas DUAS telas: no monitor
           ele e' o "ENTRAR", no notebook e' o "aguardando".
           Escondendo so' um, o notebook ficava em branco.     */
        this.showPanel("intro", true);
        this.showPanel("arrival", false);
        this.setStatus(this.role === "monitor" ? "PRONTO" : "AGUARDANDO");
    },


    /* =============================================
       LOOP
    ============================================= */

    loop() {

        const tick = () => {

            const now = worldNow();

            if (this.isOwner) this.simulate(now);

            this.render(now);

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    },


    /* ---------- SIMULACAO (somente o dono) ---------- */

    simulate(now) {

        let dt = (now - this.lastStep) / 1000;
        this.lastStep = now;

        if (dt <= 0) return;
        dt = Math.min(dt, 0.05);

        this.dragon.step(dt, now);
        this.emitter.emit(this.dragon, now, dt);

        this.checkCrossing(now);

        /* historico proprio: o dono tambem desenha atrasado,
           para que as duas telas mostrem o MESMO instante   */
        this.pushHistory(now, this.dragon.serialize());

        /* stream */
        const interval = 1000 / DISPLAY_CONFIG.streamHz;

        if (now - this.lastStream >= interval) {

            this.lastStream = now;

            const parts = this.emitter.flush();

            if (parts) this.particles.pushRaw(parts);
            if (this.pendingRings) this.rings.pushRaw(this.pendingRings);

            this.bridge.send("DRAGON_SYNC", {
                buf: this.dragon.serialize(),
                particles: parts,
                rings: this.pendingRings || null,
                state: this.state
            });

            this.pendingRings = null;
        }
    },


    /* ---------- TRAVESSIA ---------- */

    checkCrossing(now) {

        const d = this.dragon;
        const dir = d.dir;

        const head = d.segments[0];
        const tail = d.segments[d.segments.length - 1];

        const headPassed = dir < 0 ? head.x <= 0 : head.x >= 0;
        const tailPassed = dir < 0 ? tail.x <= 0 : tail.x >= 0;


        /* --- ja' cheguei nesta tela --- */

        if (this.state === "arriving") {

            if (this.destination) {
                /* rumo a um ponto clicado: o proprio modo
                   "travel" termina sozinho em "follow"      */
                if (d.mode === "follow") this.markArrived(true);

            } else if (d.mode === "flight" &&
                       this.map.isVisible(tail.x, tail.y, 40)) {

                const p = this.map.landingPoint();
                d.settleAt(p.x, p.y);
                this.markArrived(true);
            }
        }


        /* --- viagem dentro da MESMA tela: sem painel --- */

        if (this.state === "moving" && d.mode === "follow") {
            this.markArrived(false);
        }


        /* A deteccao de saida so' vale para quem LANCOU a
           travessia. Sem isto, a tela que acabou de receber
           o dragao (que ja' esta do outro lado de vx=0)
           dispararia um DRAGON_EXIT falso no mesmo frame.   */

        const emRota = d.mode === "flight" || d.mode === "travel";


        /* -------------------------------------------------
           REDE DE SEGURANCA

           Se o corpo INTEIRO ja' saiu do meu enquadramento e
           eu continuo sendo o dono, alguma coisa impediu a
           entrega — e o dragao fica orfao: sumiu daqui e
           nunca apareceu la'.

           Entrego a forca depois de meio segundo assim.
        ------------------------------------------------- */

        if (this.isOwner && !this.handoffFired && emRota) {

            let algumVisivel = false;

            for (let i = 0; i < d.segments.length; i += 4) {
                if (this.map.isVisible(d.segments[i].x, d.segments[i].y, 300)) {
                    algumVisivel = true;
                    break;
                }
            }

            if (algumVisivel) {
                this.foraDesde = 0;

            } else {
                if (!this.foraDesde) this.foraDesde = now;

                if (now - this.foraDesde > 500 && this.bridge.peerOf(this.peerRole)) {

                    this.handoffFired = true;
                    this.foraDesde = 0;

                    this.bridge.send("DRAGON_HANDOFF", {
                        owner: this.peerRole,
                        buf: d.serialize(),
                        velocityX: d.vx,
                        velocityY: d.vy,
                        flightT: d.flightT,
                        dir: d.dir,
                        dest: this.destination || null,
                        timestamp: now,
                        resgate: true
                    });

                    this.isOwner = false;
                    this.crossingArmed = false;
                    this.state = "gone";

                    this.setStatus("ENTREGUE (RESGATE)");
                }
            }
        }


        if (!this.crossingArmed) return;


        /* "head" = avisa quando a CABECA cruza (continuidade real)
           "full" = avisa so' depois que o corpo inteiro saiu       */

        const exitTrigger = DISPLAY_CONFIG.exitPolicy === "full"
            ? tailPassed
            : headPassed;


        /* Os DOIS modos de deslocamento contam.
           Testar so' "flight" fazia o dragao sair do monitor
           sem ninguem assumir do outro lado quando a viagem
           tinha sido pedida por clique.                      */



        /* --- cruzou a borda fisica --- */

        if (emRota && !this.exitFired && exitTrigger) {

            this.exitFired = true;
            this.state = "crossing";
            this.flash = 1;

            /* explosao e anel NA COSTURA: cada tela mostra
               metade, formando um efeito unico             */
            this.emitter.burst(0, head.y, now, 1, dir);

            this.pendingRings = new Float64Array([0, head.y, now, 1.5, 1]);

            const payload = {
                type: "DRAGON_EXIT",

                /* o que o enunciado pede */
                x: head.x,
                y: head.y,
                velocityX: d.vx,
                velocityY: d.vy,
                rotation: head.angle,
                timestamp: now,

                /* o que torna a continuidade REAL:
                   o corpo inteiro, nao so' a cabeca */
                buf: d.serialize(),
                dir: dir,
                energy: d.energy,
                flightT: d.flightT,
                fromSide: this.map.side
            };

            this.bridge.send("DRAGON_EXIT", payload);

            this.setStatus("SAINDO PELA BORDA");
        }


        /* --- CAUDA terminou de passar: entrego o dominio --- */

        if (this.exitFired && !this.handoffFired && tailPassed) {

            this.handoffFired = true;

            this.bridge.send("DRAGON_HANDOFF", {
                owner: this.peerRole,
                buf: d.serialize(),
                velocityX: d.vx,
                velocityY: d.vy,
                flightT: d.flightT,
                dir: dir,

                /* sem o destino, a tela que recebe nao saberia
                   para onde ele estava indo e pousaria no lugar
                   errado                                        */
                dest: this.destination || null,

                timestamp: now
            });

            this.isOwner = false;
            this.crossingArmed = false;
            this.state = "gone";

            this.setStatus("DRAGAO ENTREGUE A OUTRA TELA");
        }


    },


    /* =============================================
       DESENHO
    ============================================= */

    render(now) {

        /* AS DUAS TELAS DESENHAM ESTE INSTANTE */
        const renderTime = now - DISPLAY_CONFIG.renderDelay;

        const pose = this.poseAt(renderTime);

        /* --- energia da costura --- */

        this.flash = Math.max(0, this.flash - 0.018);

        let seam = 0;

        if (pose) {
            let nearest = Infinity;
            for (let i = 0; i < pose.segments.length; i += 3) {
                nearest = Math.min(nearest, Math.abs(pose.segments[i].x));
            }
            seam = Math.max(0, 1 - nearest / 620) * (0.30 + 0.70 * pose.energy);
        }

        seam = Math.min(1, seam + this.flash * 0.9);


        /* --- fundo --- */

        this.ambient.draw(this.actx, this.W, this.H, now, seam * 0.9);


        /* --- palco (mundo) --- */

        const ctx = this.sctx;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.stageCanvas.width, this.stageCanvas.height);

        this.map.applyTransform(ctx);

        this.rings.draw(ctx, this.map, renderTime);
        this.particles.draw(ctx, this.map, renderTime);

        if (pose && this.poseVisible(pose)) {
            DragonRender.draw(ctx, pose, { time: renderTime });
        }

        if (this.calibrating) this.drawCalibrationGrid(ctx);


        /* --- pos-processamento (espaco de tela) --- */

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this.dpr, this.dpr);

        SeamFX.distort(ctx, this.stageCanvas, this.map,
                       this.W, this.H, seam, now, this.dpr);

        SeamFX.glow(ctx, this.map, this.W, this.H, seam, now);
        SeamFX.grade(ctx, this.W, this.H, now, seam);

        this.updateCountdown(now);
        this.updateHud(seam, pose);
    },


    /* Reconstroi a pose no instante pedido:
       interpola entre os dois frames que o cercam.     */

    poseAt(t) {

        const h = this.history;
        if (!h.length) return null;

        if (t <= h[0].t) return decodePose(h[0].buf);

        for (let i = h.length - 1; i >= 1; i--) {

            if (h[i - 1].t <= t && t <= h[i].t) {

                const span = h[i].t - h[i - 1].t;
                const k = span > 0 ? (t - h[i - 1].t) / span : 1;

                return lerpPose(
                    decodePose(h[i - 1].buf),
                    decodePose(h[i].buf),
                    k
                );
            }
        }

        /* stream atrasou: projeta pela velocidade */
        const last = h[h.length - 1];
        return extrapolatePose(decodePose(last.buf), t - last.t);
    },


    poseVisible(pose) {

        for (let i = 0; i < pose.segments.length; i += 4) {
            const s = pose.segments[i];
            if (this.map.isVisible(s.x, s.y, 260)) return true;
        }

        return false;
    },


    /* =============================================
       HUD
    ============================================= */

    setStatus(text) {
        const el = document.getElementById("status");
        if (el) el.textContent = text;
    },


    showPanel(name, visible) {
        const el = document.getElementById(name === "intro" ? "introPanel" : "arrivalPanel");
        if (el) el.classList.toggle("hidden", !visible);
    },


    updateHud(seam, pose) {

        const link = document.getElementById("link");

        if (link) {
            /* so' conta a OUTRA tela: o launcher tambem
               esta no canal e nao deve mascarar o pareamento */
            const ok = !!this.bridge.peerOf(this.peerRole);
            link.textContent = ok
                ? "PAREADO . " + this.bridge.transportLabel
                : "AGUARDANDO A OUTRA TELA";
            link.classList.toggle("ok", ok);
        }

        const owner = document.getElementById("owner");
        if (owner) owner.textContent = this.isOwner ? "DOMINIO: ESTA TELA" : "DOMINIO: OUTRA TELA";

        if (!DISPLAY_CONFIG.debug) {
            const dbg = document.getElementById("debug");
            if (dbg) dbg.classList.add("hidden");
            return;
        }

        const dbg = document.getElementById("debug");
        if (!dbg) return;

        dbg.classList.remove("hidden");

        const head = pose ? pose.segments[0] : null;

        dbg.textContent =
            this.map.describe() + "\n" +
            "estado " + this.state + "  dono " + (this.isOwner ? "sim" : "nao") + "\n" +
            "latencia " + this.bridge.lastLatency.toFixed(2) + " ms\n" +
            "buffer " + this.history.length + " frames\n" +
            "costura " + seam.toFixed(2) + "\n" +
            (head ? "cabeca vx " + head.x.toFixed(0) + "  vy " + head.y.toFixed(0) : "sem pose") + "\n" +
            "particulas " + this.particles.count;
    },


    /* =============================================
       CALIBRACAO
    ============================================= */

    toggleCalibration(forcar) {

        this.calibrating = (forcar === undefined) ? !this.calibrating : !!forcar;

        const el = document.getElementById("calibration");
        if (el) el.classList.toggle("hidden", !this.calibrating);

        this.refreshCalibrationUI();
    },


    closeCalibration() {
        this.toggleCalibration(false);
    },


    nudge(field, delta) {

        if (field === "seamGap") {
            this.cal.seamGap = Math.round((this.cal.seamGap + delta) * 100) / 100;
        } else if (field === "scale") {
            const cur = this.cal[this.role].scale || 1;
            this.cal[this.role].scale = Math.max(0.2, Math.round((cur + delta) * 1000) / 1000);
        } else {
            this.cal[this.role][field] =
                Math.round((this.cal[this.role][field] + delta) * 100) / 100;
        }

        this.commitCalibration();
    },


    commitCalibration() {

        saveCalibration(this.cal);
        this.map.setCalibration(this.cal);
        this.bridge.send("CALIBRATION", { cal: this.cal });
        this.refreshCalibrationUI();
    },


    bindCalibrationControls() {

        const bind = (id, get, set) => {

            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener("input", () => {
                set(parseFloat(el.value));
                this.commitCalibration();
            });

            el._get = get;
        };

        bind("calOffsetY",
             () => this.cal[this.role].offsetY,
             (v) => { this.cal[this.role].offsetY = v; });

        bind("calScale",
             () => this.cal[this.role].scale || 1,
             (v) => { this.cal[this.role].scale = v; });

        bind("calGap",
             () => this.cal.seamGap,
             (v) => { this.cal.seamGap = v; });

        const reset = document.getElementById("calReset");

        if (reset) {
            reset.addEventListener("click", () => {
                this.cal = defaultCalibration();
                this.commitCalibration();
            });
        }
    },


    refreshCalibrationUI() {

        for (const id of ["calOffsetY", "calScale", "calGap"]) {

            const el = document.getElementById(id);
            if (!el || !el._get) continue;

            el.value = el._get();

            const out = document.getElementById(id + "Value");
            if (out) out.textContent = (+el.value).toFixed(2);
        }
    },


    /* Reguas de alinhamento.
       Se as duas telas estiverem calibradas, as linhas
       horizontais formam UMA linha continua atravessando
       a moldura fisica, e os tracos verticais tem o mesmo
       tamanho nas duas telas.                             */

    drawCalibrationGrid(ctx) {

        ctx.save();

        const left = this.map.worldLeft;
        const right = this.map.worldRight;

        ctx.lineWidth = 1;
        ctx.font = "12px monospace";

        for (const vy of [-400, -200, 0, 200, 400]) {

            ctx.strokeStyle = vy === 0
                ? "rgba(0,245,255,0.95)"
                : "rgba(0,245,255,0.30)";

            ctx.beginPath();
            ctx.moveTo(left, vy);
            ctx.lineTo(right, vy);
            ctx.stroke();

            ctx.fillStyle = "rgba(184,250,255,0.8)";
            ctx.fillText("vy " + vy, this.map.side === "left" ? right - 90 : left + 12, vy - 8);
        }

        /* tracos de 100 vpx: revelam diferenca de escala */
        ctx.strokeStyle = "rgba(139,92,246,0.8)";

        const start = Math.ceil(left / 100) * 100;

        for (let vx = start; vx < right; vx += 100) {

            const big = (vx % 500 === 0);

            ctx.beginPath();
            ctx.moveTo(vx, -60 - (big ? 40 : 0));
            ctx.lineTo(vx, 60 + (big ? 40 : 0));
            ctx.stroke();

            if (big) {
                ctx.fillStyle = "rgba(139,92,246,0.9)";
                ctx.fillText(String(vx), vx + 4, -70);
            }
        }

        /* a costura */
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -this.H);
        ctx.lineTo(0, this.H);
        ctx.stroke();

        ctx.restore();
    }
};
