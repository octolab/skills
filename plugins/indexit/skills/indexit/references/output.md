# Output

Every fetch command writes JSONL to stdout, or appends it to `-o <file>`.
Logs, warnings and progress go to stderr.

## Records

| `_kind` | Identifying fields | Also carries |
| --- | --- | --- |
| `dialog` | `uid`, `peer_type`, `peer_id` | title, username, forum status, unread count, account status, flags |
| `topic` | `dialog_uid`, `topic_id` | title, creation date, top message, counters, flags |
| `peer` | `ref`, `uid` | `peer_type`, title, usernames, `about`, `participants_count`, linked chat, account status, flags, user and bot details (below), `invite`, or `error` |
| `message` | `dialog_uid`, `id` | `date`, `text`, optional sender (`from`), topic, media description, replies, forwards |
| `media` | `dialog_uid`, `message_id`, `path` | `type`, date, size, `grouped_id` for albums, `skipped`, or `error` |

- Optional fields can be absent, including most false flags and zero counters;
  account status preserves known false values (see below). Keep readers tolerant
  of missing and extra fields. There is no schema version.
- Dates are RFC3339 in UTC. Text is plain; formatting entities are not
  exported. Reactions are a total, not per emoji.
- IDs can need 64-bit precision, `grouped_id` especially; use a reader that
  keeps integers exact.
- `fetch messages` only describes attachments; `fetch media` downloads them.
  Album frames share `grouped_id`; order them by numeric `message_id`.
- `uid` values (`channel:<id>`, `chat:<id>`, `user:<id>`) are valid
  `--dialog` addresses.

## Account status

`dialog` and `peer` records can include these booleans for the signed-in
account in a channel, supergroup (including a gigagroup), or basic group:

| Field | Meaning |
| --- | --- |
| `is_member` | The account currently belongs to this chat; false for chats it left and for migrated or deactivated basic groups |
| `is_admin` | The account is the owner or has admin rights |
| `is_creator` | The account is the owner |

Known values are always emitted, including `false`. Missing means unknown or
not applicable: reduced (`min`) channels, channel direct-message inboxes
(monoforums), inaccessible or missing entities, invite-only previews, and
users/bots have no account status fields. For invite
links, `invite.member` separately describes membership reported by the invite.
Old binaries may also omit all three fields. Never turn an absent field into
`false` when selecting non-admins. Report unknown status separately.

Telegram may retain owner/admin flags on a migrated basic group or a channel
the owner left. To select owned chats the account currently belongs to, also
require `is_member == true`.

A peer record with `error` can retain status from a usable entity already
returned by an invite check, even if the subsequent full fetch fails. Check
`error` before relying on the rest of the card.

`fetch dialogs` reads status from its existing pages; no per-peer requests
are added. Names and member counts do not establish ownership or admin status.
These fields cannot identify chats owned by another person when the signed-in
account is an ordinary member.

## User and bot cards

A `peer` record for a user or a bot (`peer_type` `user` or `bot`) is a full
card, not an error. Besides identity, `about` (the bio) and the flags
(`verified`, `premium`, `scam`, `fake`, `support`, `deleted`), it can carry:

| Field | Meaning |
| --- | --- |
| `first_name`, `last_name`, `phone`, `lang_code` | names, phone number and the user's language code, as Telegram returns them; `lang_code` mostly for the signed-in account |
| `personal_channel_uid`, `personal_channel` | the channel shown on the profile, `{uid, title, username}` like `linked_chat`; the UID can come alone |
| `birthday` | `YYYY-MM-DD`, or `--MM-DD` without a year |
| `business` | `location` (`address`, `latitude`, `longitude`), `work_hours` (`timezone_id`, `weekly_open[]` of `start_minute`/`end_minute` from Monday 00:00), `intro` (`title`, `description`) |
| `bot` | `description`, `commands[]` (`command`, `description`), `privacy_policy_url`, `active_users` (absent when not reported), `inline_placeholder`; `can_join_groups`, `can_read_all_group_messages`, `has_main_app` keep known `false` |
| `stars_rating`, `send_paid_messages_stars` | Stars rating `{level, stars}`; Stars price of a message to the user: `0` = paid messages on but the account is exempt, absent = free |

What privacy settings hide is absent, without an error. A cached `user:<id>`
reports `bot` from the full response; if that request fails, the record keeps
the cached identity with `peer_type` `user` and `error.code` `rpc`.

## Peer errors

`fetch peer` reports a failed ref in its record's `error.code`:

| Code | Meaning |
| --- | --- |
| `bad_ref` | not a Telegram address |
| `not_found` | the username is free or invalid |
| `cold_peer` | numeric ID not in the peer cache, or a user known only from a passing mention; such a user keeps its `uid`, `title`, `username`, a never-seen ID has none; after an account switch the cache starts empty; run `fetch dialogs` or pass a username |
| `invite_not_member` | invite to a chat the account isn't in; only a preview without an ID |
| `invite_expired` | invite expired or revoked |
| `rpc` | any other Telegram error, e.g. a private channel or a stale cached user; known identity is kept |

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

## Local photo previews

Photo `media` adds `preview_url` or `preview_error`. The URL identifies the account,
dialog, message and exact Photo.ID; preserve its string verbatim. It is local to
the user's machine, not a public share URL. The service downloads the largest
Telegram JPEG unchanged on first GET and then serves its persistent disk copy.

Photo albums additionally include `media.album` with `photos` (each has
`message_id` and `url`), explicit `complete`, and optional `error`. Exact-message
fetching from any album item looks up its accessible neighbors. A failure or an
unproven window boundary is reported; do not silently materialize a partial album.
Existing fields and the selected message's caption remain intact.
