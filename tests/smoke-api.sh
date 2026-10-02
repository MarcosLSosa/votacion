#!/usr/bin/env bash
# Prueba de humo de rutas y API del panel de votación.
# Uso:  APP_URL=http://localhost:3000 USUARIO=sofia CLAVE=Prueba-segura-2026 bash tests/smoke-api.sh
# Requiere el servidor levantado (npm start) y curl.
set -uo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
USUARIO="${USUARIO:-sofia}"
CLAVE="${CLAVE:-${VOTACION_TEST_PASSWORD:-Prueba-segura-2026}}"
JAR="$(mktemp)"
FALLOS=0
PASOS=0

paso() { # descripcion obtenido esperado
  PASOS=$((PASOS + 1))
  if [[ "$2" == "$3" ]]; then
    printf '  ok    %-48s %s\n' "$1" "$2"
  else
    printf '  FALLA %-48s obtenido %s, esperado %s\n' "$1" "$2" "$3"
    FALLOS=$((FALLOS + 1))
  fi
}

estado() { # url [extra curl...] -> http code
  local url="$1"; shift
  curl -s -o /dev/null -w '%{http_code}' "$@" "$APP_URL$url"
}

contenido() { # url texto_esperado [jar] (usa la cookie de sesión)
  local body jar="${3:-$JAR}"
  body=$(curl -s -b "$jar" "$APP_URL$1")
  PASOS=$((PASOS + 1))
  if grep -q -- "$2" <<<"$body"; then
    printf '  ok    %-48s contiene "%s"\n' "$1" "$2"
  else
    printf '  FALLA %-48s no contiene "%s"\n' "$1" "$2"
    FALLOS=$((FALLOS + 1))
  fi
}

sin_contenido() { # url texto_no_esperado [jar]
  local body jar="${3:-$JAR}"
  body=$(curl -s -b "$jar" "$APP_URL$1")
  PASOS=$((PASOS + 1))
  if grep -q -- "$2" <<<"$body"; then
    printf '  FALLA %-48s no debería contener "%s"\n' "$1" "$2"
    FALLOS=$((FALLOS + 1))
  else
    printf '  ok    %-48s sin "%s"\n' "$1" "$2"
  fi
}

token_de() { # usuario clave -> token
  curl -s -X POST "$APP_URL/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4
}

jar_de() { # usuario clave -> archivo de cookies
  local jar; jar=$(mktemp)
  curl -s -o /dev/null -c "$jar" -X POST "$APP_URL/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}"
  echo "$jar"
}

PAGINAS=(/dashboard /usuarios /concejales /bloques /municipios /sesiones /asistencia-qr /quorum /orden-del-dia /proyectos /votaciones /reportes /estadisticas /auditoria /configuracion)
# Páginas que sólo Mesa o Administrador pueden abrir.
PAGINAS_MESA=(/concejales /bloques /municipios /sesiones /asistencia-qr /proyectos /reportes /estadisticas /auditoria)
PAGINAS_ADMIN=(/usuarios /configuracion)

echo "== 1. Rutas publicas =="
for r in /login /asistencia /screen; do
  paso "GET $r" "$(estado $r)" 200
done

echo "== 2. Paginas protegidas sin sesion =="
for p in "${PAGINAS[@]}"; do
  paso "GET $p sin sesion" "$(estado $p)" 302
  redir=$(curl -s -o /dev/null -w '%{redirect_url}' "$APP_URL$p")
  PASOS=$((PASOS + 1))
  if [[ "$redir" == */login ]]; then
    printf '  ok    %-48s redirige a /login\n' "  redireccion de $p"
  else
    printf '  FALLA %-48s redirige a %s\n' "  redireccion de $p" "$redir"
    FALLOS=$((FALLOS + 1))
  fi
done

echo "== 3. Login =="
login=$(curl -s -c "$JAR" -X POST "$APP_URL/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$USUARIO\",\"password\":\"$CLAVE\"}")
PASOS=$((PASOS + 1))
if grep -q '"token"' <<<"$login"; then
  printf '  ok    %-48s devolvio token y cookie\n' 'POST /api/auth/login'
else
  printf '  FALLA %-48s %s\n' 'POST /api/auth/login' "${login:0:120}"
  FALLOS=$((FALLOS + 1))
fi
TOKEN=$(grep -o '"token":"[^"]*"' <<<"$login" | cut -d'"' -f4)
AUTH=(-H "x-auth-token: $TOKEN")
CODIGO=$(curl -s "${AUTH[@]}" "$APP_URL/api/asistencia/qr" | grep -o '"codigo":"[^"]*"' | cut -d'"' -f4)

echo "== 3b. Presencia registrada por login =="
asistencias=$(curl -s "${AUTH[@]}" "$APP_URL/api/asistencia")
PASOS=$((PASOS + 1))
if grep -q '"metodo":"panel"' <<<"$asistencias"; then
  printf '  ok    %-48s el login deja marca de presencia\n' 'GET /api/asistencia'
else
  printf '  FALLA %-48s sin marca de login: %s\n' 'GET /api/asistencia' "${asistencias:0:120}"
  FALLOS=$((FALLOS + 1))
fi

echo "== 4. Paginas con sesion =="
for p in "${PAGINAS[@]}"; do
  paso "GET $p" "$(estado $p -b "$JAR")" 200
  contenido "$p" 'nav-link active'
done
contenido /dashboard 'class="vote-panel'
contenido /asistencia-qr 'id="qrCodigo"'

echo "== 4b. Acceso de concejal =="
JAR_CONCEJAL=$(jar_de maria "$CLAVE")
PAGINAS_CONCEJAL=(/dashboard /quorum /orden-del-dia /votaciones)
for p in "${PAGINAS_CONCEJAL[@]}"; do
  paso "GET $p como concejal" "$(estado "$p" -b "$JAR_CONCEJAL")" 200
  contenido "$p" 'nav-link active' "$JAR_CONCEJAL"
done
for p in "${PAGINAS_MESA[@]}" "${PAGINAS_ADMIN[@]}"; do
  paso "GET $p como concejal" "$(estado "$p" -b "$JAR_CONCEJAL")" 403
done
nav_concejal=$(curl -s -b "$JAR_CONCEJAL" "$APP_URL/dashboard")
for p in /dashboard /quorum /orden-del-dia /votaciones; do
  PASOS=$((PASOS + 1))
  if grep -q "href=\"$p\"" <<<"$nav_concejal"; then
    printf '  ok    %-48s visible en nav de concejal\n' "$p"
  else
    printf '  FALLA %-48s falta en nav de concejal\n' "$p"
    FALLOS=$((FALLOS + 1))
  fi
done
for p in /concejales /bloques /municipios /sesiones /asistencia-qr /proyectos /reportes /estadisticas /auditoria /usuarios /configuracion; do
  PASOS=$((PASOS + 1))
  if grep -q "href=\"$p\"" <<<"$nav_concejal"; then
    printf '  FALLA %-48s no debería aparecer en nav de concejal\n' "$p"
    FALLOS=$((FALLOS + 1))
  else
    printf '  ok    %-48s oculto en nav de concejal\n' "$p"
  fi
done

echo "== 5. API de lectura =="
for r in /api/session /api/projects /api/history /api/sessions /api/order-of-day /api/quorum /api/attendance /api/reports /api/stats /api/votaciones /api/overview /api/councillors /api/bloques /api/municipios /api/screen; do
  paso "GET $r" "$(estado $r)" 200
done
contenido '/api/screen' '"quorumAlcanzado"'
contenido '/api/screen' '"bloqueColor"'
contenido '/api/screen' '"presente":'
contenido '/api/screen' '"serverAt"'
paso "GET /api/project/1" "$(estado /api/project/1)" 200
paso "GET /api/project/9999" "$(estado /api/project/9999)" 404

echo "== 6. API protegida sin token =="
for r in /api/auth/me /api/usuarios /api/auditoria /api/asistencia /api/configuracion; do
  paso "GET $r sin token" "$(estado $r)" 401
done

echo "== 7. API protegida con token =="
for r in /api/auth/me /api/usuarios /api/auditoria /api/asistencia /api/asistencia/qr /api/configuracion; do
  paso "GET $r con token" "$(estado $r "${AUTH[@]}")" 200
done
usuarios=$(curl -s "${AUTH[@]}" "$APP_URL/api/usuarios")
PASOS=$((PASOS + 1))
if grep -Eq '"password"|scrypt' <<<"$usuarios"; then
  printf '  FALLA %-48s la API expone material de autenticacion\n' 'GET /api/usuarios'
  FALLOS=$((FALLOS + 1))
else
  printf '  ok    %-48s no expone contraseñas ni hashes\n' 'GET /api/usuarios'
fi

echo "== 8. Votacion =="
paso "POST /api/vote opcion invalida" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/vote" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"option":"no-existe"}')" 400
yo=$(curl -s "${AUTH[@]}" "$APP_URL/api/auth/me")
if grep -q '"voted":false' <<<"$yo"; then
  paso "POST /api/vote abstencion" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/vote" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"option":"abstencion"}')" 200
  paso "POST /api/vote duplicado" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/vote" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"option":"abstencion"}')" 409
else
  printf '  skip  %-48s ya votó el proyecto activo\n' 'POST /api/vote'
fi

echo "== 9. Asistencia QR =="
paso "POST checkin codigo invalido" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d '{"codigo":"DEADBEEF","username":"leo"}')" 400
paso "POST checkin sin clave no autentica" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\",\"username\":\"leo\"}")" 401
paso "POST checkin no permite suplantar concejal" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\",\"username\":\"leo\",\"password\":\"incorrecta\"}")" 401
paso "POST checkin credenciales propias" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\",\"username\":\"leo\",\"password\":\"$CLAVE\"}")" 200
paso "POST checkin duplicado" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\",\"username\":\"leo\",\"password\":\"$CLAVE\"}")" 409

echo "== 9b. Credenciales individuales =="
JAR_LEO=$(jar_de leo "$CLAVE")
paso "PUT contraseña corta" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/usuarios/12/password" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"password":"short"}')" 400
paso "PUT contraseña sin rol administrador" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/usuarios/12/password" -H 'Content-Type: application/json' -b "$JAR_CONCEJAL" -d '{"password":"Clave-Individual-2026"}')" 403
CLAVE_TEMPORAL='Credencial-Temporal-2026'
paso "PUT restablecer contraseña" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/usuarios/12/password" -H 'Content-Type: application/json' "${AUTH[@]}" -d "{\"password\":\"$CLAVE_TEMPORAL\"}")" 200
paso "POST login rechaza clave anterior" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"leo\",\"password\":\"$CLAVE\"}")" 401
paso "PUT contraseña invalida sesiones anteriores" \
  "$(estado /api/auth/me -b "$JAR_LEO")" 401
JAR_LEO=$(jar_de leo "$CLAVE_TEMPORAL")
paso "POST login acepta clave individual nueva" \
  "$(estado /api/auth/me -b "$JAR_LEO")" 200
paso "PUT restaurar contraseña del test" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/usuarios/12/password" -H 'Content-Type: application/json' "${AUTH[@]}" -d "{\"password\":\"$CLAVE\"}")" 200

echo "== 10. Configuracion =="
actual=$(curl -s "${AUTH[@]}" "$APP_URL/api/configuracion")
duracion=$(grep -o '"duracion_votacion":"[^"]*"' <<<"$actual" | cut -d'"' -f4)
paso "PUT /api/configuracion" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/configuracion" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"duracion_votacion":9}')" 200
paso "PUT /api/configuracion clave no permitida" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$APP_URL/api/configuracion" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"clave_falsa":1}')" 400
curl -s -o /dev/null -X PUT "$APP_URL/api/configuracion" -H 'Content-Type: application/json' "${AUTH[@]}" -d "{\"duracion_votacion\":$duracion}"

echo "== 11. Auditoria =="
auditoria=$(curl -s "${AUTH[@]}" "$APP_URL/api/auditoria")
PASOS=$((PASOS + 1))
if grep -q 'Inicio de sesión' <<<"$auditoria"; then
  printf '  ok    %-48s registro el inicio de sesión\n' 'GET /api/auditoria'
else
  printf '  FALLA %-48s sin inicio de sesión: %s\n' 'GET /api/auditoria' "${auditoria:0:120}"
  FALLOS=$((FALLOS + 1))
fi

echo "== 12. Logout =="
paso "POST /api/auth/logout" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -b "$JAR" -c "$JAR" "$APP_URL/api/auth/logout")" 200
paso "GET /auditoria tras logout" "$(estado /auditoria -b "$JAR")" 302
paso "GET /api/auth/me con token revocado" "$(estado /api/auth/me "${AUTH[@]}")" 401

rm -f "$JAR" "$JAR_CONCEJAL" "$JAR_LEO"
echo
if [[ "$FALLOS" -eq 0 ]]; then
  echo "TODO OK: $PASOS verificaciones"
else
  echo "$FALLOS FALLAS de $PASOS verificaciones"
  exit 1
fi
