#!/usr/bin/env node
// The catalog site on GitHub Pages: what cd.docs.yml and doctor.yml check.
// Adapted from octomation/skills-action, where it checks a documentation
// site; here the site is one page that must show every published tool at the
// version plugins/<tool>/provenance.json records. Zero dependencies: Node,
// git and, for doctor, gh.
//
//   pages.mjs site-env                          SITE_URL and BASE_PATH of a preview, from settings.json pages
//   pages.mjs pages <base-url>                  the Pages URL matches settings.json pages
//   pages.mjs smoke <site-url> [--retries <n>]  the deployed site serves its page, assets and the catalog
//   pages.mjs doctor                            the Pages configuration on GitHub matches settings.json

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SETTINGS = '.github/settings.json'

export function settings(file = SETTINGS) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
}

// Every published tool with its version, as the checkout records it: the
// page must show each of them, or the site is stale.
export function published(dir = 'plugins') {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(`${dir}/${e.name}/provenance.json`))
    .map((e) => ({ tool: e.name, version: JSON.parse(readFileSync(`${dir}/${e.name}/provenance.json`, 'utf8')).version }))
}

// owner/name from GITHUB_REPOSITORY or the origin remote.
export function repoSlug(env = process.env) {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1] ?? null
  } catch {
    return null
  }
}

// The URL the site must be built for: the custom domain, or the default one.
export function expectedSite(pages, slug) {
  if (pages?.cname) return `https://${pages.cname}/`
  if (!slug) return null
  const [owner, name] = slug.toLowerCase().split('/')
  return name === `${owner}.github.io` ? `https://${name}/` : `https://${owner}.github.io/${name}/`
}

export const slash = (url) => url.replace(/\/*$/, '/')

// The build bakes the base path and the origin in; a domain changed in Settings
// but not in settings.json (or the reverse) must stop the build, not ship it.
export function pagesCheck(baseUrl, pages, slug) {
  const expected = expectedSite(pages, slug)
  if (!baseUrl) return ['no Pages base URL; is actions/configure-pages set up?']
  if (!expected) return ['cannot resolve the repository; set GITHUB_REPOSITORY or the origin remote']
  if (slash(baseUrl) === expected) return []
  if (slash(baseUrl).replace(/^http:/, 'https:') === expected) {
    return [`Pages serves ${slash(baseUrl)} over plain HTTP, ${SETTINGS} expects ${expected}; turn on Settings → Pages → Enforce HTTPS`]
  }
  return [`Pages serves ${slash(baseUrl)}, ${SETTINGS} expects ${expected}; ` +
    'update pages.cname there or Settings → Pages → Custom domain so they agree']
}

async function probe(url, init = {}) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init })
    return { status: res.status, type: res.headers.get('content-type') || '', location: res.headers.get('location'), text: init.method === 'HEAD' ? '' : await res.text() }
  } catch (e) {
    return { status: 0, type: '', location: null, text: '', error: e.cause?.code || e.message }
  }
}

export async function smokeOnce(site, { fallback = null, https = true, tools = [], get = probe } = {}) {
  const errors = []
  const expect = (cond, msg) => { if (!cond) errors.push(msg) }
  const show = (r) => r.error || `HTTP ${r.status}`

  const home = await get(site)
  expect(home.status === 200 && home.type.includes('text/html'), `${site}: ${show(home)}, want an HTML page`)
  if (home.status !== 200) return errors

  // A stale base path is exactly this: the page loads, its assets do not.
  const assets = [...new Set(home.text.match(/(?:href|src)="([^"]*\/_next\/static\/[^"]+\.(?:css|js))"/g) || [])]
    .map((a) => new URL(a.replace(/^(?:href|src)="|"$/g, ''), site).href)
  expect(assets.length > 0, `${site}: no /_next/static assets referenced`)
  for (const url of [assets.find((a) => a.endsWith('.css')), assets.find((a) => a.endsWith('.js'))].filter(Boolean)) {
    const r = await get(url, { method: 'HEAD' })
    expect(r.status === 200, `${url}: ${show(r)}; the site was built for another base path, rebuild it`)
  }

  const og = home.text.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1]
  if (og) {
    expect(og.startsWith(site), `og:image ${og} is outside ${site}; SITE_URL is stale, rebuild the site`)
    const r = await get(og, { method: 'HEAD' })
    expect(r.status === 200 && r.type.startsWith('image/'), `${og}: ${show(r)}, want an image`)
  } else {
    errors.push(`${site}: no og:image`)
  }

  // The card of a tool carries its version (components/catalog.jsx): a
  // publication that the site does not show yet means a stale deployment or a
  // build that failed on a missing card in docs/products.mjs.
  for (const { tool, version } of tools) {
    expect(home.text.includes(`data-tool="${tool}" data-version="${version}"`),
      `${site}: no card of ${tool} v${version}; rebuild the site, or add its card to docs/products.mjs if the build failed`)
  }

  const missing = await get(new URL('smoke-missing-page/', site).href)
  expect(missing.status === 404 && missing.text.includes('/_next/static/'), `${site}smoke-missing-page/: ${show(missing)}, want the site's own 404`)

  // With HTTPS enforced, plain HTTP only redirects; so does the default
  // domain with a custom one.
  if (https && site.startsWith('https://')) {
    const http = await get(site.replace(/^https:/, 'http:'))
    expect([301, 302, 307, 308].includes(http.status) && http.location?.startsWith(site),
      `${site.replace(/^https:/, 'http:')}: ${show(http)} to ${http.location}, want a redirect to HTTPS; turn on Enforce HTTPS`)
  }
  // og.png stands for any path: the redirect must keep it.
  if (fallback && fallback !== site) {
    const r = await get(new URL('og.png', fallback).href)
    expect([301, 302, 308].includes(r.status) && r.location === new URL('og.png', site).href,
      `${fallback}og.png: ${show(r)} to ${r.location}, want a redirect to ${site}og.png`)
  }
  return errors
}

// Pages may serve the previous deployment for a while after deploy-pages returns.
export async function smoke(site, retries, { wait = 15000, ...opts } = {}) {
  if (!Number.isInteger(retries) || retries < 0) return [`--retries must be a non-negative integer, got ${retries}`]
  if (!/^https?:\/\/[^/]/.test(site || '')) return [`want the URL of the site, got ${JSON.stringify(site ?? '')}`]
  let errors = []
  for (let i = 0; i <= retries; i++) {
    errors = await smokeOnce(slash(site), opts)
    if (!errors.length || i === retries) break
    await new Promise((r) => setTimeout(r, wait))
  }
  return errors
}

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// Settings → Pages against settings.json; a domain change triggers no build.
async function doctor() {
  const report = []
  const ok = (m) => report.push(['ok', m])
  const fail = (m) => report.push(['fail', m])
  const slug = repoSlug()
  const want = settings().pages
  if (!want) return [['ok', `${SETTINGS} declares no Pages site`]]
  const where = `https://github.com/${slug}/settings/pages`
  let pages
  try {
    pages = JSON.parse(gh('api', `repos/${slug}/pages`))
  } catch (e) {
    fail(`Pages is not enabled or not readable, but ${SETTINGS} declares it; check ${where} (${(e.stderr || e.message).trim()})`)
    return report
  }
  if (pages.build_type === (want.build_type || 'workflow')) ok(`Pages publishes ${pages.html_url} from GitHub Actions`)
  else fail(`Pages builds from a branch; set Settings → Pages → Source: GitHub Actions (${where})`)
  if ((pages.cname || null) === (want.cname || null)) ok(`Pages domain ${pages.cname || 'default'} matches ${SETTINGS}`)
  else fail(`Pages domain is ${pages.cname || 'default'}, ${SETTINGS} says ${want.cname || 'default'}; align them (${where}), then rebuild the docs: gh workflow run cd.docs.yml`)
  if (want.https_enforced !== undefined) {
    if (pages.https_enforced === want.https_enforced) ok(`Pages HTTPS enforcement is ${pages.https_enforced ? 'on' : 'off'}`)
    else fail(`Pages HTTPS enforcement is ${pages.https_enforced ? 'on' : 'off'}, ${SETTINGS} wants ${want.https_enforced ? 'on' : 'off'}; toggle Enforce HTTPS (${where})`)
  }
  if (pages.protected_domain_state && pages.protected_domain_state !== 'verified' && want.cname) {
    fail(`the domain ${want.cname} is ${pages.protected_domain_state}; verify it for the organization`)
  }
  // a publication minutes before the run may still be deploying: retry 8×15s
  const errors = await smoke(pages.html_url, 8, { fallback: expectedSite(null, slug), https: want.https_enforced !== false, tools: published() })
  if (errors.length) errors.forEach((e) => fail(`site: ${e}`))
  else ok(`site ${pages.html_url} serves its page, assets and every published tool`)
  return report
}

async function main([mode, ...rest]) {
  const retries = rest.includes('--retries') ? Number(rest[rest.indexOf('--retries') + 1]) : 20
  switch (mode) {
    case 'site-env': {
      const site = expectedSite(settings().pages, repoSlug())
      if (!site) throw new Error('cannot resolve the Pages URL')
      console.log(`SITE_URL=${site}`)
      console.log(`BASE_PATH=${new URL(site).pathname.replace(/\/$/, '')}`)
      return 0
    }
    case 'pages': {
      const errors = pagesCheck(rest[0], settings().pages, repoSlug())
      errors.forEach((e) => console.error(`pages: ${e}`))
      return errors.length ? 1 : 0
    }
    case 'smoke': {
      const errors = await smoke(rest[0], retries, { fallback: expectedSite(null, repoSlug()), https: settings().pages?.https_enforced !== false, tools: published() })
      errors.forEach((e) => console.error(`smoke: ${e}`))
      if (!errors.length) console.log(`smoke: ${slash(rest[0])} serves its page, assets and every published tool`)
      return errors.length ? 1 : 0
    }
    case 'doctor': {
      const report = await doctor()
      for (const [status, msg] of report) console.log(`${status.padEnd(5)} ${msg}`)
      return report.some(([s]) => s === 'fail') ? 1 : 0
    }
    default:
      console.error('usage: pages.mjs site-env | pages <base-url> | smoke <site-url> [--retries <n>] | doctor')
      return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (e) {
    console.error(`pages: ${e.message}`)
    process.exitCode = 1
  }
}
