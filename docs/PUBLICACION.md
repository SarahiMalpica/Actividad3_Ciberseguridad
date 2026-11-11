# Archivos preparados para publicación

Se mantiene la organización original: `API`, `Contenedores`, `Diagrama`, `Documento`, `IAM`, `LocalStack`, `Reportes`, `Terraform` y `ZAP`. Se añaden documentación, plantillas sin credenciales y la prueba reproducible del sitio. No se trasladaron los componentes que utilizan rutas absolutas.

## Material incluido

- Código de la API y de la página; se conservan las versiones de las dependencias y `package-lock.json`.
- Terraform, `.terraform.lock.hcl`, Compose, políticas IAM y los cuatro Dockerfiles.
- Planes ZAP y OpenAPI originales. Se conservan sus bytes porque el ejecutor verifica las huellas SHA-256 de los planes autenticados.
- Reportes JSON, HTML y consolas compartibles; se mantienen los intentos fallidos como antecedentes separados.
- Documentos Word originales y diagramas PNG/Draw.io.
- Reporte nuevo 18, con las pruebas de la página compacta y la API actualizada.

`LEEME_ZAP_JWT.txt` se conserva como nota del paquete original. Sus menciones a extracción y al chat son antecedentes; las instrucciones actuales de ejecución están en el README y la guía de Windows.

## Revisión de información sensible

Se examinaron los archivos de texto y el XML de los documentos, buscando la clave JWT local, JWT completos, claves privadas y patrones de credenciales. Se revisaron visualmente las 27 imágenes únicas incrustadas en los documentos y los dos diagramas. No se encontraron credenciales en el material seleccionado. Las rutas de Windows y los nombres de recursos simulados se conservan como contexto del laboratorio.

Los valores `test` de Terraform y la cuenta `000000000000` son datos ficticios usados con LocalStack. Los `.env.example` contienen nombres de variables y valores vacíos, sin claves ni tokens.

## Material excluido

El `.gitignore` mantiene fuera de Git los `.env` privados, claves, tokens, `node_modules`, `Herramientas`, sesiones y reportes privados de ZAP, estados y planes de Terraform, respaldos, ZIP duplicados y temporales. Los archivos siguen disponibles localmente; excluirlos no implica borrarlos.

Los informes generados después de esta revisión quedan en `Reportes/Nuevas/` y requieren revisión antes de seleccionar una copia para publicar. `.gitattributes` conserva los bytes para que la conversión de finales de línea en Windows no altere huellas registradas.

## Estado de GitHub

Durante la revisión inicial no había un repositorio Git local en la carpeta original ni archivos rastreados que retirar. Se confirmó la sesión autenticada de `SarahiMalpica` y la ausencia del repositorio de destino. Con autorización se creó el repositorio público [Actividad3_Ciberseguridad](https://github.com/SarahiMalpica/Actividad3_Ciberseguridad), sin historial previo.

La selección publicable se mantiene en `C:\Users\sarah\Documents\ChatGPT\CIBERSEGURIDAD\Actividad3_Ciberseguridad`. Antes del commit se comparó con la carpeta original de `D:` y se revisaron los archivos preparados para Git. El laboratorio y sus archivos privados permanecen en `D:\Actividad3_Ciberseguridad`; la publicación contiene únicamente la selección revisada.

## Adaptación posterior para Render

El commit inicial de GitHub conserva la página local. La adaptación posterior añade configuración del servidor, botones y emisión de JWT solo en modo demo, pruebas reproducibles y `render.yaml` con el plan Free. La adaptación se publica como un commit posterior que conserva el historial; tener estos archivos en GitHub no implica que la demo esté desplegada. El [reporte 19](../Reportes/19_Preparacion_Render.json) acredita pruebas locales. La [guía de Render](RENDER.md) describe la separación de claves y las verificaciones pendientes antes de anunciar un enlace público.
