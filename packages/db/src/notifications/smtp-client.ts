import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

/**
 * Minimal, dependency-free SMTP client.
 *
 * The whole platform must stay self-hostable with no mandatory paid service and
 * no unnecessary dependency (cost policy). Sending mail is a well-defined text
 * protocol, so rather than pull in a mailer we speak it directly over Node's own
 * `net`/`tls`. This supports what a client's mailbox (Hostinger, Gmail, a VPS
 * Postfix, …) actually needs:
 *
 *   - implicit TLS (port 465) or STARTTLS upgrade (port 587 / 25),
 *   - AUTH LOGIN and AUTH PLAIN,
 *   - a MIME multipart/alternative body (plain text + branded HTML),
 *   - correct CRLF framing, dot-stuffing and header-injection guards.
 *
 * It is intentionally small: one message per connection, then QUIT. Higher-level
 * batching/pooling is unnecessary for the DB-backed queue, which sends one job at
 * a time.
 */

const CRLF = '\r\n';

export interface SmtpConfig {
  host: string;
  port: number;
  /** true → implicit TLS from the first byte (465). false → plaintext, upgraded via STARTTLS when offered. */
  secure: boolean;
  user?: string;
  pass?: string;
  /** Reject invalid/self-signed server certs. Default true; set false only for a known self-signed host. */
  rejectUnauthorized?: boolean;
  /** Per-step socket timeout. Default 15s. */
  timeoutMs?: number;
}

export interface SmtpMail {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string | null;
}

export interface SmtpSendResult {
  messageId: string;
  /** The final 2xx line from the server after the message was accepted. */
  response: string;
}

class SmtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmtpError';
  }
}

interface SmtpReply {
  code: number;
  text: string;
}

/**
 * Wraps the active stream (plain socket, then possibly a TLS socket after
 * STARTTLS) and turns the byte stream into ordered, awaitable SMTP replies.
 */
class SmtpConnection {
  private stream: net.Socket | tls.TLSSocket;
  private buffer = '';
  /** Parsed replies that arrived before a reader awaited them (e.g. the greeting). */
  private replies: SmtpReply[] = [];
  private waiters: { resolve: (r: SmtpReply) => void; reject: (e: Error) => void }[] = [];
  private fatal: Error | null = null;
  private readonly timeoutMs: number;

  constructor(stream: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.stream = stream;
    this.timeoutMs = timeoutMs;
    this.attach();
  }

  private attach(): void {
    this.stream.setEncoding('utf8');
    this.stream.on('data', (chunk: string) => this.onData(chunk));
    this.stream.on('error', (err: Error) => this.onFatal(err));
    this.stream.on('close', () => this.onFatal(new SmtpError('Connection closed by server.')));
  }

  /** Swap to the TLS-upgraded socket after STARTTLS. */
  rebind(stream: tls.TLSSocket): void {
    this.stream.removeAllListeners('data');
    this.stream.removeAllListeners('error');
    this.stream.removeAllListeners('close');
    this.stream = stream;
    this.attach();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let block = this.takeReply();
    while (block) {
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(block);
      else this.replies.push(block);
      block = this.takeReply();
    }
  }

  /** Consume one complete reply (through its final "NNN " line) from the buffer, or return null. */
  private takeReply(): SmtpReply | null {
    const lines: string[] = [];
    let rest = this.buffer;
    for (;;) {
      const nl = rest.indexOf(CRLF);
      if (nl === -1) return null; // wait for more bytes
      const line = rest.slice(0, nl);
      if (!/^\d{3}[ -]/.test(line)) {
        // Not an SMTP reply line — drop it defensively and stop.
        this.buffer = rest.slice(nl + CRLF.length);
        return null;
      }
      lines.push(line);
      rest = rest.slice(nl + CRLF.length);
      if (line[3] === ' ') {
        this.buffer = rest;
        return { code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join('\n') };
      }
    }
  }

  private onFatal(err: Error): void {
    if (this.fatal) return;
    this.fatal = err;
    for (const w of this.waiters.splice(0)) w.reject(err);
  }

  /** Await the next SMTP reply (returning a buffered one if it already arrived). */
  read(): Promise<SmtpReply> {
    const ready = this.replies.shift();
    if (ready) return Promise.resolve(ready);
    if (this.fatal) return Promise.reject(this.fatal);
    return new Promise<SmtpReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(entry);
        if (i !== -1) this.waiters.splice(i, 1);
        reject(new SmtpError('Timed out waiting for the mail server.'));
      }, this.timeoutMs);
      const entry = {
        resolve: (r: SmtpReply) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.waiters.push(entry);
    });
  }

  write(data: string): void {
    this.stream.write(data);
  }

  /** Send a command line and assert the reply code is in `expected`. */
  async command(line: string | null, expected: number[]): Promise<SmtpReply> {
    if (line !== null) this.write(line + CRLF);
    const reply = await this.read();
    if (!expected.includes(reply.code)) {
      throw new SmtpError(`SMTP ${line ? line.split(' ')[0] : 'greeting'} failed: ${reply.code} ${reply.text.replace(/\n/g, ' ')}`);
    }
    return reply;
  }

  get socket(): net.Socket | tls.TLSSocket {
    return this.stream;
  }
}

function stripHeader(value: string): string {
  // Prevent header injection: no CR/LF in a header value.
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function formatAddress(email: string, name?: string): string {
  const addr = stripHeader(email);
  if (!name) return `<${addr}>`;
  const clean = stripHeader(name).replace(/"/g, '');
  return `"${clean}" <${addr}>`;
}

function encodeSubject(subject: string): string {
  const clean = stripHeader(subject);
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function base64Body(text: string): string {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  // Wrap at 76 chars per RFC 2045.
  return (b64.match(/.{1,76}/g) ?? []).join(CRLF);
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? 'localhost' : email.slice(at + 1) || 'localhost';
}

/** Build the RFC 5322 message (headers + MIME body). Always CRLF, always base64 parts. */
export function buildMimeMessage(mail: SmtpMail, messageId: string): string {
  const headers: string[] = [];
  headers.push(`From: ${formatAddress(mail.from, mail.fromName)}`);
  headers.push(`To: ${formatAddress(mail.to, mail.toName)}`);
  if (mail.replyTo) headers.push(`Reply-To: <${stripHeader(mail.replyTo)}>`);
  headers.push(`Subject: ${encodeSubject(mail.subject)}`);
  headers.push(`Message-ID: <${messageId}>`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push('MIME-Version: 1.0');

  const html = mail.html && mail.html.trim() ? mail.html : null;

  let body: string;
  if (html) {
    const boundary = `_bp_${randomBytes(12).toString('hex')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body =
      `--${boundary}${CRLF}` +
      `Content-Type: text/plain; charset=utf-8${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      `${base64Body(mail.text)}${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Type: text/html; charset=utf-8${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      `${base64Body(html)}${CRLF}` +
      `--${boundary}--${CRLF}`;
  } else {
    headers.push(`Content-Type: text/plain; charset=utf-8`);
    headers.push(`Content-Transfer-Encoding: base64`);
    body = `${base64Body(mail.text)}${CRLF}`;
  }

  return `${headers.join(CRLF)}${CRLF}${CRLF}${body}`;
}

/** Dot-stuff a DATA payload: any line beginning with '.' gets an extra leading '.'. */
function dotStuff(payload: string): string {
  return payload
    .split(CRLF)
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);
}

function connect(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  const timeoutMs = config.timeoutMs ?? 15_000;
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    if (config.secure) {
      const socket = tls.connect(
        { host: config.host, port: config.port, servername: config.host, rejectUnauthorized: config.rejectUnauthorized ?? true },
        () => resolve(socket),
      );
      socket.setTimeout(timeoutMs, () => socket.destroy(new SmtpError('Connection timed out.')));
      socket.once('error', onError);
    } else {
      const socket = net.connect({ host: config.host, port: config.port }, () => resolve(socket));
      socket.setTimeout(timeoutMs, () => socket.destroy(new SmtpError('Connection timed out.')));
      socket.once('error', onError);
    }
  });
}

async function ehlo(conn: SmtpConnection, hostname: string): Promise<string> {
  const reply = await conn.command(`EHLO ${hostname}`, [250]);
  return reply.text.toUpperCase();
}

/** Connect, authenticate, send one message, QUIT. Resolves with the message id on 2xx acceptance. */
export async function sendSmtpMail(config: SmtpConfig, mail: SmtpMail): Promise<SmtpSendResult> {
  const timeoutMs = config.timeoutMs ?? 15_000;
  const raw = await connect(config);
  const conn = new SmtpConnection(raw, timeoutMs);
  const clientName = domainOf(mail.from);

  try {
    await conn.command(null, [220]); // greeting
    let caps = await ehlo(conn, clientName);

    // STARTTLS upgrade on a plaintext connection when the server offers it.
    if (!config.secure && caps.includes('STARTTLS')) {
      await conn.command('STARTTLS', [220]);
      const secured = tls.connect({
        socket: conn.socket as net.Socket,
        servername: config.host,
        rejectUnauthorized: config.rejectUnauthorized ?? true,
      });
      await new Promise<void>((resolve, reject) => {
        secured.once('secureConnect', () => resolve());
        secured.once('error', reject);
      });
      conn.rebind(secured);
      caps = await ehlo(conn, clientName); // re-greet over TLS
    }

    // Authenticate if credentials are configured.
    if (config.user && config.pass) {
      if (caps.includes('AUTH') && caps.includes('LOGIN')) {
        await conn.command('AUTH LOGIN', [334]);
        await conn.command(Buffer.from(config.user, 'utf8').toString('base64'), [334]);
        await conn.command(Buffer.from(config.pass, 'utf8').toString('base64'), [235]);
      } else {
        const token = Buffer.from(`\0${config.user}\0${config.pass}`, 'utf8').toString('base64');
        await conn.command(`AUTH PLAIN ${token}`, [235]);
      }
    }

    await conn.command(`MAIL FROM:<${stripHeader(mail.from)}>`, [250]);
    await conn.command(`RCPT TO:<${stripHeader(mail.to)}>`, [250, 251]);
    await conn.command('DATA', [354]);

    const messageId = `${randomBytes(16).toString('hex')}@${clientName}`;
    const message = dotStuff(buildMimeMessage(mail, messageId));
    conn.write(message);
    const accepted = await conn.command(`${CRLF}.`, [250]);

    // Best-effort QUIT — the message is already accepted at this point.
    try {
      await conn.command('QUIT', [221]);
    } catch {
      // ignore — server may just drop the connection
    }
    conn.socket.end();

    return { messageId, response: accepted.text.replace(/\n/g, ' ') };
  } catch (error) {
    conn.socket.destroy();
    throw error instanceof SmtpError ? error : new SmtpError((error as Error)?.message ?? 'SMTP send failed.');
  }
}
