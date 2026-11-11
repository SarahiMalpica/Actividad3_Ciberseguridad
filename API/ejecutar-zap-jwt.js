'use strict';

// Actividad 3. Solo el laboratorio local, con identidades simuladas.
// Los JWT no se imprimen ni se guardan en las politicas compartibles.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ROOT = 'D:\\Actividad3_Ciberseguridad';
const BASE = 'http://127.0.0.1:3000';
const PROGRAM = path.join(ROOT, 'Herramientas', 'ZAP', 'Programa', 'ZAP_2.17.0');
const JAVA = path.join(ROOT, 'Herramientas', 'ZAP', 'Java', 'jdk-17.0.21+9-jre', 'bin', 'java.exe');
const PUBLIC = path.join(ROOT, 'Reportes', 'ZAP');
const ROLES = {
  usuario: { folder: 'Usuario', prefix: '09c_ZAP_usuario_api', planHash: 'ba59c446bc9be225b4fcd1d2db4f658ab259cb4a26e8e8016ea529b578f5c05e' },
  admin: { folder: 'Admin', prefix: '10_ZAP_admin_api', planHash: '3e38f763fdd38c69713954592bc1f583ff19d590092f94beefd16539b49ab3bf' }
};
let secret = '';
let token = '';
let redactions = 0;

function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function clean(value) {
  let result = String(value);
  for (const credential of [secret, token]) {
    if (credential) {
      const count = result.split(credential).length - 1;
      redactions += count;
      result = result.split(credential).join('[CREDENCIAL_OCULTA]');
    }
  }
  return result.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, () => {
    redactions++;
    return '[JWT_OCULTO]';
  });
}
function writeNew(file, value) {
  requireThat(!fs.existsSync(file), 'Ya existe un resultado: ' + file);
  fs.writeFileSync(file, value, { encoding: 'utf8', flag: 'wx' });
}
function rolePaths(role) {
  const settings = ROLES[role];
  requireThat(Boolean(settings), 'El rol debe ser usuario o admin.');
  const home = path.join(ROOT, 'Herramientas', 'ZAP', 'Datos-API-' + settings.folder);
  return {
    ...settings, home,
    raw: path.join(home, 'ReportesPrivados'),
    plan: path.join(ROOT, 'ZAP', 'plan-' + role + '-api.yaml')
  };
}
function checkSetup(role) {
  const files = rolePaths(role);
  requireThat(fs.statSync(files.raw).isDirectory(), 'Falta preparar ReportesPrivados.');
  requireThat(fs.statSync(PUBLIC).isDirectory(), 'Falta Reportes\\ZAP.');
  requireThat(fs.existsSync(JAVA), 'No se encontro el Java preparado para ZAP.');
  requireThat(fs.existsSync(path.join(PROGRAM, 'zap-2.17.0.jar')), 'No se encontro el JAR de ZAP.');
  requireThat(sha(fs.readFileSync(files.plan)) === files.planHash, 'El plan cambio; debe revisarse antes de ejecutarlo.');
  return files;
}
function makeToken(role) {
  secret = process.env.ACTIVIDAD3_JWT_SECRET || '';
  delete process.env.ACTIVIDAD3_JWT_SECRET;
  requireThat(/^[a-f0-9]{128}$/.test(secret), 'Inicia Node con --env-file para cargar el secreto local.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (data) => Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const claims = {
    sub: 'zap_' + role, rol: role, iss: 'actividad3', aud: 'actividad3-api',
    iat: now, exp: now + 1200, jti: crypto.randomUUID()
  };
  const unsigned = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(claims);
  // El secreto es el texto de .env, igual que en jsonwebtoken.verify de la API.
  token = unsigned + '.' + crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return claims;
}
async function checkAccess(role, moment, checks) {
  const expected = [['/health', 200], ['/api/perfil', 200], ['/api/admin', role === 'admin' ? 200 : 403]];
  for (const [endpoint, status] of expected) {
    const response = await fetch(BASE + endpoint, {
      headers: { Connection: 'close', ...(endpoint === '/health' ? {} : { Authorization: 'Bearer ' + token }) },
      redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    const body = await response.json();
    const correctBody = endpoint === '/health' ? body.estado === 'ok'
      : status === 403 ? typeof body.error === 'string' && body.error.length > 0
      : body.usuario === 'zap_' + role && body.rol === role && typeof body.datos === 'string';
    const headers = response.headers.get('cache-control') === 'no-store' &&
      response.headers.get('x-content-type-options') === 'nosniff';
    checks.push({ momento: moment, ruta: endpoint, esperado: status, obtenido: response.status, cuerpoCorrecto: correctBody, cabecerasCorrectas: headers });
    requireThat(response.status === status && correctBody && headers, 'Fallo la comprobacion de acceso: ' + moment + ' ' + endpoint);
  }
}
function runZap(files, validation) {
  const env = { ...process.env };
  delete env.ACTIVIDAD3_ZAP_TOKEN;
  const marker = '${ACTIVIDAD3_ZAP_TOKEN}';
  const template = fs.readFileSync(files.plan, 'utf8');
  requireThat(template.split(marker).length === 2, 'El plan debe contener un solo marcador de token.');
  const runtimePlan = path.join(files.home, 'plan-temporal-' + crypto.randomUUID() + '.yaml');
  // Replacer 21 no expande variables en RuleData: materializar solo en el home privado.
  fs.writeFileSync(runtimePlan, template.replace(marker, validation ? 'VALIDACION_SIN_TOKEN_REAL' : token), { encoding: 'utf8', flag: 'wx' });
  delete env.ACTIVIDAD3_JWT_SECRET;
  const args = [
    '-Xmx512m', '-jar', path.join(PROGRAM, 'zap-2.17.0.jar'),
    '-cmd', '-silent', '-installdir', PROGRAM, '-dir', files.home,
    '-config', 'extensions.extension(0).name=ExtensionClientIntegration',
    '-config', 'extensions.extension(0).enabled=false',
    validation ? '-autocheck' : '-autorun', runtimePlan
  ];
  let result;
  try {
    result = spawnSync(JAVA, args, {
      env, encoding: 'utf8', windowsHide: true, shell: false,
      timeout: 12 * 60 * 1000, maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } finally {
    fs.unlinkSync(runtimePlan);
  }
  const raw = (result.stdout || '') + '\n' + (result.stderr || '') +
    '\nCodigo de salida de ZAP: ' + String(result.status) + '\n';
  return { result, raw };
}
function reportIdentity(report) {
  return report.site.map((site) => ({
    sitio: site['@name'],
    alertas: site.alerts.map((alert) => ({
      pluginid: alert.pluginid, riskcode: alert.riskcode,
      confidence: alert.confidence, count: alert.count,
      instancias: (alert.instances || []).length
    }))
  }));
}
async function execute(role) {
  const files = checkSetup(role);
  const publicBase = path.join(PUBLIC, files.prefix);
  const rawBase = path.join(files.raw, files.prefix);
  const suffixes = ['.html', '.json', '_consola.txt', '_comprobaciones.json'];
  for (const suffix of suffixes) requireThat(!fs.existsSync(publicBase + suffix), 'Ya existe evidencia compartible: ' + files.prefix + suffix);
  for (const suffix of ['.html', '.json', '_consola_original.txt']) requireThat(!fs.existsSync(rawBase + suffix), 'Ya existe evidencia privada de ese analisis.');
  const claims = makeToken(role);
  const checks = [];
  const started = new Date().toISOString();
  let zap = null;
  let message = '';
  let completed = false;
  try {
    await checkAccess(role, 'antes', checks);
    console.log('Analizando rol ' + role + '. Espera a que termine ZAP...');
    zap = runZap(files, false);
    writeNew(rawBase + '_consola_original.txt', zap.raw);
    writeNew(publicBase + '_consola.txt', clean(zap.raw));
    requireThat(!zap.result.error && zap.result.status === 0, 'ZAP no termino correctamente. Revisa la consola compartible.');
    requireThat(zap.raw.includes('Automation plan succeeded!'), 'No se confirmo la finalizacion del plan.');
    await checkAccess(role, 'despues', checks);
    const jsonRaw = fs.readFileSync(rawBase + '.json', 'utf8');
    const htmlRaw = fs.readFileSync(rawBase + '.html', 'utf8');
    const original = JSON.parse(jsonRaw);
    requireThat(Array.isArray(original.site) && original.site.length > 0 &&
      original.site.every((site) => site['@name'] === BASE && Array.isArray(site.alerts)),
      'El reporte no confirma el sitio local esperado.');
    const publicJson = clean(jsonRaw);
    requireThat(JSON.stringify(reportIdentity(original)) === JSON.stringify(reportIdentity(JSON.parse(publicJson))),
      'La redaccion cambio contadores o clasificaciones; revisar localmente.');
    const notice = '<p>Actividad 3: copia compartible. Credenciales de prueba ocultas cuando aparecen. Alcance HTTP/JSON; DOM XSS 40026 excluido. Rol: ' + role + '.</p>';
    writeNew(publicBase + '.json', publicJson);
    const publicHtml = clean(htmlRaw);
    writeNew(publicBase + '.html', publicHtml.replace('</body>', notice + '\n</body>'));
    completed = true;
  } catch (error) {
    message = clean(error.message + (error.cause && error.cause.code ? ' (' + error.cause.code + ')' : ''));
  }
  const summary = {
    rol: role, inicio: started, fin: new Date().toISOString(),
    analisisCompletado: completed, codigoZap: zap ? zap.result.status : null,
    comprobaciones: checks, caducidadTokenSegundos: claims.exp - claims.iat,
    alcance: BASE, reglaDomXssExcluida: 40026,
    clientIntegration: 'desactivado; se conservan avisos de dependencias',
    copiasCompartibles: 'Solo credenciales redactadas; hallazgos y contadores conservados.',
    redacciones: redactions, indexJsSha256: sha(fs.readFileSync(path.join(ROOT, 'API', 'index.js'))),
    politicaSha256: files.planHash, ejecutorSha256: sha(fs.readFileSync(__filename)),
    error: message || null
  };
  writeNew(publicBase + '_comprobaciones.json', clean(JSON.stringify(summary, null, 2)) + '\n');
  requireThat(completed, message || 'No se completo el analisis.');
  console.table(checks);
  console.log('ZAP terminado con codigo 0. Revisa los hallazgos en los reportes.');
  for (const suffix of suffixes) console.log('Compartible: ' + publicBase + suffix);
}
function validateBoth() {
  for (const role of Object.keys(ROLES)) {
    const files = checkSetup(role);
    const log = path.join(PUBLIC, files.prefix + '_validacion_v2.txt');
    requireThat(!fs.existsSync(log), 'Ya existe la validacion de ' + role + '; conservarla.');
    console.log('Validando plan de ' + role + ' sin emitir un JWT real...');
    const zap = runZap(files, true);
    writeNew(log, clean(zap.raw));
    requireThat(!zap.result.error && zap.result.status === 0, 'No se valido el plan de ' + role + '. Revisa ' + log);
    console.log('Plan ' + role + ': codigo ' + zap.result.status);
  }
}
async function main() {
  requireThat(path.resolve(__dirname).toLowerCase() === path.join(ROOT, 'API').toLowerCase(), 'El ejecutor debe estar en D:\\Actividad3_Ciberseguridad\\API.');
  const mode = process.argv[2];
  if (mode === 'validar') return validateBoth();
  requireThat(mode === 'ejecutar' && process.argv.length === 4, 'Uso: node ejecutar-zap-jwt.js validar | ejecutar usuario | ejecutar admin');
  await execute(process.argv[3]);
}
main().catch((error) => {
  console.error('ERROR: ' + clean(error.message));
  console.error('Comparte solo los archivos de D:\\Actividad3_Ciberseguridad\\Reportes\\ZAP.');
  process.exitCode = 1;
});
