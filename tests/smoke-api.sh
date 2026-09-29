#!/usr/bin/env bash
# Prueba de humo de rutas y API del panel de votación.
# Uso:  APP_URL=http://localhost:3000 USUARIO=sofia CLAVE=1234 bash tests/smoke-api.sh
# Requiere el servidor levantado (npm start) y curl.
set -uo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
USUARIO="${USUARIO:-sofia}"
CLAVE="${CLAVE:-1234}"
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

contenido() { # url texto_esperado (usa la cookie de sesión)
  local body
  body=$(curl -s -b "$JAR" "$APP_URL$1")
  PASOS=$((PASOS + 1))
  if grep -q -- "$2" <<<"$body"; then
    printf '  ok    %-48s contiene "%s"\n' "$1" "$2"
  else
    printf '  FALLA %-48s no contiene "%s"\n' "$1" "$2"
    FALLOS=$((FALLOS + 1))
  fi
}

PAGINAS=(/dashboard /usuarios /concejales /bloques /municipios /sesiones /asistencia-qr /quorum /orden-del-dia /proyectos /votaciones /reportes /estadisticas /auditoria /configuracion)

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

echo "== 4. Paginas con sesion =="
for p in "${PAGINAS[@]}"; do
  paso "GET $p" "$(estado $p -b "$JAR")" 200
  contenido "$p" 'nav-link active'
done
contenido /dashboard 'class="vote-panel'
contenido /asistencia-qr 'id="qrCodigo"'

echo "== 5. API de lectura =="
for r in /api/session /api/projects /api/history /api/sessions /api/order-of-day /api/quorum /api/attendance /api/reports /api/stats /api/votaciones /api/overview /api/usuarios /api/councillors /api/bloques /api/municipios; do
  paso "GET $r" "$(estado $r)" 200
done
paso "GET /api/project/1" "$(estado /api/project/1)" 200
paso "GET /api/project/9999" "$(estado /api/project/9999)" 404

echo "== 6. API protegida sin token =="
for r in /api/auth/me /api/auditoria /api/asistencia /api/configuracion; do
  paso "GET $r sin token" "$(estado $r)" 401
done

echo "== 7. API protegida con token =="
for r in /api/auth/me /api/auditoria /api/asistencia /api/asistencia/qr /api/configuracion; do
  paso "GET $r con token" "$(estado $r "${AUTH[@]}")" 200
done

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
paso "POST checkin usuario inexistente" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$APP_URL/api/asistencia/checkin" -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\",\"username\":\"noexiste\"}")" 404

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

rm -f "$JAR"
echo
if [[ "$FALLOS" -eq 0 ]]; then
  echo "TODO OK: $PASOS verificaciones"
else
  echo "$FALLOS FALLAS de $PASOS verificaciones"
  exit 1
fi

