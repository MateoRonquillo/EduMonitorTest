# API Sprint 1

Los endpoints, ejemplos, autenticación y errores se documentan en la [guía de uso](../requirements/sprint1.md#contratos). OpenAPI se genera en `/openapi/v1.json` solo con `ASPNETCORE_ENVIRONMENT=Development`.

Todos los endpoints académicos exigen `Authorization: Bearer <token personal Moodle>` y consultan permisos actuales por curso. `/health` es público y comprueba exclusivamente vida del proceso. No hay endpoints que modifiquen notas Moodle ni endpoints internos de escritura de snapshots accesibles al cliente.
