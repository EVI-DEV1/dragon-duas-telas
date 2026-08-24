/* =====================================================
   DRAGON // DUAS TELAS
   launcher.js  —  abre as duas janelas nos monitores certos
                   e calibra a partir da geometria real

   Usa a Window Management API (Chrome / Edge) quando
   disponivel: com ela da' para POSICIONAR cada janela em
   um monitor especifico. Sem ela, cai no modo manual.
===================================================== */


function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}


const Launcher = {

    async start() {

        this.bridge = new Bridge("launcher");
        this.screens = null;
        this.windows = {};

        /* RELAY: repassa entre as duas janelas filhas.
           Faz o transporte postMessage funcionar de verdade
           como fallback, caso o BroadcastChannel falte.
           A deduplicacao por (from, seq) evita eco duplo.    */

        this.bridge.on("*", (payload, msg) => {

            for (const role of ["monitor", "notebook"]) {

                if (msg.role === role) continue;

                const win = this.windows[role];
                if (!win || win.closed) continue;

                try {
                    win.postMessage(msg, window.location.origin);
                } catch (e) { /* ignora */ }
            }
        });

        this.bindUI();
        this.refreshConfigUI();

        await this.detectScreens();

        setInterval(() => this.refreshStatus(), 700);
    },


    /* =============================================
       DETECCAO DE MONITORES
    ============================================= */

    async detectScreens() {

        const box = document.getElementById("screensInfo");

        if (!window.getScreenDetails) {

            box.textContent =
                "Window Management API indisponivel neste navegador.\n" +
                "As janelas vao abrir e voce arrasta cada uma para o\n" +
                "monitor certo (depois F11 ou o botao Tela cheia).";

            this.detected = false;
            return;
        }

        try {
            const details = await window.getScreenDetails();

            this.details = details;
            this.screens = details.screens.slice()
                .sort((a, b) => a.left - b.left);

            this.detected = true;

            box.textContent = this.screens.map((s, i) =>
                "[" + i + "] " + (s.label || "monitor " + i) +
                (s.isPrimary ? "  (principal)" : "") + "\n" +
                "     posicao " + s.left + "," + s.top +
                "   tamanho " + s.width + "x" + s.height +
                "   dpr " + (s.devicePixelRatio || 1)
            ).join("\n\n");

            if (this.screens.length < 2) {
                box.textContent += "\n\nSo' um monitor detectado. " +
                    "Conecte a segunda tela e recarregue.";
            }

        } catch (e) {

            this.detected = false;

            box.textContent =
                "Permissao de gerenciamento de janelas negada.\n" +
                "Clique de novo em ABRIR AS DUAS TELAS e autorize,\n" +
                "ou posicione as janelas manualmente.";
        }
    },


    /* Qual monitor fisico corresponde a esta posicao? */

    screenFor(position) {

        if (!this.screens || this.screens.length < 2) return null;

        return position === "left"
            ? this.screens[0]
            : this.screens[this.screens.length - 1];
    },


    /* =============================================
       ABRIR AS JANELAS
    ============================================= */

    async open(role) {

        if (window.getScreenDetails && !this.detected) {
            await this.detectScreens();
        }

        const position = role === "monitor"
            ? DISPLAY_CONFIG.monitorPosition
            : DISPLAY_CONFIG.notebookPosition;

        const target = this.screenFor(position);

        /* popup=yes abre SEM barra de endereco e sem abas:
           fica praticamente tela cheia sem precisar de F11  */
        let features = "popup=yes,menubar=no,toolbar=no,location=no,status=no";

        if (target) {
            features +=
                ",left=" + target.left +
                ",top=" + target.top +
                ",width=" + target.availWidth +
                ",height=" + target.availHeight;
        } else {
            features += ",width=1280,height=800";
        }

        const win = window.open(role + ".html", "dragon-" + role, features);

        if (!win) {
            /* nada de alert(): um dialogo modal travaria a
               sequencia automatica no meio                  */
            const el = document.getElementById("autoStatus");

            if (el) {
                el.textContent =
                    "O navegador bloqueou a janela da tela \"" + role + "\". " +
                    "Libere os pop-ups para localhost (icone na barra de " +
                    "endereco) e clique de novo.";
            }

            return null;
        }

        this.windows[role] = win;
        this.bridge.registerChild(win);

        /* reposiciona depois do load: alguns navegadores
           ignoram left/top na primeira chamada            */
        if (target) {
            setTimeout(() => {
                try {
                    win.moveTo(target.left, target.top);
                    win.resizeTo(target.availWidth, target.availHeight);
                } catch (e) { /* ignora */ }
            }, 400);
        }

        return win;
    },


    async openBoth() {

        this.open("notebook");
        await delay(450);
        this.open("monitor");
    },


    /* =============================================
       UM CLIQUE SO'

       Faz a sequencia inteira: detecta os monitores,
       abre as duas janelas nas telas certas, espera
       parearem, calibra pela geometria real e lanca
       a travessia. O clique do usuario e' o gesto que
       autoriza abrir janelas e pedir a permissao de
       gerenciamento de telas.
    ============================================= */

    async autoStart() {

        if (this.running) return;
        this.running = true;

        const btn = document.getElementById("autoStart");
        const step = (msg) => {
            const el = document.getElementById("autoStatus");
            if (el) el.textContent = msg;
        };

        btn.disabled = true;
        const rotulo = btn.textContent;

        try {

            /* 1. monitores */
            step("1/5  procurando seus monitores...");
            await this.detectScreens();

            const achou2 = this.screens && this.screens.length >= 2;

            /* 2. abrir */
            step(achou2
                ? "2/5  abrindo as duas telas nos monitores certos..."
                : "2/5  abrindo as duas telas (posicionamento manual)...");

            await this.openBoth();

            /* 3. parear */
            step("3/5  esperando as duas telas se enxergarem...");

            const pareou = await this.waitForPeers(15000);

            if (!pareou) {
                step("Nao pareou. Se o navegador bloqueou os pop-ups, " +
                     "libere para localhost e clique de novo.");
                return;
            }

            /* 4. calibrar */
            step("4/5  calibrando pelas dimensoes reais das telas...");
            await delay(500);
            this.autoCalibrate();

            if (!achou2) {
                step("As duas telas estao abertas. Arraste cada uma para o " +
                     "seu monitor e clique de novo para calibrar e lancar.");
                return;
            }

            /* 5. lancar

               A contagem acontece NAS TELAS, a partir do relogio
               compartilhado. Aqui so' informamos o horario do
               disparo: em tela cheia este painel fica escondido
               atras das janelas e ninguem veria o aviso.        */

            step("5/5  OLHE PARA A MOLDURA ENTRE OS MONITORES.");

            /* 3000 exatos: com Math.ceil, qualquer valor acima
               disso faria a contagem comecar em "4"           */
            this.bridge.send("LAUNCH_REQUEST", { at: worldNow() + 3000 });

        } finally {
            btn.disabled = false;
            btn.textContent = rotulo;
            this.running = false;
        }
    },


    /* Espera as DUAS janelas aparecerem no canal */

    async waitForPeers(timeoutMs) {

        const limite = worldNow() + timeoutMs;

        while (worldNow() < limite) {

            if (this.bridge.peerOf("monitor") && this.bridge.peerOf("notebook")) {
                return true;
            }

            await delay(200);
        }

        return false;
    },


    /* =============================================
       CALIBRACAO AUTOMATICA
       Usa a geometria que cada janela reportou.
    ============================================= */

    autoCalibrate() {

        const mn = this.bridge.peerOf("monitor");
        const nb = this.bridge.peerOf("notebook");

        const out = document.getElementById("calibResult");

        if (!mn || !nb || !mn.geometry || !nb.geometry) {
            out.textContent =
                "Abra as duas telas primeiro. " +
                "A calibracao le a geometria que cada janela reporta.";
            return;
        }

        /* availWidth/availHeight podem vir zerados em janelas
           embutidas: cai para o tamanho da propria janela.   */

        const clean = (geo) => ({
            screenLeft: Number.isFinite(geo.screenLeft) ? geo.screenLeft : 0,
            screenTop: Number.isFinite(geo.screenTop) ? geo.screenTop : 0,
            availW: geo.availW > 0 ? geo.availW : geo.w,
            availH: geo.availH > 0 ? geo.availH : geo.h,
            w: geo.w, h: geo.h
        });

        const g = { monitor: clean(mn.geometry), notebook: clean(nb.geometry) };

        if (g.monitor.screenLeft === g.notebook.screenLeft &&
            g.monitor.screenTop === g.notebook.screenTop) {

            out.textContent =
                "As duas janelas reportam o MESMO monitor.\n" +
                "Arraste uma delas para a outra tela (e de' F5 nela) " +
                "antes de calibrar. Ate' la', use a calibracao manual: " +
                "tecle C em cada janela.";
            return;
        }

        const cal = defaultCalibration();

        /* escala de cada tela, no mesmo criterio do runtime */
        const scaleOf = (geo) => {
            if (DISPLAY_CONFIG.scaleMode === "height") {
                return geo.h / DISPLAY_CONFIG.referenceHeight;
            }
            return 1;
        };

        const sM = scaleOf(g.monitor) * DISPLAY_CONFIG.dragonScale;
        const sN = scaleOf(g.notebook) * DISPLAY_CONFIG.dragonScale;

        /* quem esta a esquerda de fato */
        const leftRole = DISPLAY_CONFIG.monitorPosition === "left"
            ? "monitor" : "notebook";

        const rightRole = leftRole === "monitor" ? "notebook" : "monitor";

        const L = g[leftRole];
        const R = g[rightRole];

        /* --- vao horizontal entre os dois monitores --- */

        const gapPx = R.screenLeft - (L.screenLeft + L.availW);

        const sRight = rightRole === "monitor" ? sM : sN;

        /* um vao maior que meia tela nao e' moldura, e' leitura
           errada da geometria: nesse caso vale zero            */
        const vao = Math.round(gapPx / (sRight || 1));
        const vaoMax = (R.availW / (sRight || 1)) * 0.5;

        cal.seamGap = (vao > 0 && vao < vaoMax) ? vao : 0;

        /* --- alinhamento vertical ---
           vy = 0 precisa cair no mesmo Y fisico nas duas telas */

        const centerL = L.screenTop + L.availH / 2;
        const centerR = R.screenTop + R.availH / 2;

        const sLeft = leftRole === "monitor" ? sM : sN;

        /* TRAVA DE SEGURANCA.

           availTop / availLeft vem do Windows e podem chegar
           errados (escala de DPI, monitor virtual, janela em
           outro monitor). Um offsetY grande demais desloca a
           faixa vertical do mundo que a tela enxerga, e o
           dragao passa INTEIRO fora do enquadramento: a tela
           renderiza, mas nao aparece nada.

           O desalinhamento util nunca passa de meia tela.     */

        const bruto = (centerL - centerR) / (sLeft || 1);

        const limite = (L.availH / (sLeft || 1)) * 0.5;

        cal[leftRole].offsetY = Math.round(
            Math.max(-limite, Math.min(limite, bruto))
        );

        cal[rightRole].offsetY = 0;

        const travado = Math.abs(bruto) > limite + 1;

        saveCalibration(cal);
        this.bridge.send("CALIBRATION", { cal: cal });

        out.textContent =
            "Calibrado.\n" +
            "esquerda (" + leftRole + ")  " + L.availW + "x" + L.availH +
            "  em " + L.screenLeft + "," + L.screenTop + "\n" +
            "direita  (" + rightRole + ")  " + R.availW + "x" + R.availH +
            "  em " + R.screenLeft + "," + R.screenTop + "\n" +
            "vao entre as telas  " + cal.seamGap + " vpx\n" +
            "offsetY " + leftRole + "  " + cal[leftRole].offsetY + " vpx" +
            (travado ? "  (limitado: geometria suspeita)" : "") + "\n" +
            "escalas  monitor " + sM.toFixed(3) + "   notebook " + sN.toFixed(3);
    },


    /* =============================================
       STATUS AO VIVO
    ============================================= */

    refreshStatus() {

        for (const role of ["monitor", "notebook"]) {

            const el = document.getElementById(role + "Status");
            if (!el) continue;

            const peer = this.bridge.peerOf(role);

            if (!peer) {
                el.textContent = "fechada";
                el.parentElement.classList.remove("ok");
                continue;
            }

            const g = peer.geometry;

            el.textContent = g
                ? "aberta  " + g.w + "x" + g.h +
                  "  dpr " + (g.dpr || 1).toFixed(2) +
                  "\nmonitor em " + g.screenLeft + "," + g.screenTop +
                  "  (" + g.availW + "x" + g.availH + ")" +
                  "\nlado configurado: " + g.side
                : "aberta";
        }

        const t = document.getElementById("transport");
        if (t) t.textContent = this.bridge.transportLabel;
    },


    /* =============================================
       CONFIGURACAO
    ============================================= */

    bindUI() {

        document.getElementById("autoStart")
            .addEventListener("click", () => this.autoStart());

        document.getElementById("openBoth")
            .addEventListener("click", () => this.openBoth());

        document.getElementById("openMonitor")
            .addEventListener("click", () => this.open("monitor"));

        document.getElementById("openNotebook")
            .addEventListener("click", () => this.open("notebook"));

        document.getElementById("autoCalibrate")
            .addEventListener("click", () => this.autoCalibrate());

        document.getElementById("swapSides")
            .addEventListener("click", () => {

                saveConfigOverrides({
                    monitorPosition: DISPLAY_CONFIG.notebookPosition,
                    notebookPosition: DISPLAY_CONFIG.monitorPosition
                });

                this.refreshConfigUI();
                this.bridge.send("CONFIG", { config: {
                    monitorPosition: DISPLAY_CONFIG.monitorPosition,
                    notebookPosition: DISPLAY_CONFIG.notebookPosition
                }});

                document.getElementById("calibResult").textContent =
                    "Lados trocados. Recarregue as duas janelas (F5) " +
                    "para que as bordas e paineis se reposicionem.";
            });

        const bind = (id, key, cast) => {

            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener("change", () => {

                const v = cast ? cast(el.value) : el.value;

                saveConfigOverrides({ [key]: v });
                this.bridge.send("CONFIG", { config: { [key]: v } });

                this.refreshConfigUI();
            });
        };

        bind("cfgScaleMode", "scaleMode");
        bind("cfgDuration", "transitionDuration", parseFloat);
        bind("cfgScale", "dragonScale", parseFloat);
        bind("cfgSpeed", "cruiseSpeed", parseFloat);
        bind("cfgExit", "exitPolicy");
    },


    refreshConfigUI() {

        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.value = v;
        };

        set("cfgScaleMode", DISPLAY_CONFIG.scaleMode);
        set("cfgDuration", DISPLAY_CONFIG.transitionDuration);
        set("cfgScale", DISPLAY_CONFIG.dragonScale);
        set("cfgSpeed", DISPLAY_CONFIG.cruiseSpeed);
        set("cfgExit", DISPLAY_CONFIG.exitPolicy);

        const el = document.getElementById("sidesLabel");

        if (el) {
            el.textContent =
                "monitor a " + (DISPLAY_CONFIG.monitorPosition === "right" ? "DIREITA" : "ESQUERDA") +
                "   .   notebook a " + (DISPLAY_CONFIG.notebookPosition === "left" ? "ESQUERDA" : "DIREITA");
        }
    }
};
