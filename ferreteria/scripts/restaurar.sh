#!/bin/sh
# Restaura un respaldo sobre la base de datos.
# Uso (desde la carpeta ferreteria/):  ./scripts/restaurar.sh respaldos/ferreteria-AAAAMMDD-HHMMSS.dump
set -eu
ARCHIVO="${1:?Indique el archivo .dump a restaurar}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO"; exit 1; }

echo "ATENCIÓN: se reemplazarán TODOS los datos actuales por los del respaldo $ARCHIVO."
printf "Escriba RESTAURAR para continuar: "
read -r respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

docker compose stop api
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$ARCHIVO"
docker compose start api
echo "Restauración terminada."
