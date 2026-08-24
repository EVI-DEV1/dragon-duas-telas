/* =====================================================
   DRAGON // DUAS TELAS
   server.js  —  servidor local, sem dependencias

       node server.js            -> http://localhost:5173
       node server.js 8080       -> outra porta

   Por que precisa de servidor:
   em file:// o Chrome trata cada aba como uma origem
   opaca e diferente, entao BroadcastChannel e
   localStorage NAO sao compartilhados entre as janelas.
   Servido por http://localhost as duas paginas passam a
   ter a mesma origem e o canal conecta.
===================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 5173;
const ROOT = __dirname;

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2"
};


const server = http.createServer((req, res) => {

    let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname
    );

    if (pathname === "/") pathname = "/index.html";

    /* nao deixa sair da pasta do projeto */
    const target = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ""));

    if (!target.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("403");
        return;
    }

    fs.readFile(target, (err, data) => {

        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("404  " + pathname);
            return;
        }

        res.writeHead(200, {
            "Content-Type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });

        res.end(data);
    });
});


server.listen(PORT, () => {

    console.log("");
    console.log("  DRAGON // duas telas");
    console.log("  ------------------------------------------");
    console.log("  painel    http://localhost:" + PORT + "/");
    console.log("  tela 1    http://localhost:" + PORT + "/monitor.html");
    console.log("  tela 2    http://localhost:" + PORT + "/notebook.html");
    console.log("  ------------------------------------------");
    console.log("  ctrl+c para encerrar");
    console.log("");
});
