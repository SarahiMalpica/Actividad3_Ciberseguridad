'use strict';

// Emulacion local de la configuracion de Render; no crea ni consulta servicios cloud.
// Claves y JWT de prueba se mantienen en memoria y no aparecen en los informes.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const jwt = require('jsonwebtoken');
const configurar = require('./configuracion-servidor.cjs');
const clave = randomBytes(64).toString('hex');
const origenDemo = 'https://actividad3-prueba.invalid';
const resultados = [];
const procesos = [];
let regresion = null;

async function prueba(capa, caso, ejecutar) {
  try { await ejecutar(); resultados.push({ capa, caso, correcto: true }); console.log('OK | ' + capa + ' | ' + caso); }
  catch { resultados.push({ capa, caso, correcto: false }); console.error('FALLO | ' + capa + ' | ' + caso); }
}
function entornoLimpio(extra = {}) {
  const entorno = { ...process.env };
  for (const key of Object.keys(entorno)) if (/^(?:RENDER|ACTIVIDAD3_|PORT$)/.test(key)) delete entorno[key];
  return { ...entorno, ...extra };
}
async function puertoLibre() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const puerto = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return puerto;
}
async function iniciar(extra) {
  const puerto = await puertoLibre();
  const env = entornoLimpio({ PORT: String(puerto), ...extra });
  const child = spawn(process.execPath, ['index.js'], { cwd: __dirname, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  procesos.push(child);
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El servidor de prueba no inicio')), 8000);
    child.once('error', () => { clearTimeout(timeout); reject(new Error('No se pudo iniciar Node')); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('El servidor de prueba termino')); });
    child.stdout.on('data', chunk => { if (String(chunk).includes('API disponible')) { clearTimeout(timeout); resolve(); } });
  });
  return { child, env, base: 'http://127.0.0.1:' + puerto };
}
function crearInterfaz(configuracion, peticion, origen = origenDemo) {
  class Elemento {
    constructor() { this.textContent = ''; this.value = ''; this.disabled = true; this.hidden = true; this.dataset = {}; this.atributos = {}; this.eventos = {}; }
    setAttribute(key, value) { this.atributos[key] = value; }
    querySelector() { return this.etiqueta; }
    addEventListener(key, fn) { (this.eventos[key] ||= []).push(fn); }
    focus() {}
    emitir(key) { return Promise.all((this.eventos[key] || []).map(fn => fn())); }
  }
  const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
  const elementos = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Elemento()]));
  for (const id of ['consultar-estado', 'consultar-perfil', 'consultar-admin']) { elementos[id].etiqueta = new Elemento(); elementos[id].etiqueta.textContent = id; }
  const eventos = {};
  const ventana = { ACTIVIDAD3_CONFIG: configuracion, location: { origin: origen }, addEventListener: (key, fn) => (eventos[key] ||= []).push(fn) };
  const documento = { getElementById: id => elementos[id] };
  for (const target of [ventana, documento]) {
    for (const key of ['localStorage', 'sessionStorage', 'cookie']) Object.defineProperty(target, key, { get() { throw new Error('Persistencia prohibida'); }, set() { throw new Error('Persistencia prohibida'); } });
  }
  const contexto = { window: ventana, document: documento, Date, AbortController, setTimeout, clearTimeout, fetch: peticion };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8'), contexto);
  return { elementos, click: id => elementos[id].emitir('click'), ventana: async key => { for (const fn of eventos[key] || []) await fn(); } };
}

async function main() {
  await prueba('Configuracion', 'Windows conserva loopback y puerto 3000, demo desactivada', () => {
    const config = configurar({ ACTIVIDAD3_JWT_SECRET: clave });
    assert.equal(config.HOST, '127.0.0.1'); assert.equal(config.PORT, 3000); assert.equal(config.demoPublica, false);
  });
  await prueba('Configuracion', 'Render utiliza todas las interfaces y el puerto asignado', () => {
    const config = configurar({ RENDER: 'true', PORT: '10000', RENDER_EXTERNAL_URL: origenDemo, ACTIVIDAD3_DEMO_PUBLICA: '1' });
    assert.equal(config.HOST, '0.0.0.0'); assert.equal(config.PORT, 10000); assert.equal(config.origenPublico, origenDemo);
    assert.match(config.secretoJwt, /^[a-f0-9]{128}$/);
  });
  await prueba('Configuracion', 'Cada instancia de demo obtiene una clave diferente', () => {
    const env = { RENDER: 'true', RENDER_EXTERNAL_URL: origenDemo, ACTIVIDAD3_DEMO_PUBLICA: '1' };
    assert.notEqual(configurar(env).secretoJwt, configurar(env).secretoJwt);
  });
  for (const puerto of ['0', '-1', '65536', 'abc', '3000x']) {
    await prueba('Configuracion', 'Rechazar puerto invalido ' + puerto, () => assert.throws(() => configurar({ ACTIVIDAD3_JWT_SECRET: clave, PORT: puerto })));
  }
  for (const direccion of ['http://sitio.invalid', 'https://sitio.invalid/ruta', 'https://sitio.invalid/?token=x', 'https://usuario:clave@sitio.invalid', 'https://sitio.invalid/#x']) {
    await prueba('Configuracion', 'Rechazar origen con protocolo, ruta o credenciales incorrectos: ' + direccion.replace('usuario:clave@', ''), () => {
      assert.throws(() => configurar({ ACTIVIDAD3_JWT_SECRET: clave, ACTIVIDAD3_PUBLIC_ORIGIN: direccion }));
    });
  }
  await prueba('Configuracion', 'Demo requiere un origen HTTPS configurado', () => assert.throws(() => configurar({ ACTIVIDAD3_JWT_SECRET: clave, ACTIVIDAD3_DEMO_PUBLICA: '1' })));
  await prueba('Configuracion', 'Windows no genera automaticamente una clave de laboratorio', () => assert.throws(() => configurar({})));
  await prueba('Configuracion', 'Un Render sin modo demo exige una clave explicita', () => assert.throws(() => configurar({ RENDER: 'true', RENDER_EXTERNAL_URL: origenDemo })));
  await prueba('Configuracion', 'Una clave explicita incorrecta no activa la generacion automatica', () => assert.throws(() => configurar({ RENDER: 'true', RENDER_EXTERNAL_URL: origenDemo, ACTIVIDAD3_DEMO_PUBLICA: '1', ACTIVIDAD3_JWT_SECRET: 'incorrecta' })));

  const local = await iniciar({ ACTIVIDAD3_JWT_SECRET: clave });
  await prueba('Regresion local', 'Ejecutar la suite del sitio contra un servidor aislado', async () => {
    const child = spawn(process.execPath, ['pruebas-sitio.cjs'], { cwd: __dirname, windowsHide: true, env: { ...local.env, ACTIVIDAD3_TEST_URL: local.base }, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = ''; child.stdout.on('data', data => { salida += data; }); child.stderr.resume();
    const codigo = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    const resumen = salida.trim().split(/\r?\n/).at(-1);
    regresion = JSON.parse(resumen);
    assert.equal(codigo, 0); assert.equal(regresion.fallidas, 0); assert.equal(regresion.total, 47);
  });

  const demo = await iniciar({ RENDER: 'true', RENDER_EXTERNAL_URL: origenDemo, ACTIVIDAD3_DEMO_PUBLICA: '1' });
  const request = (ruta, opciones = {}) => fetch(demo.base + ruta, { ...opciones, signal: opciones.signal || AbortSignal.timeout(8000) });
  const post = (body, headers = {}) => request('/api/demo/token', { method: 'POST', headers: { Origin: origenDemo, 'Content-Type': 'application/json', ...headers }, body });
  let emitidos = 0;
  const emitir = async rol => { const response = await post(JSON.stringify({ rol })); assert.equal(response.status, 200); emitidos++; return response.json(); };
  let configCliente;
  const roles = {};
  await prueba('HTTP modo Render emulado', 'Estado publico disponible', async () => assert.equal((await request('/health').then(r => r.json())).estado, 'ok'));
  await prueba('HTTP modo Render emulado', 'Configuracion publica habilita solo origenes previstos y no contiene secretos', async () => {
    const response = await request('/configuracion.js');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const source = await response.text(); const context = { window: {} }; vm.runInNewContext(source, context);
    configCliente = context.window.ACTIVIDAD3_CONFIG;
    assert.equal(configCliente.demoPublica, true); assert.ok(configCliente.origenesPermitidos.includes(origenDemo));
    assert.deepEqual(Object.keys(configCliente).sort(), ['demoPublica', 'origenesPermitidos']); assert.ok(!source.includes(clave));
  });
  for (const rol of ['usuario', 'admin']) {
    await prueba('HTTP modo Render emulado', 'JWT temporal ' + rol + ' emitido en servidor', async () => {
      roles[rol] = await emitir(rol); const data = jwt.decode(roles[rol].token);
      assert.equal(data.rol, rol); assert.equal(data.exp - data.iat, 300); assert.equal(data.iss, 'actividad3'); assert.equal(data.aud, 'actividad3-api');
      assert.match(data.sub, /^demo-(usuario|admin)-[a-f0-9]{16}$/); assert.equal(data.demo, true);
    });
  }
  for (const [rol, ruta, codigo] of [['usuario', '/api/perfil', 200], ['usuario', '/api/admin', 403], ['admin', '/api/perfil', 200], ['admin', '/api/admin', 200]]) {
    await prueba('HTTP modo Render emulado', rol + ' en ' + ruta + ': ' + codigo, async () => {
      const response = await request(ruta, { headers: { Authorization: 'Bearer ' + roles[rol].token } });
      assert.equal(response.status, codigo); assert.equal(response.headers.get('cache-control'), 'no-store');
    });
  }
  await prueba('HTTP modo Render emulado', 'Sin JWT se mantiene 401 en recursos protegidos', async () => {
    for (const ruta of ['/api/perfil', '/api/admin']) assert.equal((await request(ruta)).status, 401);
  });
  await prueba('HTTP modo Render emulado', 'JWT del laboratorio no sirve en la instancia publica', async () => {
    const token = jwt.sign({ rol: 'admin' }, clave, { algorithm: 'HS256', issuer: 'actividad3', audience: 'actividad3-api', subject: 'laboratorio', expiresIn: '5m' });
    assert.equal((await request('/api/admin', { headers: { Authorization: 'Bearer ' + token } })).status, 401);
  });
  for (const [caso, body, headers, codigo] of [
    ['Origen ajeno', '{"rol":"admin"}', { Origin: 'https://otro.invalid' }, 403],
    ['Sin origen', '{"rol":"admin"}', { Origin: '' }, 403],
    ['Tipo incorrecto', '{"rol":"admin"}', { 'Content-Type': 'text/plain' }, 415],
    ['JSON mal formado', '{', {}, 400],
    ['Cuerpo demasiado grande', JSON.stringify({ rol: 'admin', extra: 'x'.repeat(2000) }), {}, 413],
    ['Rol inexistente', '{"rol":"propietario"}', {}, 400],
    ['Parametros adicionales', '{"rol":"admin","exp":9999999999}', {}, 400],
    ['Lista en vez de objeto', '["admin"]', {}, 400]
  ]) {
    await prueba('HTTP modo Render emulado', 'Emision rechazada: ' + caso, async () => {
      const response = await post(body, headers); assert.equal(response.status, codigo);
      assert.equal(response.headers.get('access-control-allow-origin'), null); assert.equal(typeof (await response.json()).error, 'string');
    });
  }
  await prueba('HTTP modo Render emulado', 'Archivos privados y metodo GET de emision no se publican', async () => {
    for (const ruta of ['/.env', '/configuracion-servidor.cjs', '/index.js', '/package-lock.json', '/api/demo/token']) assert.equal((await request(ruta)).status, 404);
  });

  const clienteReal = (ruta, opciones) => {
    assert.equal(opciones.credentials, 'omit'); assert.equal(opciones.mode, 'same-origin'); assert.equal(opciones.redirect, 'error');
    if (ruta === '/api/demo/token') assert.equal(opciones.headers.Authorization, undefined);
    return request(ruta, { ...opciones, headers: { ...opciones.headers, Origin: origenDemo } });
  };
  await prueba('Cliente con HTTP real local', 'Boton usuario carga JWT en memoria, muestra 200 y comprueba 403', async () => {
    const ui = crearInterfaz(configCliente, clienteReal); assert.equal(ui.elementos['modo-demo'].hidden, false);
    await ui.click('demo-usuario'); emitidos++;
    const token = ui.elementos['jwt-token'].value;
    assert.ok(token); assert.equal(ui.elementos['resultado-http'].textContent, '200'); assert.ok(!ui.elementos['resultado-json'].textContent.includes(token));
    await ui.click('consultar-perfil'); assert.equal(ui.elementos['resultado-http'].textContent, '200');
    await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, '403');
    await ui.click('borrar-token'); assert.equal(ui.elementos['jwt-token'].value, '');
    await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, '401');
  });
  await prueba('Cliente con HTTP real local', 'Boton admin permite 200 y salir elimina el JWT', async () => {
    const ui = crearInterfaz(configCliente, clienteReal); await ui.click('demo-admin'); emitidos++;
    assert.ok(ui.elementos['jwt-token'].value);
    await ui.click('consultar-admin'); assert.equal(ui.elementos['resultado-http'].textContent, '200');
    await ui.ventana('pagehide'); await ui.ventana('pageshow'); assert.equal(ui.elementos['jwt-token'].value, '');
  });
  await prueba('Cliente simulado', 'Una copia en un origen ajeno no habilita roles ni solicitudes', async () => {
    let solicitudes = 0;
    const ui = crearInterfaz(configCliente, async () => { solicitudes++; }, 'https://copia.invalid');
    await ui.click('demo-admin'); assert.equal(solicitudes, 0); assert.equal(ui.elementos['demo-admin'].disabled, true);
  });
  await prueba('Cliente simulado', 'Una emision tardia no restaura el token despues de borrarlo', async () => {
    let resolver;
    const ui = crearInterfaz(configCliente, () => new Promise(resolve => { resolver = resolve; }));
    const pendiente = ui.click('demo-admin'); await ui.click('borrar-token');
    resolver(new Response(JSON.stringify(roles.admin), { status: 200 })); await pendiente;
    assert.equal(ui.elementos['jwt-token'].value, ''); assert.equal(ui.elementos['resultado-http'].textContent, '—');
  });
  await prueba('Cliente simulado', 'Fallo al emitir JWT muestra aviso y permite reintentar', async () => {
    const ui = crearInterfaz(configCliente, async () => { throw new Error('Sin conexion'); });
    await ui.click('demo-usuario'); assert.equal(ui.elementos['jwt-token'].value, '');
    assert.equal(ui.elementos['resultado-http'].textContent, 'Sin respuesta'); assert.equal(ui.elementos['demo-usuario'].disabled, false);
  });
  await prueba('HTTP modo Render emulado', 'Emision limitada a 60 tokens por minuto por instancia', async () => {
    while (emitidos < 60) { await emitir('usuario'); }
    const response = await post('{"rol":"usuario"}'); assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) >= 1);
  });
}

(async () => {
  try { await main(); }
  finally {
    for (const child of procesos) {
      if (child.exitCode === null) { const cierre = new Promise(resolve => child.once('exit', resolve)); child.kill(); await cierre; }
    }
  }
  const informe = {
    fecha: new Date().toISOString(), node: process.version,
    alcance: 'Preparacion de Render emulada en Windows con HTTP local y DOM minimo; no es un despliegue ni verifica TLS o cuotas de Render. No se ejecutan LocalStack, Terraform, Trivy o ZAP.',
    regresionLocal: regresion ? { total: regresion.total, correctas: regresion.correctas, fallidas: regresion.fallidas } : null,
    total: resultados.length, correctas: resultados.filter(r => r.correcto).length, fallidas: resultados.filter(r => !r.correcto).length,
    archivos: Object.fromEntries(['index.js', 'configuracion-servidor.cjs', 'public/app.js', 'public/index.html', 'public/styles.css', '../render.yaml'].map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')])),
    resultados
  };
  const carpeta = path.join(__dirname, '../Reportes/Nuevas'); fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, 'render-' + informe.fecha.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(archivo, JSON.stringify(informe, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ total: informe.total, correctas: informe.correctas, fallidas: informe.fallidas, regresionLocal: informe.regresionLocal, informe: archivo }));
  if (informe.fallidas) process.exitCode = 1;
})().catch(() => { console.error('No se completo la preparacion de Render. No se imprimen credenciales.'); process.exitCode = 1; });
