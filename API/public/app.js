'use strict';

(() => {
  const buscar = (id) => document.getElementById(id);
  const campoToken = buscar('jwt-token');
  const botonBorrar = buscar('borrar-token');
  const ayudaToken = buscar('token-ayuda');
  const panel = buscar('panel-resultado');
  const rutaResultado = buscar('resultado-ruta');
  const httpResultado = buscar('resultado-http');
  const origenResultado = buscar('resultado-origen');
  const formatoResultado = buscar('resultado-formato');
  const jsonResultado = buscar('resultado-json');
  const explicacion = buscar('resultado-explicacion');
  const estadoServicio = buscar('estado-servicio');
  const estadoTitulo = buscar('estado-titulo');
  const estadoDetalle = buscar('estado-detalle');
  const aviso = buscar('aviso-api');
  const configuracion = window.ACTIVIDAD3_CONFIG;
  const demoPublica = configuracion?.demoPublica === true;
  const panelDemo = buscar('modo-demo');
  const botonesDemo = [buscar('demo-usuario'), buscar('demo-admin')];
  const recursos = [
    { ruta: '/health', boton: buscar('consultar-estado') },
    { ruta: '/api/perfil', boton: buscar('consultar-perfil') },
    { ruta: '/api/admin', boton: buscar('consultar-admin') }
  ];
  for (const recurso of recursos) {
    recurso.etiqueta = recurso.boton.querySelector('.button-label');
    recurso.texto = recurso.etiqueta.textContent;
  }

  // Sin persistencia: no cookies, almacenamiento del navegador ni URL con JWT.
  let tokenEnMemoria = '';
  let controladorActivo = null;
  let numeroSolicitud = 0;
  let ocupado = false;
  let habilitado = false;

  function horaActual() {
    return new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }

  function mostrarEstado(estado, titulo, detalle) {
    estadoServicio.dataset.state = estado;
    estadoTitulo.textContent = titulo;
    estadoDetalle.textContent = detalle;
  }

  function cambiarCarga(enCurso, recursoActual = null) {
    ocupado = enCurso;
    panel.setAttribute('aria-busy', String(enCurso));
    for (const recurso of recursos) {
      const seleccionado = enCurso && recurso === recursoActual;
      recurso.boton.disabled = !habilitado || enCurso;
      recurso.boton.setAttribute('aria-busy', String(seleccionado));
      recurso.etiqueta.textContent = seleccionado ? 'Consultando…' : recurso.texto;
    }
    for (const boton of botonesDemo) boton.disabled = !habilitado || !demoPublica || enCurso;
  }

  function cancelarConsulta() {
    numeroSolicitud += 1;
    if (controladorActivo) controladorActivo.abort();
    controladorActivo = null;
    cambiarCarga(false);
  }

  function limpiarResultado(mensaje) {
    rutaResultado.textContent = '—';
    httpResultado.textContent = '—';
    httpResultado.dataset.state = 'pendiente';
    origenResultado.textContent = 'Sin solicitud';
    formatoResultado.textContent = 'Respuesta JSON';
    jsonResultado.textContent = 'Todavía no hay una respuesta.\n\nElige un recurso para consultar la API.';
    explicacion.textContent = mensaje;
  }

  function actualizarToken() {
    cancelarConsulta();
    tokenEnMemoria = campoToken.value.trim();
    ayudaToken.textContent = tokenEnMemoria
      ? 'Token en memoria. El servidor comprobará su validez.'
      : 'Sin token: las rutas protegidas responderán 401.';
    limpiarResultado('Token actualizado. Consulta un recurso.');
    // Una consulta cancelada no acredita el estado actual del servicio.
    mostrarEstado('pendiente', 'Sin consultar', 'Selecciona un recurso para consultar');
  }

  function borrarToken(mostrarMensaje = true) {
    cancelarConsulta();
    tokenEnMemoria = '';
    campoToken.value = '';
    ayudaToken.textContent = 'Sin token: las rutas protegidas responderán 401.';
    limpiarResultado(mostrarMensaje
      ? 'Token borrado. Resultado anterior eliminado.'
      : 'Elige un recurso. 200: atendida · 401: autenticación rechazada · 403: sin permiso.');
    mostrarEstado('pendiente', 'Sin consultar', 'Selecciona un recurso para consultar');
  }

  function explicarRespuesta(ruta, codigo, cuerpo, esJson) {
    if (!esJson) {
      return 'El servidor respondió por HTTP, pero el contenido no es JSON. Se muestra como texto; comprueba que estás ejecutando la API de este proyecto.';
    }
    if (codigo === 401) {
      return 'Error de autenticación: token ausente, inválido o vencido.';
    }
    if (codigo === 403) {
      return 'Token reconocido, pero sin permiso. Esta ruta requiere el rol admin.';
    }
    if (codigo === 404) {
      return 'El servidor no encontró esta ruta. Comprueba que está en ejecución la versión de la API que contiene /health, /api/perfil y /api/admin.';
    }
    if (codigo >= 500) {
      return 'La API respondió con un error del servidor. Este resultado no comprueba el estado de LocalStack.';
    }
    if (codigo === 200 && ruta === '/health' && cuerpo && cuerpo.estado === 'ok') {
      return 'La API está disponible. Esta consulta no verifica S3, IAM ni LocalStack.';
    }
    const esPerfil = cuerpo && typeof cuerpo === 'object' &&
      typeof cuerpo.usuario === 'string' && typeof cuerpo.datos === 'string' &&
      ['usuario', 'admin'].includes(cuerpo.rol);
    if (codigo === 200 && ruta === '/api/perfil' && esPerfil) {
      return 'JWT válido: acceso al perfil permitido. Los datos son simulados.';
    }
    if (codigo === 200 && ruta === '/api/admin' && esPerfil && cuerpo.rol === 'admin') {
      return 'Rol admin autorizado. Los datos son simulados.';
    }
    return 'El servidor respondió con HTTP ' + codigo + '. Revisa el JSON recibido: el contenido o el código es distinto de lo esperado para esta ruta.';
  }

  async function consultar(recurso) {
    if (!habilitado || ocupado) return;
    const solicitud = ++numeroSolicitud;
    const controlador = new AbortController();
    controladorActivo = controlador;
    let tiempoAgotado = false;
    let respuesta = null;
    const temporizador = setTimeout(() => {
      tiempoAgotado = true;
      controlador.abort();
    }, 8000);

    cambiarCarga(true, recurso);
    rutaResultado.textContent = 'GET ' + recurso.ruta;
    httpResultado.textContent = 'Esperando…';
    httpResultado.dataset.state = 'pendiente';
    origenResultado.textContent = 'Consulta en curso';
    formatoResultado.textContent = 'Respuesta JSON';
    jsonResultado.textContent = 'Esperando la respuesta del servidor…';
    explicacion.textContent = 'Consultando la API. Puedes borrar o cambiar el token para cancelar esta solicitud.';
    mostrarEstado('carga', 'Consultando…', 'GET ' + recurso.ruta);

    try {
      const cabeceras = { Accept: 'application/json' };
      // /health nunca recibe el token. Las rutas protegidas admiten pruebas sin JWT.
      if (recurso.ruta !== '/health' && tokenEnMemoria) {
        cabeceras.Authorization = 'Bearer ' + tokenEnMemoria;
      }
      respuesta = await fetch(recurso.ruta, {
        method: 'GET',
        headers: cabeceras,
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controlador.signal
      });
      const texto = await respuesta.text();
      if (solicitud !== numeroSolicitud) return;

      let cuerpo = null;
      let esJson = false;
      try {
        cuerpo = JSON.parse(texto);
        esJson = true;
      } catch {
        // Mostrar como texto evita interpretar HTML de una respuesta inesperada.
      }
      const hora = horaActual();
      httpResultado.textContent = String(respuesta.status);
      httpResultado.dataset.state = respuesta.ok ? 'exito'
        : respuesta.status === 401 || respuesta.status === 403 ? 'rechazo' : 'error';
      origenResultado.textContent = 'En vivo · ' + hora;
      formatoResultado.textContent = esJson ? 'Respuesta JSON' : 'Respuesta recibida (no JSON)';
      jsonResultado.textContent = esJson ? JSON.stringify(cuerpo, null, 2) : texto || '(Respuesta vacía)';
      explicacion.textContent = explicarRespuesta(recurso.ruta, respuesta.status, cuerpo, esJson);

      const saludCorrecta = recurso.ruta === '/health' && respuesta.status === 200 &&
        esJson && cuerpo && cuerpo.estado === 'ok';
      if (saludCorrecta) {
        mostrarEstado('disponible', 'Servicio disponible', 'GET /health · ' + hora);
      } else if (recurso.ruta === '/health' || respuesta.status >= 500) {
        mostrarEstado('error', 'Respuesta inesperada', 'HTTP ' + respuesta.status + ' · ' + hora);
      } else {
        mostrarEstado('responde', 'Responde por HTTP', 'HTTP ' + respuesta.status + ' · ' + hora);
      }
    } catch {
      if (solicitud !== numeroSolicitud) return;
      const hora = horaActual();
      httpResultado.textContent = respuesta ? String(respuesta.status) : 'Sin respuesta';
      httpResultado.dataset.state = 'error';
      origenResultado.textContent = 'Intento en vivo · ' + hora;
      jsonResultado.textContent = respuesta
        ? 'Se recibió una respuesta HTTP, pero no se pudo leer su contenido completo.'
        : 'No se recibió una respuesta JSON del servidor.';
      explicacion.textContent = tiempoAgotado
        ? 'La consulta superó los 8 segundos de espera. El servidor puede estar iniciándose; espera y vuelve a intentarlo.'
        : 'No se pudo completar la consulta a la API. El servidor puede estar desconectado o la conexión puede haberse interrumpido. Vuelve a intentarlo.';
      mostrarEstado('error', 'Sin respuesta completa', 'Último intento · ' + hora);
    } finally {
      clearTimeout(temporizador);
      if (solicitud === numeroSolicitud) {
        controladorActivo = null;
        cambiarCarga(false);
      }
    }
  }

  async function usarRolDemo(rol) {
    if (!habilitado || !demoPublica || ocupado) return;
    borrarToken(false);
    const solicitud = ++numeroSolicitud;
    const controlador = new AbortController();
    controladorActivo = controlador;
    const temporizador = setTimeout(() => controlador.abort(), 8000);
    cambiarCarga(true);
    rutaResultado.textContent = 'POST /api/demo/token';
    httpResultado.textContent = 'Esperando…';
    httpResultado.dataset.state = 'pendiente';
    origenResultado.textContent = 'Consulta en curso';
    formatoResultado.textContent = 'Respuesta JSON · JWT oculto';
    jsonResultado.textContent = 'Solicitando un JWT temporal de prueba…';
    explicacion.textContent = 'Solo habilita datos simulados de esta demo pública.';
    mostrarEstado('carga', 'Consultando…', 'JWT de prueba');
    let respuesta;
    try {
      respuesta = await fetch('/api/demo/token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol }), credentials: 'omit', mode: 'same-origin', redirect: 'error',
        cache: 'no-store', referrerPolicy: 'same-origin', signal: controlador.signal
      });
      const cuerpo = await respuesta.json();
      if (solicitud !== numeroSolicitud) return;
      httpResultado.textContent = String(respuesta.status);
      origenResultado.textContent = 'En vivo · ' + horaActual();
      httpResultado.dataset.state = respuesta.ok ? 'exito' : 'error';
      if (!respuesta.ok) {
        jsonResultado.textContent = JSON.stringify({ error: cuerpo.error || 'No se pudo obtener un JWT de prueba.' }, null, 2);
        explicacion.textContent = respuesta.status === 429 ? 'Espera un minuto antes de pedir otro token de prueba.' : 'No se obtuvo un JWT. Inténtalo de nuevo.';
      } else {
        if (typeof cuerpo.token !== 'string' || cuerpo.rol !== rol || cuerpo.demostracion !== true || cuerpo.duracionSegundos !== 300) {
          throw new Error('Respuesta de demostracion inesperada.');
        }
        tokenEnMemoria = cuerpo.token;
        campoToken.value = cuerpo.token;
        ayudaToken.textContent = 'JWT de prueba (' + rol + ') en memoria. Vence en cinco minutos.';
        jsonResultado.textContent = JSON.stringify({ rol: cuerpo.rol, duracionSegundos: cuerpo.duracionSegundos, demostracion: true }, null, 2);
        explicacion.textContent = 'JWT cargado en el campo protegido. Consulta el perfil o administración para comprobar los permisos.';
      }
      mostrarEstado('responde', 'Responde por HTTP', 'HTTP ' + respuesta.status);
    } catch {
      if (solicitud !== numeroSolicitud) return;
      httpResultado.textContent = respuesta ? String(respuesta.status) : 'Sin respuesta';
      httpResultado.dataset.state = 'error';
      origenResultado.textContent = 'Intento en vivo · ' + horaActual();
      jsonResultado.textContent = 'No se obtuvo un JWT de prueba válido.';
      explicacion.textContent = 'El servidor puede estar iniciándose o desconectado. Espera y vuelve a intentarlo.';
      mostrarEstado('error', 'Sin JWT de prueba', 'Vuelve a intentarlo');
    } finally {
      clearTimeout(temporizador);
      if (solicitud === numeroSolicitud) { controladorActivo = null; cambiarCarga(false); }
    }
  }

  // El servidor declara sus origenes exactos; las copias en otros sitios quedan desactivadas.
  if (!configuracion || !Array.isArray(configuracion.origenesPermitidos) ||
      !configuracion.origenesPermitidos.includes(window.location.origin)) {
    campoToken.value = '';
    aviso.textContent = 'Abre la dirección del servidor del laboratorio o de su demo. En esta ubicación no se aceptan tokens ni se envían solicitudes.';
    return;
  }

  habilitado = true;
  campoToken.value = '';
  campoToken.disabled = false;
  botonBorrar.disabled = false;
  cambiarCarga(false);
  panelDemo.hidden = !demoPublica;
  aviso.textContent = demoPublica
    ? 'Demo pública: roles de prueba y datos simulados. Las consultas a la API son en vivo; las evidencias son históricas.'
    : 'Consultas en vivo. Sin JWT, las rutas protegidas responden 401.';
  if (demoPublica) {
    buscar('entorno-titulo').textContent = 'Demo pública';
    buscar('entorno-detalle').textContent = 'API en línea · datos simulados. LocalStack y Terraform se ejecutan aparte.';
    botonesDemo[0].addEventListener('click', () => usarRolDemo('usuario'));
    botonesDemo[1].addEventListener('click', () => usarRolDemo('admin'));
  }

  for (const recurso of recursos) {
    recurso.boton.addEventListener('click', () => consultar(recurso));
  }
  campoToken.addEventListener('input', actualizarToken);
  botonBorrar.addEventListener('click', () => {
    borrarToken();
    campoToken.focus();
  });
  // Limpiar también si el navegador conserva o restaura la página en su historial.
  window.addEventListener('pagehide', () => borrarToken(false));
  window.addEventListener('pageshow', () => borrarToken(false));
})();
