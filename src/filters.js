/* ==========================================================
   Message filtering: decides whether a contact form submission looks serious.
   Pure functions with no database or network use (except checkDomain), so the rules are easy to read
   and tweak. worker.js calls these in this order:
     1. validateEmail      -> rejects invalid, fake and disposable addresses (visitor sees an error)
     2. checkDomain        -> asks DNS whether the email's domain can really receive mail
     3. scoreSubmission    -> adds up "suspicion points" for the name, email and message
   Score 0-2 = ok, 3-5 = review (alert is sent but marked), 6+ = spam (saved quietly, no alert).
   Nothing is ever thrown away: spam is still saved so you can check for false positives.
   ========================================================== */

export const MIN_MESSAGE_LENGTH = 10;   // shorter messages are rejected outright
export const REVIEW_AT = 3;             // score at which the alert is marked [Check]
export const SPAM_AT = 6;               // score at which a message is treated as spam

/* ---------- Email address lists (edit freely) ----------
   Throwaway-inbox providers. Not exhaustive (new ones appear constantly), but it stops the common ones. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org',
  'temp-mail.io', 'tempmailo.com', 'tempail.com', 'throwawaymail.com', 'yopmail.com', 'yopmail.net',
  'yopmail.fr', 'trashmail.com', 'trashmail.net', 'getnada.com', 'nada.email', 'maildrop.cc',
  'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com',
  'burnermail.io', 'spam4.me', 'mytemp.email', 'moakt.com', 'discard.email', 'discardmail.com',
  'spambox.us', 'mailcatch.com', 'inboxkitten.com', 'harakirimail.com', 'dropmail.me'
]);

/* Placeholder domains people type when they don't want to give a real address */
const FAKE_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'test.com', 'domain.com', 'yourdomain.com']);

const EMAIL_ERRORS = {
  format: "That email address doesn't look valid. Please check it and try again.",
  blocked: 'Please use a permanent email address (temporary inbox services are not accepted).'
};

/* ---------- 1. Email address check ----------
   Returns { ok: true, email, domain } with the address lower-cased, or { ok: false, error }. */
export function validateEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (email.length > 254 || at < 1) return { ok: false, error: EMAIL_ERRORS.format };

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  const localOk =
    local.length <= 64 &&
    /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) &&
    !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');

  const domainOk = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,20})$/.test(domain);

  if (!localOk || !domainOk) return { ok: false, error: EMAIL_ERRORS.format };

  // Check the domain and every parent of it (so sub.mailinator.com is caught too)
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.');
    if (DISPOSABLE_DOMAINS.has(d) || FAKE_DOMAINS.has(d)) return { ok: false, error: EMAIL_ERRORS.blocked };
  }

  return { ok: true, email, domain };
}

/* ---------- 2. Domain check (DNS) ----------
   Asks Cloudflare's public DNS whether the domain exists and accepts mail.
   'nxdomain' = the domain doesn't exist (reject); 'mx' = it takes mail (good);
   'no-mx' = exists but no mail server listed (suspicious); 'unknown' = lookup failed (ignored,
   so a DNS hiccup never blocks a real visitor). */
export async function checkDomain(domain) {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return 'unknown';
    const data = await res.json();
    if (data.Status === 3) return 'nxdomain';
    if (Array.isArray(data.Answer) && data.Answer.some(a => a.type === 15)) return 'mx';
    return 'no-mx';
  } catch {
    return 'unknown';
  }
}

/* ---------- 3. Scoring ----------
   Wording typical of spam and cold sales pitches. Each group counts once, however many words match.
   One match alone (say a real client mentioning SEO) only reaches "review", never "spam". */
const SPAM_PATTERNS = [
  { weight: 4, why: 'scam/adult/crypto wording',
    re: /\b(crypto(?:currency)?|bitcoin|forex|casino|betting|viagra|cialis|porn|escort|loan offer|investment opportunity|make money|passive income|get rich|lottery|you(?:'ve| have) won)\b/i },
  { weight: 3, why: 'SEO/marketing pitch',
    re: /\b(seo|backlinks?|link[- ]building|guest post(?:s|ing)?|domain authority|first page of google|rank(?:ing)? (?:#?1|first|higher)|google ranking|digital marketing)\b/i },
  { weight: 3, why: 'cold-outreach wording',
    re: /\b(we (?:can|will|would|are able to) (?:redesign|rebuild|improve|boost|increase|help you (?:get|grow|rank))|(?:increase|boost|grow) your (?:traffic|sales|ranking|revenue|business)|our (?:team|agency|company) (?:offers|provides|specializes|has)|(?:web ?site|web) (?:design|development) (?:services?|agency|company)|outsourc(?:e|ing)|offshore|white[- ]label)\b/i },
  { weight: 2, why: 'pushy wording',
    re: /\b(click here|limited time|act now|urgent(?:ly)?|congratulations|special offer|free trial|100% (?:free|guaranteed))\b/i }
];

export function scoreSubmission({ name, email, message, elapsedMs, mx }) {
  let score = 0;
  const reasons = [];
  const add = (points, why) => { score += points; reasons.push(`${why} (+${points})`); };

  // --- Message ---
  const links = (message.match(/(?:https?:\/\/|www\.)\S+/gi) || []).length;
  if (links >= 3) add(5, `${links} links`);
  else if (links === 2) add(3, '2 links');
  else if (links === 1) add(1, '1 link');

  for (const p of SPAM_PATTERNS) if (p.re.test(message)) add(p.weight, p.why);

  if (message.length < 25) add(1, 'very short message');
  if (/(.)\1{5,}/.test(message)) add(2, 'repeated characters');
  if (/[bcdfghjklmnpqrstvwxz]{7,}/i.test(message)) add(2, 'keyboard-mash text');

  const letters = (message.match(/\p{L}/gu) || []).length;
  if (message.length >= 20 && letters / message.length < 0.5) add(2, 'mostly symbols/numbers');
  const upper = (message.match(/\p{Lu}/gu) || []).length;
  if (letters >= 20 && upper / letters > 0.6) add(1, 'mostly capitals');
  if ((message.match(/[!$€£]/g) || []).length > 5) add(1, 'lots of !/$ symbols');

  // --- Name ---
  if (/https?:|www\.|@/i.test(name)) add(3, 'link or @ in name');
  if (name.length < 2) add(1, 'one-letter name');
  if (/^(test|asdf|qwerty|admin|user|name|none|na)$/i.test(name)) add(2, 'placeholder name');
  if ((name.match(/\d/g) || []).length >= 4) add(1, 'digits in name');

  // --- Email ---
  const local = email.split('@')[0];
  if ((local.match(/\d/g) || []).length >= 6) add(1, 'many digits in email');
  if (mx === 'no-mx') add(3, 'domain has no mail server');

  // --- Behaviour (how fast the form was filled in; 0 means the form was never focused) ---
  if (elapsedMs < 800) add(3, 'form filled instantly');
  else if (elapsedMs < 2000) add(2, 'form filled very quickly');

  const status = score >= SPAM_AT ? 'spam' : score >= REVIEW_AT ? 'review' : 'ok';
  return { score, reasons, status };
}
