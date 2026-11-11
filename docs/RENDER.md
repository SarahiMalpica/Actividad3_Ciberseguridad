# Demo pública en Render Free

## Estado y alcance

La adaptación está preparada y probada localmente. No se ha desplegado ni existe todavía una dirección pública de la demo. El despliegue necesita acceso a la cuenta de Render del propietario; publicar los archivos en GitHub no pone la demo en línea.

El profesor podrá abrir un enlace HTTPS y consultar la página y la API sin instalar herramientas. La API devuelve exclusivamente los datos simulados del laboratorio. LocalStack, Terraform, Docker, Trivy y ZAP siguen siendo componentes o evidencias del laboratorio local; no se ejecutan en Render.

## Configuración prevista

El archivo [render.yaml](../render.yaml) declara un solo servicio web:

| Parámetro | Valor |
|---|---|
| Plan | `free` |
| Directorio raíz | `API` |
| Node.js | `24.13.0`, sin cambiar las dependencias bloqueadas |
| Instalación | `npm ci --omit=dev` |
| Inicio | `node index.js` |
| Comprobación de estado | `/health` |
| Despliegues automáticos | Desactivados; los posteriores se inician manualmente |
| Modo de demostración | `ACTIVIDAD3_DEMO_PUBLICA=1` |

Render proporciona `RENDER=true`, su `PORT` y `RENDER_EXTERNAL_URL`. El servidor utiliza `0.0.0.0` en Render; en Windows conserva `127.0.0.1` y el puerto 3000 por defecto. La página utiliza rutas relativas del mismo origen y acepta únicamente las direcciones exactas declaradas por el servidor en `/configuracion.js`.

Para un dominio personalizado habría que configurar `ACTIVIDAD3_PUBLIC_ORIGIN` con su origen HTTPS exacto, sin rutas ni credenciales. No se debe utilizar una lista abierta de dominios ni habilitar CORS indiscriminadamente.

## JWT y permisos de demostración

Con el modo público explícitamente activado, la ruta `POST /api/demo/token` permite solicitar el rol fijo `usuario` o `admin`. Requiere un cuerpo JSON con únicamente `rol` y un encabezado `Origin` permitido. La emisión está limitada a 60 tokens por minuto por instancia; la respuesta 429 indica cuándo reintentar.

Los JWT duran cinco minutos y usan HS256, emisor `actividad3`, audiencia `actividad3-api` e identidad de prueba aleatoria. Los botones cargan el JWT en el campo protegido; la respuesta visible oculta el token. No se envía a `/health`, no se guarda en almacenamiento del navegador y se elimina al borrarlo o salir.

La emisión de ambos roles es pública para experimentar con datos simulados. No acredita una autenticación de personas ni sería un sistema de acceso adecuado para datos reales. Las rutas protegidas conservan la validación en el servidor:

| Ruta | Sin JWT válido | Usuario | Administrador |
|---|---:|---:|---:|
| `/health` | 200 | 200 | 200 |
| `/api/perfil` | 401 | 200 | 200 |
| `/api/admin` | 401 | 403 | 200 |

Solo en Render y con el modo de demostración activado, si no se proporciona una clave explícita, el proceso genera una clave aleatoria propia en memoria. No utiliza la clave privada de Windows. Al reiniciar o despertar una instancia nueva se invalidan los JWT anteriores: basta volver a pulsar el botón de rol. Este funcionamiento es apropiado para una demo de una sola instancia, sin datos persistentes. Fuera de ese caso la API exige la clave configurada; no la genera automáticamente.

El `/configuracion.js` público contiene únicamente los orígenes permitidos y el indicador de demo. No publica claves, variables privadas ni JWT. La ruta de emisión y sus botones están desactivados en el laboratorio local por defecto.

## Procedimiento de publicación

1. Revisar el diff, las pruebas y la selección sin secretos; hacer el commit y push de la adaptación a [GitHub](https://github.com/SarahiMalpica/Actividad3_Ciberseguridad).
2. Iniciar sesión en Render con la cuenta del propietario y permitir acceso únicamente al repositorio de la actividad.
3. Crear un Blueprint desde ese repositorio usando `render.yaml`, o un Web Service con los parámetros de la tabla. Confirmar **Free** y un solo servicio, sin base de datos, disco, dominio comprado ni otros recursos de pago.
4. Mantener vacía la variable `ACTIVIDAD3_JWT_SECRET` de la demo: se generará una clave efímera por proceso. No copiar `.env`, credenciales AWS, el token de LocalStack ni la clave de Windows al alojamiento.
5. Iniciar el primer despliegue y esperar el estado operativo. Copiar la URL HTTPS realmente asignada; no deducirla del nombre del servicio.
6. Comprobar la página, `/health`, usuario 200/403, administrador 200/200 y borrado 401 desde ese enlace. Verificar cabeceras, limpieza del JWT y funcionamiento en celular. Actualizar entonces el README con la URL y evidencia de esas pruebas reales.

Si Render solicita verificaciones de cuenta o facturación, el propietario deberá resolverlas; esta preparación no autoriza cargos. Elegir Free no sustituye la revisión de las cuotas o de los servicios que ya tenga la cuenta.

## Costo y limitaciones

Render ofrece servicios web gratuitos con límites de horas, transferencia y compilación. El servicio Free se suspende después de 15 minutos sin tráfico y puede tardar aproximadamente un minuto en volver a estar disponible. Si la cuenta tiene un medio de pago, ciertos excesos de uso pueden generar cargos; sin medio de pago, Render puede suspender servicios o compilaciones al agotar las cuotas. El plan Free no ofrece disponibilidad continua garantizada.

No hacen falta una cuenta real de AWS, una base de datos ni un dominio comprado para esta demo. No se deben presentar las pruebas locales como comprobaciones del servicio alojado.

## Comprobaciones realizadas

Desde `API/`, con las dependencias instaladas:

```powershell
node pruebas-render.cjs
```

La suite comprueba configuración, emisión, aislamiento de claves, permisos, JSON inválido, límites y botones con el JavaScript real ejecutado en un DOM mínimo. Incluye la regresión local de 47 casos. El [reporte 19](../Reportes/19_Preparacion_Render.json) conserva los 43 casos de adaptación y las huellas de los archivos examinados. Los informes nuevos van a `Reportes/Nuevas/`, excluido de Git hasta revisarlos.

La revisión visual nueva de la demo quedó pendiente: el control de navegador se detuvo porque no pudo establecer con certeza la URL. No se sustituyó por una supuesta revisión visual. Las pruebas automatizadas emplean HTTP local; aún falta verificar HTTPS, la instancia de Render y sus cuotas tras desplegar.

## Fuentes oficiales consultadas

- [Render Free: límites y comportamiento](https://render.com/docs/free).
- [Requisitos del servicio web y del puerto](https://render.com/docs/web-services).
- [Selección de la versión de Node.js](https://render.com/docs/node-version).
- [Variables proporcionadas por Render](https://render.com/docs/environment-variables).
- [Referencia del Blueprint](https://render.com/docs/blueprint-spec).
