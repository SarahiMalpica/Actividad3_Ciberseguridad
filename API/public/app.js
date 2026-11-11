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
      return 'La API respondió con un error del servidor. Revisa su consola local; este resultado no comprueba el estado de LocalStack.';
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
    explicacion.textContent = 'Consultando la API local. Puedes borrar o cambiar el token para cancelar esta solicitud.';
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
        ? 'La consulta superó los 8 segundos de espera. Comprueba que la API está en ejecución en 127.0.0.1:3000 y vuelve a intentarlo.'
        : 'No se pudo completar la consulta a la API. El servidor puede estar desconectado o la conexión puede haberse interrumpido. Comprueba su consola local y vuelve a intentarlo.';
      mostrarEstado('error', 'Sin respuesta completa', 'Último intento · ' + hora);
    } finally {
      clearTimeout(temporizador);
      if (solicitud === numeroSolicitud) {
        controladorActivo = null;
        cambiarCarga(false);
      }
    }
  }

  // Solo enviar JWT a la API local prevista, nunca al abrir una copia en otro sitio.
  const origenesLocales = ['http://127.0.0.1:3000', 'http://localhost:3000'];
  if (!origenesLocales.includes(window.location.origin)) {
    campoToken.value = '';
    aviso.textContent = 'Abre http://127.0.0.1:3000/ con la API en ejecución. En esta ubicación no se aceptan tokens ni se envían solicitudes.';
    return;
  }

  habilitado = true;
  campoToken.value = '';
  campoToken.disabled = false;
  botonBorrar.disabled = false;
  cambiarCarga(false);
  aviso.textContent = 'Consultas en vivo. Sin JWT, las rutas protegidas responden 401.';

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
