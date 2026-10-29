# Docker

La infraestructura reproducible se encuentra en `infra/compose/compose.yml`. Incluye Moodle, su MySQL aislado, MySQL auxiliar, los tres hosts .NET y la vista web docente. Consultar [instalación y validación](../requirements/sprint1.md).

Los Dockerfiles .NET restauran también BuildingBlocks/Integration antes de publicar y ejecutan con usuario no privilegiado. El frontend compila React/Vite en una etapa Node y sirve el bundle final con Nginx. Moodle instala dependencias PHP y obtiene la etiqueta v5.0.3 oficial. Bases y almacenamiento Moodle tienen volúmenes persistentes; los secretos proceden de `infra/.env`, excluido de Git.

Esta configuración es un laboratorio local y publica puertos en 127.0.0.1. Se ejecutó la aceptación real con Docker Engine, Moodle y MySQL.

## Entrada desde la raíz

`compose.yaml` incluye la definición de `infra/compose/compose.yml` y carga `infra/.env`. Requiere Compose v2.20 o posterior (soporte de include).

```powershell
./scripts/init-local-env.ps1
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 600
docker compose ps
```

Se han añadido health checks HTTP para Moodle y los tres hosts, además de los checks SQL. Moodle termina instalación y semilla antes de marcarse preparado; Access y MoodleIntegration esperan a Moodle; AcademicData espera a su MySQL y a MoodleIntegration. Todos los servicios tienen reinicio unless-stopped. Una pérdida posterior de salud se observa con `docker compose ps`; depends_on ordena el arranque y no reinicia consumidores por cambios de salud posteriores.

Las contraseñas generadas se guardan exclusivamente en `infra/.env`, excluido de Git. Consultar ese archivo local para iniciar sesión en Moodle. Los servicios publicados son Moodle (8080), integración (5101), datos (5102), acceso (5103) y la vista docente (5170). Nginx enruta las solicitudes de la vista a los servicios dentro de la red Compose; todos los puertos del host se enlazan a loopback.

Se verificaron ambos Compose, las 30 pruebas .NET y la sintaxis PHP. Con Docker Engine ya disponible se ejecutó la aceptación real y se comprobó la recreación de Moodle con volúmenes persistentes. El laboratorio incluye siete servicios; el frontend y las seis dependencias están healthy. El flujo CI repite instalación, recreación y aceptación.

## Corrección del arranque Moodle

La semilla completa los campos obligatorios de assign, incluidos requiresubmissionstatement y las opciones de notificaciones y fechas. La configuración restaurada del volumen se asigna al usuario www-data con permisos 640 en cada arranque. El rol de laboratorio permite crear tokens únicamente a los catorce usuarios ficticios definidos por la semilla.

El health check exige la respuesta exacta Healthy de `/health.php`; ese endpoint carga la configuración con el usuario Apache y comprueba el servicio en MySQL. Esto detecta fallos PHP que podrían devolver HTTP 200 en la pantalla de acceso.

Si una imagen anterior quedó reiniciándose, ejecutar `docker compose up --build -d --wait --wait-timeout 600`. No se necesita eliminar volúmenes.
