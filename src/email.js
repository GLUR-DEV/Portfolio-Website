/* ==========================================================
   Email alert: sends you an email when a new message arrives.
   Uses the send_email binding (env.EMAIL) declared in wrangler.toml, so there is no third-party
   service or password. Replying to the alert replies straight to the visitor (Reply-To).
   Returns true if sent. It never throws, so a failed alert can't lose or break a saved message.
   ========================================================== */

// Removes line breaks and control characters so visitor text can't tamper with the subject line
const oneLine = text => String(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

export async function sendAlert(env, msg) {
  if (!env.EMAIL || !env.ALERT_TO || !env.ALERT_FROM) {
    console.warn('Email alert skipped: EMAIL binding or ALERT_TO/ALERT_FROM not configured');
    return false;
  }

  const flagged = msg.status === 'review';
  const subject = `${flagged ? '[Check] ' : ''}New message from ${oneLine(msg.name)}`.slice(0, 120);

  const lines = [
    'New message via glursolutions.com',
    '',
    `Name:  ${oneLine(msg.name)}`,
    `Email: ${msg.email}`,
    '',
    'Message:',
    msg.message,
    '',
    '---'
  ];
  if (flagged) {
    lines.push(`Flagged for review by the spam filter (score ${msg.score}): ${msg.reasons.join('; ')}`);
  }
  lines.push(`Saved in the database as message #${msg.id}. Reply to this email to answer ${oneLine(msg.name)} directly.`);

  try {
    await env.EMAIL.send({
      to: env.ALERT_TO,
      from: { email: env.ALERT_FROM, name: 'GLUR Solutions website' },
      replyTo: msg.email,
      subject,
      text: lines.join('\n')
    });
    return true;
  } catch (err) {
    console.error('Email alert failed:', err.code, err.message);
    return false;
  }
}
