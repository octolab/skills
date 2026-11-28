import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { expectedSite, pagesCheck, published, smoke, smokeOnce } from './pages.mjs'

const SITE = 'https://skills.octolab.org/'
const FALLBACK = 'https://octolab.github.io/skills/'
const TOOLS = [{ tool: 'indexit', version: '0.4.2' }, { tool: 'maintainer', version: '0.6.1' }]

test('expectedSite: the custom domain, the project and the user site', () => {
  assert.equal(expectedSite({ cname: 'skills.octolab.org' }, 'octolab/skills'), SITE)
  assert.equal(expectedSite(null, 'octolab/skills'), FALLBACK)
  assert.equal(expectedSite({}, 'OctoLab/octolab.github.io'), 'https://octolab.github.io/')
  assert.equal(expectedSite(null, null), null)
})

test('pagesCheck: refuses a domain that settings.json does not expect', () => {
  const pages = { cname: 'skills.octolab.org' }
  assert.deepEqual(pagesCheck('https://skills.octolab.org', pages, 'octolab/skills'), [])
  assert.match(pagesCheck(FALLBACK, pages, 'octolab/skills')[0], /expects https:\/\/skills\.octolab\.org\//)
  assert.match(pagesCheck('', pages, 'octolab/skills')[0], /configure-pages/)
  assert.match(pagesCheck('http://skills.octolab.org/', pages, 'octolab/skills')[0], /Enforce HTTPS/)
})

test('published: every plugin with a provenance record, with its version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plugins-'))
  mkdirSync(join(dir, 'indexit'))
  writeFileSync(join(dir, 'indexit', 'provenance.json'), JSON.stringify({ version: '0.4.2' }))
  mkdirSync(join(dir, 'draft'))
  assert.deepEqual(published(dir), [{ tool: 'indexit', version: '0.4.2' }])
  assert.deepEqual(published(join(dir, 'missing')), [])
})

// The site as GitHub Pages serves it: the page with a card per tool, assets,
// its own 404, an HTTPS redirect and the default domain redirecting to the
// custom one.
const cards = TOOLS.map((t) => `<article class="sk-card" id="${t.tool}" data-tool="${t.tool}" data-version="${t.version}">`).join('')
function server(overrides = {}) {
  const home = `<link href="/_next/static/css/a.css"><script src="/_next/static/chunks/b.js"></script>` +
    `<meta property="og:image" content="${SITE}og.png">${cards}`
  const routes = {
    [SITE]: { status: 200, type: 'text/html', text: home },
    [`${SITE}_next/static/css/a.css`]: { status: 200, type: 'text/css' },
    [`${SITE}_next/static/chunks/b.js`]: { status: 200, type: 'text/javascript' },
    [`${SITE}og.png`]: { status: 200, type: 'image/png' },
    [`${SITE}smoke-missing-page/`]: { status: 404, type: 'text/html', text: '<script src="/_next/static/x.js">' },
    'http://skills.octolab.org/': { status: 301, location: SITE },
    [`${FALLBACK}og.png`]: { status: 301, location: `${SITE}og.png` },
    ...overrides,
  }
  return async (url) => ({ type: '', text: '', location: null, ...(routes[url] || { status: 404 }) })
}

test('smokeOnce: a healthy site passes', async () => {
  assert.deepEqual(await smokeOnce(SITE, { fallback: FALLBACK, tools: TOOLS, get: server() }), [])
})

test('smokeOnce: a published version the page does not show fails', async () => {
  const tools = [{ tool: 'indexit', version: '0.4.3' }, { tool: 'pulse', version: '0.1.0' }]
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, tools, get: server() })
  assert.equal(errors.length, 2)
  assert.match(errors[0], /no card of indexit v0\.4\.3/)
  assert.match(errors[1], /docs\/products\.mjs/)
})

test('smokeOnce: plain HTTP must redirect to HTTPS', async () => {
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, tools: TOOLS, get: server({ 'http://skills.octolab.org/': { status: 200, type: 'text/html' } }) })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /Enforce HTTPS/)
})

test('smokeOnce: assets of another base path and a foreign og:image fail', async () => {
  const get = server({
    [`${SITE}_next/static/css/a.css`]: { status: 404 },
    [SITE]: { status: 200, type: 'text/html', text: '<link href="/_next/static/css/a.css"><meta property="og:image" content="http://localhost:3000/og.png">' },
  })
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, get })
  assert.ok(errors.some((e) => /another base path/.test(e)), errors.join('\n'))
  assert.ok(errors.some((e) => /SITE_URL is stale/.test(e)), errors.join('\n'))
})

test('smokeOnce: the default domain must redirect, keeping the path', async () => {
  const errors = await smokeOnce(SITE, { fallback: FALLBACK, tools: TOOLS, get: server({ [`${FALLBACK}og.png`]: { status: 200 } }) })
  assert.match(errors.join('\n'), /want a redirect to https:\/\/skills\.octolab\.org\/og\.png/)
})

test('smokeOnce: plain HTTP may stay when HTTPS is not enforced', async () => {
  const get = server({ 'http://skills.octolab.org/': { status: 200, type: 'text/html' } })
  assert.deepEqual(await smokeOnce(SITE, { fallback: FALLBACK, https: false, tools: TOOLS, get }), [])
})

test('smokeOnce: no og:image and a 404 that is not the site\'s own fail', async () => {
  const get = server({
    [SITE]: { status: 200, type: 'text/html', text: '<link href="/_next/static/css/a.css">' },
    [`${SITE}smoke-missing-page/`]: { status: 404, type: 'text/html', text: 'Not Found' },
  })
  const errors = (await smokeOnce(SITE, { fallback: FALLBACK, get })).join('\n')
  assert.match(errors, /no og:image/)
  assert.match(errors, /want the site's own 404/)
})

test('smoke: an empty site URL fails at once', async () => {
  assert.match((await smoke('', 20))[0], /want the URL of the site/)
  assert.match((await smoke(undefined, 20))[0], /want the URL of the site/)
})

test('smoke: retries until the deployment is served, and checks its input', async () => {
  let calls = 0
  const healthy = server()
  const get = async (url, init) => (url === SITE && ++calls < 3 ? { status: 503, type: '', text: '' } : healthy(url, init))
  assert.deepEqual(await smoke(SITE, 3, { wait: 0, fallback: FALLBACK, tools: TOOLS, get }), [])
  assert.equal(calls, 3)
  assert.match((await smoke(SITE, -1))[0], /non-negative integer/)
})
