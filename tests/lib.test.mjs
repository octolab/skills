import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  checkCatalog,
  checkSkill,
  compareVersions,
  defaultRange,
  digestDir,
  digestFiles,
  marketplaceManifest,
  parseFrontmatter,
  checkRange,
  parseRange,
  parseVersion,
  satisfies,
} from '../scripts/lib.mjs'
import { REGISTRY, SKILL, skillFiles } from './fixtures.mjs'

test('parseFrontmatter reads folded blocks, quoted scalars and nested maps', () => {
  const { data, body } = parseFrontmatter(SKILL)
  assert.equal(data.name, 'indexit')
  assert.equal(data.description, 'Export Telegram data with the indexit CLI. Use when the user wants to export chats.')
  assert.equal(data.compatibility, 'Requires the indexit binary.')
  assert.deepEqual(data.metadata, {
    author: 'octopot',
    version: '0.2.0',
    tool: 'indexit',
    'tool-version-range': '>=0.2.0 <0.3.0',
  })
  assert.match(body, /# indexit/)
})

test('parseFrontmatter folds paragraphs like YAML', () => {
  const fm = (yaml) => parseFrontmatter(`---\n${yaml}\n---\n`).data.d
  assert.equal(fm('d: >-\n  a\n\n  b'), 'a\nb')
  assert.equal(fm('d: >-\n  a\n\n\n  b'), 'a\n\nb')
  assert.equal(fm('d: >\n  a\n  b'), 'a b\n')
  assert.equal(fm('d: |-\n  a\n\n  b'), 'a\n\nb')
})

test('parseFrontmatter rejects what it does not understand', () => {
  const fm = (yaml) => () => parseFrontmatter(`---\n${yaml}\n---\n`)
  assert.throws(() => parseFrontmatter('no frontmatter'), /must start/)
  assert.throws(() => parseFrontmatter('---\nname: x\n'), /closing/)
  assert.throws(fm('description: [invalid, sequence]'), /quote values that start with \[/)
  assert.throws(fm('tags: {a: b}'), /quote values that start with \{/)
  assert.throws(fm('metadata:\n  author: true'), /non-string/)
  assert.throws(fm('metadata:\n  version: 1.0'), /number/)
  assert.throws(fm("license: 'MIT"), /unterminated/)
  assert.throws(fm('license: "MIT" extra'), /unterminated or trailing/)
  assert.throws(fm('name: a\nname: b'), /duplicate key/)
  assert.throws(fm('metadata:\n  a: x\n   b: y'), /inconsistent indentation/)
  assert.throws(fm('metadata:\n  nested:\n    deep: x'), /one level/)
  assert.throws(fm('range: >=1.0.0 <2.0.0'), /start with >/)
  assert.throws(fm('note: a: b'), /contain ": "/)
  assert.throws(fm('list:\n  - a'), /unsupported line/)
})

test('versions compare by semver precedence', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('0.9.9', '0.10.0'), -1)
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-1'), 1)
})

test('defaultRange follows the OctoLab policy', () => {
  assert.equal(defaultRange('1.4.2'), '>=1.4.2 <2.0.0')
  assert.equal(defaultRange('0.4.2'), '>=0.4.2 <0.5.0')
  assert.equal(defaultRange('0.0.2'), '=0.0.2')
  assert.equal(defaultRange('1.0.0-rc.1'), '=1.0.0-rc.1')
})

test('satisfies checks every comparator', () => {
  assert.ok(satisfies('0.2.5', '>=0.2.0 <0.3.0'))
  assert.ok(!satisfies('0.3.0', '>=0.2.0 <0.3.0'))
  assert.ok(!satisfies('0.1.9', '>=0.2.0 <0.3.0'))
  assert.ok(satisfies('1.0.0', '1.0.0'))
  assert.ok(!satisfies('2.0.0', '>=1.0.0 <2.0.0'))
  assert.equal(parseRange('>=x'), null)
  assert.equal(parseRange(''), null)
})

test('prereleases match only ranges that name them', () => {
  assert.ok(!satisfies('0.3.0-rc.1', '>=0.2.0 <0.3.0'))
  assert.ok(satisfies('0.3.0-rc.2', '>=0.3.0-rc.1 <0.3.0'))
  assert.ok(satisfies('1.0.0-rc.1', '=1.0.0-rc.1'))
})

test('versions are strict semver without build metadata', () => {
  assert.equal(parseVersion('1.0.0+foo..bar'), null)
  assert.equal(parseVersion('1.0.0+build'), null)
  assert.equal(parseVersion('01.0.0'), null)
  assert.equal(parseVersion('1.0.0-01'), null)
  assert.ok(parseVersion('1.0.0-rc.1'))
})

test('checkRange enforces the compatibility policy', () => {
  assert.equal(checkRange('0.2.0', '>=0.2.0 <0.3.0'), null)
  assert.equal(checkRange('0.2.3', '>=0.2.3 <0.2.5'), null)
  assert.equal(checkRange('1.4.2', '>=1.4.2 <2.0.0'), null)
  assert.equal(checkRange('0.0.2', '=0.0.2'), null)
  assert.match(checkRange('0.2.0', '>=0.1.0 <9.0.0'), /start at the release/)
  assert.match(checkRange('0.2.0', '>=0.2.0 <9.0.0'), /no later than <0.3.0/)
  assert.match(checkRange('0.2.0', '>=0.2.0'), /look like/)
  assert.match(checkRange('0.0.2', '>=0.0.2 <0.1.0'), /must be =0.0.2/)
  assert.equal(checkRange('0.2.0', '=0.2.0'), null)
  assert.equal(checkRange('1.4.2', '=1.4.2'), null)
  assert.match(checkRange('0.2.0', '>=0.2.0 <0.3.0-rc.1'), /prereleases/)
})

test('checkSkill accepts a valid skill', () => {
  assert.deepEqual(checkSkill('indexit', skillFiles()).errors, [])
})

test('checkSkill reports contract violations', () => {
  const bad = SKILL.replace('name: indexit', 'name: other')
    .replace('version: "0.2.0"', 'version: "0.3.0"')
    .replace('references/cli.md', 'references/missing.md')
  const { errors } = checkSkill('indexit', skillFiles(bad))
  assert.ok(errors.some((e) => e.includes('name: must be indexit')))
  assert.ok(errors.some((e) => e.includes('tool-version-range: must start at the release')))
  assert.ok(errors.some((e) => e.includes('broken link')))
})

test('digest is length-delimited, order-independent and stable', () => {
  const a = digestFiles([['a', Buffer.from('bc')], ['b', Buffer.from('')]])
  const b = digestFiles([['b', Buffer.from('')], ['a', Buffer.from('bc')]])
  const c = digestFiles([['a', Buffer.from('b')], ['b', Buffer.from('c')]])
  assert.equal(a, b)
  assert.notEqual(a, c)
  // Test vector shared with tool implementations (`<tool> skill info`).
  assert.equal(
    digestFiles([['SKILL.md', Buffer.from('hello\n')], ['references/a.md', Buffer.from('a')]]),
    'sha256:64ce802d5cef2c789ce95d306c9fcce6779c6e8166339ae47634e7f8b265a34b',
  )
})

test('digestDir rejects symlinks and dotfiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-'))
  writeFileSync(join(dir, 'SKILL.md'), 'x')
  mkdirSync(join(dir, 'references'))
  writeFileSync(join(dir, 'references', 'a.md'), 'a')
  assert.match(digestDir(dir), /^sha256:[0-9a-f]{64}$/)
  symlinkSync('SKILL.md', join(dir, 'link.md'))
  assert.throws(() => digestDir(dir), /symbolic links/)
  const dot = mkdtempSync(join(tmpdir(), 'skill-'))
  writeFileSync(join(dot, '.marker.json'), '{}')
  assert.throws(() => digestDir(dot), /dotfiles/)
})

test('checkCatalog accepts the registry and rejects bad entries', () => {
  assert.deepEqual(checkCatalog(REGISTRY), [])
  const bad = structuredClone(REGISTRY)
  bad.tools.indexit.skill = '../indexit'
  bad.tools.indexit.homepage = 'http://indexit.octolab.org/'
  const errors = checkCatalog(bad)
  assert.ok(errors.some((e) => e.includes('.skill')))
  assert.ok(errors.some((e) => e.includes('.homepage')))
})

test('marketplaceManifest lists only published tools, sorted', () => {
  const m = marketplaceManifest(REGISTRY, ['zeta', 'indexit'])
  assert.deepEqual(
    m.plugins.map((p) => [p.name, p.source]),
    [
      ['indexit', './plugins/indexit'],
      ['zeta', './plugins/zeta'],
    ],
  )
  assert.deepEqual(marketplaceManifest(REGISTRY, []).plugins, [])
})
