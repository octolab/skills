#!/usr/bin/env node
// Publishes one tool's released skill into the catalog. The publish action
// runs it from the tool's release workflow; see AGENTS.md for the contract.
//
// Environment:
//   TOOL                  registered tool name, e.g. indexit
//   SOURCE_TAG            release tag in the tool repository, e.g. v0.2.0
//   SOURCE_SHA            commit the workflow released (github.sha)
//   CALLER_REPOSITORY     repository running the workflow (github.repository)
//   CATALOG_REPOSITORY    defaults to octolab/skills
//   CATALOG_TOKEN         token with contents: write on the catalog
//   SOURCE_TOKEN          token that can read the tool repository
//   DRY_RUN               "true" to print the plan without writing
//   ALLOW_UNVERIFIED_TAG  "true" to accept an unsigned or unverified tag
//   PUBLISHER             publisher identity for provenance.json
//   GITHUB_OUTPUT         step outputs: changed, catalog-commit, catalog-tag, payload-digest

import { appendFileSync } from 'node:fs'

import {
  CATALOG,
  MARKETPLACE,
  PLUGINS,
  catalogTag,
  checkCatalog,
  checkSkill,
  compareVersions,
  digestFiles,
  formatJSON,
  marketplaceManifest,
  parseVersion,
  pluginManifest,
  provenanceRecord,
} from './lib.mjs'

const API = process.env.GITHUB_API_URL || 'https://api.github.com'
const GRAPHQL = process.env.GITHUB_GRAPHQL_URL || `${API}/graphql`
const ATTEMPTS = 5

export class PublishError extends Error {}

function fail(message) {
  throw new PublishError(message)
}

function client(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'octolab-skills-publish',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const rest = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 404 && method === 'GET') return null
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return res.status === 204 ? null : res.json()
  }
  const graphql = async (query, variables) => {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json()
    if (!res.ok || json.errors) {
      const err = new Error(`graphql: ${res.status} ${JSON.stringify(json.errors || json)}`)
      err.graphql = json.errors || []
      throw err
    }
    return json.data
  }
  return { rest, graphql }
}

const decode = (content) => Buffer.from(content, 'base64')

async function fileAt(rest, repo, path, ref) {
  const res = await rest('GET', `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`)
  return res ? decode(res.content) : null
}

// resolveRelease checks the source tag and release and returns the commit.
async function resolveRelease(rest, { repository, tag, sha, allowUnverified, log }) {
  const ref = await rest('GET', `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`)
  if (!ref) fail(`${repository}: tag ${tag} not found`)
  let commit = ref.object.sha
  if (ref.object.type === 'tag') {
    const obj = await rest('GET', `/repos/${repository}/git/tags/${ref.object.sha}`)
    if (obj.object.type !== 'commit') fail(`${tag}: must point at a commit`)
    commit = obj.object.sha
    if (!obj.verification?.verified) {
      const reason = obj.verification?.reason || 'unsigned'
      if (!allowUnverified) fail(`${tag}: tag signature is not verified (${reason}); release tags must be signed`)
      log(`warning: ${tag}: tag signature is not verified (${reason}); continuing because ALLOW_UNVERIFIED_TAG=true`)
    }
  } else if (!allowUnverified) {
    fail(`${tag}: lightweight tag; release tags must be annotated and signed`)
  }
  if (sha && sha !== commit) fail(`${tag} points at ${commit}, but the workflow released ${sha}`)
  const release = await rest('GET', `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`)
  if (!release) fail(`${repository}: no GitHub release for ${tag}`)
  if (release.draft || release.prerelease) fail(`${tag}: the release is a draft or a prerelease`)
  return commit
}

// readPayload downloads the skill directory at the commit.
async function readPayload(rest, { repository, commit, skill }) {
  const tree = await rest('GET', `/repos/${repository}/git/trees/${commit}?recursive=1`)
  if (tree.truncated) fail(`${repository}@${commit}: tree is too large to read`)
  const prefix = `${skill}/`
  const files = new Map()
  for (const entry of tree.tree) {
    if (!entry.path.startsWith(prefix)) continue
    const rel = entry.path.slice(prefix.length)
    if (entry.mode === '120000') fail(`${entry.path}: symbolic links are not allowed in a skill`)
    if (rel.split('/').some((part) => part.startsWith('.'))) fail(`${entry.path}: dotfiles are not allowed in a skill`)
    if (entry.type === 'tree') continue
    if (entry.type !== 'blob') fail(`${entry.path}: ${entry.type} entries (submodules) are not allowed in a skill`)
    const blob = await rest('GET', `/repos/${repository}/git/blobs/${entry.sha}`)
    files.set(rel, decode(blob.content))
  }
  if (!files.size) fail(`${repository}@${commit}: no files under ${skill}`)
  return files
}

async function catalogState(rest, catalog) {
  const head = await rest('GET', `/repos/${catalog}/git/ref/heads/main`)
  if (!head) fail(`${catalog}: no main branch`)
  const oid = head.object.sha
  const tree = await rest('GET', `/repos/${catalog}/git/trees/${oid}?recursive=1`)
  if (tree.truncated) fail(`${catalog}: tree is too large to read`)
  const registry = JSON.parse((await fileAt(rest, catalog, CATALOG, oid)).toString('utf8'))
  return { oid, paths: tree.tree.filter((e) => e.type === 'blob').map((e) => e.path), registry }
}

// publicationCommit finds the newest commit at or before head that wrote the
// tool's provenance: the commit a missing tag must point at. Anchored to the
// head already inspected, so a newer publication can't be picked up.
async function publicationCommit(rest, catalog, tool, head) {
  const path = `${PLUGINS}/${tool}/provenance.json`
  const commits = await rest('GET', `/repos/${catalog}/commits?sha=${head}&path=${encodeURIComponent(path)}&per_page=1`)
  if (!commits?.length) fail(`${catalog}: no commit wrote ${path}`)
  return commits[0].sha
}

// verifyPublication checks that a catalog ref really publishes this release:
// its provenance names the same source, and its files, hashed again rather
// than trusted from provenance, give the same digest. Returns a problem or null.
async function verifyPublication(rest, catalog, ref, release) {
  const { tool, version, repository, tag, commit, digest } = release
  const raw = await fileAt(rest, catalog, `${PLUGINS}/${tool}/provenance.json`, ref)
  const record = raw && JSON.parse(raw.toString('utf8'))
  if (!record) return `${ref} has no provenance for ${tool}`
  const s = record.source || {}
  if (record.version !== version || s.repository !== repository || s.tag !== tag || s.commit !== commit) {
    return `${ref} publishes ${s.repository}@${s.tag} (${s.commit}), not ${repository}@${tag} (${commit})`
  }
  if (record.digest?.value !== digest) return `${ref} records digest ${record.digest?.value}, not ${digest}`
  // ref may be a commit or a tag name: the trees API accepts both.
  const files = await readPayload(rest, { repository: catalog, commit: ref, skill: `${PLUGINS}/${tool}/skills/${tool}` })
  const actual = digestFiles(files)
  return actual === digest ? null : `${ref} holds files that hash to ${actual}, not ${digest}`
}

// requireVerified waits briefly for GitHub to report the commit as verified;
// an unverified commit is never tagged.
async function requireVerified(rest, catalog, oid, wait) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = await rest('GET', `/repos/${catalog}/commits/${oid}`)
    if (c?.commit?.verification?.verified) return
    await wait(2000 * (attempt + 1))
  }
  fail(`${oid} is not a verified commit; refusing to tag it`)
}

// createTag creates the catalog tag; if a concurrent run created it first, it
// succeeds only when that tag holds the same publication.
async function createTag(rest, catalog, ctag, oid, release) {
  try {
    await rest('POST', `/repos/${catalog}/git/refs`, { ref: `refs/tags/${ctag}`, sha: oid })
  } catch (err) {
    if (!/: 422 /.test(err.message)) throw err
    const existing = await rest('GET', `/repos/${catalog}/git/ref/tags/${encodeURIComponent(ctag)}`)
    if (!existing) throw err
    if (existing.object.sha === oid) return oid
    const problem = await verifyPublication(rest, catalog, ctag, release)
    if (problem) fail(`${ctag} was created concurrently with different content: ${problem}`)
    return existing.object.sha
  }
  return oid
}

function isStale(err) {
  return (err.graphql || []).some((e) => e.type === 'STALE_DATA' || /expected branch to point/i.test(e.message || ''))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const CREATE_COMMIT = `
mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid url signature { isValid state } }
  }
}`

export async function publish(env, { log = console.log, catalogClient, sourceClient, wait = sleep } = {}) {
  const tool = env.TOOL
  const tag = env.SOURCE_TAG
  const catalog = env.CATALOG_REPOSITORY || 'octolab/skills'
  const dryRun = env.DRY_RUN === 'true'
  if (!tool || !tag) fail('TOOL and SOURCE_TAG are required')
  const cat = catalogClient || client(env.CATALOG_TOKEN)
  const src = sourceClient || client(env.SOURCE_TOKEN || env.CATALOG_TOKEN)

  const version = tag.replace(/^v/, '')
  const parsed = parseVersion(version)
  if (!tag.startsWith('v') || !parsed) fail(`${tag}: release tags look like vX.Y.Z`)
  if (parsed.pre.length) fail(`${tag}: prereleases are not published to the catalog`)

  let state = await catalogState(cat.rest, catalog)
  const registryErrors = checkCatalog(state.registry)
  if (registryErrors.length) fail(`${CATALOG} on main is invalid: ${registryErrors.join('; ')}`)
  const entry = state.registry.tools[tool]
  if (!entry) fail(`${tool}: not registered in ${catalog}/${CATALOG}`)
  if (env.CALLER_REPOSITORY && env.CALLER_REPOSITORY !== entry.repository) {
    fail(`${tool} is published from ${entry.repository}, not from ${env.CALLER_REPOSITORY}`)
  }

  const commit = await resolveRelease(src.rest, {
    repository: entry.repository,
    tag,
    sha: env.SOURCE_SHA,
    allowUnverified: env.ALLOW_UNVERIFIED_TAG === 'true',
    log,
  })
  const files = await readPayload(src.rest, { repository: entry.repository, commit, skill: entry.skill })
  const { errors, frontmatter } = checkSkill(tool, files)
  if (errors.length) fail(`${entry.repository}@${tag}/${entry.skill}: ${errors.join('; ')}`)
  if (frontmatter.metadata.version !== version) {
    fail(`SKILL.md metadata.version ${frontmatter.metadata.version} does not match ${tag}`)
  }
  const digest = digestFiles(files)
  const ctag = catalogTag(tool, version)
  const release = { tool, version, repository: entry.repository, tag, commit, digest }
  const result = { changed: false, 'catalog-tag': ctag, 'payload-digest': digest, 'catalog-commit': '' }
  log(`${tool} ${tag}: ${files.size} file(s), ${digest}`)

  for (let attempt = 1; ; attempt++) {
    // A published release is frozen: the tag either matches or the run fails.
    // Checked on every attempt: a concurrent run of the same release may
    // have finished in between.
    const tagged = await cat.rest('GET', `/repos/${catalog}/git/ref/tags/${encodeURIComponent(ctag)}`)
    if (tagged) {
      const problem = await verifyPublication(cat.rest, catalog, ctag, release)
      if (problem) fail(`${ctag} already exists with different content (${problem}); a published release is frozen, ship a new version`)
      log(`${ctag} is already published`)
      return { ...result, 'catalog-commit': tagged.object.sha }
    }

    const current = await fileAt(cat.rest, catalog, `${PLUGINS}/${tool}/provenance.json`, state.oid)
    const record = current && JSON.parse(current.toString('utf8'))
    if (record) {
      if (!parseVersion(record.version || '')) fail(`${PLUGINS}/${tool}/provenance.json on main has an invalid version`)
      const order = compareVersions(version, record.version)
      if (order < 0) fail(`${catalog} already holds ${tool} ${record.version}; refusing to downgrade to ${version}`)
      if (order === 0) {
        // The commit landed but the tag didn't: tag the publication commit,
        // after checking it is this release and a verified commit.
        const oid = await publicationCommit(cat.rest, catalog, tool, state.oid)
        const problem = await verifyPublication(cat.rest, catalog, oid, release)
        if (problem) fail(`${tool} ${version} is on main with different content: ${problem}`)
        log(`${tool} ${version} is on main without ${ctag}; tagging ${oid}`)
        if (dryRun) return { ...result, 'catalog-commit': oid }
        await requireVerified(cat.rest, catalog, oid, wait)
        return { ...result, 'catalog-commit': await createTag(cat.rest, catalog, ctag, oid, release) }
      }
    }

    const root = `${PLUGINS}/${tool}`
    const additions = new Map()
    for (const [rel, bytes] of files) additions.set(`${root}/skills/${tool}/${rel}`, bytes)
    additions.set(`${root}/.claude-plugin/plugin.json`, formatJSON(pluginManifest(tool, entry, version)))
    additions.set(
      `${root}/provenance.json`,
      formatJSON(
        provenanceRecord({
          tool,
          version,
          repository: entry.repository,
          tag,
          commit,
          skill: entry.skill,
          digest,
          publisher: env.PUBLISHER || 'octolab/skills/.github/actions/publish',
        }),
      ),
    )
    const tools = new Set(
      state.paths.filter((p) => /^plugins\/[^/]+\/provenance\.json$/.test(p)).map((p) => p.split('/')[1]),
    )
    tools.add(tool)
    additions.set(MARKETPLACE, formatJSON(marketplaceManifest(state.registry, [...tools])))
    const deletions = state.paths.filter((p) => p.startsWith(`${root}/`) && !additions.has(p))

    const message = {
      headline: `chore(${tool}): publish ${tag}`,
      body: `Source: ${entry.repository}@${commit} (${tag})\nDigest: ${digest}`,
    }
    if (dryRun) {
      log(`dry run: would commit "${message.headline}" on ${catalog}@${state.oid}`)
      for (const p of additions.keys()) log(`  write  ${p}`)
      for (const p of deletions) log(`  delete ${p}`)
      log(`dry run: would tag ${ctag}`)
      return { ...result, changed: true }
    }

    let created
    try {
      const data = await cat.graphql(CREATE_COMMIT, {
        input: {
          branch: { repositoryNameWithOwner: catalog, branchName: 'main' },
          message,
          expectedHeadOid: state.oid,
          fileChanges: {
            additions: [...additions].map(([path, contents]) => ({
              path,
              contents: Buffer.from(contents).toString('base64'),
            })),
            deletions: deletions.map((path) => ({ path })),
          },
        },
      })
      created = data.createCommitOnBranch.commit
    } catch (err) {
      if (!isStale(err) || attempt >= ATTEMPTS) throw err
      log(`main moved while publishing (attempt ${attempt}); retrying`)
      state = await catalogState(cat.rest, catalog)
      if (JSON.stringify(state.registry.tools?.[tool]) !== JSON.stringify(entry)) {
        fail(`${tool}'s registration in ${CATALOG} changed during publication; run it again`)
      }
      continue
    }

    if (!created.signature?.isValid) await requireVerified(cat.rest, catalog, created.oid, wait)
    const oid = await createTag(cat.rest, catalog, ctag, created.oid, release)
    log(`published ${created.url} as ${ctag}`)
    return { ...result, changed: true, 'catalog-commit': oid }
  }
}

async function main() {
  try {
    const out = await publish(process.env)
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(''))
    }
  } catch (err) {
    console.error(`::error::${err.message}`)
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
