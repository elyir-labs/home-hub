#!/usr/bin/env bash
# Puts hub.elyir.com together in site/dist: the front page, its pictures, and the install script from the top of the
# repository, so /install serves exactly what the README's command does. functions/ stays beside dist, where
# `wrangler pages deploy dist` looks for it. The pretend house goes in at /try, built first with
# `npm run build:try` in app/; the front page links it, so the site is not put together without it.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/shots dist/fonts
cp index.html privacy.html site.js _headers _routes.json dist/
cp shots/*.jpg dist/shots/
cp fonts/* dist/fonts/
cp ../app/public/favicon.svg dist/
cp ../install.sh dist/install.sh
[ -d ../app/dist-try ] || { echo "no app/dist-try: run npm run build:try in app/ first" >&2; exit 1; }
cp -R ../app/dist-try dist/try
echo "site/dist: $(find dist -type f | wc -l | tr -d ' ') files"
