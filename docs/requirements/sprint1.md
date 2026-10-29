# Sprint 1: laboratorio, acceso e importación Moodle

Implementación de HU-01 a HU-05. Conserva Access.API, MoodleIntegration.API y AcademicData.API sobre .NET 10. MySQL 8.4 sustituye PostgreSQL por indicación del usuario; no se usa Microsoft SQL Server. La vista de Sprint N1 cubre cursos autorizados, conexión/sincronización, participantes, calificaciones individuales y contenido del curso, como indican sus mockups. El dashboard estadístico, alertas, recomendaciones y Ollama corresponden a incrementos posteriores.

## Ejecutar con Docker

Requisitos: Docker Engine/Desktop con contenedores Linux y Docker Compose v2. Para pruebas locales sin contenedores se necesita SDK .NET 10.

1. Ejecutar `./scripts/init-local-env.ps1` con PowerShell 7 para generar las contraseñas locales sin mostrarlas en terminal; conserva un archivo existente. Como alternativa, copiar `infra/.env.example` a `infra/.env`.
2. Completar las cinco contraseñas con valores locales distintos y fuertes. La contraseña del laboratorio debe cumplir la política Moodle (mayúscula, minúscula, número y símbolo; al menos ocho caracteres). Si contiene `$`, usar comillas simples en `.env`; para la contraseña de conexión MySQL evitar `;`, que delimita la cadena de conexión.
3. Ejecutar desde la raíz:

```powershell
docker compose up --build -d --wait --wait-timeout 600
docker compose logs -f moodle
```

El primer arranque descarga Moodle 5.0.3 desde su etiqueta oficial y prepara PHP 8.3, MySQL y datos ficticios. Esperar el mensaje `Laboratorio preparado` antes de consultar. Abrir http://localhost:8080. Usuario administrador `admin` con `MOODLE_ADMIN_PASSWORD`; usuarios `docente`, `otrodocente`, `estudiante01` a `estudiante12` con `MOODLE_LAB_PASSWORD`.

La vista web docente está disponible en http://localhost:5170. Inicia sesión con la cuenta Moodle; la interfaz enumera únicamente los cursos con permisos efectivos. El token personal permanece en memoria del navegador y no se guarda en el almacenamiento local.

El docente principal tiene PROGRAMACION y BASES-DATOS; el segundo tiene CURSO-RESTRINGIDO. Cada curso tiene cuatro unidades, dos parciales y tareas evaluables con escala 0–10. Cada parcial pondera Exámenes 40%, Autónomo 30% y APEs 30%; los parciales pesan 50% cada uno. Hay notas cero y estudiantes sin nota. Los datos y configuración persisten en volúmenes. La semilla conserva registros existentes y no restablece notas modificadas. No modificar las contraseñas de base de datos en `.env` después de inicializar los volúmenes sin rotarlas también en MySQL.

No se utiliza ni se modifica la carpeta local `moodle-latest-503/`. No es necesario añadirla a Git ni al contexto de construcción.

## Identidad y uso

Cada usuario obtiene un token personal del servicio `edumonitor` mediante `POST http://localhost:8080/login/token.php` con formulario `username`, `password`, `service=edumonitor`. La API recibe `Authorization: Bearer <token>`; no guarda contraseñas ni tokens. No usar el token de un administrador o de un usuario técnico para representar a un docente.

```powershell
$credential = Get-Credential -UserName docente
$login = Invoke-RestMethod -Method Post http://localhost:8080/login/token.php -Body @{
 username=$credential.UserName; password=$credential.GetNetworkCredential().Password; service='edumonitor'
}
$headers = @{Authorization="Bearer $($login.token)"}
$me = Invoke-RestMethod http://localhost:5103/api/access/me -Headers $headers
$id = $me.courses[0].id
Invoke-RestMethod -Method Post "http://localhost:5102/api/courses/$id/sync" -Headers $headers
Invoke-RestMethod "http://localhost:5102/api/courses/$id/data" -Headers $headers
```

El complemento `infra/moodle/local/edumonitor` expone una función de lectura que devuelve únicamente matrículas activas con capacidades efectivas `moodle/grade:viewall` y `moodle/course:viewparticipants`. Los controles Moodle aplican también restricciones de grupos y visibilidad al recuperar calificaciones. Si faltan permisos o la respuesta informa advertencias, no se sustituye la última carga correcta. Los roles personalizados de estudiantes requieren adaptar la selección de participantes, que en este laboratorio usa `shortname=student`.

## Contratos

| Servicio | Método y ruta | Resultado |
|---|---|---|
| Todos | GET /health | Vida del proceso; no prueba dependencias |
| Access, 5103 | GET /api/access/me | Identidad validada y cursos permitidos |
| Access | GET /api/access/courses/{id} | Verifica permiso efectivo |
| MoodleIntegration, 5101 | GET /api/courses | Cursos autorizados |
| MoodleIntegration | GET /api/courses/{id}/snapshot | Participantes, actividades e ítems/notas |
| AcademicData, 5102 | POST /api/courses/{id}/sync | Importación manual atómica |
| AcademicData | GET /api/courses/{id}/data | Última carga, origen y fecha UTC |

Todos los endpoints de negocio exigen token y revalidan acceso en Moodle, incluso al leer la copia local. HTTP 401: token ausente/inválido; 403: permiso denegado; 502: error de integración; 503: configuración/base de datos; 504: tiempo agotado. Los errores no incluyen respuestas originales ni secretos. OpenAPI en `/openapi/v1.json` solo en Development.

En desarrollo local: configurar `Moodle__BaseUrl`, `Moodle__AllowHttp=true` para laboratorio (y `Moodle__HostHeader=localhost:8080` si se accede por DNS interno Docker), `ConnectionStrings__Academic` y `Services__MoodleIntegration`. En producción utilizar HTTPS y Moodle autorizado; el Compose es un laboratorio accesible solo por loopback. MySQL no publica puertos. El complemento debe instalarse y revisarse con el administrador antes de usar Moodle institucional. No hay bypass por rol de administrador técnico para consultar cursos académicos.

## Datos y sincronización

AcademicData es el único propietario de MySQL auxiliar. `courses` conserva origen, fecha y actividades; `students` usa clave compuesta curso/usuario; `grades` usa curso/usuario/ítem, con contrato que conserva nombre, módulo, instancia, escala, mínimo, máximo y valor nullable. Las actividades mantienen la estructura oficial por secciones. `sync_runs` registra actor, curso, fecha, éxito o código de fallo. No se altera la base Moodle desde las APIs.

La sustitución se realiza en una transacción con bloqueo de la fila del curso; evita duplicados y elimina datos que ya no aparecen en una carga completa. La lectura usa una instantánea transaccional. Una carga fallida conserva los datos anteriores. Si MySQL está caído tampoco puede persistirse el registro del fallo y se emite un aviso sin secretos. El esquema inicial se aplica al crear el volumen MySQL; futuras modificaciones requieren migraciones explícitas.

`graded` incluye cero; `unknown` significa que no hay nota visible. No se deduce ausencia de entrega ni pendiente de calificar a partir de null. Esos estados requieren integrar evidencias adicionales en un siguiente incremento. Las consultas recuperan el curso completo, adecuadas al laboratorio de 12 estudiantes; la paginación de cursos grandes queda pendiente.

## Validación

```powershell
dotnet test backend/EduMonitorAI.sln -c Release
./scripts/acceptance-sprint1.ps1 -LabPassword (Read-Host 'Contraseña de laboratorio' -AsSecureString)
```

Las pruebas .NET usan respuestas Moodle controladas, sin conexión institucional ni MySQL. El script de aceptación requiere el Compose ya iniciado y compara las notas originales con las persistidas después de dos sincronizaciones, además de comprobar permisos y usuarios. Revisar manualmente el libro Moodle para confirmar pesos 40/30/30 y actividades. Consultar `docs/evidence/matriz-comprobacion.md` para distinguir verificaciones ejecutadas de pendientes.

Para detener conservando datos: `docker compose --env-file infra/.env -f infra/compose/compose.yml down`. Los volúmenes contienen el laboratorio y la copia auxiliar; conservarlos para futuras ejecuciones.

## Acceso mediante correo

El formulario Moodle permite correo y contraseña (también conserva el usuario Moodle). Cuentas ficticias disponibles en [Moodle](http://localhost:8080/login/index.php):

| Perfil | Correo | Contraseña inicial |
|---|---|---|
| Docente | docente@example.invalid | `Docente123!` |
| Estudiante | estudiante01@example.invalid | `Estudiante123!` |

El docente accede a PROGRAMACION y BASES-DATOS. El estudiante entra a Moodle y a sus actividades; las APIs de análisis siguen restringidas a docentes. Los correos `.invalid` son ficticios y no reciben mensajes.

Estas dos cuentas usan `MOODLE_TEACHER_PASSWORD` y `MOODLE_STUDENT_PASSWORD`, con los valores anteriores como predeterminados locales. La semilla aplica sus contraseñas configuradas en cada arranque. Los demás usuarios conservan `MOODLE_LAB_PASSWORD`; admin conserva `MOODLE_ADMIN_PASSWORD`. Para personalizarlas, añadir las variables a `infra/.env` y recrear Moodle.

Verificar el formulario (dos accesos válidos y contraseña incorrecta rechazada): `./scripts/verify-email-login.ps1`. Si se personalizan las contraseñas, pasar `-TeacherPassword` y `-StudentPassword` como SecureString; el script de aceptación admite los mismos parámetros junto con `-LabPassword`.
