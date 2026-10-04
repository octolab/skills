# Troubleshooting

## The login code never arrives

Have the user sign in with a device that is already logged in:
`indexit telegram auth login --qr`, or type `qr` at the code prompt.
Requesting more codes doesn't help when Telegram has no other channel.

## "Peer … not in cache"

Run `indexit telegram fetch dialogs` with the same account, session and
`--peer-cache` as the failing command, then retry. Public `@username` and
`t.me/name` addresses resolve without the cache; numeric IDs and `t.me/c/`
links don't. A cache entry doesn't grant access the account lacks.

## The whole group came back instead of one topic

The link had one number, so it named a message. Use a link with the topic and
a message (`t.me/example_forum/42/1042`) or `channel:<id>:<topic>`; find topic
IDs with `fetch topics --dialog <forum>`.

## The command waits

indexit logs progress and a heartbeat during long calls. On `FLOOD_WAIT` it
waits and retries once; a wait longer than the remaining `--timeout` fails.
`PEER_FLOOD` fails immediately — stop and tell the user rather than retrying in
a loop. For details run with `-v`; `-vvv` adds transport logs, which the user
should review before sharing.

If Telegram is unreachable, configure a proxy (see
[workflows.md](workflows.md#proxy)).

## Files are missing after `fetch media`

Look for `error` records in the manifest. Re-run the same command to retry;
existing non-empty files are skipped, `--overwrite` replaces them. Keep one
`--dir` per dialog.

## Messages are missing without a warning

`-q` hid the warnings. Run again without it to see which IDs were skipped and
why.

## Shell variables seem ignored

A loaded `.env` overrides matching environment variables. Check the
`loaded .env` log line, or run with `--env-file=""` to use only the
environment.

## Session permissions are rejected

The session file must have mode `0600` on macOS and Linux:
`chmod 600 ~/.config/indexit/telegram/session.json` (or the `--session` path).
If Telegram revoked the session, the user signs in again.

## Exit code 2

A usage or configuration error: check a dialog address with
`indexit telegram debug uid <value>`, the flags with `--help`, and the proxy
settings. Bare positive numbers are ambiguous and rejected; use `user:<id>`,
`chat:<id>` or `channel:<id>`. An invite link names no dialog: describe it with
`fetch peer`, which also takes links without `https://` and a bare
`t.me/c/<id>` that `debug uid` rejects.

## Still stuck

Suggest an issue at https://github.com/octopot/indexit/issues/new with
`indexit version`, the command with sensitive values removed, and the error.
Never include session files, API credentials or exported private messages.
