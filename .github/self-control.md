# Self-control

Open checks that outlive a working session: things to look at later, decisions
that are waiting, and follow-ups that still need an issue. Each item says when
to look, what proves it and what to do if it fails. An item is removed once it
is proven or moved into an issue.

## Watch

### Dependencies of the site

- [ ] **On the first Nextra release after 4.6.1** (shuding/nextra#4990): move
  the `nextra-theme-docs` override in `docs/package.json` to zod 4.6.6 or
  later, or drop it, and drop the katex and minimatch overrides its own
  ranges cover. Proven when `npm audit` in `docs/` is clean and the site
  builds.

Overrides in `docs/package.json`:

| Package | Override | Why |
| --- | --- | --- |
| katex | `^0.18.2` | advisories below 0.18.2; Nextra and mermaid ask for 0.16 |
| minimatch | `^11.0.1` | advisories below 11.0.1; Nextra → ts-morph asks for 10 |
| zod | `4.1.12` under `nextra-theme-docs` | **kept vulnerable on purpose**: newer zod breaks Nextra 4.6.1 (shuding/nextra#5036). It validates the repository's own config at build time only; the alert (GHSA-mrhx-c7xc-m3w5) is dismissed as a tolerable risk |
| @xmldom/xmldom | `^0.9.12` under `speech-rule-engine@4.1.4` | advisories of the version speech-rule-engine asks for |

## Checks by occasion

Not open work: what to check each time the occasion comes.

### After Dependabot fails or a security alert opens

A security update of a transitive dependency of `docs/` fails with
`security_update_not_possible` when its parent pins an older range.

- [ ] **Lift it with `overrides`** in `docs/package.json`, then `npm install`
  and `npm audit` in `docs/`, and build the site. Proven when `npm ls <name>`
  shows the patched version and the site builds; add a row to the table of
  overrides above.
- [ ] **When an override cannot be lifted** (the site breaks), dismiss the
  alert as a tolerable risk with the reason and the upstream issue, and say
  so in the table.
