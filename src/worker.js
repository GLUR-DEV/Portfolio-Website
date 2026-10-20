/* ==========================================================
   Contact form server code: POST /api/contact
   This runs on Cloudflare's servers (not in the visitor's browser). wrangler.toml sets
   run_worker_first = ["/api/*"], so only requests to /api/... reach this file; every other
   request (the pages, CSS and JS in public/) is served directly as static files.
   The form arrives as JSON, is checked here, then saved to the D1 database.
   env.DB is the D1 binding declared in wrangler.toml.
   ========================================================== */

const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers });

async function handleContact(request, env) {
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

  // 3. Clean and validate. Never trust the browser: the checks in the page can be bypassed.
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();

  const valid =
    name && email && message &&
    name.length <= 100 &&
    email.length <= 200 &&
    message.length <= 5000 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  if (!valid) return json({ ok: false, error: 'Invalid input' }, 400);

  // 4. Save it. The ? placeholders and .bind() keep the values separate from the SQL,
  //    which is what prevents SQL injection. Never build the SQL string from the values.
  try {
    await env.DB
      .prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)')
      .bind(name, email, message)
      .run();
  } catch (err) {
    console.error('D1 insert failed:', err);
    return json({ ok: false, error: 'Could not save message' }, 500);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/contact') {
      if (request.method === 'POST') return handleContact(request, env);
      return json({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    if (pathname.startsWith('/api/')) return json({ ok: false, error: 'Not found' }, 404);

    // Safety net: anything else is passed to the static files in public/
    return env.ASSETS.fetch(request);
  }
};
