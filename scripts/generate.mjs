#!/usr/bin/env node
// Regenerates the files derived from catalog.json and the published
// provenance records: .claude-plugin/marketplace.json and every
// plugins/<tool>/.claude-plugin/plugin.json.
//
//   node scripts/generate.mjs           write the files
//   node scripts/generate.mjs --check   fail if any file is out of date

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  CATALOG,
  MARKETPLACE,
  PLUGINS,
  formatJSON,
  marketplaceManifest,
  pluginManifest,
  readJSON,
} from './lib.mjs'

export function published(root) {
  const dir = join(root, PLUGINS)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'provenance.json')))
    .map((e) => e.name)
    .sort()
}

// render returns the generated files as a map from path to contents.
export function render(root) {
  const catalog = readJSON(join(root, CATALOG))
  const tools = published(root)
  const files = new Map([[MARKETPLACE, formatJSON(marketplaceManifest(catalog, tools))]])
  for (const name of tools) {
    const tool = catalog.tools[name]
    if (!tool) continue // validate.mjs reports unregistered plugins
    const { version } = readJSON(join(root, PLUGINS, name, 'provenance.json'))
    files.set(`${PLUGINS}/${name}/.claude-plugin/plugin.json`, formatJSON(pluginManifest(name, tool, version)))
  }
  return files
}

function main() {
  const root = process.cwd()
  const check = process.argv.includes('--check')
  const stale = []
  for (const [path, contents] of render(root)) {
    const full = join(root, path)
    const current = existsSync(full) ? readFileSync(full, 'utf8') : null
    if (current === contents) continue
    if (check) {
      stale.push(path)
      continue
    }
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
    console.log(`wrote ${path}`)
  }
  if (stale.length) {
    for (const path of stale) console.error(`${path}: out of date; run node scripts/generate.mjs`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
