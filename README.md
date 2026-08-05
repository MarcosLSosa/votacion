# Sistema de Votación del Concejo Deliberante

## Descripción general
Este proyecto es una plataforma de votación para un concejo deliberante, con módulos para:
- Login de concejales
- Dashboard de sesión y resultados
- Gestión de usuarios
- Administración de concejales, bloques y municipios
- Sesiones, orden del día y quórum
- Proyectos y votaciones
- Asistencia QR (estructura)
- Pantalla pública en vivo
- Reportes, estadísticas y auditoría
- Configuración del sistema

## Estructura del proyecto
- `server.js`: servidor Express que expone APIs y sirve contenido estático.
- `package.json`: dependencias del proyecto.
- `public/index.html`: interfaz principal.
- `public/app.js`: lógica de la aplicación y módulos.
- `public/styles.css`: estilos de la interfaz.
- `public/screen.html`: pantalla pública de resultados.
- `public/screen.js`: lógica de actualización de pantalla pública.
- `public/screen.css`: estilos de pantalla pública.

## Cómo correr el proyecto
1. Abre una terminal en la carpeta del proyecto.
2. Ejecuta `npm install` si todavía no instalaste dependencias.
3. Ejecuta `npm start`.
4. Abre `http://localhost:3000` en el navegador.

## Módulos disponibles
La aplicación actual tiene los siguientes módulos en la barra lateral:
- Dashboard
- Usuarios
- Concejales
- Bloques
- Municipios
- Sesiones
- Asistencia QR
- Quórum
- Orden del Día
- Proyectos
- Votaciones
- Pantalla Pública
- Reportes
- Estadísticas
- Auditoría
- Configuración

## Cómo usar la aplicación
1. Ingresa con un usuario demo (por ejemplo `sofia`, `juan`, `maria`, etc.) y contraseña `1234`.
2. El Dashboard muestra la votación activa y el estado de la sesión.
3. Usa la barra lateral para navegar entre módulos.
4. El módulo `Sesiones` muestra sesiones programadas y su estado.
5. El módulo `Orden del Día` muestra los puntos en discusión.
6. El módulo `Quórum` muestra si el quórum necesario fue alcanzado.
7. El módulo `Votaciones` resume la votación actual.
8. El módulo `Asistencia QR` muestra el estado de asistencia (conexión) y votos pendientes.
9. El módulo `Reportes` muestra métricas generales de la sesión.
10. El módulo `Estadísticas` muestra una vista de datos agregados.
11. El módulo `Auditoría` muestra eventos recientes.
12. El enlace `Pantalla pública` abre una vista en vivo para audiencias.

## APIs principales
- `GET /api/session`: datos de la votación activa y resumen.
- `GET /api/projects`: lista de proyectos con conteos.
- `GET /api/history`: proyectos finalizados.
- `GET /api/sessions`: sesiones disponibles.
- `GET /api/order-of-day`: orden del día actual.
- `GET /api/quorum`: estado del quórum.
- `GET /api/attendance`: asistencia y estado de voto.
- `GET /api/reports`: datos de reportes generales.
- `GET /api/stats`: estadísticas agregadas.
- `POST /api/auth/login`: inicio de sesión.
- `POST /api/vote`: emitir voto.

## Ver los cambios online
Para ver los cambios en vivo:
1. Arranca el servidor con `npm start`.
2. Navega a `http://localhost:3000`.
3. Navega a `http://localhost:3000/screen` para la pantalla pública.
4. Cada vez que navegues a un módulo, la app carga los datos de la API.

## Próximos pasos sugeridos
- Implementar edición/creación real de usuarios, proyectos y sesiones.
- Añadir registro y lectura de asistencia QR.
- Agregar persistencia de datos con base de datos.
- Completar rutas API de `Usuarios`, `Bloques`, `Municipios` y `Configuración`.
- Mejorar el flujo de votaciones con cierre de sesiones y resultados definitivos.
