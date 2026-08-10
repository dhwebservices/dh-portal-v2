/**
 * Catches components used in JSX that were never imported or defined.
 *
 * Vite builds this without complaint - esbuild transforms each file in
 * isolation and does not resolve identifiers - so the first sign of trouble is
 * a blank white page in the browser. That has happened twice: a leftover call
 * to deleted state, and <AnnouncementModal /> rendered with no import because a
 * string replace silently matched nothing.
 *
 * Deliberately narrow. It only looks at capitalised JSX tags, which are
 * component references, and only reports ones with no import, no local
 * declaration and no destructuring anywhere in the file. That keeps it free of
 * the false positives that would get it switched off, at the cost of not being
 * a real linter.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const SRC = path.join(root, 'src')

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git'])

// Anything the runtime or JSX transform provides.
const GLOBALS = new Set([
  'Fragment', 'Suspense', 'StrictMode', 'Profiler',
  'Math', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'JSON',
  'Promise', 'Map', 'Set', 'Error', 'RegExp', 'Intl', 'Infinity', 'NaN',
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx$/.test(full)) out.push(full)
  }
  return out
}

const findings = []

for (const file of walk(SRC)) {
  const source = readFileSync(file, 'utf8')
  const relative = path.relative(root, file)

  // Capitalised JSX tags, ignoring dotted forms like <Foo.Bar />
  const used = new Set()
  for (const match of source.matchAll(/<([A-Z][A-Za-z0-9_]*)(?=[\s/>])/g)) {
    used.add(match[1])
  }

  for (const name of used) {
    if (GLOBALS.has(name)) continue

    const declared = new RegExp(
      `(^|[^A-Za-z0-9_])(import\\s+${name}\\b`
      + `|import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`
      + `|(const|let|var|function|class)\\s+${name}\\b`
      + `|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=`
      // parameter destructuring, including renames: ({ icon: Icon })
      + `|[({,]\\s*[A-Za-z0-9_]+\\s*:\\s*${name}\\b`
      + `|${name}\\s*[:=])`,
      'm',
    ).test(source)

    if (!declared) {
      const line = source.slice(0, source.indexOf(`<${name}`)).split('\n').length
      findings.push(`${relative}:${line} <${name}> is rendered but never imported or defined.`)
    }
  }
}

if (findings.length) {
  console.error('Undefined component references (these render as a blank page):\n')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log(`No undefined component references (${walk(SRC).length} files checked).`)
