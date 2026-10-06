const { google } = require('googleapis');

// Each entry maps a Sheet column (in order) to the field name used internally.
const COLUMNS = [
  { header: 'Submitted At', key: 'created_at' },
  { header: 'Name', key: 'name' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'City', key: 'city' },
  { header: 'Practice Type', key: 'practice_type' },
  { header: 'Years Experience', key: 'experience' },
  { header: 'Client Volume', key: 'client_volume' },
  { header: 'Current Follow-up Method', key: 'follow_up_method' },
  { header: 'Most Useful Feature', key: 'useful_feature' },
  { header: 'Trial Clients Estimate', key: 'trial_clients' },
  { header: 'Biggest Challenge', key: 'challenge' },
  { header: 'Wants Demo', key: 'demo_interest' },
  { header: 'Feedback', key: 'feedback' },
  { header: 'Share Consent', key: 'share_consent' },
  { header: 'Privacy Consent', key: 'privacy_consent' },
  { header: 'UTM Source', key: 'utm_source' },
  { header: 'UTM Medium', key: 'utm_medium' },
  { header: 'UTM Campaign', key: 'utm_campaign' },
];

const EMAIL_COLUMN_INDEX = COLUMNS.findIndex((c) => c.key === 'email'); // 0-based
const LAST_COLUMN_LETTER = String.fromCharCode('A'.charCodeAt(0) + COLUMNS.length - 1);

let cachedClient = null;

function getSheetName() {
  return process.env.GOOGLE_SHEET_TAB || 'Waitlist';
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }
  return id;
}

async function getClient() {
  if (cachedClient) return cachedClient;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Sheets is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, and GOOGLE_SHEET_ID in .env (run `node get-refresh-token.js` to get the refresh token — see README.md).'
    );
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  cachedClient = google.sheets({ version: 'v4', auth: oAuth2Client });
  return cachedClient;
}

async function ensureHeaderRow(sheets) {
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const range = `${sheetName}!A1:${LAST_COLUMN_LETTER}1`;

  let existing;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    existing = (res.data.values && res.data.values[0]) || [];
  } catch (err) {
    throw new Error(
      `Could not read tab "${sheetName}" in the Google Sheet. Make sure that tab exists and the service account has been given Editor access. (${err.message})`
    );
  }

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS.map((c) => c.header)] },
    });
  }
}

async function findByEmail(email) {
  const sheets = await getClient();
  await ensureHeaderRow(sheets);
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();
  const emailColLetter = String.fromCharCode('A'.charCodeAt(0) + EMAIL_COLUMN_INDEX);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${emailColLetter}2:${emailColLetter}`,
  });
  const values = res.data.values || [];
  const target = email.toLowerCase();
  return values.some((row) => (row[0] || '').toLowerCase() === target);
}

async function appendRow(record) {
  const sheets = await getClient();
  await ensureHeaderRow(sheets);
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const row = COLUMNS.map(({ key }) => {
    const v = record[key];
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return v === undefined || v === null ? '' : String(v);
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:${LAST_COLUMN_LETTER}`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

async function listAll() {
  const sheets = await getClient();
  await ensureHeaderRow(sheets);
  const spreadsheetId = getSpreadsheetId();
  const sheetName = getSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:${LAST_COLUMN_LETTER}`,
  });
  const values = res.data.values || [];
  return values.map((row) => {
    const obj = {};
    COLUMNS.forEach(({ key }, i) => {
      obj[key] = row[i] || '';
    });
    return obj;
  });
}

module.exports = { findByEmail, appendRow, listAll, COLUMNS };
