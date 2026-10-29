# Laboratorio Moodle

Consultar [la guía completa](../requirements/sprint1.md) para el primer arranque y los usuarios ficticios. El entorno usa Moodle 5.0.3, PHP 8.3 y MySQL 8.4.

`infra/moodle/bootstrap.php` crea tres cursos, doce estudiantes y dos docentes. El principal tiene dos materias y el segundo una materia restringida. Se crean cuatro unidades, dos parciales y actividades assign en las categorías Exámenes (40%), Autónomo (30%) y APEs (30%). Cada parcial pesa 50% de la nota del curso. El máximo está fijado en 10 para actividades, categorías, parciales y nota final del curso; el libro contiene ceros y notas ausentes.

El complemento local edumonitor publica el servicio `edumonitor` con funciones de lectura. La semilla activa REST y permite usar el protocolo a usuarios autenticados; las funciones siguen aplicando permisos Moodle. Los estudiantes pueden obtener un token pero no acceder a las APIs EduMonitor. En una institución, el administrador debe revisar la instalación y reducir los usuarios habilitados del servicio según sus políticas.

La contraseña del administrador y de los usuarios de laboratorio procede del archivo local de entorno. La semilla no imprime tokens y las APIs no escriben notas. Verificar visualmente categorías, actividades y pesos en el libro de calificaciones antes de declarar aceptada HU-01.
