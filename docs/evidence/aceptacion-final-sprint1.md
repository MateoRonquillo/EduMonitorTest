# Informe final de aceptación del Sprint 1

Ejecución inicial: 22 de octubre de 2026 (America/Guayaquil). Actualización de la vista y PA-04: 27 de octubre de 2026.

## Dictamen

Las cinco pruebas de aceptación del Sprint 1 cumplen en el laboratorio, con las observaciones descritas abajo. PA-04 se actualizó tras integrar y comprobar la vista React docente el 27 de octubre. Esto no declara terminado el MVP completo ni cubre requisitos de analítica/agente de sprints posteriores.

Referencia: Product Backlog `SprintN1.docx`, apartado “Criterios de aceptación o pruebas de aceptación” y HU 1–5. También se considera la especificación general del proyecto. MySQL sustituye PostgreSQL/SQL Server por solicitud explícita del usuario, decisión que permanece documentada en la ADR 0002.

## Resultado por prueba

| Prueba | Resultado | Evidencia actual | Observación |
|---|---|---|---|
| PA-01 / HU-01: entorno Moodle | Cumple con observación | Moodle y su MySQL healthy; tres cursos; doce actividades por curso; doce estudiantes y docente en cada curso de prueba. Acceso HTTP autenticado a los libros de PROGRAMACION y BASES-DATOS: 200, con unidades y parciales presentes en HTML. SQL confirma máximo 10 en nota final, parciales y categorías; parciales 50/50 y categorías 40/30/30. | La semilla carga las notas directamente en el libro; no constituye evidencia de entregas o evaluaciones dentro de cada tarea. |
| PA-02 / HU-02: microservicios .NET | Cumple | Siete servicios Docker running/healthy; Compose válido; tres hosts .NET con health; suite Release: 30 correctas, cero fallos. La construcción y recreación de Moodle con volúmenes persistentes también se verificaron durante la corrección previa. | Los health .NET comprueban vida del proceso, no todas sus dependencias. Esta ejecución no repitió una instalación en volúmenes vacíos. |
| PA-03 / HU-03: integración Moodle | Cumple en escenario nominal | Consulta real de cursos permitidos, estudiantes, actividades e ítems/notas; script HTTP completo correcto. Comparación independiente Moodle/MySQL auxiliar: 504 filas, cero diferencias de valor, mínimo o máximo. | La prueba original no exige simular caídas; esas condiciones no se reprodujeron en servidores reales en este análisis. |
| PA-04 / HU-04: acceso docente | Cumple en laboratorio | La vista React autentica con Moodle y enumera los dos cursos autorizados del docente. Las APIs rechazan al estudiante con 403; curso ajeno denegado; token ausente o inválido: 401. El token de navegador permanece en memoria. | El acceso se validó con cuentas ficticias. La restricción de estudiantes/grupos dentro de un curso compartido sigue siendo una limitación (F-02). |
| PA-05 / HU-05: almacenamiento | Cumple en el laboratorio | Dos sincronizaciones consecutivas por curso en esta ejecución; comparación original/copia correcta; doce estudiantes y 252 registros de ítems/notas por curso; cero claves duplicadas; cero calificaciones huérfanas. | Las 252 filas incluyen ítems de actividad y totales/categorías, no 252 actividades. Las actividades se conservan como estructura JSON Moodle. |

## Verificaciones realizadas

1. `dotnet test backend/EduMonitorAI.sln -c Release --no-restore`: 30 correctas, cero fallos.
2. `scripts/verify-email-login.ps1`: acceso web de ambos perfiles con correo y contraseña, y rechazo de contraseña incorrecta.
3. `scripts/acceptance-sprint1.ps1`: todas sus comprobaciones HTTP completadas para el backend. La vista React se verificó por separado en navegador.
4. Consulta SQL directa en Moodle: cursos, actividades, categorías, pesos y calificaciones originales.
5. Comparación SQL independiente entre el libro Moodle y la copia auxiliar: 504 claves curso/estudiante/ítem; cero diferencias de valor y escala. Se incluyeron valores null.
6. SQL auxiliar: cero duplicados y cero referencias huérfanas. El historial crece con cada sincronización; los datos académicos mantienen sus claves sin duplicarse.
7. Libro de calificaciones mediante sesión web docente: ambas páginas respondieron 200 y su HTML contiene las unidades y parciales. No se realizó inspección visual por capturas.
8. Comprobación adicional con token estudiante: 403 en listado de cursos, snapshot, copia local y verificación de curso. Token inválido contra identidad: 401.
9. Vista docente React: docente autenticado y limitado a dos cursos; login de estudiante rechazado por falta de cursos autorizados; navegación por participantes/notas/contenido/sincronización y Atrás/Adelante verificados; sesión protegida vuelve a login al recargar.

Las pruebas de sincronización actualizan únicamente la copia auxiliar y su auditoría. No se cambiaron notas, matrículas ni roles para realizar este análisis.

## Hallazgos y acciones recomendadas

### F-01. Panel docente propio - resuelto en la actualización

El 27 de octubre se integró la vista docente React descrita en `docs/architecture/README.md`, con rutas de cursos, participantes, calificaciones, contenido y datos sincronizados. El acceso requiere cuenta Moodle que devuelva cursos con permisos docentes; la comprobación de acceso a APIs continúa en backend. PA-04 deja de estar pendiente en el flujo de laboratorio.

### F-02. Alcance por grupos no trasladado a la copia local

Prioridad: alta antes de permitir docentes con restricciones por grupos en un mismo curso.

`AcademicData.API/Program.cs`, líneas 72–77, comprueba permiso de curso y devuelve el snapshot completo almacenado. `local/edumonitor/classes/external/get_access.php`, líneas 14–17, devuelve cursos por matrícula y capacidades, sin alcance por estudiante/grupo. Por tanto, la lectura auxiliar no incorpora una restricción adicional por grupo para un docente que sí esté autorizado al curso.

Este hallazgo proviene de revisión estática; no se realizó una explotación con un docente de grupo restringido. Los controles entre cursos sí se verificaron y funcionan. Antes del uso institucional, definir y aplicar el alcance por estudiante/grupo tanto al sincronizar como al leer la copia, y añadir el escenario de prueba con dos grupos y dos docentes del mismo curso.

### F-03. Notas de semilla en libro y en tareas no equivalentes

Prioridad: media para una demostración coherente de actividades.

`infra/moodle/bootstrap.php` usa `grade_item::update_final_grade`, que registra las notas en el libro, sin crear por ese mecanismo registros de evaluación de assign o entregas. Son entidades diferentes; esta diferencia no demuestra pérdida en la sincronización, cuya comparación fue correcta.

Para demostrar evaluaciones desde la pantalla de cada tarea, preparar las notas mediante la API del módulo assign y comprobar su concordancia con el libro. No inferir entrega ausente o pendiente de calificar a partir de una nota null; el contrato actual la representa como unknown.

## Límites de la conclusión

- Se verificó el laboratorio actual, con datos ficticios y los volúmenes existentes; no se certifica una instalación limpia en este análisis.
- No se probaron en vivo revocación de roles, grupos separados, interrupciones de red, base auxiliar caída, cargas concurrentes ni recuperación tras fallos parciales. La transacción y los controles existen en código, pero esos escenarios requieren pruebas adicionales.
- La aceptación del MVP completo incluye dashboard, alertas, agente y reportes de sprints posteriores; no están cubiertos ni implementados por aprobar la base de este Sprint 1.
- Las actividades, categorías, parciales y totales del laboratorio usan máximo 10. La semilla actualiza también libros preexistentes y fuerza el recálculo de las notas finales.

## Cierre recomendado

Registrar PA-01 a PA-05 como cumplidas en el laboratorio, con las observaciones y límites anteriores. PA-04 se verificó tras añadir el panel React; F-02 sigue bloqueando el uso institucional con docentes limitados por grupos. Ajustar la semilla de evaluaciones antes de demostrar notas dentro de cada tarea.
