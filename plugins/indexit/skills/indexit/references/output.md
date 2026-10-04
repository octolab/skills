# Output

Every fetch command writes JSONL to stdout, or appends it to `-o <file>`.
Logs, warnings and progress go to stderr.

## Records

| `_kind` | Identifying fields | Also carries |
| --- | --- | --- |
| `dialog` | `uid`, `peer_type`, `peer_id` | title, username, forum status, unread count, flags |
| `topic` | `dialog_uid`, `topic_id` | title, creation date, top message, counters, flags |
| `peer` | `ref`, `uid` | `peer_type`, title, usernames, `about`, `participants_count`, linked chat, flags, `invite`, or `error` |
| `message` | `dialog_uid`, `id` | `date`, `text`, optional sender (`from`), topic, media description, replies, forwards |
| `media` | `dialog_uid`, `message_id`, `path` | `type`, date, size, `grouped_id` for albums, `skipped`, or `error` |

- Optional fields can be absent, including false flags and zero counters; keep
  readers tolerant of missing and extra fields. There is no schema version.
- Dates are RFC3339 in UTC. Text is plain; formatting entities are not
  exported. Reactions are a total, not per emoji.
- IDs can need 64-bit precision, `grouped_id` especially; use a reader that
  keeps integers exact.
- `fetch messages` only describes attachments; `fetch media` downloads them.
  Album frames share `grouped_id`; order them by numeric `message_id`.
- `uid` values (`channel:<id>`, `chat:<id>`, `user:<id>`) are valid
  `--dialog` addresses.

## Peer errors

`fetch peer` reports a failed ref in its record's `error.code`:

| Code | Meaning |
| --- | --- |
| `bad_ref` | not a Telegram address |
| `not_found` | the username is free or invalid |
| `cold_peer` | numeric ID not in the peer cache; run `fetch dialogs` or pass a username |
| `invite_not_member` | invite to a chat the account isn't in; only a preview without an ID |
| `invite_expired` | invite expired or revoked |
| `not_channel` | a user or bot; identity fields are still filled |
| `rpc` | any other Telegram error, e.g. a private channel |

## Completeness

- Each message ID is emitted once per run, also across overlapping pages and
  topics. Repeated IDs don't consume `--limit`. Across runs nothing is
  deduplicated, and `-o` appends.
- `--limit` counts emitted records. For media, skipped and failed files count
  too.
- A history walk that stops making progress fails with an error instead of
  reporting a partial export as complete.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | the command completed, possibly with empty or partial results |
| `1` | runtime failure |
| `2` | usage or configuration error: bad address, missing flag, malformed proxy |

Partial results with `0`:

- `fetch message`: skipped messages appear only as warnings on stderr (hidden
  by `-q`).
- `fetch media`: failed files are `error` records; find them with
  `jq -c 'select(.error)'`.
- `fetch peer`: exits `0` if at least one record has no `error`; `1` if every
  ref failed; `2` if every ref was malformed.
