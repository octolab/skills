// node --test docs/catalog.test.mjs: the data of the site, on the real
// catalog and on small catalogs made up for each rule.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { compareVersions, frontmatter, loadCatalog } from './catalog.mjs'

const SKILL = (name, tool, version, range = `>=${version} <0.2.0`) => `---
name: ${name}
description: >-
  Folded
  description.
metadata:
  version: "${version}"
  tool: ${tool}
  tool-version-range: "${range}"
---

# ${name}
`

// A catalog of two registered tools: demo, published at 0.1.0 with the given
// skills, and later, registered but not published yet.
function fixture({ extra = [], published = ['demo'], version = '0.1.0', range } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-'))
  const tool = { repository: 'octolab/demo', skill: 'skills/demo', description: 'Demo', homepage: 'https://demo.octolab.org/', license: 'MIT' }
  if (extra.length) tool['extra-skills'] = extra
  writeFileSync(join(root, 'catalog.json'), JSON.stringify({
    marketplace: { name: 'octolab' },
    tools: { demo: tool, later: { ...tool, skill: 'skills/later' } },
  }))
  const base = join(root, 'plugins', 'demo')
  for (const name of published) {
    mkdirSync(join(base, 'skills', name), { recursive: true })
    writeFileSync(join(base, 'skills', name, 'SKILL.md'), SKILL(name, 'demo', version, range))
  }
  writeFileSync(join(base, 'provenance.json'), JSON.stringify({
    version, source: { repository: 'octolab/demo', tag: `v${version}`, path: 'skills/demo' },
    digest: { value: 'sha256:aaaa' },
  }))
  return root
}

const card = (skills, extra = {}) => ({ emoji: '🧪', tagline: 'T', summary: 'S', install: 'brew install demo', releaseNotes: 'https://demo.octolab.org/changelog/v{version}/', skills, ...extra })
const cards = (demoSkills = { demo: 'Does demo things.' }, demoExtra) => ({ demo: card(demoSkills, demoExtra), later: card({ later: 'Later.' }) })

test('frontmatter: reads what the publisher accepts', () => {
  const fm = frontmatter(SKILL('demo', 'demo', '0.1.0'))
  assert.equal(fm.description, 'Folded description.')
  assert.equal(fm.metadata.version, '0.1.0')
  assert.equal(fm.metadata['tool-version-range'], '>=0.1.0 <0.2.0')
  assert.equal(frontmatter(SKILL('demo', 'demo', '0.1.0').replaceAll('\n', '\r\n')).metadata.tool, 'demo', 'CRLF')
  const folded = frontmatter('---\nname: demo\nmetadata:\n  version: "0.1.0"\n\n  tool-version-range: >-\n    >=0.1.0\n    <0.2.0\n---\n')
  assert.equal(folded.metadata['tool-version-range'], '>=0.1.0 <0.2.0', 'a folded value in the map, after a blank line')
  assert.throws(() => frontmatter('# no frontmatter'), /must start with a --- frontmatter line/)
})

test('compareVersions: semver precedence, prereleases included', () => {
  const sorted = ['1.0.0', '1.0.0-rc.1', '0.10.0', '1.0.0-alpha.1', '0.9.1', '1.0.0-alpha'].sort(compareVersions)
  assert.deepEqual(sorted, ['0.9.1', '0.10.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-rc.1', '1.0.0'])
})

test('the real catalog: every registered tool and skill has its card', () => {
  const c = loadCatalog()
  assert.ok(c.tools.length > 0)
  for (const t of c.tools) {
    assert.ok(t.skills.length > 0, t.tool)
    assert.equal(t.skills[0].name, t.tool, 'the main skill comes first')
    assert.ok(t.range, `${t.tool} states the binaries it supports`)
  }
})

test('a published tool shows with the data of its release', () => {
  const c = loadCatalog(fixture(), cards())
  assert.equal(c.tools.length, 1, 'a registered tool without a plugin does not show')
  const [t] = c.tools
  assert.equal(t.version, '0.1.0')
  assert.equal(t.catalogTag, 'demo--v0.1.0')
  assert.equal(t.releaseNotes, 'https://demo.octolab.org/changelog/v0.1.0/')
  assert.equal(t.embedded, false, 'a card that does not say so does not embed')
  assert.deepEqual(t.skills.map((s) => [s.id, s.digest]), [['demo:demo', 'sha256:aaaa']])
  assert.equal(t.published, null, 'no git history, no date')
  assert.deepEqual(t.history, [])
})

test('an exact range and a prerelease are shown as published', () => {
  const c = loadCatalog(fixture({ version: '0.0.2', range: '=0.0.2' }), cards())
  assert.equal(c.tools[0].range, '=0.0.2')
  assert.equal(loadCatalog(fixture({ version: '1.0.0-rc.1', range: '=1.0.0-rc.1' }), cards()).tools[0].version, '1.0.0-rc.1')
})

test('the build stops on a registered tool without a card, published or not', () => {
  assert.throws(() => loadCatalog(fixture(), { demo: cards().demo }), /no card for later, registered in catalog\.json/)
})

test('the build stops on a registered skill without a summary, published or not', () => {
  assert.throws(() => loadCatalog(fixture({ extra: ['review'] }), cards()), /demo\.skills\.review is missing; catalog\.json registers review/)
  assert.throws(() => loadCatalog(fixture(), cards({ demo: '   ' })), /demo\.skills\.demo is missing/)
})

test('the build stops on a card field missing', () => {
  assert.throws(() => loadCatalog(fixture(), cards(undefined, { install: '' })), /demo\.install is required/)
})

test('the build stops on a card that the registry does not know', () => {
  assert.throws(() => loadCatalog(fixture(), { ...cards({ demo: 'x', review: 'y' }), ghost: card({}) }),
    /ghost is not registered in catalog\.json[\s\S]*demo\.skills\.review is not a skill catalog\.json registers/)
})

test('the build names a published skill the registry does not list', () => {
  assert.throws(() => loadCatalog(fixture({ published: ['demo', 'stray'] }), cards()),
    /plugins\/demo\/skills\/stray: published, but catalog\.json does not register it/)
})
