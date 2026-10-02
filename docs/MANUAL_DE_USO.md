# Manual de uso

## Ingreso

Abrí `http://localhost:3000` → te manda a `/login`. Ingresá con las credenciales individuales que te asignó la administración del Concejo. La base inicial contiene datos ficticios sólo para desarrollo; no uses esas cuentas para una sesión real.

La sesión dura 8 horas o hasta que cierres la sesión con el botón **Salir** de la tarjeta del perfil. Si el servidor se reinicia, hay que volver a entrar.

Los concejales sólo tienen en su menú las cuatro vistas de uso habitual: **Votación en curso, Orden del Día, Quórum y Votaciones**. Las páginas de consulta ampliada requieren Mesa; Usuarios y Configuración requieren Administración.

## Panel: qué hace cada página

| URL | Página | Para qué sirve |
| --- | --- | --- |
| `/dashboard` | Votación en curso | Proyecto activo, contadores en vivo, concejales conectados y los botones **AFIRMATIVO / NEGATIVO / ABSTENCIÓN**. Abajo, la lista de proyectos con el botón **Activar** para pasarlos a votación. |
| `/usuarios` | Usuarios | Alta vista del personal: usuario, email derivado, bloque, estado y votos emitidos. KPIs de total/activos/inactivos. |
| `/concejales` | Concejales | Cuerpo completo con rol, bloque, presencia y voto sobre el proyecto activo. |
| `/bloques` | Bloques | Bloques con sigla, color, cantidad de miembros y chips con los nombres; KPIs de miembros y presentes. |
| `/municipios` | Municipios | Municipios del distrito, habitantes y porcentaje sobre el total. |
| `/sesiones` | Sesiones | Sesiones convocadas, estado, quórum requerido y **Activar** para tomar una como activa. |
| `/asistencia-qr` | Asistencia QR | Código de la sesión activa, link para compartirlo, y las últimas marcas de presencia. Botón **Copiar link**. |
| `/quorum` | Quórum | Presentes, ausentes, quórum exigido y si está alcanzado; tabla por concejal. |
| `/orden-del-dia` | Orden del Día | Puntos del día con su estado y acceso rápido para activar el proyecto relacionado. |
| `/proyectos` | Proyectos | Expedientes ingresados, tipo, autor y estado de votación. |
| `/votaciones` | Votaciones | Detalle voto a voto por proyecto: quién votó qué y quiénes están pendientes. |
| `/reportes` | Reportes | Totales de proyectos, aprobados/rechazados y participación; tabla de resultados. |
| `/estadisticas` | Estadísticas | Votos históricos, tasa de participación y barras por tipo de voto. |
| `/auditoria` | Auditoría | Bitácora de acciones (login, votos, cambios de configuración, asistencias). |
| `/configuracion` | Configuración | Municipio sede, mayoría exigida, duración de votación, pantalla pública y notificaciones. |

Todas las páginas se refrescan solas cada 5 segundos; no hace falta recargar.

## Cómo se vota

1. Entrá con tu usuario y andá a `/dashboard`.
2. Si todavía no votaste el proyecto activo, el cartel dice **Selecciona una opción para votar**; tocá uno de los tres botones.
3. El conteo sube y el cartel pasa a **Ya emitiste tu voto: …**. Un segundo intento devuelve `Ya emitiste tu voto en esta ordenanza` (HTTP 409): el voto es único por proyecto.
4. En `/votaciones` se ve el detalle de cada concejal, y en `/quorum` quién está presente.
5. Para cambiar de tema, usá **Activar** en `/dashboard`, `/orden-del-dia` o `/sesiones`.

## Asistencia con QR

1. En `/asistencia-qr` está el código de la sesión activa (por ejemplo `80D7AF7D`) y el link `/asistencia?codigo=80D7AF7D`. Ese link es el que va en el cartel o en el QR impreso.
2. El concejal abre el link desde su celular, escribe su usuario y contraseña individual, y toca **Marcar presencia**. No necesita iniciar sesión en el panel.
3. Si el código coincide y las credenciales son válidas, aparece `Listo, <Nombre>: tu presencia quedó registrada`, el concejal pasa a **conectado** y suma para el quórum. Códigos vencidos, credenciales incorrectas y marcas duplicadas se rechazan.
4. En `/asistencia-qr` se ve la marca con hora y método, y la lista de ausentes.
5. Cuando cambia la sesión activa se emite un código nuevo: los links viejos dejan de funcionar.

## Gestión de contraseñas

La cuenta inicial de Administración (`sofia`) recibe la contraseña definida en `VOTACION_BOOTSTRAP_PASSWORD` durante la primera inicialización o la migración de una base anterior. Desde **Usuarios → Cambiar clave**, Administración asigna una contraseña individual (mínimo 12 caracteres) a cada integrante. Las contraseñas no se pueden consultar; asignar una nueva invalida las sesiones abiertas de esa cuenta.

## Pantalla pública

`/screen` es una vista a pantalla completa para proyectar en el recinto: lee `GET /api/screen` (un solo pedido cada 3 s) y muestra proyecto, resultado (`APROBADO` / `RECHAZADO` / `EMPATE`), las cuatro tarjetas de conteo con su barra y porcentaje, la dona de distribución, la barra de presencia y una ficha por concejal con iniciales, bloque, voto y el detalle de la presencia (`conectado ahora`, `presente por QR · 19:04`, `presente en panel`, `sin conexión ni presencia`). Arriba muestra presentes/total, el estado del quórum y un reloj en vivo del servidor en formato 24 h. No exige login: abrila en una segunda ventana o en el monitor del recinto. Si no hay proyecto en votación o la API no responde, muestra un aviso en vez de datos inventados.

## Configuración

En `/configuracion` se guardan municipio sede, mayoría exigida, duración de votación, pantalla pública y notificaciones. Todo queda en la tabla `configuracion` y se registra en auditoría. Por ahora `duracion_votacion`, `pantalla_publica` y `notificaciones` son datos de configuración que **no** disparan comportamiento: cerrar la votación sigue siendo manual.

## Imprimir

`/reportes`, `/votaciones` y `/auditoria` tienen estilos `@media print`: al imprimir se ocultan sidebar y top bar y el contenido pasa a una columna.
