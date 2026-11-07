#!/usr/bin/env bash
# Arma el instalador con la versión de package.json. Uso: bash build/armar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
rm -rf dist && mkdir -p dist/app
cp -r app/. dist/app/
# La versión de la app sale de package.json
sed -i "s/const APP_VERSION = '[^']*';/const APP_VERSION = '$V';/" dist/app/app.js
grep -q "const APP_VERSION = '$V';" dist/app/app.js
makensis -V2 -DVERSION="$V" -DORIGEN="$PWD/dist/app" -DSALIDA="$PWD/dist/StreamDonations-Setup-$V.exe" build/instalador.nsi
echo "Listo: dist/StreamDonations-Setup-$V.exe"
