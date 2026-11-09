#!/bin/sh
# Compila y publica dist/ en la rama gh-pages (GitHub Pages).
set -e
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Publicación $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$(cd .. && git remote get-url origin)" gh-pages
rm -rf .git
echo "Publicado."
