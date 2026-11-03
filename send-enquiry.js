// Cloudflare Worker entry point for www.techandsupport.com
// Handles POST /send-enquiry (contact form -> Resend email). Everything else is served from static assets.
// Deploy with: npx wrangler deploy
// Required secret:  RESEND_API_KEY   (Worker > Settings > Variables and Secrets > Add > Secret)
// Optional variables: TO_EMAIL, FROM_EMAIL (defaults below)

const DEFAULT_TO = 'info@techandsupport.com';
const DEFAULT_FROM = 'Tech and Support Website <no-reply@techandsupport.com>';
const MAX_BODY_BYTES = 25000;
const PREFERRED_CONTACT = ['Phone', 'Email', 'WhatsApp'];

const SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

const json = (value, status = 200, extra = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra },
  });

const escapeHtml = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plain HTML result page for visitors who submit without JavaScript.
const page = (title, message, status) =>
  new Response(
    `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${escapeHtml(title)} | Tech and Support</title>` +
      `<style>body{font-family:Arial,sans-serif;background:#071a33;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}` +
      `a{color:#19c3e6}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>` +
      `<p><a href="/contact">Back to contact page</a></p></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } }
  );

// Strip control characters and cap length. oneLine also removes line breaks (prevents header/subject injection).
const clean = (value, max = 2000) =>
  (typeof value === 'string' ? value : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r/g, '').trim().slice(0, max);
const oneLine = (value, max = 200) => clean(value, max).replace(/\n+/g, ' ');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== '/send-enquiry' && url.pathname !== '/send-enquiry/') {
      return env.ASSETS.fetch(request);
    }

    const wantsJson = (request.headers.get('accept') || '').includes('application/json');
    const fail = (message, status) =>
      wantsJson ? json({ ok: false, error: message }, status) : page('Could not send your request', message, status);

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed.' }, 405, { allow: 'POST' });
    }

    // Same-origin only.
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail('Invalid request origin.', 403);
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return fail('Invalid request origin.', 403);

    const type = (request.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('multipart/form-data') && !type.includes('application/x-www-form-urlencoded')) {
      return fail('Unsupported form format.', 415);
    }

    const size = Number(request.headers.get('content-length') || 0);
    if (!size) return fail('Invalid form submission.', 411);
    if (size > MAX_BODY_BYTES) return fail('Request too large.', 413);

    let form;
    try {
      form = await request.formData();
    } catch {
      return fail('Invalid form submission.', 400);
    }

    // Honeypot: real visitors never fill this field. Pretend success so bots learn nothing.
    if (clean(form.get('website'))) {
      return wantsJson ? json({ ok: true }) : page('Thank you', 'Your request has been submitted successfully.', 200);
    }

    const name = oneLine(form.get('name'), 120);
    const company = oneLine(form.get('company'), 160);
    const email = oneLine(form.get('email'), 160);
    const phone = oneLine(form.get('phone'), 40);
    const requirement = oneLine(form.get('requirement'), 80);
    const companySize = oneLine(form.get('size'), 60);
    const environment = clean(form.get('env'), 500);
    const preferredRaw = oneLine(form.get('pcm'), 20);
    const preferred = PREFERRED_CONTACT.includes(preferredRaw) ? preferredRaw : '';
    const message = clean(form.get('message'), 4000);

    if (!name || !EMAIL_RE.test(email)) {
      return fail('Please enter your name and a valid email address.', 422);
    }
    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY secret is not configured');
      return fail('Email service is not configured. Please contact us directly.', 503);
    }

    const to = env.TO_EMAIL || DEFAULT_TO;
    const from = env.FROM_EMAIL || DEFAULT_FROM;
    const subject = `Website enquiry: ${requirement || 'General'} - ${company || name}`.slice(0, 200);
    const body =
      `New enquiry from Tech and Support website\n\n` +
      `Name: ${name}\nCompany: ${company}\nBusiness email: ${email}\nPhone: ${phone}\n` +
      `Requirement: ${requirement}\nCompany size: ${companySize}\nCurrent IT environment: ${environment}\n` +
      `Preferred contact method: ${preferred}\n\nMessage:\n${message}\n\nTime: ${new Date().toISOString()}\n`;

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], reply_to: email, subject, text: body }),
      });
      if (response.ok) {
        return wantsJson ? json({ ok: true }) : page('Thank you', 'Your request has been submitted successfully.', 200);
      }
      // Details go to the Worker log only, never to the visitor.
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      console.error('Resend rejected enquiry', response.status, detail);
      return fail('Email delivery failed. Please email info@techandsupport.com directly.', 502);
    } catch (error) {
      console.error('Resend request failed', String(error));
      return fail('Email service unavailable. Please try again later.', 502);
    }
  },
};
