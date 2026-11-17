// Checks that all 4 locale files have the same keys as en.json, and that every
// literal t('section.key') used in the app exists in en.json.
// Usage: node scripts/check-i18n.mjs   (exit code 1 if anything is missing)

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const I18N_DIR = 'src/i18n';
const LOCALES = ['en', 'fr', 'de', 'es'];
const SOURCE_DIRS = ['src', 'App.js'];

const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  const key = prefix ? `${prefix}.${k}` : k;
  return v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, key) : [key];
});

// i18next plural suffixes: t('x.count') resolves to x.count_one / x.count_other
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

const keysByLocale = Object.fromEntries(LOCALES.map((l) => [
  l, new Set(flatten(JSON.parse(readFileSync(join(I18N_DIR, `${l}.json`), 'utf8')))),
]));
const reference = keysByLocale.en;
let problems = 0;

for (const locale of LOCALES.filter((l) => l !== 'en')) {
  const keys = keysByLocale[locale];
  const missing = [...reference].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !reference.has(k));
  if (missing.length) console.log(`\n[${locale}] missing ${missing.length} key(s):\n  ${missing.join('\n  ')}`);
  if (extra.length) console.log(`\n[${locale}] ${extra.length} key(s) not in en.json:\n  ${extra.join('\n  ')}`);
  problems += missing.length + extra.length;
}

const listJs = (p) => statSync(p).isDirectory()
  ? readdirSync(p).flatMap((f) => listJs(join(p, f)))
  : p.endsWith('.js') ? [p] : [];

const baseKeys = new Set([...reference].map((k) => k.replace(PLURAL_SUFFIX, '')));
const unknown = [];
for (const file of SOURCE_DIRS.flatMap(listJs)) {
  const src = readFileSync(file, 'utf8');
  for (const [, key] of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)['"]/g)) {
    if (!reference.has(key) && !baseKeys.has(key)) unknown.push(`${file}: ${key}`);
  }
}
if (unknown.length) console.log(`\nt() keys used in code but missing from en.json:\n  ${unknown.join('\n  ')}`);
problems += unknown.length;

if (problems) {
  console.log(`\n${problems} i18n problem(s) found.`);
  process.exit(1);
}
console.log(`i18n OK — ${reference.size} keys in ${LOCALES.length} locales, all t() literals resolved.`);
