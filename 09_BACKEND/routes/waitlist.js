const express = require('express');
const sheets = require('../sheets');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key');
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

// POST /api/waitlist — public, submits a new waitlist signup to the Google Sheet
router.post('/', async (req, res) => {
  const body = req.body || {};

  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const phone = str(body.phone);
  const city = str(body.city);
  const shareConsent = !!body.shareConsent;
  const privacyConsent = !!body.privacyConsent;

  if (!name || !email || !phone || !city) {
    return res.status(400).json({ error: 'Please fill in all required fields with a valid email.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please fill in all required fields with a valid email.' });
  }
  if (!shareConsent || !privacyConsent) {
    return res.status(400).json({ error: "Please confirm you're comfortable sharing these details and agree to the Privacy Policy." });
  }

  try {
    const exists = await sheets.findByEmail(email);
    if (exists) {
      return res.status(200).json({
        status: 'already_on_list',
        message: "You're already on the waitlist — we'll be in touch.",
      });
    }

    await sheets.appendRow({
      created_at: new Date().toISOString(),
      name,
      email,
      phone,
      city,
      practice_type: str(body.practiceType),
      experience: str(body.experience),
      client_volume: str(body.clientVolume),
      follow_up_method: str(body.followUpMethod),
      useful_feature: str(body.usefulFeature),
      trial_clients: str(body.trialClients),
      challenge: str(body.challenge),
      demo_interest: !!body.demoInterest,
      feedback: str(body.feedback),
      share_consent: shareConsent,
      privacy_consent: privacyConsent,
      utm_source: str(body.utm_source),
      utm_medium: str(body.utm_medium),
      utm_campaign: str(body.utm_campaign),
    });
  } catch (err) {
    console.error('Waitlist -> Google Sheets failed:', err.message);
    return res.status(500).json({ error: 'Something went wrong saving your signup. Please try again in a moment.' });
  }

  return res.status(201).json({
    status: 'ok',
    message: "You're on the list! Check your email for confirmation.",
  });
});

// GET /api/waitlist — admin only, lists all signups straight from the Sheet (header: x-admin-key)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const rows = await sheets.listAll();
    res.json({ count: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not read the Google Sheet: ' + err.message });
  }
});

// GET /api/waitlist/export.csv — admin only, downloads all signups as CSV
router.get('/export.csv', requireAdmin, async (req, res) => {
  try {
    const rows = await sheets.listAll();
    const headers = sheets.COLUMNS.map((c) => c.key);
    const escape = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const lines = [headers.join(',')];
    rows.forEach((row) => {
      lines.push(headers.map((h) => escape(row[h])).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="taap-waitlist.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'Could not export: ' + err.message });
  }
});

module.exports = router;
