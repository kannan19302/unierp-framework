// Hoist "use client" above tsc's "use strict" prologue.
// React only honours the directive as the FIRST statement; one line lower it is
// an inert string expression and the component silently becomes a server
// component. See unierp-design-system for the full account.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIRECTIVE = '"use client";';
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}
let fixed = 0;
for (const file of walk('dist')) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(DIRECTIVE)) continue;
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.trim() === DIRECTIVE);
  if (i <= 0) continue;
  lines.splice(i, 1);
  lines.unshift(DIRECTIVE);
  writeFileSync(file, lines.join('\n'));
  fixed += 1;
}
console.log(`hoisted "use client" in ${fixed} file(s)`);
