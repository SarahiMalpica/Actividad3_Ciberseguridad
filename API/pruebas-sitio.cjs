'use strict';

// Pruebas locales. No imprime ni guarda el secreto o los JWT utilizados.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

const api = __dirname;
const base = process.env.ACTIVIDAD3_TEST_URL || 'http://127.0.0.1:3000';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d{1,5}$/);
if (fs.existsSync(path.join(api, '.env'))) process.loadEnvFile(path.join(api, '.env'));
const requireApi = createRequire(path.join(api, 'package.json'));
const jwt = requireApi('jsonwebtoken');
const secreto = process.env.ACTIVIDAD3_JWT_SECRET;
delete process.env.ACTIVIDAD3_JWT_SECRET;
assert.match(secreto || '', /^[a-f0-9]{128}$/);
const opciones = { algorithm: 'HS256', issuer: 'actividad3', audience: 'actividad3-api', expiresIn: '5m' };
const emitir = (rol, cambios = {}, clave = secreto) => jwt.sign({ rol }, clave, {
  ...opciones, subject: 'prueba-sitio-' + rol, ...cambios
});
const usuario = emitir('usuario');
const admin = emitir('admin');
const invalido = emitir('usuario', {}, 'clave-ficticia-incorrecta');
const vencido = emitir('usuario', { expiresIn: -60 });
const sinExp = jwt.sign({ rol: 'usuario' }, secreto, {
  algorithm: 'HS256', issuer: 'actividad3', audience: 'actividad3-api', subject: 'prueba-sitio-usuario'
});
const tokens = [usuario, admin, invalido, vencido, sinExp];
const resultados = [];
const inicio = new Date().toISOString();

async function prueba(capa, nombre, ejecutar) {
  try {
    await ejecutar();
    resultados.push({ capa, caso: nombre, correcto: true });
    console.log('OK | ' + capa + ' | ' + nombre);
  } catch (error) {
    // Redactar incluso ante fallos de una asercion.
    let detalle = String(error.message || 'Fallo de comprobacion');
    for (const dato of [secreto, ...tokens]) detalle = detalle.split(dato).join('[CREDENCIAL_OCULTA]');
    detalle = detalle.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_OCULTO]');
    resultados.push({ capa, caso: nombre, correcto: false, detalle: detalle.slice(0, 600) });
    console.log('FALLO | ' + capa + ' | ' + nombre);
  }
}

function solicitar(ruta, opcionesPeticion = {}) {
  return fetch(base + ruta, {
    ...opcionesPeticion,
    headers: { Connection: 'close', ...opcionesPeticion.headers },
    redirect: 'error',
    signal: opcionesPeticion.signal || AbortSignal.timeout(8000)
  });
}

function cabecerasSeguras(respuesta) {
  assert.equal(respuesta.headers.get('cache-control'), 'no-store');
  assert.equal(respuesta.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(respuesta.headers.get('x-frame-options'), 'DENY');
  assert.equal(respuesta.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(respuesta.headers.get('x-powered-by'), null);
  assert.equal(respuesta.headers.get('etag'), null);
}

// DOM minimo para ejecutar el JavaScript real del sitio sin almacenar los JWT.
// No sustituye la inspeccion de maquetacion ni la ejecucion en un navegador.
function interfaz({ origen = base, peticion = solicitar, temporizador = setTimeout } = {}) {
  class Elemento {
    constructor() { this.textContent = ''; this.value = ''; this.disabled = true; this.dataset = {}; this.atributos = {}; this.eventos = {}; }
    setAttribute(k, v) { this.atributos[k] = v; }
    querySelector() { return this.etiqueta; }
    addEventListener(k, fn) { (this.eventos[k] ||= []).push(fn); }
    focus() {}
    emitir(k) { return Promise.all((this.eventos[k] || []).map(fn => fn())); }
  }
  const html = fs.readFileSync(path.join(api, 'public/index.html'), 'utf8');
  const elementos = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m => [m[1], new Elemento()]));
  for (const [id, texto] of [['consultar-estado', 'Consultar estado'], ['consultar-perfil', 'Consultar perfil'], ['consultar-admin', 'Consultar administración']]) {
    elementos[id].etiqueta = new Elemento(); elementos[id].etiqueta.textContent = texto;
  }
  const eventosVentana = {};
  const solicitudes = [];
  const sandbox = {
    document: { getElementById: id => elementos[id] },
    window: { ACTIVIDAD3_CONFIG: { origenesPermitidos: [base], demoPublica: false }, location: { origin: origen }, addEventListener: (tipo, fn) => (eventosVentana[tipo] ||= []).push(fn) },
    Date, AbortController, setTimeout: temporizador, clearTimeout,
    fetch: (ruta, opcionesFetch) => { solicitudes.push({ ruta, opciones: opcionesFetch }); return peticion(ruta, opcionesFetch); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(api, 'public/app.js'), 'utf8'), sandbox, { filename: 'public/app.js' });
  return {
    elementos, solicitudes,
    async token(valor) { elementos['jwt-token'].value = valor; await elementos['jwt-token'].emitir('input'); },
    click(id) { return elementos[id].emitir('click'); },
    async ventana(tipo) { for (const fn of eventosVentana[tipo] || []) await fn(); }
  };
}

async function main() {
  const casos = [
    ['Estado publico', '/health', null, 200],
    ['Perfil sin token', '/api/perfil', null, 401],
    ['Admin sin token', '/api/admin', null, 401],
    ['Perfil firma invalida', '/api/perfil', invalido, 401],
    ['Admin firma invalida', '/api/admin', invalido, 401],
    ['Perfil token vencido', '/api/perfil', vencido, 401],
    ['Admin token vencido', '/api/admin', vencido, 401],
    ['Perfil usuario', '/api/perfil', usuario, 200, 'usuario'],
    ['Admin sin permiso', '/api/admin', usuario, 403],
    ['Admin autorizado', '/api/admin', admin, 200, 'admin'],
    ['Perfil administrador', '/api/perfil', admin, 200, 'admin'],
    ['Token sin vencimiento', '/api/perfil', sinExp, 401],
    ['Emisor incorrecto', '/api/perfil', emitir('usuario', { issuer: 'otro' }), 401],
    ['Destinatario incorrecto', '/api/perfil', emitir('usuario', { audience: 'otro' }), 401],
    ['Algoritmo no permitido', '/api/perfil', emitir('usuario', { algorithm: 'HS384' }), 401],
    ['Rol no permitido', '/api/perfil', emitir('invitado'), 401],
    ['Cabecera mal formada', '/api/perfil', 'no-es-un-jwt', 401]
  ];
  for (const [nombre, ruta, token, codigo, rol] of casos) {
    await prueba('HTTP real', nombre, async () => {
      const respuesta = await solicitar(ruta, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      assert.equal(respuesta.status, codigo);
      cabecerasSeguras(respuesta);
      assert.match(respuesta.headers.get('content-type'), /application\/json/);
      assert.equal(respuesta.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
      const cuerpo = await respuesta.json();
      if (ruta === '/health') assert.equal(cuerpo.estado, 'ok');
      else if (codigo === 200) { assert.equal(cuerpo.rol, rol); assert.equal(cuerpo.usuario, 'prueba-sitio-' + rol); assert.equal(typeof cuerpo.datos, 'string'); }
      else { assert.equal(typeof cuerpo.error, 'string'); assert.ok(!('datos' in cuerpo) && !('usuario' in cuerpo)); }
      if (codigo === 401) assert.match(respuesta.headers.get('www-authenticate'), /^Bearer\b/);
    });
  }
  for (const [ruta, archivo, tipo] of [['/', 'index.html', 'text/html'], ['/index.html', 'index.html', 'text/html'], ['/styles.css', 'styles.css', 'text/css'], ['/app.js', 'app.js', 'javascript']]) {
    await prueba('HTTP real', 'Archivo publico ' + ruta, async () => {
      const respuesta = await solicitar(ruta);
      assert.equal(respuesta.status, 200); cabecerasSeguras(respuesta);
      assert.ok(respuesta.headers.get('content-type').includes(tipo));
      assert.equal(respuesta.headers.get('last-modified'), null);
      assert.equal(respuesta.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.ok(Buffer.from(await respuesta.arrayBuffer()).equals(fs.readFileSync(path.join(api, 'public', archivo))));
      if (archivo === 'index.html') {
        const csp = respuesta.headers.get('content-security-policy');
        for (const directiva of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directiva));
        assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
        assert.equal(respuesta.headers.get('cross-origin-embedder-policy'), 'require-corp');
        assert.ok(respuesta.headers.get('permissions-policy').includes('camera=()'));
      }
    });
  }
  await prueba('HTTP real', 'Configuracion del cliente sin credenciales ni demo local', async () => {
    const respuesta = await solicitar('/configuracion.js');
    assert.equal(respuesta.status, 200); cabecerasSeguras(respuesta);
    assert.match(respuesta.headers.get('content-type'), /javascript/);
    const contexto = { window: {} };
    const texto = await respuesta.text();
    assert.ok(!texto.includes(secreto));
    vm.runInNewContext(texto, contexto);
    assert.equal(contexto.window.ACTIVIDAD3_CONFIG.demoPublica, false);
    assert.ok(contexto.window.ACTIVIDAD3_CONFIG.origenesPermitidos.includes(base));
    assert.equal((await solicitar('/api/demo/token', { method: 'POST' })).status, 404);
  });
  for (const ruta of ['/.env', '/index.js', '/package.json', '/package-lock.json', '/node_modules/express/package.json', '/pruebas-jwt.js', '/ejecutar-zap-jwt.js', '/%2e%2e%2f.env', '/ruta-inexistente', '/configuracion-servidor.cjs', '/pruebas-render.cjs']) {
    await prueba('HTTP real', 'No publicar ' + ruta, async () => {
      const respuesta = await solicitar(ruta);
      assert.equal(respuesta.status, 404); cabecerasSeguras(respuesta);
      assert.equal((await respuesta.json()).error, 'Ruta no encontrada.');
    });
  }
  await prueba('HTTP real', 'HEAD de pagina publica', async () => {
    const respuesta = await solicitar('/', { method: 'HEAD' });
    assert.equal(respuesta.status, 200); cabecerasSeguras(respuesta); assert.equal(await respuesta.text(), '');
  });

  await prueba('Cliente con HTTP real', 'Estado y carga sin enviar JWT a health', async () => {
    const ui = interfaz(); await ui.token(usuario);
    const consulta = ui.click('consultar-estado');
    assert.equal(ui.elementos['panel-resultado'].atributos['aria-busy'], 'true');
    assert.equal(ui.elementos['consultar-admin'].disabled, true);
    await consulta;
    assert.equal(ui.elementos['resultado-http'].textContent, '200');
    assert.equal(JSON.parse(ui.elementos['resultado-json'].textContent).estado, 'ok');
    assert.equal(ui.solicitudes[0].opciones.headers.Authorization, undefined);
    assert.equal(ui.elementos['estado-titulo'].textContent, 'Servicio disponible');
    assert.equal(ui.elementos['consultar-admin'].disabled, false);
  });
  await prueba('Cliente con HTTP real', 'Perfil y admin sin token muestran 401', async () => {
    const ui = interfaz();
    for (const id of ['consultar-perfil', 'consultar-admin']) {
      await ui.click(id); assert.equal(ui.elementos['resultado-http'].textContent, '401');
      assert.ok(ui.elementos['resultado-explicacion'].textContent.includes('autenticación'));
    }
  });
  for (const [nombre, token, perfilHttp, adminHttp] of [['usuario', usuario, '200', '403'], ['administrador', admin, '200', '200'], ['invalido', invalido, '401', '401'], ['vencido', vencido, '401', '401']]) {
    await prueba('Cliente con HTTP real', 'Botones con token ' + nombre, async () => {
      const ui = interfaz(); await ui.token(token);
      await ui.click('consultar-perfil'); assert.equal(ui.elementos['resultado-http'].textContent, perfilHttp);
      await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, adminHttp);
      for (const solicitud of ui.solicitudes) {
        assert.equal(solicitud.opciones.headers.Authorization, 'Bearer ' + token);
        assert.equal(solicitud.opciones.credentials, 'omit');
        assert.equal(solicitud.opciones.redirect, 'error');
        assert.equal(solicitud.opciones.mode, 'same-origin');
      }
    });
  }
  await prueba('Cliente con HTTP real', 'Borrar token limpia el campo, resultado y autenticacion', async () => {
    const ui = interfaz(); await ui.token(admin); await ui.click('consultar-admin');
    await ui.click('borrar-token');
    assert.equal(ui.elementos['jwt-token'].value, '');
    assert.ok(!ui.elementos['resultado-json'].textContent.includes('prueba-sitio-admin'));
    await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, '401');
    assert.equal(ui.solicitudes.at(-1).opciones.headers.Authorization, undefined);
  });
  await prueba('Cliente con HTTP real', 'Salir y restaurar pagina elimina JWT y resultados', async () => {
    const ui = interfaz(); await ui.token(admin); await ui.click('consultar-admin');
    await ui.ventana('pagehide'); await ui.ventana('pageshow');
    assert.equal(ui.elementos['jwt-token'].value, '');
    assert.ok(!ui.elementos['resultado-json'].textContent.includes('prueba-sitio-admin'));
    await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, '401');
  });
  await prueba('Cliente simulado', 'Desconexion devuelve aviso y rehabilita botones', async () => {
    const ui = interfaz({ peticion: async () => { throw new TypeError('fetch failed'); } });
    await ui.click('consultar-estado');
    assert.equal(ui.elementos['resultado-http'].textContent, 'Sin respuesta');
    assert.ok(ui.elementos['resultado-explicacion'].textContent.includes('desconectado'));
    assert.equal(ui.elementos['consultar-estado'].disabled, false);
  });
  await prueba('Cliente simulado', 'Espera de 8 segundos cancela la solicitud', async () => {
    const ui = interfaz({ peticion: (ruta, opcionesFetch) => new Promise((resolve, reject) => {
      opcionesFetch.signal.addEventListener('abort', () => reject(new DOMException('Cancelada', 'AbortError')), { once: true });
    }) });
    await ui.click('consultar-estado');
    assert.ok(ui.elementos['resultado-explicacion'].textContent.includes('8 segundos'));
    assert.equal(ui.elementos['consultar-estado'].disabled, false);
  });
  await prueba('Cliente simulado', 'Una respuesta tardia no reaparece tras borrar token', async () => {
    let terminar;
    const ui = interfaz({ peticion: () => new Promise(resolve => { terminar = resolve; }) });
    await ui.token(admin);
    const pendiente = ui.click('consultar-admin'); await ui.click('borrar-token');
    terminar(new Response(JSON.stringify({ usuario: 'prueba-sitio-admin', rol: 'admin', datos: 'Simulado' }), { status: 200 }));
    await pendiente;
    assert.equal(ui.elementos['resultado-http'].textContent, '—');
    assert.ok(!ui.elementos['resultado-json'].textContent.includes('prueba-sitio-admin'));
  });
  await prueba('Cliente simulado', 'Origen distinto del laboratorio mantiene controles desactivados', async () => {
    const ui = interfaz({ origen: 'https://example.invalid' });
    assert.equal(ui.elementos['jwt-token'].disabled, true);
    assert.equal(ui.elementos['consultar-estado'].disabled, true);
    assert.equal(ui.solicitudes.length, 0);
  });
  await prueba('Cliente simulado', 'Respuesta no JSON se muestra como texto', async () => {
    const texto = '<div>Respuesta inesperada</div>';
    const ui = interfaz({ peticion: async () => new Response(texto, { status: 502 }) });
    await ui.click('consultar-estado');
    assert.equal(ui.elementos['resultado-http'].textContent, '502');
    assert.equal(ui.elementos['resultado-json'].textContent, texto);
    assert.ok(ui.elementos['resultado-formato'].textContent.includes('no JSON'));
  });

  const informe = {
    inicio, fin: new Date().toISOString(), servidor: base, node: process.version,
    dependencias: requireApi('./package.json').dependencies,
    archivos: Object.fromEntries(['index.js', 'public/index.html', 'public/styles.css', 'public/app.js'].map(nombre => [nombre, createHash('sha256').update(fs.readFileSync(path.join(api, nombre))).digest('hex')])),
    alcance: 'API real en Windows; JavaScript real del sitio ejecutado con DOM minimo. Las pruebas de desconexion, timeout, respuesta tardia y no JSON son simuladas. No verifica maquetacion, CSP en navegador ni LocalStack.',
    total: resultados.length, correctas: resultados.filter(r => r.correcto).length,
    fallidas: resultados.filter(r => !r.correcto).length, resultados
  };
  const carpetaInformes = path.join(api, '..', 'Reportes', 'Nuevas');
  fs.mkdirSync(carpetaInformes, { recursive: true });
  const nombreInforme = 'resultado-' + informe.fin.replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(path.join(carpetaInformes, nombreInforme), JSON.stringify(informe, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ total: informe.total, correctas: informe.correctas, fallidas: informe.fallidas, informe: path.join(carpetaInformes, nombreInforme) }));
  if (informe.fallidas) process.exitCode = 1;
}

main().catch(() => { console.error('No se pudo completar la verificacion local. No se imprimen credenciales.'); process.exitCode = 1; });
