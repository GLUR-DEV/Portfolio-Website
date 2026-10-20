/* ==========================================================
   Contact form endpoint: POST /api/contact
   Cloudflare Pages runs this file on its servers (not in the visitor's browser).
   The file path decides the URL: functions/api/contact.js -> /api/contact.
   It receives the form as JSON, checks it, and saves it to the D1 database.
   env.DB is the D1 binding declared in wrangler.toml.
   ========================================================== */

const json = (body, status = 200) => Response.json(body, { status });

export async function onRequestPost({ request, env }) {
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

// Any other method (GET, PUT...) on this URL is refused
export async function onRequest() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
