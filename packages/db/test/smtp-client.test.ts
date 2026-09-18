import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { sendSmtpMail, buildMimeMessage } from '../src/notifications/smtp-client';
import { SmtpEmailProvider, emailConfigFromEnv, emailConfigStatus } from '../src/notifications/smtp-provider';

/**
 * These tests exercise the real SMTP client against an in-process mock SMTP server
 * — no network, no third party. The mock speaks just enough of the protocol
 * (greeting, EHLO, AUTH LOGIN, MAIL/RCPT/DATA, QUIT) to prove our client frames
 * commands, authenticates, and delivers a dot-stuffed message correctly.
 */

interface Captured {
  ehlo: string | null;
  user: string | null;
  pass: string | null;
  mailFrom: string | null;
  rcptTo: string | null;
  data: string | null;
  quit: boolean;
}

function startMockSmtp(): Promise<{ port: number; captured: Captured; close: () => Promise<void> }> {
  const captured: Captured = { ehlo: null, user: null, pass: null, mailFrom: null, rcptTo: null, data: null, quit: false };

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buf = '';
    let mode: 'cmd' | 'data' | 'auth-user' | 'auth-pass' = 'cmd';
    let dataLines: string[] = [];

    const send = (line: string) => socket.write(line + '\r\n');
    send('220 mock ESMTP ready');

    socket.on('data', (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);

        if (mode === 'data') {
          if (line === '.') {
            // Undo dot-stuffing on the captured payload.
            captured.data = dataLines.map((l) => (l.startsWith('..') ? l.slice(1) : l)).join('\r\n');
            dataLines = [];
            mode = 'cmd';
            send('250 2.0.0 OK: queued as MOCK123');
          } else {
            dataLines.push(line);
          }
          continue;
        }
        if (mode === 'auth-user') {
          captured.user = Buffer.from(line, 'base64').toString('utf8');
          mode = 'auth-pass';
          send('334 UGFzc3dvcmQ6'); // "Password:"
          continue;
        }
        if (mode === 'auth-pass') {
          captured.pass = Buffer.from(line, 'base64').toString('utf8');
          mode = 'cmd';
          send('235 2.7.0 Authentication successful');
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          captured.ehlo = line.slice(5).trim();
          send('250-mock hello');
          send('250-AUTH LOGIN PLAIN');
          send('250 SIZE 10485760');
        } else if (upper.startsWith('AUTH LOGIN')) {
          mode = 'auth-user';
          send('334 VXNlcm5hbWU6'); // "Username:"
        } else if (upper.startsWith('MAIL FROM')) {
          captured.mailFrom = line;
          send('250 2.1.0 OK');
        } else if (upper.startsWith('RCPT TO')) {
          captured.rcptTo = line;
          send('250 2.1.5 OK');
        } else if (upper === 'DATA') {
          mode = 'data';
          send('354 End data with <CR><LF>.<CR><LF>');
        } else if (upper === 'QUIT') {
          captured.quit = true;
          send('221 2.0.0 Bye');
          socket.end();
        } else {
          send('502 5.5.2 Command not recognized');
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({
        port,
        captured,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

let running: { close: () => Promise<void> } | null = null;
afterEach(async () => {
  if (running) await running.close();
  running = null;
});

describe('sendSmtpMail (against mock server)', () => {
  it('authenticates and delivers a multipart message', async () => {
    const mock = await startMockSmtp();
    running = mock;

    const res = await sendSmtpMail(
      { host: '127.0.0.1', port: mock.port, secure: false, user: 'bookings@biz.test', pass: 's3cret', timeoutMs: 5000 },
      {
        from: 'bookings@biz.test',
        fromName: 'Aurora Spa',
        to: 'mia@example.com',
        subject: 'Your booking is confirmed',
        text: 'Hi Mia,\n\nConfirmed.',
        html: '<p>Hi Mia</p>',
      },
    );

    expect(res.messageId).toContain('@biz.test');
    expect(mock.captured.user).toBe('bookings@biz.test');
    expect(mock.captured.pass).toBe('s3cret');
    expect(mock.captured.mailFrom).toContain('<bookings@biz.test>');
    expect(mock.captured.rcptTo).toContain('<mia@example.com>');
    expect(mock.captured.quit).toBe(true);

    const data = mock.captured.data ?? '';
    expect(data).toContain('From: "Aurora Spa" <bookings@biz.test>');
    expect(data).toContain('To: <mia@example.com>');
    expect(data).toContain('Subject: Your booking is confirmed');
    expect(data).toContain('multipart/alternative');
    expect(data).toContain('text/plain');
    expect(data).toContain('text/html');
    // Message-ID line is present.
    expect(data).toMatch(/Message-ID: <[0-9a-f]+@biz\.test>/);
  });

  it('sends a text-only message without auth', async () => {
    const mock = await startMockSmtp();
    running = mock;

    await sendSmtpMail(
      { host: '127.0.0.1', port: mock.port, secure: false, timeoutMs: 5000 },
      { from: 'no-reply@biz.test', to: 'x@example.com', subject: 'Hi', text: 'Plain body' },
    );

    expect(mock.captured.user).toBeNull(); // no AUTH attempted
    expect(mock.captured.data).toContain('text/plain');
    expect(mock.captured.data).not.toContain('multipart/alternative');
  });

  it('rejects a bad hostname quickly', async () => {
    await expect(
      sendSmtpMail({ host: '127.0.0.1', port: 1, secure: false, timeoutMs: 2000 }, { from: 'a@b.test', to: 'c@d.test', subject: 's', text: 't' }),
    ).rejects.toBeTruthy();
  });
});

describe('SmtpEmailProvider', () => {
  it('maps a successful send to a SendResult with a provider id', async () => {
    const mock = await startMockSmtp();
    running = mock;
    const provider = new SmtpEmailProvider(
      { host: '127.0.0.1', port: mock.port, secure: false, timeoutMs: 5000 },
      { from: 'bookings@biz.test', fromName: 'Biz' },
    );
    const result = await provider.send({
      channel: 'EMAIL',
      recipient: 'mia@example.com',
      subject: 'Hi',
      body: 'Text body',
      html: '<p>HTML body</p>',
      event: 'BOOKING_ACCEPTED',
      bookingId: 'b1',
    });
    expect(result.ok).toBe(true);
    expect(result.providerMessageId).toBeTruthy();
  });

  it('fails cleanly with no recipient', async () => {
    const provider = new SmtpEmailProvider({ host: '127.0.0.1', port: 25, secure: false }, { from: 'x@y.test' });
    const result = await provider.send({
      channel: 'EMAIL',
      recipient: '',
      subject: 's',
      body: 'b',
      event: 'BOOKING_CREATED',
      bookingId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/recipient/i);
  });
});

describe('buildMimeMessage', () => {
  it('dot-stuffing target: a body line starting with a dot is escapable', () => {
    const msg = buildMimeMessage({ from: 'a@b.test', to: 'c@d.test', subject: 's', text: 'ok' }, 'id@b.test');
    expect(msg).toContain('Content-Transfer-Encoding: base64');
    expect(msg).toContain('MIME-Version: 1.0');
  });

  it('encodes a non-ascii subject as RFC 2047', () => {
    const msg = buildMimeMessage({ from: 'a@b.test', to: 'c@d.test', subject: 'Café ☕', text: 'ok' }, 'id@b.test');
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it('strips CRLF from headers to prevent injection', () => {
    const msg = buildMimeMessage(
      { from: 'a@b.test', to: 'c@d.test', subject: 'Hi\r\nBcc: evil@x.test', text: 'ok' },
      'id@b.test',
    );
    // The CRLF is flattened into the subject value, so no standalone Bcc header line exists.
    expect(msg).not.toMatch(/\r\nBcc:/);
    expect(msg).toContain('Subject: Hi Bcc: evil@x.test');
  });
});

describe('emailConfigFromEnv', () => {
  it('returns null when SMTP is not configured', () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(emailConfigFromEnv({ SMTP_HOST: 'smtp.test' })).toBeNull(); // missing EMAIL_FROM
  });

  it('builds config with implicit TLS default for port 465', () => {
    const resolved = emailConfigFromEnv({ SMTP_HOST: 'smtp.test', SMTP_PORT: '465', EMAIL_FROM: 'a@b.test' });
    expect(resolved?.config.secure).toBe(true);
    expect(resolved?.config.port).toBe(465);
  });

  it('defaults to STARTTLS (secure=false) on 587 and reads identity', () => {
    const resolved = emailConfigFromEnv({
      SMTP_HOST: 'smtp.test',
      SMTP_PORT: '587',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      EMAIL_FROM: 'a@b.test',
      EMAIL_FROM_NAME: 'Biz',
      EMAIL_REPLY_TO: 'reply@b.test',
    });
    expect(resolved?.config.secure).toBe(false);
    expect(resolved?.config.user).toBe('u');
    expect(resolved?.identity.fromName).toBe('Biz');
    expect(resolved?.identity.replyTo).toBe('reply@b.test');
  });

  it('status never exposes the password', () => {
    const status = emailConfigStatus({ SMTP_HOST: 'smtp.test', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'secret', EMAIL_FROM: 'a@b.test' });
    expect(status.configured).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(JSON.stringify(status)).not.toContain('secret');
  });
});
