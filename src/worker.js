/* ==========================================================
   Contact form server code: POST /api/contact
   This runs on Cloudflare's servers (not in the visitor's browser). wrangler.toml sets
   run_worker_first lists /api/* and /admin (see wrangler.toml), so only those requests reach this file;
   every other request (the pages, CSS and JS in public/) is served directly as static files.
   /admin is forwarded to the ASP.NET admin app by src/adminProxy.js.

   For each message it: checks the fields, filters out fake/spam senders (src/filters.js), saves it
   to the D1 database (env.DB) and emails you an alert (src/email.js).
   ========================================================== */

import { MIN_MESSAGE_LENGTH, validateEmail, checkDomain, scoreSubmission } from './filters.js';
import { sendAlert } from './email.js';
import { handleAdmin } from './adminProxy.js';

const MAX_PER_HOUR = 5;   // messages allowed per visitor (by hashed IP) per hour

const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers });

/* A one-way hash of the visitor's IP, used only for rate limiting. The raw IP is never stored.
   Returns null when there is no IP (e.g. local testing), which skips the rate limit. */
async function hashIp(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`${env.IP_SALT || 'glur'}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function handleContact(request, env, ctx) {
  // 1. Read the JSON body (reject anything that isn't valid JSON)
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  // 2. Honeypot: real visitors never see this field, so a value means a bot.
  //    Reply "ok" so the bot thinks it worked, but save nothing.
  if (body.website) return json({ ok: true });

  // 3. Clean and check the basics. Never trust the browser: the checks in the page can be bypassed.
  const name = String(body.name || '').trim();
  const message = String(body.message || '').trim();
  const elapsedMs = Math.max(0, Number(body.elapsed) || 0);

  if (!name || !message) return json({ ok: false, error: 'Please fill in every field.' }, 400);
  if (name.length > 100 || message.length > 5000) {
    return json({ ok: false, error: 'Your name or message is too long.' }, 400);
  }
  if (message.length < MIN_MESSAGE_LENGTH) {
    return json({ ok: false, error: 'Please write a little more so I know how to help.' }, 400);
  }

  // 4. Email address: format, throwaway/fake domains, then does the domain exist? (visitor sees the error)
  const emailCheck = validateEmail(body.email);
  if (!emailCheck.ok) return json({ ok: false, error: emailCheck.error }, 400);
  const { email, domain } = emailCheck;

  const mx = await checkDomain(domain);
  if (mx === 'nxdomain') {
    return json({ ok: false, error: "That email address's domain doesn't seem to exist. Please check it." }, 400);
  }

  try {
    // 5. Rate limit and duplicates (looked up in the database)
    const ipHash = await hashIp(request, env);
    if (ipHash) {
      const recent = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')")
        .bind(ipHash).first();
      if (recent && recent.n >= MAX_PER_HOUR) {
        return json({ ok: false, error: 'Too many messages in a short time. Please try again later.' }, 429);
      }
    }

    const duplicate = await env.DB
      .prepare("SELECT 1 FROM messages WHERE email = ? AND message = ? AND created_at > datetime('now', '-1 day') LIMIT 1")
      .bind(email, message).first();
    if (duplicate) return json({ ok: true });   // already received; don't save or alert twice

    // 6. Score the submission: ok / review / spam
    const { score, reasons, status } = scoreSubmission({ name, email, message, elapsedMs, mx });

    // 7. Save it. The ? placeholders and .bind() keep the values separate from the SQL,
    //    which is what prevents SQL injection. Never build the SQL string from the values.
    const saved = await env.DB
      .prepare('INSERT INTO messages (name, email, message, status, score, reasons, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(name, email, message, status, score, reasons.join('; '), ipHash)
      .run();
    const id = saved.meta.last_row_id;

    // 8. Email you about it (spam is saved but not emailed). waitUntil lets the visitor get their
    //    reply straight away while the email finishes sending in the background.
    if (status !== 'spam') {
      ctx.waitUntil(
        sendAlert(env, { id, name, email, message, status, score, reasons }).then(async sent => {
          if (sent) await env.DB.prepare('UPDATE messages SET alerted = 1 WHERE id = ?').bind(id).run();
        }).catch(err => console.error('Alert follow-up failed:', err))
      );
    }

    // Spam gets the same "ok" reply, so spammers can't tell they were filtered
    return json({ ok: true });
  } catch (err) {
    console.error('Contact form failed:', err);
    return json({ ok: false, error: 'Could not save message' }, 500);
  }
}

/* ---------- Site content: GET /api/technologies, /api/projects, /api/projects/<slug> ----------
   The pages' content is edited in the ASP.NET admin app. Every admin save writes a JSON copy of the public
   content to Azure Blob storage (technologies.json, projects.json, project-<slug>.json). This Worker reads
   those files from the server side (env.SNAPSHOT_BASE), so visitors never touch the database and the
   browser only ever talks to glursolutions.com (no CORS, and the storage account can stay private to the browser).

   Answers are kept in Cloudflare's cache: fresh for 60 seconds, then re-read from Blob storage. If storage
   is unreachable, the last good answer (up to a day old) is served instead. Only these exact paths are
   mapped to files, nothing else. */
const CONTENT_PATH = /^\/api\/(technologies|projects(\/[A-Za-z0-9_-]{1,80})?)$/;
const FRESH_SECONDS = 60;
const KEEP_SECONDS = 86400;

// /api/technologies -> technologies.json, /api/projects -> projects.json, /api/projects/<slug> -> project-<slug>.json
const snapshotFile = pathname => {
  if (pathname === '/api/technologies') return 'technologies.json';
  if (pathname === '/api/projects') return 'projects.json';
  return `project-${pathname.slice('/api/projects/'.length)}.json`;
};

const contentResponse = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${FRESH_SECONDS}` }
  });

async function handleContent(request, env, ctx, pathname) {
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'GET' });
  if (!env.SNAPSHOT_BASE) return json({ ok: false, error: 'Content is not configured' }, 503);

  const cache = caches.default;
  const cacheKey = new Request(new URL(pathname, request.url).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  const ageSeconds = cached ? (Date.now() - Number(cached.headers.get('X-Cached-At') || 0)) / 1000 : Infinity;
  if (cached && ageSeconds < FRESH_SECONDS) return contentResponse(await cached.text());

  try {
    const origin = await fetch(`${env.SNAPSHOT_BASE}/${snapshotFile(pathname)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (origin.status === 404 || origin.status === 403) return json({ ok: false, error: 'Not found' }, 404);   // no saved copy for this name
    if (!origin.ok) { const e = new Error(`Storage answered ${origin.status}`); e.reason = `storage-status-${origin.status}`; throw e; }

    const body = await origin.text();
    ctx.waitUntil(cache.put(cacheKey, new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${KEEP_SECONDS}`,   // how long Cloudflare may keep it as the fallback copy
        'X-Cached-At': String(Date.now())
      }
    })));
    return contentResponse(body);
  } catch (err) {
    console.error('Content snapshot failed:', err);
    if (cached) return contentResponse(await cached.text());   // serve the last good copy
    // "reason" is only a short code (storage-status-500, timeout, network), never a message or address
    const reason = err.reason || (err.name === 'TimeoutError' ? 'timeout' : 'network');
    return json({ ok: false, error: 'Content is unavailable right now', reason }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // The admin area: forwarded to the ASP.NET app on Azure (needs a Cloudflare Access sign-in, then the app's own login)
    if (/^\/admin(\/|$)/i.test(pathname)) return handleAdmin(request, env);

    if (pathname === '/api/contact') {
      if (request.method === 'POST') return handleContact(request, env, ctx);
      return json({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    if (CONTENT_PATH.test(pathname)) return handleContent(request, env, ctx, pathname);

    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'Not found' }, 404);

    // Safety net: anything else is passed to the static files in public/
    return env.ASSETS.fetch(request);
  }
};
