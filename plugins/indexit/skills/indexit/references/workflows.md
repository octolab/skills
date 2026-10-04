# Workflows

Recipes for indexit `>=0.2.0 <0.3.0`. Substitute the user's real addresses;
`@example_channel`, `@example_forum` and the numbers below are placeholders.

## Set up and sign in

1. `indexit version` — see [SKILL.md](../SKILL.md) for the version check.
2. Credentials live in `.env` in the working directory:

   ```dotenv
   TELEGRAM_API_ID=123456
   TELEGRAM_API_HASH=replace_with_your_api_hash
   ```

   The user creates them at https://my.telegram.org/apps and types them in;
   never ask for them in chat.
3. `indexit telegram auth status` — if not authorized, the user runs
   `indexit telegram auth login --qr` in their terminal and scans the QR in
   Telegram → Settings → Devices → Link Desktop Device. Phone-code login is
   `indexit telegram auth login`; typing `qr` at the code prompt switches to
   QR.
4. Confirm with `indexit telegram auth status`.

## Read a public channel or group

```sh
indexit -q telegram fetch messages --dialog @example_channel --limit 200
```

Messages arrive newest first. `https://t.me/example_channel` works too.
Remove `--limit` to walk all history; add `--timeout 5m` to bound it.

## Find a private conversation

```sh
indexit -q telegram fetch dialogs \
  | jq -r '[.uid, .title // .username // .uid] | @tsv'
```

Pick the row whose title the user names and use its `uid` with `--dialog`.
Listing dialogs also fills the peer cache that numeric addresses need.

## Read a period

```sh
indexit -q telegram fetch messages --dialog @example_channel \
  --from 2026-08-01T00:00:00Z --to 2026-09-01T00:00:00Z
```

Dates are RFC3339 with `Z` or an offset. For ID windows, `--min-id` and
`--max-id` are exclusive bounds.

## Fetch exact messages

```sh
indexit -q telegram fetch message \
  https://t.me/example_channel/11 https://t.me/example_channel/46
indexit -q telegram fetch message --dialog @example_channel --id 11 --id 46,47
```

Missing, service and inaccessible messages are skipped with a warning; run
without `-q` to see which.

## Work with a forum topic

```sh
indexit -q telegram fetch topics --dialog @example_forum
indexit -q telegram fetch messages \
  --dialog https://t.me/example_forum/42/1042 --limit 100
```

`topic_id` comes from `fetch topics`. A topic address needs the topic and a
message number (`/42/1042`), or `channel:<id>:<topic>`; `/42` alone is message
42 in the whole dialog. The history walks the topic; it doesn't stop at
message 1042.

## Download media

```sh
indexit -q telegram fetch media \
  --dialog https://t.me/example_forum/42/1042 \
  --media photo --limit 20 --dir ./trip
```

Files go to `--dir`; stdout gets one manifest record per file. Date and ID
windows work as for `fetch messages`: `--from`/`--to` in RFC3339, exclusive
`--min-id`/`--max-id` — so `--min-id 41 --max-id 43` keeps only message 42.
`--media`
takes `photo`, `video`, `document`, `audio`, `voice`, `sticker`, comma-separated;
omit it for every downloadable type. Re-running retries missing files and
skips existing non-empty ones (`skipped: true`); `--overwrite` fetches them
again. Check for `error` records afterwards.

## Describe channels, groups, users and invites

```sh
indexit -q telegram fetch peer @example_channel https://t.me/+<hash> channel:<id>
```

One `peer` record per ref, in order. A username or invite placed before the
numeric ID of the same channel warms the peer cache for it. Users and bots get
identity fields plus `error.code` `not_channel`.

## Filter and save

```sh
indexit -q telegram fetch messages --dialog @example_channel --limit 200 \
  | jq -c 'select(.text | test("travel"; "i"))'
indexit -q telegram fetch messages --dialog @example_channel --limit 100 \
  | jq -r '[.id, .date, .text] | @tsv'
indexit -q telegram fetch messages --dialog @example_channel -o export.jsonl
```

`-o` appends to an existing file. For an interactive look, give the user
`... | fx` or an fzf pipeline to run in their own terminal.

## Separate accounts

```sh
indexit telegram --session ./work/session.json \
  --peer-cache ./work/peers.json fetch dialogs
```

Keep each session and peer cache pair together on every run of that account.

## Proxy

If Telegram is unreachable, the user sets one of these in `.env`:

```dotenv
INDEXIT_PROXY_URL="tg://proxy?server=proxy.example&port=443&secret=YOUR_SECRET"
INDEXIT_PROXY_URL="socks5://user:password@proxy.example:1080"
INDEXIT_PROXY_URL="http://proxy.example:3128"
```

Check with `indexit telegram auth status --timeout 30s`. `HTTP_PROXY` and
friends don't apply; a configured proxy never falls back to a direct
connection.

## Install and update this skill

The binary carries the skill for its own version:

```sh
indexit skill info
indexit skill install --agent claude-code,codex
indexit skill status
```

`install` writes `~/.claude/skills/indexit` for Claude Code and
`~/.agents/skills/indexit` for Codex, or the same under the current directory
with `--project`, and leaves directories of other installers alone. After
upgrading indexit, run it again with `--replace`. `status` lists every copy the
agents load, flags incompatible, changed and duplicate ones, and exits `1` on a
problem. `indexit skill export -o <dir>` writes the skill anywhere else.
