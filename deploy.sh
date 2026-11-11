#!/bin/sh
# Build and push dist/ to the gh-pages branch (GitHub Pages serves it).
# The Avantt fonts are not in the source repo but are part of the build.
set -e
cd "$(dirname "$0")"
npm run build
touch dist/.nojekyll
cd dist
rm -rf .git
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name=typograaf -c user.email=hello@typografie.be commit -q -m "Deploy"
git push -f https://github.com/typograaf/artist-card.git gh-pages:gh-pages
rm -rf .git
echo "deployed"
