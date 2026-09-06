
# VS Code Extension Plan: .msg / .eml Email Viewer

## 1. Context / Background

**Goal:** Build a VS Code extension that reads and views `.msg` and `.eml` files, specifically in the context of email forwards (chains of forwarded messages, often with nested email attachments).

**Prior discussion summary (interface design decided before this plan):**

- The extension must use VS Code's **Custom Editor API** (`CustomReadonlyEditorProvider`) backed by a **Webview**, since `.msg`/`.eml` are binary/rich formats that cannot render in a plain text editor. This mirrors how VS Code's built-in image preview and extensions like PDF Viewer / Excel Viewer work. *(Verified: `priority: "default"` is documented, mature behavior — "Reopen With → Text Editor" remains available regardless via VS Code's built-in `workbench.editorAssociations` mechanism.)*
- Files should open directly in the custom viewer on double-click (`contributes.customEditors`, `priority: default`), with a fallback to "Reopen With → Text Editor" for raw MIME source, plus an editor-title button for "View Raw Source." *(Verified: the editor-title button is contributed via `contributes.menus["editor/title"]` with `"when": "activeCustomEditorId == '<viewType>'"` — a stable, documented `when`-clause context key. "View Raw Source" must be implemented via VS Code's native text-document APIs, e.g. `vscode.workspace.openTextDocument`/"Reopen With → Text Editor" — never as a webview that templates the raw MIME text via `innerHTML`, which would reintroduce the exact injection risk the sandboxed body view is designed to prevent, now fed the entire unsanitized raw message including any literal `<script>` tags.)*
- **Webview layout** (single email view):
  - Collapsible header card (Subject, From, To/Cc, Date essentials by default; "Show all headers" expands full transport headers, SPF/DKIM, Message-ID, etc.)
  - Attachments strip as horizontal chips, each with Save (⬇) and, for nested emails, View (👁)
  - Body pane with HTML/Plain-text toggle. **Security note (revised):** an independent review found "sandboxed iframe with strict CSP (no scripts, remote images blocked)" alone is **refuted** as sufficient — script-free attack classes survive a script-src-only CSP (dangling-markup injection, `<form>`-based phishing, CSS-driven UI redress/spoofing), and CSS alone has caused real-world data exfiltration (e.g. a 2026 Thunderbird CVE via CSS animations/`@font-face`, independent of any `<img>`-tag remote-content toggle). The body pane needs three independent layers, not one: (1) **DOMPurify** sanitization of the HTML, explicitly configured (forbid `form`/`meta`/`base`/`style`, strip `on*` handlers, block `javascript:`/`data:text/html` URIs — defaults are not enough, DOMPurify's own default allow-list permits `style`), (2) the iframe's `sandbox` attribute as the primary containment control (empty/no tokens — no scripts are needed in the body at all), (3) an expanded CSP (`default-src 'none'; form-action 'none'; base-uri 'none'`, plus `style-src`/`font-src` locked down, not just `img-src`) as defense-in-depth. This mirrors real, fixed vulnerabilities in shipped VS Code extensions with the same webview+injected-HTML architecture.
  - Inline images resolved from `cid:` references (Content-ID → data URI rewriting) — **deferred out of v1's first implementation pass**, see Milestone 4.
  - Collapsible quoted/forwarded sections (heuristic detection of `-----Original Message-----`, `On ... wrote:`, nested `<blockquote>`), togglable via setting
  - VS Code theme variables (`--vscode-*`) for chrome. **Note:** these do not cross an iframe boundary — the sandboxed body iframe is its own document/CSSOM and won't inherit them, so it's styled with an explicit forced light/email-native background instead, not themed chrome variables.
- **Nested/forwarded email handling** (core to the "email forwards" use case): forwarded messages arriving as `message/rfc822` parts (.eml) or embedded `.msg` attachments should open in a *new instance* of the same custom editor via `vscode.openWith`, using VS Code's own tab navigation as the drill-down/back mechanism, rather than building in-webview breadcrumbs. **Resolved design** (see Milestone 5): a nested attachment isn't a real file on disk, so it's served through a custom **virtual `FileSystemProvider`** on a `mailpeek-nested://` scheme, backed by an in-memory `Map<uri, bytes>` populated when the parent is parsed — not a temp file. This is the documented, sample-backed VS Code pattern for non-disk virtual content (Microsoft's `fsprovider-sample`/`memfs`, referenced from the official Virtual Documents guide), and a real published extension (`TomasHubelbauer/vscode-email-viewer`) uses the identical approach for the identical problem. It's still the plan's single highest-uncertainty piece (VS Code's editor/working-copy machinery — breadcrumbs, revert, decorations — has documented failure modes for atypical/unregistered schemes in less-common code paths) — prototype it end-to-end early, including breadcrumbs/close/revert, not just the happy path.
- **Secondary surfaces considered:** command palette commands (`Extract All Attachments`, `Copy Headers as JSON`); a deferred v2 idea for a multi-file "Open as thread" view using `Message-ID` / `In-Reply-To` / `References` headers.

**Assumptions — confirmed:**

1. **Read-only viewer** (no composing/editing) — confirmed.
2. `.msg` parsed via `@kenjiuno/msgreader` (OLE2/CFB) — confirmed as the right choice (Apache-2.0, actively maintained, 1.65M monthly downloads, natively models nested `.msg`-in-`.msg` attachments). `.eml` parsing library is **revised**: `mailparser` does *not* extract nested `message/rfc822` parts as distinct parsed sub-messages out of the box (confirmed via source + maintainer-confirmed GitHub issues — it either merges forwarded content into the parent body or hands back an opaque undecoded blob). `postal-mime` does this natively (`node.subMessage`, `maxNestingDepth` guard, zero dependencies) and is the better fit specifically for this plan's forwarded-email requirement; decide before Milestone 2 starts. `letterparser` is stale (22 months, no fresh commits) and not recommended.
3. **Desktop VS Code only** (not vscode.dev) — confirmed, required for Node.js-based parsing.
4. Forward-chain drill-down is v1 priority; cross-file threading is v2 — confirmed.
5. No in-webview search/find-bar for v1 — confirmed.
6. Publish target: **both** personal/internal use and eventual Marketplace publication — build with Marketplace-clean licensing/dependencies from the start rather than as a later retrofit.
7. Test fixtures: 24 real `.msg` files under `data/` (real forwarded logistics/PO email chains). Checked directly against `@kenjiuno/msgreader`: **none** of the 24 contain a genuine nested `.msg` attachment — all forwards are inline body text, real attachments are images/PDFs/spreadsheets. **All 24** have `bodyHtml` empty and rely on `compressedRtf` — i.e. the RTF-decompression pipeline (Milestone 3) is required for essentially every real fixture to render a body at all, not an edge case. A synthetic fixture (`data/FW_ Climax (with nested Morenci attachment) - SYNTHETIC.msg`, built by embedding one real `.msg` inside another as a true OLE2 nested-message attachment) was added to exercise the nested-attachment drill-down path end-to-end.

---

## 2. Objective

Ship a VS Code extension that lets a user open `.msg` or `.eml` files and see a readable, correctly-rendered view of the email — headers, body (HTML or plain text), attachments, and nested forwarded emails — without leaving the editor.

## 3. Scope

### In scope (v1)

- Custom read-only editor for `.eml` and `.msg`
- Header display (essential + expandable full headers)
- HTML and plain-text body rendering with sandboxing/CSP
- Inline image (`cid:`) resolution
- Attachment listing, save-to-disk, and recursive viewing of nested `.eml`/`.msg` attachments
- Collapsible quoted/forward-chain sections
- Theme-aware chrome styling

### Out of scope (v1, deferred to v2+)

- Composing or editing emails
- Cross-file thread view
- In-webview search/find
- Web (vscode.dev) support

## 4. Proposed Milestones

| # | Milestone                        | Description                                                                                       | Key deliverable                                                   |
| - | -------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1 | Project scaffold                 | Manual scaffold, TypeScript, esbuild, `package.json` contributions for `customEditors` (viewType `mailpeek.emailViewer`, selector `*.eml`/`*.msg`, `priority: "default"`)  | Extension loads in Extension Development Host, registers viewType |
| 2 | .eml parsing pipeline            | Integrate `postal-mime` (not `mailparser` — see revised assumption #2, it lacks native nested-`message/rfc822` support), extract headers/body/attachments into a normalized internal model          | Parser module + unit tests against sample`.eml` fixtures        |
| 3 | .msg parsing pipeline            | Integrate `@kenjiuno/msgreader`, map to the same normalized internal model. **Required, not optional:** body resolution order is `bodyHtml` → decompress+de-encapsulate `compressedRtf` (`@kenjiuno/decompressrtf` + `rtf-stream-parser`, MS-OXRTFEX) → plain `body`, since RTF-only is the majority real-world case (confirmed against all 24 local fixtures). TNEF/`winmail.dat` and S/MIME are unhandled by any library in this space — explicit in/out-of-scope decision needed, see Open Gaps.      | Parser module + unit tests against sample`.msg` fixtures        |
| 4 | Webview UI — header & body      | Build webview HTML/CSS/JS, header card, HTML/text toggle. **Security (revised, see Section 1):** DOMPurify sanitization (explicitly configured) + iframe `sandbox` attribute (primary control) + expanded CSP (`form-action`/`base-uri`/`style-src`/`font-src`, not just `script-src`/`img-src`) — CSP alone is refuted as sufficient. | Renders a single top-level email correctly, with the body pane's three sandboxing layers verified against a script/style injection probe, not just trusted by config |
| 5 | Attachments & nested emails      | Attachment chips, save-to-disk, recursive `vscode.openWith` for nested email attachments via a virtual `FileSystemProvider` on a `mailpeek-nested://` scheme (in-memory `Map<uri, bytes>`, id derived from parent+index so re-opening reuses the same tab) — see resolved design in Section 1. No temp files, no disk writes/cleanup lifecycle.        | Forward chains navigable via tabs                                 |
| 6 | Quoting/forward-chain collapsing | Heuristic detection + collapsible sections, user setting to toggle                                | Long forward chains readable by default                           |
| 7 | Theming & polish                 | VS Code CSS variable integration, light/dark handling for email body                              | Visual QA across VS Code themes                                   |
| 8 | Packaging & docs                 | `@vscode/vsce package` (the `vsce` npm package is deprecated — use `@vscode/vsce`), README, `THIRD-PARTY-NOTICES.md` (Apache-2.0 attribution for `msgreader`), privacy statement, marketplace listing. **Deadline to track:** Azure DevOps retires the "all accessible organizations" PATs that Marketplace publish currently requires on 2026-12-01 — confirm `@vscode/vsce`'s Entra ID/`--azure-credential` path covers the intended publish flow before relying on a PAT.  | Installable`.vsix`                                              |

## 5. Open Questions — original five, now resolved

1. ~~Confirm read-only scope for v1~~ — **Yes, read-only.**
2. ~~Confirm target parsing libraries~~ — **`@kenjiuno/msgreader` for `.msg` (confirmed correct); `postal-mime` for `.eml`** (revised from `mailparser` — see Section 1/assumption #2). `msg-parser` (the alternative `.msg` library) checked and found effectively unmaintained since 2021 with ~260x less adoption — not a viable alternative.
3. ~~Desktop-only acceptable?~~ — **Yes, desktop-only.**
4. ~~Existing sample fixtures available?~~ — **Yes**, 24 real `.msg` files in `data/` (real forwarded logistics/PO chains), plus one synthetic nested-attachment fixture added for testing the drill-down path (see assumption #7).
5. ~~Publish target?~~ — **Both** personal/internal and eventual Marketplace.

## 6. Open Gaps — surfaced by review, need a decision before/at the relevant milestone

None of these are assumed answered; each is a genuine open decision, not something silently defaulted:

1. **TNEF/`winmail.dat` decoding** — Outlook-to-Outlook internal mail (this extension's core use case) frequently wraps the real body/attachments in a TNEF blob, especially with RTF formatting; neither `msgreader` nor any `.eml`/`.msg` library in this space decodes it. In scope for v1 (needs a library like `node-tnef`), or shown as an opaque attachment?
2. **S/MIME signed/encrypted messages** — unhandled by any library considered. For signed mail, unwrap and show the inner body transparently? For encrypted mail, what should the UI say instead of failing silently or showing ciphertext?
3. **Character-encoding edge cases** — RFC 2047 encoded-words in uncommon charsets, `.msg` legacy code pages without a Unicode counterpart. Best-effort auto-detection acceptable, or need an explicit "reinterpret as charset X" override?
4. **Performance / size limits** — no stated cap on attachment size or forward-chain depth; large attachments become base64 across the webview `postMessage` boundary. What are the target limits, and should large attachments lazy-load only on click rather than eagerly?
5. **Integration testing** — milestones only mention "unit tests against fixtures"; no framework named, no `@vscode/test-electron` coverage of activation/webview/command behavior. Its own milestone, or folded into existing ones?
6. **`priority: "default"` vs other installed `.eml`/`.msg` extensions** — VS Code only allows one default-priority editor per file type without prompting. Keep `"default"` (risk: fights other installed viewers) or use `"option"` (loses the seamless double-click UX)?
7. **Webview accessibility** — no keyboard/screen-reader plan for the header/chips/toggle, or for focus management across nested-tab drill-down. Its own milestone, or deferred to v2 alongside threading?
8. **License-compliance scanning** — `vsce`/`@vscode/vsce` bundles the full `node_modules` tree into the `.vsix`. Add an automated scan (e.g. `license-checker`) as a packaging gate before any release?
9. **Parser-layer hardening** — the parsing layer runs with full Node.js access on the extension host and email files are a canonical malicious-input vector (crafted OLE2 structures, decompression bombs in RTF, deep `message/rfc822` nesting). Add explicit recursion-depth and decompression-size caps, and sanitize attachment filenames before any future unattended "Extract All" write-to-disk?

## 7. Suggested Next Step

Milestone 1 (scaffold) and Milestone 5 (the `mailpeek-nested://` `FileSystemProvider`), plus a pulled-forward slice of Milestone 4 (header/body webview, built with the revised DOMPurify+sandbox security model from the start rather than retrofitted later) are in progress under `extension/`, targeting the real `.msg` fixtures in `data/`. `.eml` support (Milestone 2, `postal-mime`) and the remaining Milestone 4/6/7/8 polish are not yet started.
