import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'
import './brand.css'
import './landing.css'
import { siteUrl } from '../site.mjs'

export const metadata = {
  title: { default: 'skills — Teach your agent every OctoLab tool.', template: '%s · skills' },
  description: 'The catalog of agent skills for OctoLab command-line tools, for Claude Code, Codex and the skills CLI.',
  metadataBase: new URL(siteUrl),
  icons: { icon: `${process.env.BASE_PATH || ''}/icon.svg` },
}

export default async function RootLayout({ children }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head color={{ hue: 256, saturation: 46, lightness: { light: 45, dark: 78 } }} backgroundColor={{ light: 'rgb(249, 247, 242)', dark: 'rgb(19, 17, 25)' }} />
      <body>
        <Layout
          navbar={<Navbar logo={<span className="wordmark"><span className="brand-emoji" aria-hidden="true">📚</span>skills</span>} projectLink="https://github.com/octolab/skills" />}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/octolab/skills/tree/main/docs"
          footer={<Footer><div className="site-footer"><span><b>skills</b> <span>Skills to use OctoLab products.</span></span><span>MIT © {new Date().getFullYear()} <a href="https://www.octolab.org/">OctoLab</a></span></div></Footer>}
          search={null}
          copyPageButton={false}
          feedback={{ content: 'Something unclear?', link: 'https://github.com/octolab/skills/issues/new' }}
          nextThemes={{ defaultTheme: 'system' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
