// The data of the site, read at build time from the catalog itself: the
// registry (catalog.json), the record of every publication
// (plugins/<tool>/provenance.json), the skills (SKILL.md) and the
// <tool>--v<version> tags. A new release of a tool reaches the page with no
// edit here; a new tool or a new skill needs its card in products.mjs, and the
// build stops until it has one (see AGENTS.md, "The site").
//
// Zero dependencies: Node and, for the dates and the release history, git.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { products } from './products.mjs'

// docs/ lives in the root of the catalog; the build runs from docs/.
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const CATALOG = 'octolab/skills'
// The sections of the page; a card's anchor is the tool's name.
const ANCHORS = ['tools', 'install', 'versions']
const REQUIRED = ['emoji', 'tagline', 'summary', 'install']

// --- read like the publisher ---------------------------------------------------
// frontmatter and compareVersions follow parseFrontmatter and compareVersions
// of octomation/skills-action (scripts/lib.mjs), so a skill the publisher
// accepts is a skill the site reads. The site only reads: what the publisher
// refuses never reaches the catalog.

export function frontmatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') throw new Error('SKILL.md must start with a --- frontmatter line')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new Error('SKILL.md frontmatter has no closing --- line')
  const body = lines.slice(1, end)
  const data = {}
  let i = 0
  const indent = (line) => line.length - line.trimStart().length
  const blank = (line) => line.trim() === ''
  const scalar = (raw) => {
    const v = raw.trim()
    if (v.startsWith('"')) return JSON.parse(v)
    if (v.startsWith("'")) return v.slice(1, -1).replaceAll("''", "'")
    return v
  }
  const block = (style, base) => {
    const out = []
    while (i < body.length && (blank(body[i]) || indent(body[i]) > base)) {
      out.push(blank(body[i]) ? '' : body[i].slice(base + 2))
      i++
    }
    while (out.length && out[out.length - 1] === '') out.pop()
    let joined = out.join('\n')
    if (style.startsWith('>')) {
      joined = ''
      let empty = 0
      for (const line of out) {
        if (line === '') {
          empty++
          continue
        }
        if (joined) joined += empty ? '\n'.repeat(empty) : ' '
        else if (empty) joined += '\n'.repeat(empty)
        joined += line
        empty = 0
      }
    }
    return style.endsWith('-') ? joined : joined + '\n'
  }
  const entries = (base, target) => {
    while (i < body.length) {
      const line = body[i]
      if (blank(line) || line.trimStart().startsWith('#')) {
        i++
        continue
      }
      if (indent(line) < base) return
      const m = line.slice(base).match(/^([A-Za-z0-9_.-]+):(?:[ ]+(.*))?$/)
      if (!m) throw new Error(`SKILL.md: unsupported line: ${line.trim()}`)
      const [, key, rest = ''] = m
      i++
      if (/^[>|]-?$/.test(rest)) target[key] = block(rest, base)
      else if (rest === '') {
        const map = {}
        entries(base + 2, map)
        target[key] = map
      } else target[key] = scalar(rest)
    }
  }
  entries(0, data)
  return data
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/

function parseVersion(v) {
  const m = SEMVER.exec(v)
  return m ? { core: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] } : null
}

export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return a < b ? -1 : a > b ? 1 : 0
  for (let k = 0; k < 3; k++) if (x.core[k] !== y.core[k]) return x.core[k] < y.core[k] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length)
  for (let k = 0; k < Math.max(x.pre.length, y.pre.length); k++) {
    if (x.pre[k] === undefined) return -1
    if (y.pre[k] === undefined) return 1
    const [p, q] = [x.pre[k], y.pre[k]]
    if (p === q) continue
    const [np, nq] = [/^\d+$/.test(p), /^\d+$/.test(q)]
    if (np && nq) return +p < +q ? -1 : 1
    if (np !== nq) return np ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

// --- git ------------------------------------------------------------------------

function git(args, root) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

// A shallow clone has the files but not their history: its dates would be
// those of the shallow boundary, so it gives none.
const fullHistory = (root) => git(['rev-parse', '--is-shallow-repository'], root)?.trim() === 'false'

// Every <tool>--v<version> tag with the date of its commit, oldest first.
// Without git, tags or full history, the page shows no history.
export function releases(tool, root = ROOT) {
  if (!fullHistory(root)) return []
  const out = git(['for-each-ref', '--format=%(refname:short) %(*committerdate:iso-strict) %(committerdate:iso-strict)', `refs/tags/${tool}--v*`], root)
  if (!out) return []
  return out.split('\n').filter(Boolean).map((line) => {
    const [tag, ...dates] = line.trim().split(/\s+/)
    return { tag, version: tag.slice(tool.length + 3), date: dates.find(Boolean)?.slice(0, 10) ?? null }
  }).sort((a, b) => compareVersions(a.version, b.version))
}

// The date of the last commit that changed a file, or null.
function lastChange(path, root) {
  if (!fullHistory(root)) return null
  return git(['log', '-1', '--format=%cI', '--', path], root)?.trim().slice(0, 10) || null
}

// --- the catalog ----------------------------------------------------------------

const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'))

// The skills a tool may publish: its main skill first, then its extra skills.
const registered = (tool, entry) => [tool, ...(entry['extra-skills'] || [])]

// Cards are checked against the registry whether or not the tool has
// published: a registration and its card land in one pull request, and the
// build of that pull request is where a missing card should stop.
function checkCards(catalog, cards) {
  const errors = []
  const fix = 'docs/products.mjs'
  for (const name of Object.keys(cards)) {
    if (!catalog.tools[name]) errors.push(`${fix}: ${name} is not registered in catalog.json`)
  }
  for (const [tool, entry] of Object.entries(catalog.tools)) {
    if (ANCHORS.includes(tool)) errors.push(`catalog.json: a tool named ${tool} would take the anchor of a section of the site; rename the section in docs/`)
    const card = cards[tool]
    if (!card) {
      errors.push(`${fix}: no card for ${tool}, registered in catalog.json; add one as AGENTS.md describes`)
      continue
    }
    for (const field of REQUIRED) {
      if (typeof card[field] !== 'string' || !card[field].trim()) errors.push(`${fix}: ${tool}.${field} is required`)
    }
    if (typeof entry.homepage !== 'string' || !/^https:\/\//.test(entry.homepage)) errors.push(`catalog.json: tools.${tool}.homepage must be an https URL`)
    const allowed = registered(tool, entry)
    for (const skill of Object.keys(card.skills || {})) {
      if (!allowed.includes(skill)) errors.push(`${fix}: ${tool}.skills.${skill} is not a skill catalog.json registers for ${tool}`)
    }
    for (const skill of allowed) {
      const line = card.skills?.[skill]
      if (typeof line !== 'string' || !line.trim()) errors.push(`${fix}: ${tool}.skills.${skill} is missing; catalog.json registers ${skill} for ${tool}`)
    }
  }
  return errors
}

export function loadCatalog(root = ROOT, cards = products) {
  const catalog = readJSON(join(root, 'catalog.json'))
  const errors = checkCards(catalog, cards)
  const tools = []

  for (const [tool, entry] of Object.entries(catalog.tools)) {
    const base = join(root, 'plugins', tool)
    const card = cards[tool]
    // A registered tool shows once its first release is published.
    if (!card || !existsSync(join(base, 'provenance.json'))) continue
    const prov = readJSON(join(base, 'provenance.json'))
    const allowed = registered(tool, entry)
    const published = existsSync(join(base, 'skills'))
      ? readdirSync(join(base, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
      : []
    for (const skill of published) {
      if (!allowed.includes(skill)) errors.push(`plugins/${tool}/skills/${skill}: published, but catalog.json does not register it for ${tool}`)
    }
    // The main skill first, the extra skills in the order of the registry.
    const recorded = prov.skills || { [tool]: { path: prov.source.path, digest: prov.digest.value } }
    const skills = allowed.filter((skill) => published.includes(skill) && card.skills?.[skill]).map((skill) => {
      const file = join('plugins', tool, 'skills', skill, 'SKILL.md')
      let fm
      try {
        fm = frontmatter(readFileSync(join(root, file), 'utf8'))
      } catch (err) {
        throw new Error(`${file}: ${err.message}`)
      }
      return {
        name: skill,
        id: `${tool}:${skill}`,
        summary: card.skills[skill],
        range: fm.metadata?.['tool-version-range'] ?? null,
        digest: recorded[skill]?.digest ?? null,
      }
    })
    const catalogTag = `${tool}--v${prov.version}`
    // The publisher commits, then tags: a build of the publication commit may
    // run before the tag exists. The release is in the history either way,
    // dated by the last commit of its record until its tag arrives.
    const history = releases(tool, root)
    const tagged = history.find((r) => r.version === prov.version)
    const date = tagged?.date ?? lastChange(join('plugins', tool, 'provenance.json'), root)
    if (!tagged && date) history.push({ tag: catalogTag, version: prov.version, date })
    tools.push({
      ...card,
      embedded: card.embedded === true,
      tool,
      repository: entry.repository,
      homepage: entry.homepage,
      version: prov.version,
      range: skills[0]?.range ?? null,
      source: prov.source,
      sourceUrl: `https://github.com/${prov.source.repository}/tree/${prov.source.tag}/${prov.source.path}`,
      catalogTag,
      catalogUrl: `https://github.com/${CATALOG}/tree/${catalogTag}/plugins/${tool}`,
      provenanceUrl: `https://github.com/${CATALOG}/blob/${catalogTag}/plugins/${tool}/provenance.json`,
      releaseNotes: card.releaseNotes?.replaceAll('{version}', prov.version) ?? null,
      published: date,
      history,
      skills,
    })
  }

  if (errors.length) throw new Error(`the catalog site cannot show the catalog:\n  ${errors.join('\n  ')}`)

  const dates = tools.map((t) => t.published).filter(Boolean).sort()
  return {
    name: catalog.marketplace.name,
    tools,
    skills: tools.reduce((n, t) => n + t.skills.length, 0),
    releases: tools.reduce((n, t) => n + t.history.length, 0),
    updated: dates.at(-1) ?? null,
  }
}

let cached
export const catalog = () => (cached ??= loadCatalog())

export function formatDate(iso) {
  if (!iso) return null
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
