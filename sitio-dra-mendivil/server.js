/**
 * Servidor estático mínimo, sin dependencias externas.
 * Sirve los archivos de esta carpeta (index.html, img/, etc.).
 * Railway inyecta el puerto en process.env.PORT.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  // Quita query string y decodifica
  let ruta = decodeURIComponent((req.url || "/").split("?")[0]);
  if (ruta === "/") ruta = "/index.html";

  // Evita salir de la carpeta (path traversal)
  const archivo = path.normalize(path.join(ROOT, ruta));
  if (!archivo.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Prohibido");
  }

  fs.readFile(archivo, (err, contenido) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h1>404 — Página no encontrada</h1>");
    }
    const tipo = TIPOS[path.extname(archivo).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": tipo });
    res.end(contenido);
  });
});

server.listen(PORT, () => {
  console.log(`Sitio de la Dra. Mendívil corriendo en el puerto ${PORT}`);
});
