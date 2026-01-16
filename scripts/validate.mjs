#!/usr/bin/env node
// Validates the catalog: the registry, every published plugin and its skill,
// provenance and digests, and optionally the catalog tags and the result of a
// skills CLI discovery run.
//
//   node scripts/validate.mjs
//   node scripts/validate.mjs --tags                 also check <tool>--v<version> tags
//   node scripts/validate.mjs --discovery out.json   compare `npx skills add . --json` output

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { published } from './generate.mjs'
import {
  CATALOG,
  DIGEST_ALGORITHM,
  PLUGINS,
  PROVENANCE_SCHEMA,
  checkCatalog,
  checkSkill,
  digestFiles,
  readJSON,
  readSkillFiles,
} from './lib.mjs'

export function validate(root) {
  const errors = []
  const catalog = readJSON(join(root, CATALOG))
  errors.push(...checkCatalog(catalog).map((e) => `${CATALOG}: ${e}`))

  const dir = join(root, PLUGINS)
  const dirs = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()) : []
  for (const { name } of dirs) {
    const at = `${PLUGINS}/${name}`
    const tool = catalog.tools?.[name]
    if (!tool) {
      errors.push(`${at}: not registered in ${CATALOG}`)
      continue
    }
    const base = join(dir, name)
    const expected = new Set(['provenance.json', '.claude-plugin/plugin.json'])
    for (const rel of walk(base)) {
      if (expected.has(rel) || rel.startsWith(`skills/${name}/`)) continue
      errors.push(`${at}/${rel}: unexpected file; a plugin holds plugin.json, provenance.json and skills/${name}/`)
    }
    if (!existsSync(join(base, 'provenance.json'))) {
      errors.push(`${at}/provenance.json: missing`)
      continue
    }
    const prov = readJSON(join(base, 'provenance.json'))
    const skillDir = join(base, 'skills', name)
    if (!existsSync(join(skillDir, 'SKILL.md'))) {
      errors.push(`${at}/skills/${name}/SKILL.md: missing`)
      continue
    }
    let skill
    try {
      skill = readSkillFiles(skillDir)
    } catch (err) {
      errors.push(`${at}/skills/${name}: ${err.message}`)
      continue
    }
    const { errors: skillErrors, frontmatter } = checkSkill(name, skill)
    errors.push(...skillErrors.map((e) => `${at}/skills/${name}/${e}`))
    const version = frontmatter?.metadata?.version

    if (prov.schema !== PROVENANCE_SCHEMA) errors.push(`${at}/provenance.json: schema must be ${PROVENANCE_SCHEMA}`)
    if (prov.tool !== name) errors.push(`${at}/provenance.json: tool must be ${name}`)
    if (prov.version !== version) errors.push(`${at}/provenance.json: version ${prov.version} != SKILL.md ${version}`)
    if (prov.source?.repository !== tool.repository) {
      errors.push(`${at}/provenance.json: source.repository must be ${tool.repository}`)
    }
    if (prov.source?.path !== tool.skill) errors.push(`${at}/provenance.json: source.path must be ${tool.skill}`)
    if (prov.source?.tag !== `v${prov.version}`) errors.push(`${at}/provenance.json: source.tag must be v${prov.version}`)
    if (!/^[0-9a-f]{40}$/.test(prov.source?.commit || '')) errors.push(`${at}/provenance.json: source.commit must be a full SHA`)
    if (prov.digest?.algorithm !== DIGEST_ALGORITHM) {
      errors.push(`${at}/provenance.json: digest.algorithm must be ${DIGEST_ALGORITHM}`)
    }
    const digest = digestFiles(skill)
    if (prov.digest?.value !== digest) errors.push(`${at}/provenance.json: digest ${prov.digest?.value} != payload ${digest}`)

    const manifestPath = join(base, '.claude-plugin', 'plugin.json')
    if (!existsSync(manifestPath)) errors.push(`${at}/.claude-plugin/plugin.json: missing`)
    else if (readJSON(manifestPath).version !== prov.version) {
      errors.push(`${at}/.claude-plugin/plugin.json: version must be ${prov.version}`)
    }
  }
  return errors
}

function walk(base, prefix = '') {
  const out = []
  for (const e of readdirSync(join(base, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(base, rel))
    else out.push(rel)
  }
  return out
}

// validateTags checks every <tool>--v<version> tag: it must point at a commit
// whose provenance for that tool has exactly that version.
export function validateTags(root) {
  const errors = []
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const tags = git('tag', '--list', '*--v*').split('\n').filter(Boolean)
  for (const tag of tags) {
    const [, tool, version] = tag.match(/^(.+)--v(.+)$/) || []
    let prov
    try {
      prov = JSON.parse(git('show', `${tag}:${PLUGINS}/${tool}/provenance.json`))
    } catch {
      errors.push(`${tag}: no ${PLUGINS}/${tool}/provenance.json at the tagged commit`)
      continue
    }
    if (prov.version !== version) errors.push(`${tag}: tagged provenance has version ${prov.version}`)
  }
  return errors
}

// validateDiscovery compares the skills CLI result with the published plugins.
export function validateDiscovery(root, results) {
  if (!Array.isArray(results)) return ['skills CLI produced no JSON result; check its log']
  const found = results.filter((r) => r.status === 'installed').map((r) => r.name).sort()
  const want = published(root)
  return JSON.stringify(found) === JSON.stringify(want)
    ? []
    : [`skills CLI discovered [${found.join(', ')}], expected [${want.join(', ')}]`]
}

function main() {
  const root = process.cwd()
  const args = process.argv.slice(2)
  const errors = validate(root)
  if (args.includes('--tags')) errors.push(...validateTags(root))
  const i = args.indexOf('--discovery')
  if (i >= 0) {
    let results = null
    try {
      results = readJSON(args[i + 1])
    } catch {
      // validateDiscovery reports it
    }
    errors.push(...validateDiscovery(root, results))
  }
  for (const e of errors) console.error(e)
  if (errors.length) process.exit(1)
  console.log(`catalog is valid: ${published(root).length} published plugin(s)`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
