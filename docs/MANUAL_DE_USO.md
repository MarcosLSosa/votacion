# Manual de uso

## Ingreso

Abrí `http://localhost:3000` → te manda a `/login`. Ingresá con las credenciales individuales que te asignó la administración del Concejo. La base inicial contiene datos ficticios sólo para desarrollo; no uses esas cuentas para una sesión real.

La sesión se conserva si se reinicia el servidor y vence tras **30 minutos sin actividad** o **8 horas** desde el ingreso. El botón **Salir** de la tarjeta del perfil la cierra inmediatamente. Las actualizaciones automáticas de la pantalla no cuentan como actividad.

Los concejales sólo tienen en su menú las cuatro vistas de uso habitual: **Votación en curso, Orden del Día, Quórum y Votaciones**. Las páginas de consulta ampliada requieren Mesa; Usuarios y Configuración requieren Administración.

## Preparar una sesión desde cero

1. **Administración (Sofía)** entra a **Bloques** y da de alta los bloques; luego entra a **Usuarios** y crea cada concejal con nombre, cargo, usuario, contraseña inicial, nivel **Concejal** y bloque. La clave inicial tiene al menos 12 caracteres; se comparte por un canal seguro.
2. **Mesa (Juan) o Administración** entra a **Sesiones**, crea la convocatoria con fecha y quórum y la activa. La sesión debe existir antes de los proyectos para que queden asociados.
3. **Mesa o Administración** entra a **Proyectos**, registra expediente, tipo, título y descripción. La nueva orden aparece también en el **Orden del Día**, sin votos.
4. Cuando comienza el tratamiento, Mesa o Administración pulsa **Activar** junto al expediente. Arranca el tiempo configurado en Configuración y los concejales pueden entrar con sus propias claves para votar una sola vez.
5. Para registrar asistencia, Mesa o Administración abre **Asistencia QR** y comparte el QR; cada concejal marca presencia desde su teléfono con usuario y contraseña.

El perfil **Concejal** no puede crear ni gestionar estos registros. Administración administra las cuentas y los bloques; Mesa organiza las convocatorias, proyectos y tratamiento. Administración también puede realizar las tareas de Mesa. Los permisos se verifican en el servidor, no sólo ocultando botones.

## Panel: qué hace cada página

| URL | Página | Para qué sirve |
| --- | --- | --- |
| `/dashboard` | Votación en curso | Proyecto activo, contadores en vivo, tiempo restante, concejales conectados y los botones **AFIRMATIVO / NEGATIVO / ABSTENCIÓN**. Abajo, la lista de proyectos abiertos con **Activar** para iniciar la votación. |
| `/usuarios` | Usuarios | Administración crea cuentas, asigna nivel/bloque y restablece claves; consulta usuario, estado y votos. |
| `/concejales` | Concejales | Cuerpo completo con rol, bloque, presencia y voto sobre el proyecto activo. |
| `/bloques` | Bloques | Administración da de alta bloques; Mesa consulta sigla, color, integrantes y presentes. |
| `/municipios` | Municipios | Municipios del distrito, habitantes y porcentaje sobre el total. |
| `/sesiones` | Sesiones | Mesa o Administración crea convocatorias, consulta quórum y activa una sesión. |
| `/asistencia-qr` | Asistencia QR | Código e imagen QR de la sesión activa, link para compartirlo y las últimas marcas de presencia. Permite descargar/imprimir el QR y copiar su link. |
| `/quorum` | Quórum | Presentes, ausentes, quórum exigido y si está alcanzado; tabla por concejal. |
| `/orden-del-dia` | Orden del Día | Puntos del día con su estado y acceso rápido para activar el proyecto relacionado. |
| `/proyectos` | Proyectos | Mesa o Administración crea expedientes y activa una votación; ve tipo, autor, estado y conteos. |
| `/votaciones` | Votaciones | Detalle voto a voto por proyecto: quién votó qué y quiénes están pendientes. |
| `/reportes` | Reportes | Totales de proyectos, aprobados/rechazados y participación; tabla de resultados y descarga CSV de votaciones. |
| `/estadisticas` | Estadísticas | Votos históricos, tasa de participación y barras por tipo de voto. |
| `/auditoria` | Auditoría | Bitácora de acciones (login, votos, cambios de configuración, asistencias) y descarga CSV. |
| `/configuracion` | Configuración | Municipio sede, mayoría exigida, duración de votación, pantalla pública y notificaciones. |

Todas las páginas se refrescan solas cada 5 segundos; no hace falta recargar.

## Cómo se vota

1. Entrá con tu usuario y andá a `/dashboard`.
2. Si todavía no votaste el proyecto activo, el cartel dice **Selecciona una opción para votar**; tocá uno de los tres botones.
3. El conteo sube y el cartel pasa a **Ya emitiste tu voto: …**. Un segundo intento devuelve `Ya emitiste tu voto en esta ordenanza` (HTTP 409): el voto es único por proyecto. La duración se configura en `/configuracion` (1–120 minutos); al vencer, la votación se cierra sola y queda registrada en auditoría.
4. En `/votaciones` se ve el detalle de cada concejal, y en `/quorum` quién está presente.
5. Para cambiar de tema, usá **Activar** en `/dashboard`, `/orden-del-dia` o `/sesiones`.

## Asistencia con QR

1. En `/asistencia-qr` están el código, la imagen QR y el link `/asistencia?codigo=80D7AF7D`. Descargá o imprimí la imagen; al cambiar la sesión activa se genera un código nuevo y hay que actualizar el cartel.
2. El concejal abre el link desde su celular, escribe su usuario y contraseña individual, y toca **Marcar presencia**. No necesita iniciar sesión en el panel.
3. Si el código coincide y las credenciales son válidas, aparece `Listo, <Nombre>: tu presencia quedó registrada`, el concejal pasa a **conectado** y suma para el quórum. Códigos vencidos, credenciales incorrectas y marcas duplicadas se rechazan.
4. En `/asistencia-qr` se ve la marca con hora y método, y la lista de ausentes.
5. Cuando cambia la sesión activa se emite un código nuevo: los links viejos dejan de funcionar.

## Gestión de contraseñas

En la semilla ficticia de desarrollo, la cuenta `sofia` recibe `VOTACION_BOOTSTRAP_PASSWORD`; durante la migración de una base antigua esa variable rota las claves legadas según la política documentada. Producción no crea esa cuenta ni usuarios de ejemplo: requiere una base oficial provisionada con contraseñas scrypt y un Administrador. Desde **Usuarios → Cambiar clave**, Administración puede asignar una contraseña individual (mínimo 12 caracteres) a cada integrante. Las contraseñas no se pueden consultar; asignar una nueva invalida las sesiones abiertas de esa cuenta.

## Pantalla pública

`/screen` es una vista a pantalla completa para proyectar en el recinto: lee `GET /api/screen` (un solo pedido cada 3 s) y muestra proyecto, resultado (`APROBADO` / `RECHAZADO` / `EMPATE`), las cuatro tarjetas de conteo con su barra y porcentaje, la dona de distribución, la barra de presencia y una ficha por concejal con iniciales, bloque, voto y el detalle de la presencia (`conectado ahora`, `presente por QR · 19:04`, `presente en panel`, `sin conexión ni presencia`). Arriba muestra presentes/total, el estado del quórum y un reloj en vivo del servidor en formato 24 h. No exige login: abrila en una segunda ventana o en el monitor del recinto. Si no hay proyecto en votación o la API no responde, muestra un aviso en vez de datos inventados.

## Configuración

En `/configuracion` se guardan municipio sede, mayoría exigida, duración de votación, pantalla pública y notificaciones. Todo queda en la tabla `configuracion` y se registra en auditoría.

La duración sí determina el cierre automático de cada votación (de 1 a 120 minutos) desde su activación. Los datos de pantalla pública y notificaciones se guardan para configuración, pero todavía no bloquean ni alteran esas funciones. Mesa puede descargar CSV de resultados, asistencias y auditoría desde sus respectivas pantallas; los archivos contienen datos operativos y deben compartirse sólo con personal autorizado.

## Imprimir

`/reportes`, `/votaciones` y `/auditoria` tienen estilos `@media print`: al imprimir se ocultan sidebar y top bar y el contenido pasa a una columna.
