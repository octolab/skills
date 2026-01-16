// Shared helpers for the octolab/skills catalog: the registry, skill
// frontmatter, versions and compatibility ranges, payload digests, and the
// files generated from them. No npm dependencies; Node 22 or later.

import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

export const CATALOG = 'catalog.json'
export const MARKETPLACE = '.claude-plugin/marketplace.json'
export const PLUGINS = 'plugins'
export const PROVENANCE_SCHEMA = 1
export const DIGEST_ALGORITHM = 'octolab-skill-sha256-v1'

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
// The regular expression from semver.org, without build metadata, which a
// release version doesn't need.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/

// --- registry -----------------------------------------------------------------

export function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function formatJSON(value) {
  return JSON.stringify(value, null, 2) + '\n'
}

// checkCatalog returns a list of problems in catalog.json.
export function checkCatalog(catalog) {
  const errors = []
  const m = catalog.marketplace || {}
  if (!m.name || !NAME.test(m.name)) errors.push('marketplace.name: must be kebab-case')
  if (!m.description) errors.push('marketplace.description: required')
  if (!m.owner?.name) errors.push('marketplace.owner.name: required')
  const tools = catalog.tools || {}
  for (const [name, t] of Object.entries(tools)) {
    const at = `tools.${name}`
    if (!NAME.test(name) || name.length > 64) errors.push(`${at}: name must be kebab-case, at most 64 chars`)
    if (!/^[\w.-]+\/[\w.-]+$/.test(t.repository || '')) errors.push(`${at}.repository: must be owner/repo`)
    if (!t.skill || t.skill.startsWith('/') || t.skill.split('/').includes('..')) {
      errors.push(`${at}.skill: must be a relative path inside the repository`)
    } else if (posix.basename(t.skill) !== name) {
      errors.push(`${at}.skill: directory must be named ${name}`)
    }
    if (!t.description) errors.push(`${at}.description: required`)
    try {
      const url = new URL(t.homepage)
      if (url.protocol !== 'https:') throw new Error()
    } catch {
      errors.push(`${at}.homepage: must be an https URL`)
    }
    if (!t.license) errors.push(`${at}.license: required`)
    if (t.keywords && !(Array.isArray(t.keywords) && t.keywords.every((k) => typeof k === 'string'))) {
      errors.push(`${at}.keywords: must be a list of strings`)
    }
  }
  return errors
}

// --- frontmatter ----------------------------------------------------------------

// parseFrontmatter reads the YAML subset SKILL.md may use and rejects the rest
// instead of guessing:
//
//   key: plain scalar          a string that YAML would also read as a string
//   key: "double" | 'single'   quoted strings
//   key: >- | > | |- | |       block scalars indented by two spaces
//   key:                       a map of the same key-value lines, indented by
//     sub: value               two spaces, one level deep
//
// Duplicate keys, flow collections, anchors, tags, and plain scalars YAML
// would type as booleans, nulls or numbers are errors.
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') throw new Error('SKILL.md must start with a --- frontmatter line')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new Error('SKILL.md frontmatter has no closing --- line')
  const body = lines.slice(1, end)
  const data = {}
  let i = 0
  const indent = (line) => line.length - line.trimStart().length
  const blank = (line) => line.trim() === ''

  const scalar = (raw, where) => {
    const v = raw.trim()
    if (v.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\.)*"$/.test(v)) throw new Error(`${where}: unterminated or trailing double-quoted string`)
      return JSON.parse(v)
    }
    if (v.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(v)) throw new Error(`${where}: unterminated or trailing single-quoted string`)
      return v.slice(1, -1).replaceAll("''", "'")
    }
    if (/^[[\]{}&*!|>@`%,?#-]/.test(v) && !/^-[^\s]/.test(v)) {
      throw new Error(`${where}: quote values that start with ${v[0]}`)
    }
    if (/:\s|\s#/.test(v)) throw new Error(`${where}: quote values that contain ": " or " #"`)
    if (/^(?:~|null|true|false|yes|no|on|off|y|n)$/i.test(v)) throw new Error(`${where}: quote "${v}", YAML reads it as a non-string`)
    if (/^[-+]?(?:\d[\d_]*(?:\.\d*)?(?:e[-+]?\d+)?|\.\d+|0x[\da-f]+|0o[0-7]+|\.inf|\.nan)$/i.test(v)) {
      throw new Error(`${where}: quote "${v}", YAML reads it as a number`)
    }
    return v
  }

  const block = (style, base, where) => {
    const out = []
    while (i < body.length && (blank(body[i]) || indent(body[i]) > base)) {
      if (!blank(body[i]) && indent(body[i]) !== base + 2) throw new Error(`${where}: block lines must be indented by ${base + 2} spaces`)
      out.push(blank(body[i]) ? '' : body[i].slice(base + 2))
      i++
    }
    while (out.length && out[out.length - 1] === '') out.pop()
    if (!out.length) throw new Error(`${where}: empty block scalar`)
    // Folding joins adjacent lines with a space; each empty line between
    // them stands for one newline.
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

  const entries = (base, target, where) => {
    while (i < body.length) {
      const line = body[i]
      if (blank(line) || line.trimStart().startsWith('#')) {
        i++
        continue
      }
      if (indent(line) < base) return
      if (indent(line) !== base) throw new Error(`${where}: inconsistent indentation: ${line.trim()}`)
      const m = line.slice(base).match(/^([A-Za-z0-9_.-]+):(?:[ ]+(.*))?$/)
      if (!m) throw new Error(`${where}: unsupported line: ${line.trim()}`)
      const [, key, rest = ''] = m
      const at = where ? `${where}.${key}` : key
      if (Object.hasOwn(target, key)) throw new Error(`${at}: duplicate key`)
      i++
      if (/^[>|]-?$/.test(rest)) target[key] = block(rest, base, at)
      else if (rest === '') {
        if (base > 0) throw new Error(`${at}: only one level of nesting is supported`)
        const map = {}
        entries(base + 2, map, at)
        if (!Object.keys(map).length) throw new Error(`${at}: empty value`)
        target[key] = map
      } else target[key] = scalar(rest, at)
    }
  }

  entries(0, data, '')
  return { data, body: lines.slice(end + 1).join('\n') }
}

// --- versions -------------------------------------------------------------------

export function parseVersion(v) {
  const m = SEMVER.exec(String(v).replace(/^v/, ''))
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split('.') : [] }
}

export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a
  const y = typeof b === 'string' ? parseVersion(b) : b
  for (const k of ['major', 'minor', 'patch']) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return Math.sign(y.pre.length - x.pre.length)
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1
    if (y.pre[i] === undefined) return 1
    const [p, q] = [x.pre[i], y.pre[i]]
    const [np, nq] = [/^\d+$/.test(p), /^\d+$/.test(q)]
    if (p === q) continue
    if (np && nq) return +p < +q ? -1 : 1
    if (np !== nq) return np ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

// defaultRange is the OctoLab compatibility policy: a skill written for X.Y.Z
// covers binaries from X.Y.Z up to the next breaking release. Before 1.0 a
// minor release is breaking; 0.0.z and prereleases match exactly.
export function defaultRange(version) {
  const v = parseVersion(version)
  if (!v) throw new Error(`not a version: ${version}`)
  const base = `${v.major}.${v.minor}.${v.patch}`
  if (v.pre.length || (v.major === 0 && v.minor === 0)) return `=${version}`
  if (v.major === 0) return `>=${base} <0.${v.minor + 1}.0`
  return `>=${base} <${v.major + 1}.0.0`
}

// parseRange accepts space-separated comparators (=, >=, >, <=, <), all of
// which must hold.
export function parseRange(range) {
  const parts = String(range).trim().split(/\s+/)
  if (!parts[0]) return null
  const out = []
  for (const p of parts) {
    const m = /^(>=|<=|>|<|=)?(.+)$/.exec(p)
    if (!m || !parseVersion(m[2])) return null
    out.push({ op: m[1] || '=', version: m[2] })
  }
  return out
}

// satisfies follows npm's rule for prereleases: a prerelease matches only a
// range that names a prerelease of the same major.minor.patch.
export function satisfies(version, range) {
  const comparators = typeof range === 'string' ? parseRange(range) : range
  const v = parseVersion(version)
  if (!comparators || !v) return false
  if (v.pre.length) {
    const same = comparators.some(({ version: bound }) => {
      const b = parseVersion(bound)
      return b.pre.length && b.major === v.major && b.minor === v.minor && b.patch === v.patch
    })
    if (!same) return false
  }
  return comparators.every(({ op, version: bound }) => {
    const c = compareVersions(version, bound)
    return { '=': c === 0, '>=': c >= 0, '>': c > 0, '<=': c <= 0, '<': c < 0 }[op]
  })
}

// checkRange enforces the compatibility policy on a declared range: it starts
// at the release itself and ends no later than the next breaking release.
// Narrower is allowed, wider is not.
export function checkRange(version, range) {
  const comparators = parseRange(range)
  if (!comparators) return 'must be a version range'
  if (comparators.length === 1 && comparators[0].op === '=' && comparators[0].version === version) return null
  const stable = !parseVersion(version).pre.length
  if (stable && comparators.some((c) => parseVersion(c.version).pre.length)) {
    return 'must not name prereleases for a stable release'
  }
  const def = parseRange(defaultRange(version))
  if (def.length === 1) {
    return comparators.length === 1 && comparators[0].op === '=' && comparators[0].version === version
      ? null
      : `must be ${defaultRange(version)}`
  }
  const lower = comparators.filter((c) => c.op === '>=')
  const upper = comparators.filter((c) => c.op === '<')
  if (comparators.length !== 2 || lower.length !== 1 || upper.length !== 1) return 'must look like ">=X.Y.Z <A.B.C"'
  if (lower[0].version !== version) return `must start at the release: >=${version}`
  const limit = def.find((c) => c.op === '<').version
  if (compareVersions(upper[0].version, version) <= 0 || compareVersions(upper[0].version, limit) > 0) {
    return `must end after ${version} and no later than <${limit}`
  }
  return null
}

// --- skill payload --------------------------------------------------------------

// listFiles returns the payload's files as sorted POSIX paths relative to dir.
// Symbolic links and dotfiles are errors: they don't survive every channel
// and dotfiles are reserved for installers' ownership markers.
export function listFiles(dir, prefix = '') {
  const files = []
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.name.startsWith('.')) throw new Error(`${rel}: dotfiles are not allowed in a skill`)
    const st = lstatSync(join(dir, rel))
    if (st.isSymbolicLink()) throw new Error(`${rel}: symbolic links are not allowed in a skill`)
    if (st.isDirectory()) files.push(...listFiles(dir, rel))
    else if (st.isFile()) files.push(rel)
    else throw new Error(`${rel}: unsupported file type`)
  }
  return files.sort(byBytes)
}

function byBytes(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b))
}

// digestFiles hashes [path, bytes] pairs: for every file in byte order of its
// path, sha256 takes path, NUL, decimal size, NUL, contents. Installers and
// `<tool> skill info` must use the same definition.
export function digestFiles(entries) {
  const hash = createHash('sha256')
  for (const [path, bytes] of [...entries].sort(([a], [b]) => byBytes(a, b))) {
    hash.update(path)
    hash.update('\0')
    hash.update(String(bytes.length))
    hash.update('\0')
    hash.update(bytes)
  }
  return `sha256:${hash.digest('hex')}`
}

export function digestDir(dir) {
  return digestFiles(listFiles(dir).map((rel) => [rel, readFileSync(join(dir, rel))]))
}

// checkSkill validates a skill directory against the Agent Skills spec and the
// OctoLab metadata contract. files maps relative paths to contents.
export function checkSkill(tool, files) {
  const errors = []
  const text = files.get('SKILL.md')
  if (text === undefined) return { errors: ['SKILL.md: missing'] }
  let fm
  try {
    fm = parseFrontmatter(text.toString('utf8'))
  } catch (err) {
    return { errors: [`SKILL.md: ${err.message}`] }
  }
  const d = fm.data
  if (d.name !== tool) errors.push(`SKILL.md name: must be ${tool}`)
  if (typeof d.description !== 'string' || !d.description.trim() || d.description.length > 1024) {
    errors.push('SKILL.md description: required, at most 1024 characters')
  }
  if (d.compatibility !== undefined && (typeof d.compatibility !== 'string' || d.compatibility.length > 500)) {
    errors.push('SKILL.md compatibility: at most 500 characters')
  }
  const meta = d.metadata
  if (!meta || typeof meta !== 'object') {
    errors.push('SKILL.md metadata: required')
    return { errors, frontmatter: d }
  }
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v !== 'string') errors.push(`SKILL.md metadata.${k}: must be a string`)
  }
  if (meta.tool !== tool) errors.push(`SKILL.md metadata.tool: must be ${tool}`)
  if (!parseVersion(meta.version || '')) errors.push('SKILL.md metadata.version: must be a semantic version')
  if (parseVersion(meta.version || '')) {
    const problem = checkRange(meta.version, meta['tool-version-range'] || '')
    if (problem) errors.push(`SKILL.md metadata.tool-version-range: ${problem}`)
  }
  for (const [rel, bytes] of files) {
    if (!rel.endsWith('.md')) continue
    for (const [, target] of bytes.toString('utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue
      const path = posix.normalize(posix.join(posix.dirname(rel), target.split('#')[0]))
      if (path.startsWith('..') || path.startsWith('/')) errors.push(`${rel}: link leaves the skill: ${target}`)
      else if (!files.has(path) && ![...files.keys()].some((f) => f.startsWith(path + '/'))) {
        errors.push(`${rel}: broken link: ${target}`)
      }
    }
  }
  return { errors, frontmatter: d }
}

export function readSkillFiles(dir) {
  return new Map(listFiles(dir).map((rel) => [rel, readFileSync(join(dir, rel))]))
}

// --- generated files ------------------------------------------------------------

export function pluginManifest(name, tool, version) {
  return {
    name,
    version,
    description: tool.description,
    author: { name: 'OctoLab', url: 'https://www.octolab.org/' },
    homepage: tool.homepage,
    repository: `https://github.com/${tool.repository}`,
    license: tool.license,
    ...(tool.keywords?.length ? { keywords: tool.keywords } : {}),
  }
}

// marketplaceManifest lists the registered tools that have a published plugin.
export function marketplaceManifest(catalog, published) {
  const m = catalog.marketplace
  return {
    name: m.name,
    description: m.description,
    owner: m.owner,
    plugins: Object.keys(catalog.tools)
      .filter((name) => published.includes(name))
      .sort()
      .map((name) => ({
        name,
        description: catalog.tools[name].description,
        source: `./${PLUGINS}/${name}`,
      })),
  }
}

export function provenanceRecord({ tool, version, repository, tag, commit, skill, digest, publisher }) {
  return {
    schema: PROVENANCE_SCHEMA,
    tool,
    version,
    source: { repository, tag, commit, path: skill },
    digest: { algorithm: DIGEST_ALGORITHM, value: digest },
    publisher,
  }
}

export function catalogTag(tool, version) {
  return `${tool}--v${version}`
}
