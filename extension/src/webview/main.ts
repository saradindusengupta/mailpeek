import DOMPurify from 'dompurify';
import { EmailPreviewData } from '../types/emailData';
import { findQuoteMarkerIndex } from '../quoteHeuristics';

interface InitMessage {
  type: 'init';
  unsupported: boolean;
  error: string | undefined;
  email: EmailPreviewData | undefined;
  collapseQuotedText: boolean;
}

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById('root')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyToClipboard(text: string, feedbackEl: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const original = feedbackEl.textContent;
  feedbackEl.textContent = 'Copied';
  window.setTimeout(() => {
    feedbackEl.textContent = original;
  }, 1200);
}

function renderCopyableField(container: HTMLElement, label: string, value: string): void {
  const row = el('div', 'mp-field');
  row.appendChild(el('span', 'mp-field-text', `${label}: ${value}`));
  const copyBtn = el('button', 'mp-copy-btn', '📋 Copy');
  copyBtn.title = `Copy ${label}`;
  copyBtn.addEventListener('click', () => copyToClipboard(value, copyBtn));
  row.appendChild(copyBtn);
  container.appendChild(row);
}

function sanitizeHtmlBody(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['form', 'meta', 'base', 'style', 'script', 'link', 'iframe', 'object', 'embed', 'input', 'textarea', 'button', 'select'],
    ALLOW_DATA_ATTR: false,
  });
}

// Wraps each blockquote in a collapsed-by-default <details>/<summary> -- the body
// iframe has no script execution at all (sandbox="", no script-src), so this has to
// be pure HTML/CSS. A detached <template> parse (not string/regex replace) handles
// nested blockquotes correctly, since it operates on the real parsed tree.
function wrapBlockquotes(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('blockquote').forEach((blockquote) => {
    const details = el('details', 'mp-quote-details');
    const summary = el('summary', 'mp-quote-summary', 'Show quoted text');
    details.appendChild(summary);
    blockquote.replaceWith(details);
    details.appendChild(blockquote);
  });
  return template.innerHTML;
}

function renderUnsupported(): void {
  root.appendChild(el('div', 'mp-empty', '.eml files are not supported yet — .msg support is implemented first. See docs/plans/initial_plan.md.'));
}

function renderError(message: string): void {
  const wrap = el('div', 'mp-empty');
  wrap.appendChild(el('div', 'mp-error-title', 'Could not read this message'));
  wrap.appendChild(el('pre', 'mp-error-detail', message));
  root.appendChild(wrap);
}

function renderEmail(email: EmailPreviewData, collapseQuotedText: boolean): void {
  const header = el('div', 'mp-header');
  const subjectRow = el('div', 'mp-subject-row');
  subjectRow.appendChild(el('div', 'mp-subject', email.subject));
  const copyAllBtn = el('button', 'mp-copy-btn', '📋 Copy all headers');
  copyAllBtn.addEventListener('click', () =>
    copyToClipboard(
      [
        `Subject: ${email.subject}`,
        `From: ${email.from}`,
        email.to && `To: ${email.to}`,
        email.cc && `Cc: ${email.cc}`,
        email.date && `Date: ${email.date}`,
      ]
        .filter(Boolean)
        .join('\n'),
      copyAllBtn
    )
  );
  subjectRow.appendChild(copyAllBtn);
  header.appendChild(subjectRow);

  const essentials = el('div', 'mp-essentials');
  renderCopyableField(essentials, 'From', email.from);
  if (email.to) renderCopyableField(essentials, 'To', email.to);
  if (email.cc) renderCopyableField(essentials, 'Cc', email.cc);
  if (email.date) renderCopyableField(essentials, 'Date', email.date);
  header.appendChild(essentials);

  if (email.rawHeaders) {
    const toggle = el('button', 'mp-link-button', 'Show all headers');
    toggle.setAttribute('aria-expanded', 'false');
    const rawBox = el('pre', 'mp-raw-headers', email.rawHeaders);
    rawBox.hidden = true;
    toggle.addEventListener('click', () => {
      rawBox.hidden = !rawBox.hidden;
      toggle.textContent = rawBox.hidden ? 'Show all headers' : 'Hide all headers';
      toggle.setAttribute('aria-expanded', String(!rawBox.hidden));
    });
    header.appendChild(toggle);
    header.appendChild(rawBox);
  }
  root.appendChild(header);

  if (email.attachments.length) {
    const strip = el('div', 'mp-attachments');
    strip.setAttribute('role', 'list');
    email.attachments.forEach((att, index) => {
      const chip = el('div', att.isSignature ? 'mp-chip mp-chip-signature' : 'mp-chip');
      chip.setAttribute('role', 'listitem');
      chip.appendChild(el('span', 'mp-chip-name', att.isSignature ? `🔏 Digital signature (${att.name})` : att.name));
      chip.appendChild(el('span', 'mp-chip-size', formatSize(att.size)));

      // A signature part isn't verified (no trust-chain/certificate checking anywhere in
      // this codebase) and isn't a nested message -- Save is still offered so a user can
      // keep the raw signature for their own records, but View never applies to it.
      const saveBtn = el('button', 'mp-chip-btn', '⬇ Save');
      saveBtn.addEventListener('click', () => vscode.postMessage({ type: 'saveAttachment', index }));
      chip.appendChild(saveBtn);

      if (att.isNestedMessage) {
        const viewBtn = el('button', 'mp-chip-btn', '👁 View');
        viewBtn.addEventListener('click', () => vscode.postMessage({ type: 'openAttachment', index }));
        chip.appendChild(viewBtn);
      }
      strip.appendChild(chip);
    });
    root.appendChild(strip);
  }

  const hasHtml = !!email.bodyHtml;
  const hasText = !!email.bodyText;

  const toggleBar = el('div', 'mp-toggle-bar');
  toggleBar.setAttribute('role', 'tablist');
  const htmlTab = el('button', 'mp-tab', 'HTML');
  htmlTab.setAttribute('role', 'tab');
  htmlTab.setAttribute('aria-selected', 'false');
  const textTab = el('button', 'mp-tab', 'Plain text');
  textTab.setAttribute('role', 'tab');
  textTab.setAttribute('aria-selected', 'false');
  if (hasHtml) toggleBar.appendChild(htmlTab);
  if (hasText) toggleBar.appendChild(textTab);
  if (hasHtml || hasText) root.appendChild(toggleBar);

  const bodyContainer = el('div', 'mp-body');
  root.appendChild(bodyContainer);

  let iframe: HTMLIFrameElement | undefined;
  function showHtml(): void {
    bodyContainer.innerHTML = '';
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.className = 'mp-body-frame';
      iframe.setAttribute('sandbox', '');
      iframe.title = 'Email body';
      let sanitized = sanitizeHtmlBody(email.bodyHtml || '');
      if (collapseQuotedText) {
        sanitized = wrapBlockquotes(sanitized);
      }
      iframe.srcdoc = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{font-family:sans-serif;background:#ffffff;color:#111111;padding:12px;}details.mp-quote-details{margin-top:8px;}summary.mp-quote-summary{cursor:pointer;color:#555;}summary.mp-quote-summary:focus-visible{outline:2px solid #005fb8;outline-offset:2px;}</style></head><body>${sanitized}</body></html>`;
    }
    bodyContainer.appendChild(iframe);
    htmlTab.classList.add('active');
    htmlTab.setAttribute('aria-selected', 'true');
    textTab.classList.remove('active');
    textTab.setAttribute('aria-selected', 'false');
  }
  function showText(): void {
    bodyContainer.innerHTML = '';
    const text = email.bodyText || '';
    const markerIndex = collapseQuotedText ? findQuoteMarkerIndex(text) : undefined;

    if (markerIndex === undefined) {
      bodyContainer.appendChild(el('pre', 'mp-body-text', text));
    } else {
      bodyContainer.appendChild(el('pre', 'mp-body-text', text.slice(0, markerIndex)));
      const toggle = el('button', 'mp-link-button', 'Show quoted text');
      toggle.setAttribute('aria-expanded', 'false');
      const quotedBox = el('pre', 'mp-body-text', text.slice(markerIndex));
      quotedBox.hidden = true;
      toggle.addEventListener('click', () => {
        quotedBox.hidden = !quotedBox.hidden;
        toggle.textContent = quotedBox.hidden ? 'Show quoted text' : 'Hide quoted text';
        toggle.setAttribute('aria-expanded', String(!quotedBox.hidden));
      });
      bodyContainer.appendChild(toggle);
      bodyContainer.appendChild(quotedBox);
    }
    textTab.classList.add('active');
    textTab.setAttribute('aria-selected', 'true');
    htmlTab.classList.remove('active');
    htmlTab.setAttribute('aria-selected', 'false');
  }

  htmlTab.addEventListener('click', showHtml);
  textTab.addEventListener('click', showText);

  if (hasHtml) {
    showHtml();
  } else if (hasText) {
    showText();
  } else if (email.isOpaqueSmime) {
    bodyContainer.appendChild(
      el('div', 'mp-empty', 'This message is S/MIME-protected (encrypted or opaquely signed) and can’t be processed.')
    );
  } else {
    bodyContainer.appendChild(el('div', 'mp-empty', 'This message has no renderable body.'));
  }
}

window.addEventListener('message', (event: MessageEvent<InitMessage>) => {
  const message = event.data;
  if (message.type !== 'init') return;

  root.innerHTML = '';
  if (message.unsupported) {
    renderUnsupported();
  } else if (message.error) {
    renderError(message.error);
  } else if (message.email) {
    renderEmail(message.email, message.collapseQuotedText);
  }
});

vscode.postMessage({ type: 'ready' });
