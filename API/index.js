'use strict';

// Actividad 3: API local con datos simulados.
// Inicio desde la carpeta API: node --env-file=.env index.js
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const configurar = require('./configuracion-servidor.cjs');

let configuracion;
try { configuracion = configurar(); } catch (error) {
  console.error(error.message);
  process.exit(1);
}
const { secretoJwt, HOST, PORT, demoPublica, origenesPermitidos } = configuracion;
const EMISOR = 'actividad3';
const DESTINATARIO = 'actividad3-api';
const app = express();

app.disable('x-powered-by');
app.disable('etag');
app.set('json escape', true);
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  });
  next();
});

function rechazarToken(res) {
  return res.status(401)
    .set('WWW-Authenticate', 'Bearer realm="actividad3-api"')
    .json({ error: 'Se requiere un token valido y vigente.' });
}

function autenticarJwt(req, res, next) {
  const cabecera = req.get('authorization');
  const coincidencia = typeof cabecera === 'string'
    ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(cabecera)
    : null;

  if (!coincidencia) return rechazarToken(res);

  let identidad;
  try {
    identidad = jwt.verify(coincidencia[1], secretoJwt, {
      algorithms: ['HS256'],
      issuer: EMISOR,
      audience: DESTINATARIO
    });
  } catch {
    return rechazarToken(res);
  }

  // Ademas de verificar la firma, se exige vencimiento, identidad y rol.
  if (!identidad || typeof identidad !== 'object' ||
      !Number.isSafeInteger(identidad.exp) ||
      typeof identidad.sub !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(identidad.sub) ||
      !['usuario', 'admin'].includes(identidad.rol)) {
    return rechazarToken(res);
  }

  req.identidad = { id: identidad.sub, rol: identidad.rol };
  next();
}

function exigirAdministrador(req, res, next) {
  if (req.identidad.rol !== 'admin') {
    return res.status(403).json({ error: 'Se requiere el rol admin.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.json({ estado: 'ok' });
});

app.get('/api/perfil', autenticarJwt, (req, res) => {
  res.json({
    usuario: req.identidad.id,
    rol: req.identidad.rol,
    datos: 'Perfil simulado del laboratorio.'
  });
});

app.get('/api/admin', autenticarJwt, exigirAdministrador, (req, res) => {
  res.json({
    usuario: req.identidad.id,
    rol: req.identidad.rol,
    datos: 'Informacion administrativa simulada del laboratorio.'
  });
});

// Configuracion publica: nunca incluye claves, tokens ni variables privadas.
app.get('/configuracion.js', (req, res) => {
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.type('application/javascript').send('window.ACTIVIDAD3_CONFIG = Object.freeze(' +
    JSON.stringify({ origenesPermitidos, demoPublica }) + ');\n');
});

// La emision de roles es EXCLUSIVA de la demo con datos simulados.
// El laboratorio local no registra esta ruta ni modifica sus controles JWT.
if (demoPublica) {
  let ventanaEmision = { inicio: Date.now(), cantidad: 0 };
  app.post('/api/demo/token', (req, res, next) => {
    if (!origenesPermitidos.includes(req.get('origin'))) {
      return res.status(403).json({ error: 'La demo requiere una solicitud desde su propia pagina.' });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Se requiere JSON.' });
    next();
  }, express.json({ limit: '1kb', strict: true }), (req, res) => {
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !['usuario', 'admin'].includes(req.body.rol)) {
      return res.status(400).json({ error: 'Elige un rol de prueba: usuario o admin.' });
    }
    const ahora = Date.now();
    if (ahora - ventanaEmision.inicio >= 60000) ventanaEmision = { inicio: ahora, cantidad: 0 };
    if (ventanaEmision.cantidad >= 60) {
      return res.status(429).set('Retry-After', String(Math.ceil((60000 - (ahora - ventanaEmision.inicio)) / 1000)))
        .json({ error: 'Se alcanzo el limite de tokens de prueba. Espera un minuto.' });
    }
    ventanaEmision.cantidad += 1;
    const token = jwt.sign({ rol: req.body.rol, demo: true }, secretoJwt, {
      algorithm: 'HS256', issuer: EMISOR, audience: DESTINATARIO,
      subject: 'demo-' + req.body.rol + '-' + randomBytes(8).toString('hex'), expiresIn: '5m'
    });
    res.json({ token, rol: req.body.rol, duracionSegundos: 300, demostracion: true });
  });
}

// Publicar solo estos archivos, sin exponer .env, codigo ni dependencias.
const carpetaPublica = path.join(__dirname, 'public');
const cspPagina = [
  "default-src 'none'",
  "base-uri 'none'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join('; ');

for (const [ruta, archivo] of [
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js']
]) {
  app.get(ruta, (req, res, next) => {
    if (archivo === 'index.html') res.set('Content-Security-Policy', cspPagina);
    res.set({
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    });
    res.sendFile(archivo, {
      root: carpetaPublica,
      dotfiles: 'deny',
      cacheControl: false,
      lastModified: false,
      etag: false
    }, (error) => {
      if (error) next(error);
    });
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El JSON supera el limite permitido.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El JSON no es valido.' });
  res.status(500).json({ error: 'Error interno del servicio.' });
});

const servidor = app.listen(PORT, HOST, () => {
  console.log(`API disponible en http://${HOST}:${PORT}`);
});

servidor.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `El puerto ${PORT} esta ocupado. La API no pudo iniciarse.`
    : 'La API no pudo iniciarse.');
  process.exit(1);
});
