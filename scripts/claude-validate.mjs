#!/usr/bin/env node
// Runs `claude plugin validate --json` on the catalog root and on every
// published plugin, and fails on any error or warning (the --strict rule).
// One warning is tolerated: "Marketplace has no plugins defined" while the
// catalog really is empty, before the first tool publishes.
//
//   CLAUDE=claude node scripts/claude-validate.mjs
//
// CLAUDE is the command to run; CI uses a pinned npx invocation.

import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { published } from './generate.mjs'
import { MARKETPLACE, readJSON } from './lib.mjs'

const EMPTY = 'Marketplace has no plugins defined'

// findings collects every error and warning in a validate --json report,
// wherever the report nests them.
export function findings(report) {
  const out = []
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    for (const kind of ['errors', 'warnings']) {
      for (const f of Array.isArray(node[kind]) ? node[kind] : []) {
        out.push({ kind, path: f.path, message: f.message, file: node.file })
      }
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'errors' && k !== 'warnings') visit(v)
  }
  visit(report)
  return out
}

export function blocking(report, { emptyCatalog }) {
  return findings(report).filter(
    (f) => !(emptyCatalog && f.kind === 'warnings' && f.path === 'plugins' && f.message === EMPTY),
  )
}

function run(target) {
  const [cmd, ...pre] = (process.env.CLAUDE || 'claude').split(' ')
  let stdout
  try {
    stdout = execFileSync(cmd, [...pre, 'plugin', 'validate', '--json', target], { encoding: 'utf8' })
  } catch (err) {
    stdout = err.stdout
    if (!stdout) throw err
  }
  return JSON.parse(stdout)
}

function main() {
  const root = process.cwd()
  const emptyCatalog = readJSON(join(root, MARKETPLACE)).plugins.length === 0
  const targets = ['.', ...published(root).map((name) => `plugins/${name}`)]
  let failed = false
  for (const target of targets) {
    const report = run(target)
    const problems = blocking(report, { emptyCatalog })
    for (const p of problems) console.error(`${target}: ${p.kind.slice(0, -1)}: ${p.path}: ${p.message}`)
    if (problems.length || report.success === false) failed = true
    else console.log(`${target}: valid`)
  }
  if (failed) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
