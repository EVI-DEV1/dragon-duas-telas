/* =====================================================
   DRAGON // DUAS TELAS
   bridge.js  —  comunicacao entre as janelas

   Transportes, em ordem de preferencia:
     1. BroadcastChannel  (tempo real, structured clone,
                           aguenta Float32Array sem serializar)
     2. postMessage       (opener <-> janelas abertas pelo launcher)
     3. localStorage      (fallback via evento "storage")

   Relogio: performance.timeOrigin + performance.now() da
   um epoch em ms comparavel entre janelas da MESMA maquina,
   com precisao sub-milissegundo. E' esse relogio que
   mantem as duas telas desenhando o mesmo instante.
===================================================== */


function worldNow() {
    return performance.timeOrigin + performance.now();
}


class Bridge {

    constructor(role, channelName) {

        this.role = role;
        this.channelName = channelName || DISPLAY_CONFIG.channelName;

        this.id = role + "-" + Math.random().toString(36).slice(2, 8);
        this.seq = 0;

        this.handlers = new Map();
        this.transports = [];

        this.peers = new Map();      // id -> { role, geometry, lastSeen }
        this.lastLatency = 0;

        this._initBroadcastChannel();
        this._initPostMessage();
        this._initStorage();

        this._startPresence();
    }


    /* ---------- transporte 1: BroadcastChannel ---------- */

    _initBroadcastChannel() {

        if (typeof BroadcastChannel === "undefined") {
            this.hasBC = false;
            return;
        }

        try {
            this.bc = new BroadcastChannel(this.channelName);
            this.bc.onmessage = (ev) => this._receive(ev.data, "bc");
            this.hasBC = true;
            this.transports.push("BroadcastChannel");
        } catch (e) {
            this.hasBC = false;
        }
    }


    /* ---------- transporte 2: postMessage ---------- */

    _initPostMessage() {

        this.children = [];

        window.addEventListener("message", (ev) => {

            if (ev.origin !== window.location.origin) return;

            const data = ev.data;
            if (!data || data.__dragon !== true) return;

            this._receive(data, "pm");
        });

        this.transports.push("postMessage");
    }


    registerChild(win) {
        if (win && this.children.indexOf(win) === -1) {
            this.children.push(win);
        }
    }


    /* ---------- transporte 3: localStorage ---------- */

    _initStorage() {

        this.storageKey = "dragon.msg." + this.channelName;

        window.addEventListener("storage", (ev) => {

            if (ev.key !== this.storageKey || !ev.newValue) return;

            try {
                this._receive(JSON.parse(ev.newValue), "ls");
            } catch (e) { /* ignora */ }
        });

        this.transports.push("localStorage");
    }


    /* ---------- envio ---------- */

    send(type, payload) {

        const msg = {
            __dragon: true,
            type: type,
            from: this.id,
            role: this.role,
            seq: ++this.seq,
            t: worldNow(),
            payload: payload || {}
        };

        if (this.hasBC) {
            try { this.bc.postMessage(msg); } catch (e) { /* ignora */ }
        }

        /* postMessage para opener e filhos */
        try {
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage(msg, window.location.origin);
            }
        } catch (e) { /* ignora */ }

        for (const win of this.children) {
            try {
                if (win && !win.closed) {
                    win.postMessage(msg, window.location.origin);
                }
            } catch (e) { /* ignora */ }
        }

        /* localStorage so' entra em acao se nao houver BroadcastChannel
           (senao geraria mensagem duplicada e gravacao a 60Hz)          */
        if (!this.hasBC) {
            try {
                localStorage.setItem(
                    this.storageKey,
                    JSON.stringify(this._plain(msg))
                );
            } catch (e) { /* ignora */ }
        }

        return msg;
    }


    /* Float32Array nao sobrevive ao JSON do localStorage */
    _plain(msg) {

        const copy = Object.assign({}, msg);
        const p = Object.assign({}, msg.payload);

        for (const k in p) {
            if (p[k] instanceof Float32Array || p[k] instanceof Float64Array) {
                p[k] = Array.from(p[k]);
            }
        }

        copy.payload = p;
        return copy;
    }


    /* ---------- recepcao ---------- */

    _receive(msg, via) {

        if (!msg || msg.__dragon !== true) return;
        if (msg.from === this.id) return;              // eco proprio

        /* deduplicacao: a mesma mensagem pode chegar por
           BroadcastChannel E postMessage                     */
        const key = msg.from + ":" + msg.seq;
        this._seen = this._seen || new Map();
        if (this._seen.has(key)) return;
        this._seen.set(key, 1);
        if (this._seen.size > 4000) this._seen.clear();

        this.lastLatency = worldNow() - msg.t;

        /* presenca */
        if (msg.type === "PRESENCE" || msg.type === "HELLO") {

            this.peers.set(msg.from, {
                role: msg.role,
                geometry: msg.payload.geometry,
                lastSeen: worldNow()
            });

            if (msg.type === "HELLO") {
                this.send("PRESENCE", { geometry: this.geometry || null });
            }
        }

        /* payload vindo do localStorage volta como Array */
        if (msg.payload) {

            if (Array.isArray(msg.payload.buf)) {
                msg.payload.buf = new Float32Array(msg.payload.buf);
            }

            /* particulas e aneis guardam epoch em ms:
               precisam de Float64, senao perdem precisao */
            for (const k of ["particles", "rings"]) {
                if (Array.isArray(msg.payload[k])) {
                    msg.payload[k] = new Float64Array(msg.payload[k]);
                }
            }
        }

        const list = this.handlers.get(msg.type);
        if (list) for (const fn of list) fn(msg.payload, msg);

        const any = this.handlers.get("*");
        if (any) for (const fn of any) fn(msg.payload, msg);
    }


    on(type, fn) {

        if (!this.handlers.has(type)) this.handlers.set(type, []);
        this.handlers.get(type).push(fn);
        return this;
    }


    /* ---------- presenca / heartbeat ---------- */

    setGeometry(geometry) {
        this.geometry = geometry;
    }


    _startPresence() {

        this.send("HELLO", { geometry: this.geometry || null });

        setInterval(() => {

            this.send("PRESENCE", { geometry: this.geometry || null });

            /* limpa quem sumiu */
            const now = worldNow();
            for (const [id, p] of this.peers) {
                if (now - p.lastSeen > 3000) this.peers.delete(id);
            }

        }, 900);
    }


    peerOf(role) {
        for (const [, p] of this.peers) {
            if (p.role === role) return p;
        }
        return null;
    }


    get connected() {
        return this.peers.size > 0;
    }


    get transportLabel() {
        return this.hasBC ? "BroadcastChannel" : "localStorage (fallback)";
    }
}
