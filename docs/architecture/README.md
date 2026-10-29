# Arquitectura Sprint 1

## Componentes implementados

- **Frontend:** React 19 con Vite, React Router y Nginx. Las rutas de la aplicación se reflejan en el historial del navegador; el token Moodle se conserva únicamente en memoria. Nginx sirve el bundle estático y enruta por el mismo origen a las APIs.
- **Access.API:** ASP.NET Core .NET 10 valida identidad Moodle y cursos autorizados.
- **MoodleIntegration.API:** usa el adaptador HTTP con token personal y transforma respuestas Moodle en contratos de transporte.
- **AcademicData.API:** coordina la sincronización y es el único propietario del almacenamiento auxiliar MySQL 8.4.
- **Moodle:** conserva las calificaciones oficiales y es la fuente de los snapshots importados.

La separación interna del backend sigue las responsabilidades por servicio: endpoints y composición en `Program.cs`; `CourseReader` en Application; `AcademicStore` en Infrastructure. `BuildingBlocks/Integration` contiene únicamente DTO de intercambio, tratamiento HTTP común y el adaptador Moodle; no contiene persistencia ni reglas estadísticas. Los servicios intercambian snapshots por HTTP y no consultan tablas ajenas.

Access.API y MoodleIntegration.API consultan permisos actuales en Moodle. AcademicData vuelve a validar el acceso antes de leer o sincronizar la copia. No existe credencial técnica compartida para suplantar docentes ni bypass para administradores de Moodle. La base auxiliar conserva cursos, alumnos por curso, ítems/notas y auditoría; usa claves compuestas y sustituciones transaccionales. Las actividades mantienen la estructura recibida. No se modifica la base Moodle.

## Frontera del sprint y evolución prevista

El Sprint 1 entrega cursos autorizados, conexión/sincronización, participantes, calificaciones individuales y contenido del curso. No contiene el motor de analítica ni el servicio agente. El backlog ubica indicadores, asociación temática y Ollama en el Sprint 2; conversación y reportes en el Sprint 3. Cuando se incorpore el agente, consultará herramientas expuestas por el backend y no accederá directamente a credenciales Moodle ni a tablas.

## Correspondencia con la especificación

La arquitectura sigue la secuencia frontend React → APIs ASP.NET Core → almacenamiento auxiliar y conserva Moodle como fuente externa. La especificación admite equivalentes tecnológicos justificados: PostgreSQL/SQL Server se sustituyó por MySQL 8.4 por decisión explícita registrada en la [ADR 0002](decisions/0002-sprint1-mysql-identidad.md). El agente Python/FastAPI u otro equivalente queda planeado para su sprint, fuera de este incremento.

En Compose de laboratorio, Moodle y APIs se publican solo en loopback para facilitar la comprobación local; la base auxiliar no publica puerto. Moodle HTTP está permitido exclusivamente para este laboratorio local. Un despliegue institucional requiere HTTPS, secretos configurados fuera del repositorio, autorización efectiva por curso y aprobación del complemento de Moodle.

Véanse las [decisiones de arquitectura](decisions/README.md) y la [guía operativa del Sprint 1](../requirements/sprint1.md).

El [diagrama de clases de Sprint N1](class-diagram.md) documenta los contratos, adaptadores, servicios de aplicación y tablas realmente presentes en el proyecto.
