// The parts of the page drawn from the catalog at build time (catalog.mjs):
// the counts of the hero, the install terminal, a card for every published
// tool and the channels table. Server components: the data never reaches the
// browser except as markup and the few fields the install commands need.
import { catalog, formatDate } from '../catalog.mjs'
import { CATALOG, CHANNELS } from './channels'
import { InstallTerminal, ToolCommand, Copy } from './install'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Only what the client components read.
const forClient = (t) => ({ tool: t.tool, install: t.install, embedded: Boolean(t.embedded), skills: t.skills.map((s) => ({ name: s.name, id: s.id })) })

export function HeroInstall() {
  return <InstallTerminal tools={catalog().tools.map(forClient)} />
}

export function HeroNote() {
  const c = catalog()
  return (
    <p className="hero-note">
      {plural(c.tools.length, 'tool')} · {plural(c.skills, 'skill')}{c.releases > 0 && <> · {plural(c.releases, 'publication')}</>}
      {c.updated && <> · updated <time dateTime={c.updated}>{formatDate(c.updated)}</time></>} · open source, MIT
    </p>
  )
}

export function Shelf() {
  const { tools } = catalog()
  return (
    <nav className="sk-shelf" aria-label="Tools in the catalog">
      {tools.map((t) => (
        <a key={t.tool} href={`#${t.tool}`}><span aria-hidden="true">{t.emoji}</span><b>{t.tool}</b><span>v{t.version}</span></a>
      ))}
    </nav>
  )
}

const short = (digest) => (digest ? `${digest.slice(0, 15)}…${digest.slice(-4)}` : '—')

function History({ tool }) {
  const { history, version } = tool
  if (!history.length) return null
  const shown = history.slice(-6)
  const first = history[0]
  return (
    <div className="sk-history">
      <p className="sk-history-title">
        {plural(history.length, 'release')} in the catalog
        {first.date && <> since <time dateTime={first.date}>{formatDate(first.date)}</time></>}
      </p>
      <ol aria-label={`Releases of ${tool.tool} in the catalog`}>
        {history.length > shown.length && <li className="is-more">+{history.length - shown.length}</li>}
        {shown.map((r) => (
          <li key={r.tag} className={r.version === version ? 'is-current' : ''}>
            <a href={`https://github.com/${CATALOG}/tree/${r.tag}/plugins/${tool.tool}`} title={r.date ? `${r.tag}, ${formatDate(r.date)}` : r.tag}>v{r.version}</a>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ToolCard({ tool, index }) {
  const t = tool
  return (
    <article className="sk-card" id={t.tool} data-tool={t.tool} data-version={t.version}>
      <header className="sk-card-head">
        <span className="card-number">{String(index + 1).padStart(2, '0')} / {t.repository.toUpperCase()}</span>
        <span className="sk-stamp">v{t.version}{t.published && <> · <time dateTime={t.published}>{formatDate(t.published)}</time></>}</span>
      </header>
      <div className="sk-card-body">
        <div className="sk-card-about">
          <h3><span className="sk-card-emoji" aria-hidden="true">{t.emoji}</span><a href={t.homepage}>{t.tool}</a></h3>
          <p className="sk-tagline">{t.tagline}</p>
          <p className="sk-summary">{t.summary}</p>
          <div className="sk-card-links">
            <a className="button-primary" href={t.homepage}>{new URL(t.homepage).host} <span aria-hidden="true">↗</span></a>
            {t.releaseNotes && <a className="button-text" href={t.releaseNotes}>Release notes v{t.version} <span aria-hidden="true">↗</span></a>}
            {t.guide && <a className="button-text" href={t.guide}>Agent guide <span aria-hidden="true">↗</span></a>}
          </div>
        </div>
        <div className="sk-card-skills">
          <p className="eyebrow">{plural(t.skills.length, 'SKILL', 'SKILLS')} IN THE PLUGIN</p>
          <ul>
            {t.skills.map((s, i) => (
              <li key={s.name}>
                <code>{s.id}</code>{i === 0 && <span className="sk-badge">main</span>}
                <p>{s.summary}</p>
              </li>
            ))}
          </ul>
          <dl className="sk-meta">
            <div><dt>Binaries</dt><dd><code>{t.range || '—'}</code></dd></div>
            <div><dt>Source</dt><dd><a href={t.sourceUrl}>{t.source.repository}@{t.source.tag}</a></dd></div>
            <div><dt>Catalog</dt><dd><a href={t.catalogUrl}>{t.catalogTag}</a></dd></div>
            <div><dt>Digest</dt><dd><a href={t.provenanceUrl} aria-label={`provenance.json of ${t.catalogTag}${t.skills[0]?.digest ? `, digest ${t.skills[0].digest}` : ''}`}><code>{short(t.skills[0]?.digest)}</code></a></dd></div>
          </dl>
        </div>
      </div>
      <footer className="sk-card-foot">
        <ToolCommand tool={forClient(t)} />
        <History tool={t} />
      </footer>
    </article>
  )
}

export function Tools() {
  const { tools } = catalog()
  return <div className="sk-cards">{tools.map((t, i) => <ToolCard key={t.tool} tool={t} index={i} />)}</div>
}

// The channels table of the README, with real commands for one tool: the
// first that embeds its skill, so that every channel has a command.
export function Channels() {
  const { tools } = catalog()
  const t = tools.find((x) => x.embedded) || tools[0]
  if (!t) return null
  const sample = { ...forClient(t) }
  return (
    <div className="sk-channels">
      {Object.entries(CHANNELS).map(([key, c], i) => {
        const steps = [
          c.register && ['Register once', c.register],
          key === 'binary' && ['Get the tool', t.install],
          ...c.install(sample).map((cmd) => [key === 'skills' ? 'Install by skill' : 'Install', cmd]),
          c.all && ['Or every skill', c.all],
          (key !== 'binary' || t.embedded) && [c.updateLabel || 'Update', c.update(sample)],
        ].filter(Boolean)
        return (
          <section key={key} className="sk-channel" aria-label={c.label}>
            <p className="card-number">0{i + 1} / {c.label.toUpperCase()}</p>
            <h3>{c.label}</h3>
            <ol>
              {steps.map(([label, cmd]) => (
                <li key={label}><span>{label}</span><code>{cmd}</code><Copy text={cmd} label={`${label}, ${c.label}`} /></li>
              ))}
            </ol>
            <p className="sk-channel-note">{c.note}</p>
          </section>
        )
      })}
    </div>
  )
}

// Pinning, with the tag of the latest publication in the catalog.
const latest = () => [...catalog().tools].sort((a, b) => (a.published || '').localeCompare(b.published || '')).at(-1)

export function Pin() {
  const t = latest()
  if (!t) return null
  const code = [
    '# one skill at a release',
    `npx skills add '${CATALOG}#${t.catalogTag}' --skill ${t.tool}`,
    '',
    '# the whole catalog at a tag, every tool included',
    `claude plugin marketplace add '${CATALOG}#${t.catalogTag}'`,
    '# Codex keeps the ref it registered: remove the catalog first',
    'codex plugin marketplace remove octolab',
    `codex plugin marketplace add ${CATALOG} --ref ${t.catalogTag}`,
  ].join('\n')
  return (
    <>
      <p className="sk-code-title">pin a release · {t.catalogTag}</p>
      <pre><code>{code}</code></pre>
    </>
  )
}
