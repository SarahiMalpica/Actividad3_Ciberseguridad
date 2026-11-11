'use strict';

// Pruebas locales: la clave y los tokens permanecen solo en memoria.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const jwt = require('jsonwebtoken');

async function ejecutarPruebas() {
  const secreto = process.env.ACTIVIDAD3_JWT_SECRET;
  if (typeof secreto !== 'string' || !/^[a-f0-9]{128}$/.test(secreto)) {
    console.error('Carga el archivo .env para ejecutar las pruebas.');
    process.exitCode = 1;
    return;
  }

  const base = 'http://127.0.0.1:3000';
  const carpeta = path.resolve(__dirname, '..', 'Reportes');
  const archivo = path.join(carpeta, '07_Pruebas_JWT_API.json');
  fs.mkdirSync(carpeta, { recursive: true });
  if (fs.existsSync(archivo)) {
    console.error('Ya existe 07_Pruebas_JWT_API.json. Conserva el informe.');
    process.exitCode = 1;
    return;
  }

  const opciones = {
    algorithm: 'HS256',
    issuer: 'actividad3',
    audience: 'actividad3-api',
    expiresIn: '5m'
  };
  const usuario = jwt.sign({ rol: 'usuario' }, secreto, {
    ...opciones, subject: 'usuario-prueba'
  });
  const administrador = jwt.sign({ rol: 'admin' }, secreto, {
    ...opciones, subject: 'admin-prueba'
  });
  const invalido = jwt.sign({ rol: 'usuario' }, 'clave-incorrecta-de-prueba', {
    ...opciones, subject: 'usuario-prueba'
  });
  const vencido = jwt.sign({ rol: 'usuario' }, secreto, {
    ...opciones, subject: 'usuario-prueba', expiresIn: -60
  });

  const casos = [
    ['Perfil sin token', '/api/perfil', null, 401],
    ['Admin sin token', '/api/admin', null, 401],
    ['Perfil firma invalida', '/api/perfil', invalido, 401],
    ['Admin firma invalida', '/api/admin', invalido, 401],
    ['Perfil token vencido', '/api/perfil', vencido, 401],
    ['Admin token vencido', '/api/admin', vencido, 401],
    ['Perfil usuario', '/api/perfil', usuario, 200, 'usuario-prueba', 'usuario'],
    ['Admin sin permiso', '/api/admin', usuario, 403],
    ['Admin autorizado', '/api/admin', administrador, 200, 'admin-prueba', 'admin'],
    ['Perfil administrador', '/api/perfil', administrador, 200, 'admin-prueba', 'admin']
  ];

  const resultados = [];
  for (const [caso, ruta, token, esperado, identidad, rol] of casos) {
    let obtenido = null;
    let cuerpoCorrecto = false;
    let cabeceraCorrecta = false;
    let detalle = '';
    try {
      const respuesta = await fetch(base + ruta, {
        method: 'GET',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      obtenido = respuesta.status;
      cabeceraCorrecta = esperado !== 401 ||
        /^Bearer\b/i.test(respuesta.headers.get('www-authenticate') || '');
      const cuerpo = await respuesta.json();
      const esObjeto = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo);
      cuerpoCorrecto = Boolean(esObjeto && (esperado === 200
        ? cuerpo.usuario === identidad && cuerpo.rol === rol && typeof cuerpo.datos === 'string'
        : typeof cuerpo.error === 'string' && !('datos' in cuerpo) && !('usuario' in cuerpo)));
    } catch {
      detalle = 'No se pudo obtener una respuesta JSON de la API.';
    }
    resultados.push({
      caso, ruta, httpEsperado: esperado, httpObtenido: obtenido,
      cuerpoCorrecto, cabeceraCorrecta,
      correcto: obtenido === esperado && cuerpoCorrecto && cabeceraCorrecta,
      detalle
    });
  }

  const correctas = resultados.filter(r => r.correcto).length;
  const informe = {
    fechaUTC: new Date().toISOString(),
    servidor: base,
    node: process.version,
    dependenciasDeclaradas: require('./package.json').dependencies,
    sha256CodigoAPI: createHash('sha256')
      .update(fs.readFileSync(path.join(__dirname, 'index.js'))).digest('hex'),
    total: resultados.length,
    correctas,
    fallidas: resultados.length - correctas,
    resultados
  };
  fs.writeFileSync(archivo, JSON.stringify(informe, null, 2) + '\n', { flag: 'wx' });
  console.table(resultados.map(r => ({
    Caso: r.caso, Esperado: r.httpEsperado, Obtenido: r.httpObtenido,
    Resultado: r.correcto ? 'CORRECTO' : 'FALLO'
  })));
  console.log('Pruebas correctas: ' + correctas + ' de ' + resultados.length);
  console.log('Informe guardado en: ' + archivo);
  if (informe.fallidas > 0) process.exitCode = 1;
}

ejecutarPruebas().catch(error => {
  console.error('No se pudo generar el informe. Codigo: ' + (error.code || 'ERROR_LOCAL'));
  process.exitCode = 1;
});