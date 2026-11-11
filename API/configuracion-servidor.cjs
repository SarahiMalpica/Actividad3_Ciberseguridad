'use strict';

const { randomBytes } = require('node:crypto');

module.exports = function configurar(entorno = process.env) {
  const enRender = entorno.RENDER === 'true';
  const demoPublica = entorno.ACTIVIDAD3_DEMO_PUBLICA === '1';
  const puerto = entorno.PORT || '3000';
  if (!/^\d{1,5}$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535) {
    throw new Error('PORT debe ser un puerto valido.');
  }
  if (entorno.ACTIVIDAD3_DEMO_PUBLICA && !['0', '1'].includes(entorno.ACTIVIDAD3_DEMO_PUBLICA)) {
    throw new Error('ACTIVIDAD3_DEMO_PUBLICA debe ser 0 o 1.');
  }
  let origenPublico = '';
  const direccion = entorno.ACTIVIDAD3_PUBLIC_ORIGIN || (enRender ? entorno.RENDER_EXTERNAL_URL : '');
  if (direccion) {
    let url;
    try { url = new URL(direccion); } catch { throw new Error('El origen publico debe ser una URL HTTPS valida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('El origen publico debe contener solo el origen HTTPS, sin credenciales ni rutas.');
    }
    origenPublico = url.origin;
  }
  if ((enRender || demoPublica) && !origenPublico) {
    throw new Error('Falta configurar el origen HTTPS de la demo.');
  }

  // Solo la demo explicita en Render puede usar una clave efimera y aislada.
  // En Windows se mantiene la exigencia de la clave privada del laboratorio.
  const secretoJwt = entorno.ACTIVIDAD3_JWT_SECRET || (enRender && demoPublica ? randomBytes(64).toString('hex') : '');
  if (!/^[a-f0-9]{128}$/.test(secretoJwt)) {
    throw new Error('Falta configurar ACTIVIDAD3_JWT_SECRET correctamente en el entorno.');
  }
  const PORT = Number(puerto);
  return {
    HOST: enRender ? '0.0.0.0' : '127.0.0.1', PORT, enRender, demoPublica, origenPublico, secretoJwt,
    origenesPermitidos: [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`, ...(origenPublico ? [origenPublico] : [])]
  };
};
