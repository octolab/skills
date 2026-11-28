'use client'

// The interactive part of the page: the agent switch, the install terminal of
// the hero and the install line of each tool card. They share one channel
// (components/channels.js), so picking Codex once turns every command on the
// page into a Codex command. Without scripts the page shows Claude Code.
import { useState, useSyncExternalStore } from 'react'
import { CHANNELS, DEFAULT } from './channels'

// The chosen channel, kept in localStorage. The server renders the default;
// the browser switches to the stored one after hydration.
const KEY = 'octolab-skills:channel'
const listeners = new Set()
let current = null

function read() {
  if (current) return current
  try {
    const stored = window.localStorage.getItem(KEY)
    current = CHANNELS[stored] ? stored : DEFAULT
  } catch {
    current = DEFAULT
  }
  return current
}

function setChannel(channel) {
  if (!CHANNELS[channel]) return
  current = channel
  try { window.localStorage.setItem(KEY, channel) } catch {}
  listeners.forEach((fn) => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const useChannel = () => useSyncExternalStore(subscribe, read, () => DEFAULT)

export function Copy({ text, label }) {
  const [state, setState] = useState('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('error')
    }
    setTimeout(() => setState('idle'), 1600)
  }
  // The button keeps one name; the result is announced by a status next to it.
  return (
    <>
      <button type="button" className="sk-copy" onClick={copy} aria-label={`Copy: ${label}`}>
        {state === 'done' ? 'copied' : state === 'error' ? 'select it' : 'copy'}
      </button>
      <span className="demo-sr-only" role="status">{state === 'done' ? `Copied: ${label}` : state === 'error' ? 'Copying failed; select the command instead' : ''}</span>
    </>
  )
}

export function ChannelSwitch({ label = 'Your agent', compact = false }) {
  const channel = useChannel()
  return (
    <div className={`sk-switch${compact ? ' is-compact' : ''}`} role="group" aria-label={label}>
      {Object.entries(CHANNELS).map(([key, c], i) => (
        <button key={key} type="button" aria-pressed={channel === key} onClick={() => setChannel(key)}>
          <span aria-hidden="true">0{i + 1}</span><b>{c.label}</b>
        </button>
      ))}
    </div>
  )
}

// The binary channel reaches only the tools that embed their skill; the
// commands, the count and the skills the agent learns all come from one list.
const reached = (channel, tools) => (channel === 'binary' ? tools.filter((t) => t.embedded) : tools)

function heroLines(channel, tools) {
  const c = CHANNELS[channel]
  if (channel === 'skills') return [c.all]
  if (channel === 'binary') return tools.flatMap((t) => [t.install, ...c.install(t)])
  return [c.register, ...tools.flatMap((t) => c.install(t))]
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`

// The hero: everything the catalog holds, for the chosen agent.
export function InstallTerminal({ tools: all }) {
  const channel = useChannel()
  const c = CHANNELS[channel]
  const tools = reached(channel, all)
  const lines = heroLines(channel, tools)
  const shows = tools.flatMap((t) => t.skills.map((s) => (channel === 'skills' || channel === 'binary' ? s.name : s.id)))
  return (
    <div className="sk-hero-demo">
      <ChannelSwitch label="Install for" />
      <div className="workflow-terminal sk-terminal">
        <div className="workflow-title"><span><span aria-hidden="true">● ● ●</span>{c.label} · install the catalog</span><span>{plural(tools.length, 'TOOL')}</span></div>
        <div className="workflow-command-row">
          <pre className="workflow-command">{lines.length
            ? lines.map((line, i) => <span key={i} className="sk-line"><span aria-hidden="true">$ </span>{line}{'\n'}</span>)
            : <span className="sk-line">No tool of the catalog embeds its skill yet.</span>}</pre>
          {lines.length > 0 && <Copy text={lines.join('\n')} label={`install with ${c.label}`} />}
        </div>
        {shows.length > 0 && <div className="workflow-body sk-shows">
          <p className="sk-shows-title">The agent learns</p>
          <ul>{shows.map((s) => <li key={s}><span aria-hidden="true">✓</span>{s}</li>)}</ul>
        </div>}
        <div className="workflow-footer"><p className="sk-note">{c.note}{tools.length < all.length && ` ${all.length - tools.length === 1 ? 'One more tool needs' : `${all.length - tools.length} more tools need`} another channel.`}</p></div>
      </div>
    </div>
  )
}

// One tool, for the chosen agent, from scratch: the catalog's registration
// first, where the agent needs one. The binary channel also shows how to get
// the tool, since a skill teaches the tool but does not install it.
export function ToolCommand({ tool }) {
  const channel = useChannel()
  const c = CHANNELS[channel]
  let lines = [...(c.register ? [c.register] : []), ...c.install(tool)]
  if (channel === 'binary') lines = [tool.install, ...lines]
  return (
    <div className="sk-tool-install">
      <ChannelSwitch label={`Install ${tool.tool} for`} compact />
      <div className="sk-tool-command">
        <code>{lines.map((l, i) => <span key={i}>{l}{'\n'}</span>)}</code>
        <Copy text={lines.join('\n')} label={`install ${tool.tool} with ${c.label}`} />
      </div>
      {channel === 'binary' && !tool.embedded && <p className="sk-tool-note">{tool.tool} does not embed its skill: pick another channel.</p>}
    </div>
  )
}
