# Ejecución del laboratorio en Windows

## Entorno registrado

| Herramienta | Versión registrada |
|---|---|
| Sistema | Windows 11 y PowerShell |
| Node.js | 24.13.0 |
| Express y jsonwebtoken | 5.3.0 y 9.0.3 |
| Terraform y proveedor AWS | 1.17.1 y 6.72.0 |
| Docker Desktop | 4.98.0, motor Linux |
| LocalStack | 2026.10.6 en el laboratorio original |
| AWS CLI | 2.34.14 |
| Trivy | 0.76.2 |
| ZAP y Java | 2.17.0 y Temurin 17.0.21+9 |

Estas son las versiones observadas en los archivos del proyecto. No sustituyen la rúbrica del profesor. Compose conserva la etiqueta original `localstack/localstack:latest`; no fija una versión o digest y una descarga posterior puede cambiar la imagen.

## Página y pruebas

Sigue el [inicio de la API y generación local de JWT](../README.md). La API y la página utilizan `127.0.0.1:3000`; LocalStack no es necesario para esas consultas.

En una segunda terminal, con la API activa:

```powershell
Set-Location 'D:\Actividad3_Ciberseguridad\API'
node pruebas-sitio.cjs
```

La suite necesita el `.env` privado y las dependencias de `npm ci`. Genera JWT solo en memoria y guarda un informe nuevo en `Reportes/Nuevas/`. La ruta del proyecto se resuelve a partir del archivo de pruebas, por lo que funciona también en otra carpeta.

Se conserva `pruebas-jwt.js` como parte de la evidencia original; evita reemplazar `07_Pruebas_JWT_API.json`. No uses ese archivo histórico como prueba de la versión nueva de la API. El script `npm test` original sigue siendo un marcador; el comando correcto de comprobación es `node pruebas-sitio.cjs`.

## LocalStack y Terraform

Inicia Docker Desktop con el motor Linux. Desde la raíz del proyecto, configura el `.env` privado de LocalStack como indica el README. Comprueba Compose sin mostrar sus valores interpolados:

```powershell
Set-Location 'D:\Actividad3_Ciberseguridad'
docker compose --env-file .\LocalStack\.env -f .\LocalStack\compose.yaml config --quiet
docker compose --env-file .\LocalStack\.env -f .\LocalStack\compose.yaml up -d
docker compose --env-file .\LocalStack\.env -f .\LocalStack\compose.yaml ps
Invoke-RestMethod -Uri 'http://127.0.0.1:4566/_localstack/health'
```

El token corresponde a LocalStack y debe obtenerse mediante la cuenta y el plan usados en la práctica. No es una credencial de AWS y no se incluye en Git.

Si Terraform está en `PATH`:

```powershell
terraform -chdir=Terraform init
terraform -chdir=Terraform validate
terraform -chdir=Terraform plan
terraform -chdir=Terraform apply
```

Si utilizas el ejecutable que ya tienes dentro de `Herramientas/`, el equivalente es:

```powershell
$terraformLaboratorio = Join-Path (Get-Location) 'Herramientas\Terraform\terraform.exe'
& $terraformLaboratorio -chdir=Terraform init
& $terraformLaboratorio -chdir=Terraform validate
& $terraformLaboratorio -chdir=Terraform plan
& $terraformLaboratorio -chdir=Terraform apply
```

Revisa el plan y confirma manualmente `apply`. El proveedor declara tres recursos de S3: bucket, cifrado y bloqueo público. Las políticas IAM se aplican por separado con AWS CLI.

Compose no configura persistencia. Si LocalStack fue recreado, los recursos pueden haber desaparecido aunque el estado local de Terraform siga presente. Revisa el plan y la correspondencia de ambos estados antes de aplicar. Conserva el estado privado local; no lo subas ni lo borres para forzar una creación.

## Consultas S3 e IAM

En una terminal dedicada al emulador, desde la raíz:

```powershell
$env:AWS_ACCESS_KEY_ID = 'test'
$env:AWS_SECRET_ACCESS_KEY = 'test'
$env:AWS_SESSION_TOKEN = $null
$opcionesLocales = @('--endpoint-url', 'http://127.0.0.1:4566', '--region', 'us-east-1', '--no-cli-pager')
aws @opcionesLocales s3api get-bucket-encryption --bucket actividad3-seguro-2024
aws @opcionesLocales s3api get-public-access-block --bucket actividad3-seguro-2024
```

Cada comando incluye el endpoint de LocalStack. No ejecutes estos ejemplos contra AWS real ni cambies los endpoints del proveedor para esta práctica.

En un emulador nuevo, tras crear S3, se puede reproducir la configuración IAM:

```powershell
aws @opcionesLocales iam create-user --user-name operador-actividad3
aws @opcionesLocales iam create-role --role-name rol-lectura-actividad3 --max-session-duration 3600 --assume-role-policy-document file://IAM/confianza-rol-lectura.json
aws @opcionesLocales iam create-policy --policy-name PoliticaLecturaActividad3 --policy-document file://IAM/politica-lectura-s3.json
aws @opcionesLocales iam attach-role-policy --role-name rol-lectura-actividad3 --policy-arn arn:aws:iam::000000000000:policy/PoliticaLecturaActividad3
```

Si esas identidades ya existen, consulta la configuración en lugar de repetir su creación:

```powershell
aws @opcionesLocales iam get-role --role-name rol-lectura-actividad3
aws @opcionesLocales iam list-attached-role-policies --role-name rol-lectura-actividad3
aws @opcionesLocales iam list-role-policies --role-name rol-lectura-actividad3
aws @opcionesLocales iam get-policy-version --policy-arn arn:aws:iam::000000000000:policy/PoliticaLecturaActividad3 --version-id v1
```

La confianza y los permisos son documentos distintos. Las respuestas no prueban que el plan de LocalStack aplique denegaciones reales. La práctica no emitió una sesión STS para comprobar expiración.

## Dockerfiles y Trivy

Desde la raíz, estos comandos construyen las cuatro imágenes de comparación:

```powershell
docker build -f .\Contenedores\Dockerfile.node14 -t actividad3-node14:inicial .\Contenedores
docker build -f .\Contenedores\Dockerfile.node18 -t actividad3-node18:comparacion .\Contenedores
docker build -f .\Contenedores\Dockerfile.node24-slim -t actividad3-node24:mitigacion .\Contenedores
docker build -f .\Contenedores\Dockerfile.node24-trixie-slim -t actividad3-node24:trixie .\Contenedores
```

Estos Dockerfiles ejecutan `node --version`; no sirven la página ni contienen la API. Las imágenes de Node 14 y Node 18 se conservan como parte de la comparación solicitada.

Ejemplo para un escaneo nuevo, sin sobrescribir la evidencia final:

```powershell
$raizLaboratorio = (Get-Location).Path
New-Item -ItemType Directory -Path '.\Reportes\Nuevas' -Force | Out-Null
$nombreReporteTrivy = 'trivy-trixie-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json'
docker run --rm `
  --mount 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly' `
  --mount "type=bind,source=$raizLaboratorio\Reportes\Nuevas,target=/reportes" `
  aquasec/trivy:0.76.2 image --image-src docker --scanners vuln --timeout 20m `
  --format json --output "/reportes/$nombreReporteTrivy" actividad3-node24:trixie
```

La primera ejecución puede descargar la imagen y su base de vulnerabilidades. Revisa el código de salida y el JSON. Nuevas bases o imágenes pueden producir otros conteos; no reemplaces los reportes originales para presentar un resultado distinto.

## ZAP original

Los planes de `ZAP/` y `API/ejecutar-zap-jwt.js` conservan las rutas originales en `D:\Actividad3_Ciberseguridad`. Requieren preparar fuera de Git:

- `Herramientas/ZAP/Programa/ZAP_2.17.0/zap-2.17.0.jar`.
- `Herramientas/ZAP/Java/jdk-17.0.21+9-jre/bin/java.exe`.
- Carpetas `Herramientas/ZAP/Datos-API-Usuario/ReportesPrivados` y `Datos-API-Admin/ReportesPrivados`.
- El secreto local de `API/.env` y la API activa.

El ejecutor verifica las huellas de los planes, crea un plan temporal privado y lo elimina al terminar. Los originales autenticados quedan en las sesiones privadas; las copias compartibles ocultan credenciales.

Estos son los comandos originales, desde la raíz, cuando estén preparados los requisitos y libres los nombres de salida:

```powershell
node .\API\ejecutar-zap-jwt.js validar
node --env-file=.\API\.env .\API\ejecutar-zap-jwt.js ejecutar usuario
node --env-file=.\API\.env .\API\ejecutar-zap-jwt.js ejecutar admin
```

El ejecutor usa nombres fijos y rechaza evidencias ya existentes, como las incluidas en este proyecto. Por ello no se pueden repetir esos análisis sobre la misma colección sin preparar una copia de trabajo y reservar por separado sus salidas. No borres los reportes originales para evitar esa comprobación. Si cambias un plan, revisa también su huella antes de ejecutar.

Los análisis registrados cubren solo las tres rutas JSON. DOM XSS está excluido y Client Integration desactivado. La página nueva requiere un análisis adicional para acreditar su cobertura; esta preparación no lo ejecuta ni inventa sus resultados.

## Detener servicios

La API se detiene con `Ctrl+C` en su terminal. Para detener LocalStack sin eliminar su contenedor:

```powershell
docker compose --env-file .\LocalStack\.env -f .\LocalStack\compose.yaml stop
```

El proyecto original no configura persistencia; detención y recreación del contenedor deben distinguirse al interpretar sus recursos.
