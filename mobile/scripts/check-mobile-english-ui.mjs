#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const roots = ['mobile/app', 'mobile/src/components'];
const extensions = new Set(['.ts', '.tsx']);
const cjk = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...files(full));
    else if (extensions.has(path.extname(entry.name)) && !full.includes('__tests__')) result.push(full);
  }
  return result;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

const offenders = [];
for (const root of roots) {
  for (const file of files(root)) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    const lines = source.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!cjk.test(line)) return;
      // User-facing literals and JSX text only; implementation identifiers/comments are ignored.
      if (/(?:['"`][^'"`]*[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^'"`]*['"`]|>[^<]*[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^<]*<)/.test(line)) {
        offenders.push(file + ':' + (i + 1) + ': ' + line.trim());
      }
    });
  }
}
if (offenders.length) {
  console.error('Mobile English UI check failed:\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('Mobile English UI check passed.');
