#!/bin/sh
# Respaldo diario de la base de datos (lo ejecuta el servicio "respaldo" de docker compose).
# Conserva los últimos $RESPALDO_DIAS días en el volumen montado en /respaldos.
set -eu

HORA="${RESPALDO_HORA:-23}"
DIAS="${RESPALDO_DIAS:-30}"

respaldar() {
  archivo="/respaldos/ferreteria-$(date +%Y%m%d-%H%M%S).dump"
  echo "$(date '+%F %T') Iniciando respaldo → $archivo"
  if pg_dump --format=custom --compress=9 --file="$archivo.tmp" && mv "$archivo.tmp" "$archivo"; then
    echo "$(date '+%F %T') Respaldo listo ($(du -h "$archivo" | cut -f1))"
    find /respaldos -name 'ferreteria-*.dump' -mtime +"$DIAS" -delete
  else
    echo "$(date '+%F %T') ERROR: el respaldo falló" >&2
    rm -f "$archivo.tmp"
  fi
}

# Un respaldo al arrancar y luego uno al día a la hora indicada.
respaldar
while true; do
  ahora=$(date +%s)
  objetivo=$(date -d "$(date +%F) $HORA:00:00" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M:%S' -d "$(date +%F) $HORA:00:00" +%s)
  [ "$objetivo" -le "$ahora" ] && objetivo=$((objetivo + 86400))
  sleep $((objetivo - ahora))
  respaldar
done
