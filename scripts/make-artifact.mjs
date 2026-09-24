// Turns the single-file build (dist-single/index.html) into an Artifact page fragment:
// the Artifact host supplies <!doctype>, <html>, <head> and <body>, so we keep only the
// title, styles, the root element and the inline module script.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');

const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);
const title = '<title>Sentence Lab</title>';
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script\b[^>]*>[\s\S]*?<\/script>/g).filter((s) => !/src=/.test(s.split('>')[0]));
if (scripts.length === 0) throw new Error('no inline script found — did the single-file build run?');

const root = '<div id="root" dir="rtl" lang="he"></div>';
const noscript = '<noscript>האפליקציה צריכה JavaScript כדי לפעול.</noscript>';
const out = [title, ...styles, root, noscript, ...scripts].join('\n');

mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/sentence-lab.html', out);
const size = statSync('artifact/sentence-lab.html').size;
if (size > 16 * 1024 * 1024) throw new Error(`artifact too large: ${size}`);
console.log(`artifact/sentence-lab.html written (${(size / 1024).toFixed(0)} KiB)`);
