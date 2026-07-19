# MailPeek

A VS Code extension that opens `.msg` and `.eml` files directly in the editor — headers, body, and attachments — with forwarded/nested emails drilling down into their own tabs instead of leaving VS Code.

See [docs/plans/initial_plan.md](docs/plans/initial_plan.md) for the full design and milestone plan.

## Status

Early development. Currently implemented: `.msg` viewing (header card, HTML/plain body with RTF-body fallback, attachment listing, nested `.msg` attachments open in a new tab). `.eml` parsing is not wired up yet — opening a `.eml` file shows a placeholder.

## Privacy

Everything is parsed locally in the extension host. No email content, headers, or attachments are transmitted anywhere. Remote images and external resources referenced by an email's HTML body are never loaded.

## Development

```bash
cd extension
npm install
npm run compile
```

Then press `F5` in VS Code (with `extension/` open, or the repo root — `launch.json` points at `extension/`) to launch an Extension Development Host, and open one of the sample files in `data/*.msg`.

Run `npm run watch` instead of `npm run compile` for incremental rebuilds while developing.
