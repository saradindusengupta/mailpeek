# Publish MailPeek to the VS Code Marketplace

## Status

Not started. One blocking item found during planning (Section 0) that needs a decision before `extension/` is ever pushed to the public repo.

## 0. Blocking: real business data would be exposed on first push

`data/` (the 24 real `.msg` fixtures) is correctly `.gitignore`d and verified never committed — only `data/data.csv` was ever pushed, no `.msg` files. **But** `extension/src/test/fixtures/sample.msg` and `nested.msg` (copied from `data/` during the recent restructure, for the Mocha test suite) are **untracked and not covered by any `.gitignore` rule**. They contain real content: actual names ("Blake Driver", "Allen Watts"), real email addresses (`blake.driver@intellitrans.com`, `allen.watts@intellitrans.com`), a real company domain, and real logistics/PO details.

`extension/` has never been pushed yet (repo only has the `Initial commit`), so nothing is exposed *yet* — but publishing to the Marketplace requires pushing `extension/` (for the `repository` link, CI, and general project hygiene), and once these two files are committed and pushed, they're in public git history permanently (a later deletion doesn't remove them from history without a rewrite).

**Recommended fix**: replace both fixtures with fully synthetic ones (fabricated names/addresses/subject lines, same structural shape — one plain `.msg` with an HTML-encapsulated-RTF body and a few attachments, one with a genuine nested `.msg` attachment) and update the `msgParser.test.ts` assertions to match the new fake values. This is the only option that doesn't compromise either privacy or CI (a plain `.gitignore` on the fixtures would keep them out of git, but then a fresh CI checkout has no fixtures to test against).

This is a decision to confirm, not something to act on silently — see "Open decisions" at the end.

## 1. Marketplace account & auth setup

- Register publisher ID `mailpeek` at marketplace.visualstudio.com/manage (check availability; needs a real Microsoft/Azure DevOps identity, not anonymous). `package.json`'s `"publisher": "mailpeek"` must match exactly whatever gets registered.
- Create an Azure DevOps Personal Access Token at dev.azure.com: **Organization = "All accessible organizations"** (scoping to a single org is a common mistake that breaks publish), **Scope = Marketplace (Manage)**.
- ⚠️ **Time-sensitive**: Azure DevOps is retiring "Global" PATs — new creation blocked and all existing ones decommissioned **2026-12-01** (~4 months out from this plan's writing). Check whether `@vscode/vsce`'s newer Entra ID / `--azure-credential` login path is usable by then as a replacement (confirmed to exist as of the earlier research pass, but pipeline/service-connection oriented, not a drop-in interactive-login swap — re-verify current state closer to actually publishing, since this is actively evolving).
- `vsce login mailpeek` (or let `vsce publish` prompt for the PAT interactively) to authenticate this machine.

## 2. Marketplace-listing polish

- **Icon**: none exists yet. Add a 128×128 PNG and `"icon": "icon.png"` in `package.json` — Marketplace listings without one look unfinished.
- **`THIRD-PARTY-NOTICES.md`**: identified as needed during earlier research (Apache-2.0 attribution requirement for `@kenjiuno/msgreader`) but never actually created. Add before publishing.
- **`keywords`** in `package.json` (e.g. `"email", "msg", "eml", "outlook", "viewer"`) for Marketplace search discoverability.
- **`categories`**: currently `["Other"]`; consider whether something more specific fits (not blocking).
- **README as Marketplace page**: README.md becomes the listing's main content. Confirm relative links (e.g. to `docs/plans/initial_plan.md`) resolve correctly once `repository` is live (Marketplace rewrites relative links based on that field) — verify after the first push, before publishing.
- Consider a screenshot or short GIF of the extension in the README — currently text-only, and listings with visuals get materially better engagement.

## 3. Product-readiness / scope — needs your call, not assumed

Current state: only `.msg` works (`.eml` shows a placeholder), Milestones 6 (quoting/forward-chain collapsing) and 7 (cross-theme visual QA) from `docs/plans/initial_plan.md` aren't done, and every item in that doc's "Open Gaps" section is still open (TNEF/winmail.dat, S/MIME, character-encoding edge cases, size/performance limits, accessibility, license-compliance scanning, parser-layer hardening against malicious files).

- **Option A** — publish now as an early/preview release, with limitations disclosed in the README under a "Known limitations" section.
- **Option B** — hold publish until `.eml` support and more "Open Gaps" items land.

This plan assumes **Option A** (ship early, iterate in public) as the default, but doesn't act on that assumption — confirm before Section 5 runs for real.

## 4. Licensing sanity check (already researched, just confirming, no new action)

Repo license: GPL-3.0-only. Bundled runtime dependencies — `@kenjiuno/msgreader` (Apache-2.0), `@kenjiuno/decompressrtf` (BSD-2-Clause), `rtf-stream-parser`, `iconv-lite`, `dompurify` (all MIT/permissive) — are all fine to include in a GPL-3.0 work (permissive → GPL is compatible; the reverse direction wouldn't be). Confirmed during the earlier research pass. Only remaining action is the `THIRD-PARTY-NOTICES.md` from Section 2.

## 5. Step-by-step publish procedure

1. Resolve Section 0 (swap in synthetic fixtures, update test assertions).
2. Commit and push `extension/` (with the fixed fixtures) to the public repo for the first time.
3. Complete Sections 1–2 (publisher account, PAT/auth, icon, notices, keywords).
4. Confirm Section 3's decision explicitly.
5. `cd extension && npm run compile && npm test && npm run lint` — all green (using the fixed `ELECTRON_RUN_AS_NODE` wiring from `docs/plans/fix_test_electron_wiring.md` if that's been applied by then).
6. `vsce package` and manually install + smoke-test the resulting `.vsix` one more time, same as the earlier local-install verification — that file is what goes live, so verify the actual artifact, not just the source.
7. `vsce publish` (first publish: just publishes the current version; use `vsce publish patch|minor|major` on later releases to bump as part of publishing).
8. Confirm the listing at `marketplace.visualstudio.com/items?itemName=mailpeek.mailpeek` — Microsoft's review/indexing can take a while to appear in search even after a successful `vsce publish`, so absence from search results isn't necessarily a failure.

## 6. Post-publish follow-ups (not blocking)

- Consider a GitHub Actions release workflow (tag-triggered `vsce publish`, PAT/credential stored as a repo secret) instead of manual publishing, once the manual flow has been proven once.
- Track the 2026-12-01 PAT deprecation and migrate auth before then.
- Revisit the "Open Gaps" backlog for a v0.1/v0.2.

## Open decisions (need your input, not assumed)

1. **Fixture content** (Section 0, blocking): synthesize fake fixtures and rewrite the two test assertions, or a different approach?
2. **Scope** (Section 3): ship now with disclosed limitations, or hold for more milestones first?
3. **Publish mechanism** (Section 6): manual `vsce publish` for now, or set up an automated release workflow before the first publish?
