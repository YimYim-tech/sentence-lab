// Renders the app icons from one SVG design (run: npm run icons).
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const TEAL = '#1E5F6A';
const PAPER = '#F4F2EC';
const EDGE = '#C9C1B0';
const LINE = '#8FC0C7';

function tiles(scale = 1, cx = 256, cy = 256) {
  // three word tiles on a ruled sentence line + an insertion caret
  const s = (v) => v * scale;
  const ox = cx - s(160);
  const oy = cy - s(60);
  const tile = (x, w) =>
    `<rect x="${ox + s(x)}" y="${oy}" width="${s(w)}" height="${s(78)}" rx="${s(14)}" fill="${EDGE}"/>` +
    `<rect x="${ox + s(x)}" y="${oy}" width="${s(w)}" height="${s(68)}" rx="${s(14)}" fill="${PAPER}"/>`;
  return (
    tile(0, 84) +
    tile(98, 112) +
    tile(224, 66) +
    `<rect x="${ox + s(302)}" y="${oy - s(6)}" width="${s(10)}" height="${s(92)}" rx="${s(5)}" fill="${PAPER}"/>` +
    `<rect x="${ox}" y="${oy + s(100)}" width="${s(320)}" height="${s(8)}" rx="${s(4)}" fill="${LINE}"/>`
  );
}

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${TEAL}"/>${tiles(1)}</svg>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${TEAL}"/>${tiles(1)}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${TEAL}"/>${tiles(0.78)}</svg>`;

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', rounded);
await sharp(Buffer.from(rounded)).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(rounded)).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(square)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('icons written');
