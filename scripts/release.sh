#!/usr/bin/env bash
# Builds everything and copies the deliverables into the Google Drive folder.
# Usage (Git Bash): bash scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="/c/Users/ASUS/My Drive/אנגלית/Sentence Lab"

npm run validate:content
npx vitest run
npm run build
npm run build:single

mkdir -p release
rm -f release/sentence-lab-source.zip
powershell -NoProfile -Command "Compress-Archive -Force -DestinationPath 'release\\sentence-lab-source.zip' -Path 'package.json','package-lock.json','tsconfig.json','vite.config.ts','playwright.config.ts','index.html','README.md','.gitignore','src','public','scripts','tests','docs'"

mkdir -p "$DEST"
cp README.md "$DEST/README.md"
cp docs/CONTENT_GUIDE.md "$DEST/CONTENT_GUIDE.md"
cp artifact/sentence-lab.html "$DEST/sentence-lab.html"
cp release/sentence-lab-source.zip "$DEST/sentence-lab-source.zip"
rm -rf "$DEST/app"
cp -r dist "$DEST/app"
echo "Deliverables copied to: $DEST"
ls -la "$DEST"
