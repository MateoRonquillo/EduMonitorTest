# Backend

Tres hosts ASP.NET Core .NET 10 conservan la distribución inicial de responsabilidades. Consultar la [guía del Sprint 1](../docs/requirements/sprint1.md) para configuración y uso.

```powershell
dotnet restore backend/EduMonitorAI.sln
dotnet build backend/EduMonitorAI.sln -c Release --no-restore
dotnet test backend/EduMonitorAI.sln -c Release --no-build
```

Desde la raíz: `dotnet run --project backend/src/Services/Access.API` (5103); `MoodleIntegration.API` (5101); `AcademicData.API` (5102). Los perfiles locales definen los puertos. `/health` no necesita dependencias; las rutas de negocio requieren Moodle configurado y token personal. AcademicData requiere además el esquema MySQL inicial.

El proyecto BuildingBlocks/Integration contiene contratos de transporte y el cliente técnico Moodle, sin persistencia. CourseReader implementa el caso de uso de lectura en MoodleIntegration; AcademicStore implementa la persistencia de AcademicData. Los servicios intercambian snapshots HTTP y no consultan tablas ajenas.
