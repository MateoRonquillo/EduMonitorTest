# Diagrama de clases — Sprint N1

El diagrama refleja las clases y contratos implementados en el repositorio para el alcance de Sprint N1: autorización de cursos, consulta a Moodle, sincronización de datos académicos y lectura de la copia auxiliar. Los tipos `Course`, `Student`, `Grade`, `Snapshot` y `Access` son `record` de C# usados como DTO; no son entidades de dominio con identidad propia.

```mermaid
classDiagram
direction LR

namespace EduMonitorAI_Integration {
  class ApiFailure {
    +int Status
  }
  class Course {
    <<record DTO>>
    +long Id
    +string Name
  }
  class Access {
    <<record DTO>>
    +long UserId
    +string Name
    +Course[] Courses
  }
  class Student {
    <<record DTO>>
    +long Id
    +string Name
  }
  class Grade {
    <<record DTO>>
    +long StudentId
    +long ItemId
    +string Name
    +string Module
    +long Instance
    +decimal Value
    +decimal Minimum
    +decimal Maximum
    +long ScaleId
    +string State
  }
  class Snapshot {
    <<record DTO>>
    +long CourseId
    +string CourseName
    +DateTimeOffset SyncedAt
    +string Source
    +Student[] Students
    +Grade[] Grades
    +JsonElement Activities
  }
  class MoodleClient {
    +Call(token, function, args) JsonElement
    +Authorize(token, courseId) Access
  }
  class ApiSetup {
    <<static>>
    +AddIntegration(services)
    +Token(context) string
    +UseApiErrors(app)
  }
}

namespace MoodleIntegration_API_Application {
  class CourseReader {
    +Read(token, courseId) Snapshot
    -ReadCore(token, courseId) Snapshot
  }
}

namespace AcademicData_API_Infrastructure {
  class AcademicStore {
    -Open() MySqlConnection
    +RecordFailure(course, actor, code)
    +Save(snapshot, actor)
    +Read(course) Snapshot
  }
}

Access "1" --> "0..*" Course : cursos autorizados
Snapshot "1" *-- "0..*" Student : participantes copiados
Snapshot "1" *-- "0..*" Grade : calificaciones copiadas
Grade "*" --> "1" Student : StudentId
CourseReader --> MoodleClient : valida acceso y consulta Moodle
CourseReader ..> Snapshot : construye
MoodleClient ..> Access : deserializa
AcademicStore --> Snapshot : guarda y reconstruye
AcademicStore ..> ApiFailure : informa errores
MoodleClient ..> ApiFailure : informa errores de API
CourseReader ..> ApiFailure : informa errores de lectura

class MoodleExternalGetAccess {
  <<Moodle PHP external API>>
  +execute_parameters()
  +execute()
  +execute_returns()
}
MoodleClient ..> MoodleExternalGetAccess : invoca local_edumonitor_get_access

class CoursesTable {
  <<MySQL table>>
  +id BIGINT PK
  +name VARCHAR
  +synced_at DATETIME
  +source VARCHAR
  +activities JSON
}
class StudentsTable {
  <<MySQL table>>
  +course_id BIGINT PK/FK
  +id BIGINT PK
  +name VARCHAR
}
class GradesTable {
  <<MySQL table>>
  +course_id BIGINT PK/FK
  +student_id BIGINT PK/FK
  +item_id BIGINT PK
  +payload JSON
}
class SyncRunsTable {
  <<MySQL table>>
  +id BIGINT PK
  +course_id BIGINT
  +actor_id BIGINT
  +finished_at DATETIME
  +status VARCHAR
  +error_code VARCHAR
}

CoursesTable "1" --> "0..*" StudentsTable : course_id
StudentsTable "1" --> "0..*" GradesTable : course_id + student_id
AcademicStore ..> CoursesTable : lee/escribe
AcademicStore ..> StudentsTable : lee/escribe
AcademicStore ..> GradesTable : lee/escribe
AcademicStore ..> SyncRunsTable : registra sincronizaciones
```

## Responsabilidades y límites

- `Access.API`, `MoodleIntegration.API` y `AcademicData.API` se componen en sus respectivos `Program.cs` con minimal APIs; no hay clases de controlador ni entidades ORM en este incremento.
- `MoodleClient` es el adaptador HTTP compartido. `CourseReader` obtiene participantes, actividades y notas de Moodle y forma el `Snapshot`. `AcademicStore` valida y persiste/reconstruye ese snapshot en MySQL dentro de transacciones.
- Las tablas del diagrama son el esquema físico definido en `infra/mysql/001-schema.sql`, no clases C# generadas. Las actividades se conservan como JSON en el snapshot/columna `courses.activities`; las notas conservan su payload JSON en `grades.payload`.
- El complemento Moodle implementa `local_edumonitor\\external\\get_access`; filtra cursos con capacidades de lectura de notas y participantes antes de devolver `Access` al backend.
- El frontend React está construido con funciones (`App`, `LoginPage`, `DashboardLayout`, `CoursePage`, `Roster`, `StudentGrades`, `CourseContent` y otras), no con clases. Por eso no forma parte del UML de clases. El frontend consume las APIs y muestra contratos serializados; no contiene entidades de dominio propias.
- El agente IA y sus clases no aparecen porque no están implementados en Sprint N1.

## Fuentes del diagrama

- `backend/src/BuildingBlocks/Integration/MoodleClient.cs`
- `backend/src/Services/MoodleIntegration.API/CourseReader.cs`
- `backend/src/Services/AcademicData.API/AcademicStore.cs`
- `backend/src/Services/{Access.API,MoodleIntegration.API,AcademicData.API}/Program.cs`
- `infra/mysql/001-schema.sql`
- `infra/moodle/local/edumonitor/classes/external/get_access.php`
