import { describe, it, expect } from 'vitest';
import { escapeHtml, textToHtml, renderBrandedEmail, renderEmailText } from './email-layout';

describe('escapeHtml', () => {
  it('escapes all five significant characters', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jo'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;');
  });
});

describe('textToHtml', () => {
  it('splits blank-line paragraphs and keeps single newlines as <br>', () => {
    const html = textToHtml('Hi Mia,\nWelcome.\n\nSee you soon.');
    expect(html).toContain('<p style="margin:0 0 16px;">Hi Mia,<br />Welcome.</p>');
    expect(html).toContain('<p style="margin:0 0 16px;">See you soon.</p>');
  });

  it('escapes content so template values cannot inject markup', () => {
    const html = textToHtml('Hello <script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('linkifies a bare url without breaking escaping', () => {
    const html = textToHtml('Manage: https://ex.com/a?b=1&c=2');
    expect(html).toContain('<a href="https://ex.com/a?b=1&amp;c=2"');
    expect(html).toContain('>https://ex.com/a?b=1&amp;c=2</a>');
  });

  it('returns empty string for empty input', () => {
    expect(textToHtml('   ')).toBe('');
  });
});

describe('renderBrandedEmail', () => {
  it('includes the business name and the body', () => {
    const html = renderBrandedEmail({ businessName: 'Aurora Spa', bodyText: 'Hi there,\n\nConfirmed.' });
    expect(html).toContain('Aurora Spa');
    expect(html).toContain('Confirmed.');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('renders a manage button only when a valid https url is given', () => {
    const withUrl = renderBrandedEmail({ businessName: 'X', bodyText: 'b', manageUrl: 'https://ex.com/m' });
    expect(withUrl).toContain('href="https://ex.com/m"');
    expect(withUrl).toContain('Manage booking');

    const noUrl = renderBrandedEmail({ businessName: 'X', bodyText: 'b' });
    expect(noUrl).not.toContain('Manage booking');

    const badUrl = renderBrandedEmail({ businessName: 'X', bodyText: 'b', manageUrl: 'javascript:alert(1)' });
    expect(badUrl).not.toContain('javascript:');
    expect(badUrl).not.toContain('Manage booking');
  });

  it('escapes an injection attempt in the business name', () => {
    const html = renderBrandedEmail({ businessName: '<script>x</script>', bodyText: 'b' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('uses a valid accent hex and ignores an invalid one', () => {
    const ok = renderBrandedEmail({ businessName: 'X', bodyText: 'b', accentColor: '#ff0000' });
    expect(ok).toContain('#ff0000');
    const bad = renderBrandedEmail({ businessName: 'X', bodyText: 'b', accentColor: 'red;}<script>' });
    expect(bad).not.toContain('<script>');
    expect(bad).toContain('#4f46e5'); // falls back to default
  });

  it('embeds a hidden preheader from the first non-empty line', () => {
    const html = renderBrandedEmail({ businessName: 'X', bodyText: '\n\nYour visit is confirmed\nmore' });
    expect(html).toContain('Your visit is confirmed');
  });
});

describe('renderEmailText', () => {
  it('appends the manage link to the plain-text part', () => {
    const text = renderEmailText({ bodyText: 'Hello', manageUrl: 'https://ex.com/m' });
    expect(text).toBe('Hello\n\nManage booking: https://ex.com/m');
  });

  it('returns the body unchanged with no url', () => {
    expect(renderEmailText({ bodyText: 'Hello' })).toBe('Hello');
  });
});
