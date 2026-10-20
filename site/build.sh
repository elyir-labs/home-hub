#!/usr/bin/env bash
# Puts hub.elyir.com together in site/dist: the front page, its pictures, and the install script from the top of the
# repository, so /install serves exactly what the README's command does. functions/ stays beside dist, where
# `wrangler pages deploy dist` looks for it. The pretend house goes in at /try when it has been built
# (`npm run build:try` in app/).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/shots dist/fonts
cp index.html privacy.html _headers dist/
cp shots/*.jpg dist/shots/
cp fonts/* dist/fonts/
cp ../app/public/favicon.svg dist/
cp ../install.sh dist/install.sh
if [ -d ../app/dist-try ]; then cp -R ../app/dist-try dist/try; fi
echo "site/dist: $(find dist -type f | wc -l | tr -d ' ') files"
