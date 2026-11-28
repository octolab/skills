// Renders scripts/og.html to public/og.png (1733×908) with headless Chrome.
// playwright-core is not a dependency of the site: point PLAYWRIGHT_CORE at an
// installed copy, or run it where `playwright-core` resolves.
import { fileURLToPath } from 'node:url'

const core = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const { chromium } = core.default ?? core
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1733, height: 908 }, deviceScaleFactor: 1, colorScheme: 'light' })
await page.goto(new URL('og.html', import.meta.url).href)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: fileURLToPath(new URL('../public/og.png', import.meta.url)) })
await browser.close()
