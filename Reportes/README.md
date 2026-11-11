# Resultados del laboratorio

Los reportes 01 a 17 corresponden a ejecuciones del 6 al 8 de noviembre de 2026 en Ciudad de México. Se conservan sin modificar. Los resultados son registros de aquellas ejecuciones, no consultas en vivo.

## S3 e IAM

- [01 Cifrado S3](01_Cifrado_S3.json): configuración AES256.
- [02 Bloqueo público](02_Bloqueo_publico_S3.json): cuatro controles activados.
- [11 Recuperación de S3](11_IAM_Recuperacion_S3.json): consulta tras recrear los recursos locales.
- [12 Usuario](12_IAM_Usuario.json), [13 rol](13_IAM_Rol.json), [14 política](14_IAM_Politica.json) y [15 asociación](15_IAM_Asociacion_Rol.json).
- [16 Verificación del rol](16_IAM_Verificacion_Rol.json) y [17 verificación de la política](17_IAM_Verificacion_Politica.json).

El rol declara lectura del bucket y confianza en el usuario simulado. Las evidencias prueban configuración, asociación y consultas en LocalStack; no denegaciones efectivas. La duración de 3600 segundos es un ajuste del rol, no una sesión STS cuya expiración se haya probado.

## Imágenes analizadas con Trivy 0.76.2

| Imagen | Críticos | Altos | Medios | Bajos | Desconocidos |
|---|---:|---:|---:|---:|---:|
| [Node 14 inicial](03_Trivy_node14_inicial.json) | 23 | 572 | 735 | 122 | 4 |
| [Node 18 comparación](04_Trivy_node18_comparacion.json) | 228 | 2302 | 6817 | 2669 | 84 |
| [Node 24 Bookworm](05_Trivy_node24_mitigacion.json) | 1 | 40 | 110 | 83 | 0 |
| [Node 24 Trixie](06_Trivy_node24_trixie.json) | 0 | 54 | 87 | 62 | 0 |

Se cuentan hallazgos por paquete, no CVE únicos. Las cuatro imágenes ejecutan `node --version`; no contienen la API. Un nuevo escaneo o construcción puede producir otros conteos. El reporte de Node 18 es un archivo grande y puede requerir descarga para consultarlo.

## JWT y ZAP de la API original

[07 Pruebas JWT](07_Pruebas_JWT_API.json) registra 10 pruebas correctas. Su SHA-256 identifica la API anterior a la incorporación de la página.

| Contexto válido | JSON | HTML |
|---|---|---|
| Sin token | [08b](ZAP/08b_ZAP_sin_autenticacion_api.json) | [08b](ZAP/08b_ZAP_sin_autenticacion_api.html) |
| Usuario | [09c](ZAP/09c_ZAP_usuario_api.json) | [09c](ZAP/09c_ZAP_usuario_api.html) |
| Administrador | [10](ZAP/10_ZAP_admin_api.json) | [10](ZAP/10_ZAP_admin_api.html) |

Estos tres reportes contienen cero alertas sobre las tres rutas HTTP/JSON. Los avisos de extensiones y la exclusión de DOM XSS permanecen documentados. Los prefijos `08`, `09` y `09b` se conservan como antecedentes; no deben presentarse como los análisis finales válidos. Los HTML se descargan y abren localmente; GitHub puede mostrar su código en lugar del informe visual.

Las copias compartibles están en `ZAP/`. Los originales autenticados, sesiones y planes temporales permanecen en `Herramientas/` y se excluyen de Git.

## Página y API actualizadas

[18 Pruebas del sitio y API](18_Pruebas_Sitio_API.json) registra 44 comprobaciones correctas y cero fallidas, realizadas el 10 de noviembre de 2026 a las 19:37, hora de Ciudad de México. El JSON conserva la fecha UTC y las huellas de los cuatro archivos examinados.

| Tipo | Cantidad | Alcance |
|---|---:|---|
| HTTP real | 31 | Rutas, roles, tokens inválidos o vencidos, encabezados, archivos públicos y rechazo de archivos internos |
| JavaScript del cliente con API real | 8 | Botones, JWT en memoria, carga, borrado y salida/restauración de la página; DOM mínimo |
| Cliente simulado | 5 | Desconexión, espera de ocho segundos, respuesta tardía, origen distinto y contenido no JSON |

Además se comprobó en el navegador la presentación en computadora y celular, la ausencia de desbordamiento horizontal en celular, las respuestas 200 y 401, el borrado del campo y el desplegable de evidencias. Los accesos 200/403 con roles se comprobaron mediante las pruebas contra la API real; no se introdujeron JWT válidos en las capturas del navegador.

Para repetir la suite con la API activa, ejecuta `node pruebas-sitio.cjs` desde `API/`. Los informes nuevos se guardan en `Nuevas/`, una carpeta ignorada hasta revisar su contenido. La suite no modifica los originales.

No se volvió a ejecutar LocalStack, Terraform, Trivy o ZAP durante estas comprobaciones de la página. Los resultados previos de ZAP no acreditan cobertura de la nueva interfaz.
