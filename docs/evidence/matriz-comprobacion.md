# Verificación Sprint 1

Fecha: 22 de octubre de 2026. Resultado actualizado después de disponer de Docker Engine.

| Apartado | Resultado ejecutado |
|---|---|
| .NET | 30 pruebas correctas; cero fallos |
| Compose | Validación correcta y construcción/arranque de los seis servicios |
| Moodle | Healthy; recreación con configuración persistida comprobada |
| Datos de laboratorio | SQL confirma tres cursos con doce actividades por curso |
| Calificación | SQL confirma máximos 10 en categorías, parciales y total; parciales al 50% y categorías al 40/30/30 |
| Identidad y autorización | Script real: docente permitido, estudiante denegado, curso ajeno denegado, token ausente rechazado |
| Integración | Lectura de participantes, actividades y notas desde Moodle real |
| MySQL auxiliar | Dos sincronizaciones por curso; cuatro cargas correctas; doce estudiantes y 252 ítems/notas por curso |
| Integridad | Comparación original/copia correcta, conservando ceros, valores ausentes y escalas |
| PHP | Sintaxis revisada; bootstrap ejecutado por el intérprete dentro del contenedor |

La aceptación se ejecutó con `scripts/acceptance-sprint1.ps1` contra los servicios levantados. La consulta SQL confirmó las ponderaciones del libro. La inspección visual del libro, las restricciones de grupos y los escenarios de revocación institucional quedan fuera de esta comprobación.

## Incidencias corregidas

1. La creación de tareas fallaba por campos assign ausentes (`requiresubmissionstatement` y otras opciones obligatorias). Se completaron sus valores de laboratorio.
2. Al restaurar config.php desde el volumen quedaba propiedad de root y Apache no podía leerlo. Ahora se ajustan propietario y permisos en cada arranque.
3. Los usuarios de laboratorio no podían crear tokens. Se añadió un rol de sistema restringido a los usuarios ficticios para esa capacidad.
4. El health check anterior aceptaba páginas PHP de error con HTTP 200. Ahora exige respuesta exacta de un endpoint que carga Moodle y consulta MySQL.

Se conservaron los volúmenes existentes. No se borraron datos para resolver las incidencias. CI incorpora recreación de Moodle antes de la aceptación para cubrir la restauración de configuración.

## Acceso por correo

Formulario web validado con cookies y token de formulario: docente y estudiante acceden mediante correo; clave incorrecta rechazada. La suite de aceptación usa correos para los tokens y verifica los permisos por perfil.

## Reejecución del 27 de octubre de 2026

Se volvió a construir y levantar el laboratorio con `docker compose up --build -d --wait --wait-timeout 600`. Compose terminó correctamente; Moodle, sus dos bases MySQL y los tres servicios .NET quedaron `healthy`. `docker compose config --quiet` también terminó correctamente. Se conservaron los volúmenes locales.

| Aceptación | Resultado de esta ejecución |
|---|---|
| HU-01 / PA-01: Moodle de prueba | Cumple en laboratorio. SQL confirma tres cursos, 12 estudiantes y 12 tareas evaluables por curso; los máximos de tarea, categorías, parciales y nota final son 10. En los dos cursos docentes, los parciales ponderan 50/50 y cada parcial usa Exámenes 40%, Autónomo 30% y APEs 30%. |
| HU-02 / PA-02: servicios .NET y Docker | Cumple. Los siete contenedores están healthy y `GET /health` responde en los tres servicios .NET. La suite Release pasa 30/30. |
| HU-03 / PA-03: integración Moodle | Cumple en el escenario nominal. La API recupera los cursos y snapshots; se compararon los datos de Moodle con dos sincronizaciones por curso, sin diferencias en la aceptación HTTP. |
| HU-04 / PA-04: acceso docente | Cumple en laboratorio tras añadir la vista React: docente autenticado y limitado a cursos autorizados; el estudiante recibe 403 y el curso ajeno recibe 403. Login web comprobado con correo; contraseña incorrecta rechazada. |
| HU-05 / PA-05: persistencia normalizada | Cumple en laboratorio. La aceptación repitió la sincronización de ambos cursos y confirmó estudiantes/notas sin duplicados, incluidos cero, null y escalas originales. |

Comandos ejecutados: `dotnet test backend/EduMonitorAI.sln -c Release`; `scripts/acceptance-sprint1.ps1` con la contraseña local del laboratorio; y `scripts/verify-email-login.ps1`. Las restricciones de grupo para dos docentes dentro del mismo curso siguen sin verificarse; no usar la copia auxiliar con esos roles institucionales hasta modelar y probar dicho alcance.

## Vista docente Sprint N1 y navegación React

El 27 de octubre de 2026 se compiló el frontend con `pnpm --dir frontend build` (Vite) y se reconstruyó el servicio mediante `docker compose up --build -d --wait --wait-timeout 180 frontend`. `docker compose config --quiet` validó la configuración y el frontend quedó `healthy` junto con los otros seis servicios.

La aplicación usa React Router con URLs de navegador. La verificación manual inició sesión con la cuenta docente de prueba, consultó los dos cursos permitidos y recuperó participantes, notas y unidades desde Moodle/copia auxiliar. Se navegó desde participantes a calificaciones (`/courses/3/grades/5`), contenido (`/courses/3/content`) y datos sincronizados (`/synced`); Atrás restauró la ruta anterior y Adelante devolvió a la siguiente, también al cambiar de curso. Recargar una ruta protegida condujo al formulario de acceso porque el token se mantiene solo en memoria. La consola de navegador no mostró errores ni advertencias.

La vista sigue limitada a cursos, conexión/sincronización, participantes, calificaciones individuales y estructura de actividades. No implementa dashboard estadístico, alertas, recomendaciones ni conversación con IA. La tabla conserva la escala recibida y presenta notas null como “Sin nota visible”.

## Dictamen final

Consultar [el informe final de aceptación](aceptacion-final-sprint1.md): PA-01 a PA-05 cumplen en el laboratorio, con límites por grupos y semilla documentados. La aceptación HTTP y la revisión manual de la vista son evidencias separadas.
