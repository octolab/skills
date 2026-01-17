import assert from 'node:assert/strict'
import { test } from 'node:test'

import { publish } from '../scripts/publish.mjs'
import { REGISTRY, SKILL } from './fixtures.mjs'

const b64 = (s) => Buffer.from(s).toString('base64')
const SHA = 'a'.repeat(40)

// fakeGitHub models the handful of endpoints publish.mjs uses: a source
// repository with a signed tag and release, and a catalog repository whose
// main branch is a list of snapshots (path -> contents).
function fakeGitHub({ skill = SKILL, signed = true, commitSigned = true, release = { draft: false, prerelease: false } } = {}) {
  const source = {
    tag: { type: 'tag', sha: 'tagobj' },
    files: { 'skills/indexit/SKILL.md': skill, 'skills/indexit/references/cli.md': '# CLI\n', 'main.go': 'package main' },
  }
  const commits = [{ oid: 'c0', files: { 'catalog.json': JSON.stringify(REGISTRY) } }]
  const tags = {}
  const calls = { graphql: 0, refs: [] }
  let moveOnce = null
  const head = () => commits[commits.length - 1]
  const find = (ref) => (ref === 'main' ? head() : commits.find((c) => c.oid === ref || c.oid === tags[ref]))

  const rest = async (method, path, body) => {
    let m
    if ((m = path.match(/^\/repos\/octopot\/indexit\/git\/ref\/tags\/(.+)$/))) {
      return m[1] === 'v0.2.0' ? { object: source.tag } : null
    }
    if (path === '/repos/octopot/indexit/git/tags/tagobj') {
      return { object: { type: 'commit', sha: SHA }, verification: { verified: signed, reason: signed ? 'valid' : 'unsigned' } }
    }
    if (path.startsWith('/repos/octopot/indexit/releases/tags/')) return release
    if (path.startsWith(`/repos/octopot/indexit/git/trees/${SHA}`)) {
      return {
        truncated: false,
        tree: Object.entries(source.files).map(([p, v]) =>
          v === null ? { path: p, type: 'commit', mode: '160000', sha: p } : { path: p, type: 'blob', mode: '100644', sha: p },
        ),
      }
    }
    if ((m = path.match(/^\/repos\/octopot\/indexit\/git\/blobs\/(.+)$/))) return { content: b64(source.files[m[1]]) }
    if (path === '/repos/octolab/skills/git/ref/heads/main') return { object: { sha: head().oid } }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/trees\/([^?]+)/))) {
      const c = find(decodeURIComponent(m[1]))
      return { truncated: false, tree: Object.keys(c.files).map((p) => ({ path: p, type: 'blob', mode: '100644', sha: `${c.oid}:${p}` })) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/blobs\/([^:]+):(.+)$/))) {
      return { content: b64(commits.find((c) => c.oid === m[1]).files[m[2]]) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/commits\/([^?]+)$/))) {
      return { commit: { verification: { verified: commitSigned } } }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/contents\/(.+)\?ref=(.+)$/))) {
      const c = find(decodeURIComponent(m[2]))
      const f = c?.files[m[1]]
      return f === undefined ? null : { content: b64(f) }
    }
    if ((m = path.match(/^\/repos\/octolab\/skills\/git\/ref\/tags\/(.+)$/))) {
      const t = tags[decodeURIComponent(m[1])]
      return t ? { object: { sha: t } } : null
    }
    if (path.startsWith('/repos/octolab/skills/commits?')) {
      const file = decodeURIComponent(path.match(/path=([^&]+)/)[1])
      const from = commits.findIndex((c) => c.oid === path.match(/sha=([^&]+)/)[1])
      const hit = commits.slice(0, from + 1).reverse().find((c, i, all) => {
        const prev = all[i + 1]
        return c.files[file] !== undefined && c.files[file] !== prev?.files[file]
      })
      return hit ? [{ sha: hit.oid }] : []
    }
    if (method === 'POST' && path === '/repos/octolab/skills/git/refs') {
      calls.refs.push(body)
      if (tags[body.ref.replace('refs/tags/', '')]) throw new Error(`POST ${path}: 422 Reference already exists`)
      tags[body.ref.replace('refs/tags/', '')] = body.sha
      return {}
    }
    throw new Error(`unexpected ${method} ${path}`)
  }

  const graphql = async (_query, { input }) => {
    calls.graphql++
    if (moveOnce) {
      moveOnce()
      moveOnce = null
    }
    if (input.expectedHeadOid !== head().oid) {
      const err = new Error('stale')
      err.graphql = [{ message: `Expected branch to point to "${input.expectedHeadOid}" but it did not.` }]
      throw err
    }
    const files = { ...head().files }
    for (const { path } of input.fileChanges.deletions) delete files[path]
    for (const { path, contents } of input.fileChanges.additions) files[path] = Buffer.from(contents, 'base64').toString()
    const oid = `c${commits.length}`
    commits.push({ oid, files, message: input.message })
    return { createCommitOnBranch: { commit: { oid, url: `https://github.com/octolab/skills/commit/${oid}`, signature: { isValid: commitSigned } } } }
  }

  const gh = { rest, graphql }
  const registerTagConcurrently = (oid) => {
    tags['indexit--v0.2.0'] = oid
  }
  return {
    clients: { catalogClient: gh, sourceClient: gh, log: () => {}, wait: async () => {} },
    commits,
    tags,
    calls,
    head,
    registerTagConcurrently,
    // concurrently simulates another tool's publication landing first.
    concurrently: () => {
      moveOnce = () => commits.push({ oid: `x${commits.length}`, files: { ...head().files, 'README.md': 'x' } })
    },
    source,
  }
}

const ENV = { TOOL: 'indexit', SOURCE_TAG: 'v0.2.0', SOURCE_SHA: SHA, CALLER_REPOSITORY: 'octopot/indexit' }

test('publishes the payload, generated manifests and a tag', async () => {
  const gh = fakeGitHub()
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(out['catalog-tag'], 'indexit--v0.2.0')
  const files = gh.head().files
  assert.equal(files['plugins/indexit/skills/indexit/SKILL.md'], SKILL)
  assert.equal(JSON.parse(files['plugins/indexit/.claude-plugin/plugin.json']).version, '0.2.0')
  const prov = JSON.parse(files['plugins/indexit/provenance.json'])
  assert.equal(prov.source.commit, SHA)
  assert.equal(prov.digest.value, out['payload-digest'])
  assert.deepEqual(JSON.parse(files['.claude-plugin/marketplace.json']).plugins.map((p) => p.name), ['indexit'])
  assert.equal(files['plugins/indexit/skills/indexit/main.go'], undefined)
  assert.equal(gh.tags['indexit--v0.2.0'], gh.head().oid)
  assert.equal(gh.head().message.headline, 'chore(indexit): publish v0.2.0')
})

test('a second run is a no-op', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(gh.calls.graphql, 1)
})

test('recovers a missing tag on the publication commit', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const published = gh.head().oid
  delete gh.tags['indexit--v0.2.0']
  gh.commits.push({ oid: 'later', files: { ...gh.head().files, 'README.md': 'later' } })
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(gh.tags['indexit--v0.2.0'], published)
})

test('retries when main moves under it', async () => {
  const gh = fakeGitHub()
  gh.concurrently()
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(gh.calls.graphql, 2)
  assert.equal(gh.head().files['README.md'], 'x')
})

test('refuses a changed payload for a published version', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.source.files['skills/indexit/references/cli.md'] = '# changed\n'
  await assert.rejects(publish(ENV, gh.clients), /frozen/)
})

test('refuses to downgrade', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const newer = gh.head().files
  newer['plugins/indexit/provenance.json'] = JSON.stringify({ version: '0.3.0' })
  delete gh.tags['indexit--v0.2.0']
  await assert.rejects(publish(ENV, gh.clients), /refusing to downgrade/)
})

test('refuses callers other than the registered repository', async () => {
  const gh = fakeGitHub()
  await assert.rejects(publish({ ...ENV, CALLER_REPOSITORY: 'octolab/zeta' }, gh.clients), /published from octopot\/indexit/)
})

test('refuses unverified tags unless explicitly allowed', async () => {
  await assert.rejects(publish(ENV, fakeGitHub({ signed: false }).clients), /not verified/)
  const out = await publish({ ...ENV, ALLOW_UNVERIFIED_TAG: 'true' }, fakeGitHub({ signed: false }).clients)
  assert.equal(out.changed, true)
})

test('refuses prereleases and a version mismatch', async () => {
  await assert.rejects(publish(ENV, fakeGitHub({ release: { prerelease: true } }).clients), /prerelease/)
  await assert.rejects(publish({ ...ENV, SOURCE_TAG: 'v0.2.0-rc.1' }, fakeGitHub().clients), /prereleases/)
  const other = SKILL.replace('version: "0.2.0"', 'version: "0.2.1"').replace('>=0.2.0', '>=0.2.1')
  await assert.rejects(publish(ENV, fakeGitHub({ skill: other }).clients), /does not match v0.2.0/)
})

test('dry run writes nothing', async () => {
  const gh = fakeGitHub()
  const out = await publish({ ...ENV, DRY_RUN: 'true' }, gh.clients)
  assert.equal(out.changed, true)
  assert.equal(gh.calls.graphql, 0)
  assert.deepEqual(gh.calls.refs, [])
})

test('a concurrent run of the same release ends as a no-op', async () => {
  const gh = fakeGitHub()
  const other = fakeGitHub()
  await publish(ENV, other.clients)
  // The other run commits and tags while this one is committing.
  gh.clients.catalogClient.graphql = async () => {
    gh.commits.push({ ...other.head(), oid: 'theirs' })
    gh.tags['indexit--v0.2.0'] = 'theirs'
    gh.clients.catalogClient.graphql = async () => {
      throw new Error('must not commit twice')
    }
    const err = new Error('stale')
    err.graphql = [{ message: 'Expected branch to point to "c0" but it did not.' }]
    throw err
  }
  const out = await publish(ENV, gh.clients)
  assert.equal(out.changed, false)
  assert.equal(out['catalog-commit'], 'theirs')
})

test('refuses a malformed version on main', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.head().files['plugins/indexit/provenance.json'] = JSON.stringify({ version: 'latest' })
  delete gh.tags['indexit--v0.2.0']
  await assert.rejects(publish(ENV, gh.clients), /invalid version/)
})

test('recovery tags the publication commit, not a newer release on main', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  const published = gh.head().oid
  delete gh.tags['indexit--v0.2.0']
  // A newer release lands after this run read main.
  const clients = { ...gh.clients, catalogClient: { ...gh.clients.catalogClient } }
  const rest = gh.clients.catalogClient.rest
  let moved = false
  clients.catalogClient.rest = async (method, path, body) => {
    if (!moved && path.startsWith('/repos/octolab/skills/commits?')) {
      moved = true
      const files = { ...gh.head().files }
      files['plugins/indexit/provenance.json'] = files['plugins/indexit/provenance.json'].replace('"0.2.0"', '"0.3.0"')
      gh.commits.push({ oid: 'newer', files })
    }
    return rest(method, path, body)
  }
  const out = await publish(ENV, clients)
  assert.equal(out['catalog-commit'], published)
  assert.equal(gh.tags['indexit--v0.2.0'], published)
})

test('refuses a tagged publication whose files were changed', async () => {
  const gh = fakeGitHub()
  await publish(ENV, gh.clients)
  gh.head().files['plugins/indexit/skills/indexit/references/cli.md'] = '# tampered\n'
  await assert.rejects(publish(ENV, gh.clients), /hash to/)
})

test('does not tag an unverified commit', async () => {
  const gh = fakeGitHub({ commitSigned: false })
  await assert.rejects(publish(ENV, gh.clients), /not a verified commit/)
  assert.deepEqual(gh.tags, {})
})

test('accepts a tag another run created for the same publication', async () => {
  const gh = fakeGitHub()
  const graphql = gh.clients.catalogClient.graphql
  gh.clients.catalogClient.graphql = async (...args) => {
    const data = await graphql(...args)
    gh.registerTagConcurrently(data.createCommitOnBranch.commit.oid)
    return data
  }
  const out = await publish(ENV, gh.clients)
  assert.equal(out['catalog-commit'], gh.head().oid)
})

test('stops when the registration changes during a retry', async () => {
  const gh = fakeGitHub()
  const graphql = gh.clients.catalogClient.graphql
  gh.clients.catalogClient.graphql = async (...args) => {
    const registry = structuredClone(REGISTRY)
    registry.tools.indexit.description = 'changed'
    gh.commits.push({ oid: 'reg', files: { ...gh.head().files, 'catalog.json': JSON.stringify(registry) } })
    gh.clients.catalogClient.graphql = graphql
    return graphql(...args)
  }
  await assert.rejects(publish(ENV, gh.clients), /registration .* changed/)
})

test('refuses submodules in the skill', async () => {
  const gh = fakeGitHub()
  gh.source.files['skills/indexit/vendor'] = null
  await assert.rejects(publish(ENV, gh.clients), /submodules/)
})
