/**
 * Email presentation (pure, UI-independent, dependency-free).
 *
 * The dispatcher renders a template body to plain text; for the EMAIL channel we
 * wrap that text in a branded, responsive HTML shell here. Everything is inline
 * (email clients strip <style> and never load external CSS/fonts/images), so this
 * produces a single self-contained document that renders in Gmail/Outlook/Apple
 * Mail without any external asset — honouring the cost policy (no CDN, no tracker).
 *
 * Kept in core so the layout is testable and the same rules back a future preview.
 */

/** Escape the five HTML-significant characters. Never trust template output in markup. */
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Turn a plain-text body (blank-line-separated paragraphs, single newlines inside)
 * into escaped HTML paragraphs. Bare URLs become links. Used for the HTML part so a
 * text template still looks intentional in an HTML client.
 */
export function textToHtml(body: string): string {
  const normalised = String(body).replace(/\r\n/g, '\n').trim();
  if (!normalised) return '';
  return normalised
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split('\n').map((line) => linkify(escapeHtml(line)));
      return `<p style="margin:0 0 16px;">${lines.join('<br />')}</p>`;
    })
    .join('\n');
}

// Linkify bare http(s) URLs in already-escaped text. The URL cannot contain markup
// because the surrounding text was escaped first, so this only ever wraps safe chars.
const URL_RE = /(https?:\/\/[^\s<]+)/g;
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (url) => `<a href="${url}" style="color:#4f46e5;text-decoration:underline;">${url}</a>`);
}

export interface BrandedEmailInput {
  /** Business name — the header/wordmark and signature. */
  businessName: string;
  /** Rendered (variables already substituted) plain-text message body. */
  bodyText: string;
  /** Optional "Manage booking" magic-link URL — renders a button + a fallback line. */
  manageUrl?: string | null;
  /** Optional label for the button (defaults to "Manage booking"). */
  manageLabel?: string;
  /** Accent colour (hex) for the header rule and button. Defaults to indigo. */
  accentColor?: string;
  /** Hidden preheader shown as the inbox preview snippet. Defaults to the first line. */
  preheader?: string;
}

function firstLine(text: string): string {
  const line = String(text).replace(/\r\n/g, '\n').split('\n').find((l) => l.trim().length > 0);
  return (line ?? '').trim().slice(0, 160);
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * Build the full branded HTML email. Table-based layout with inline styles for
 * broad client support; a light background, a card, the business name, the body,
 * an optional call-to-action button, and a small footer.
 */
export function renderBrandedEmail(input: BrandedEmailInput): string {
  const accent = isHexColor(input.accentColor) ? input.accentColor : '#4f46e5';
  const business = escapeHtml(input.businessName || 'Booking');
  const preheader = escapeHtml(input.preheader ?? firstLine(input.bodyText));
  const bodyHtml = textToHtml(input.bodyText);
  const manageUrl = typeof input.manageUrl === 'string' && /^https?:\/\//.test(input.manageUrl) ? input.manageUrl : null;
  const manageLabel = escapeHtml(input.manageLabel || 'Manage booking');

  const button = manageUrl
    ? `
              <tr>
                <td style="padding:8px 0 4px;">
                  <a href="${manageUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-weight:600;font-size:14px;line-height:20px;text-decoration:none;padding:11px 20px;border-radius:8px;">${manageLabel}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:2px 0 0;font-size:12px;line-height:18px;color:#6b7280;">
                  Or paste this link into your browser:<br />
                  <a href="${manageUrl}" style="color:#6b7280;text-decoration:underline;word-break:break-all;">${manageUrl}</a>
                </td>
              </tr>`
    : '';

  // A single-line, minified-ish document keeps the wire size small; email clients
  // don't care about pretty-printing.
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${business}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #e5e7eb;overflow:hidden;">
            <tr>
              <td style="padding:22px 28px;border-bottom:1px solid #eef0f3;">
                <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#111827;">${business}</span>
                <span style="display:inline-block;width:26px;height:3px;border-radius:3px;background:${accent};vertical-align:middle;margin-left:10px;"></span>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:23px;color:#1f2937;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td>${bodyHtml}</td></tr>${button}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;border-top:1px solid #eef0f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;">
                You are receiving this because you have a booking with ${business}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text alternative: the rendered body, with the manage link appended so the
 * text part is self-contained for clients that show it.
 */
export function renderEmailText(input: { bodyText: string; manageUrl?: string | null; manageLabel?: string }): string {
  const body = String(input.bodyText).replace(/\r\n/g, '\n').trim();
  const manageUrl = typeof input.manageUrl === 'string' && /^https?:\/\//.test(input.manageUrl) ? input.manageUrl : null;
  if (!manageUrl) return body;
  const label = input.manageLabel || 'Manage booking';
  return `${body}\n\n${label}: ${manageUrl}`;
}
