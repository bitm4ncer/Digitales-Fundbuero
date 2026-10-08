'use strict';

// Mini-Dev-Server für das Digitale Fundbüro — nur Node-Bordmittel.
// Start: node dev-server.js  →  http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Löst eine URL zu einer Datei INNERHALB des Repo-Roots auf; null bei Pfad-Ausbruch.
function sichererPfad(url) {
  let pfad;
  try { pfad = decodeURIComponent(String(url).split('?')[0].split('#')[0]); }
  catch (e) { return null; }
  if (pfad.indexOf('\0') !== -1) { return null; }
  const ziel = path.normalize(path.join(ROOT, pfad));
  if (ziel !== ROOT && ziel.indexOf(ROOT + path.sep) !== 0) { return null; }
  return ziel;
}

function sende404(res) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
    '<title>404 — Digitales Fundbüro</title></head>' +
    '<body style="font-family:Arial,Helvetica,sans-serif;background:#0f3d80;padding:40px 16px;text-align:center;">' +
    '<div style="max-width:480px;margin:0 auto;background:#dfeaff;border-radius:12px;padding:24px;">' +
    '<div style="font-size:44px;">🔍</div>' +
    '<h1 style="font-family:\'Arial Rounded MT Bold\',\'Arial Black\',Arial,sans-serif;color:#1a3e6e;font-style:italic;">Hoppla — 404!</h1>' +
    '<p style="color:#123a75;">Diese Seite hat sich verlaufen. Zum Glück gibt es ein Fundbüro.</p>' +
    '<p><a href="/" style="color:#2a68c4;font-weight:bold;">← Zurück zum Fundbüro</a></p>' +
    '</div></body></html>');
}

const server = http.createServer(function (req, res) {
  let ziel = sichererPfad(req.url || '/');
  if (!ziel) { return sende404(res); }
  try {
    if (fs.statSync(ziel).isDirectory()) { ziel = path.join(ziel, 'index.html'); }
  } catch (e) { return sende404(res); }
  fs.readFile(ziel, function (fehler, inhalt) {
    if (fehler) { return sende404(res); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(ziel).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(inhalt);
  });
});

server.listen(PORT, function () {
  console.log('Digitales Fundbüro läuft auf http://localhost:' + PORT);
});
