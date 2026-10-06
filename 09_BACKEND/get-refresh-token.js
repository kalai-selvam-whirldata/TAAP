// One-time helper: run `node get-refresh-token.js`, approve access in your browser,
// then copy the printed GOOGLE_REFRESH_TOKEN line into .env.
// See README.md "Setting up Google Sheets (OAuth)" for the full walkthrough.

require('dotenv').config();
const http = require('http');
const { exec } = require('child_process');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first, then run this again.');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
});

console.log('\nOpening your browser to sign in with the Google account that can edit your Sheet...');
console.log('(If a browser tab does not open within a few seconds, copy this ENTIRE URL — it is one long line, do not copy it in pieces — and paste it into a browser address bar yourself:)\n');
console.log(authUrl);
console.log('\nApprove access. You will be redirected back here automatically.\n');
console.log(`(Waiting on http://localhost:${PORT} ... if nothing happens, make sure`);
console.log(`"${REDIRECT_URI}" is added as an Authorized redirect URI on this OAuth client.)\n`);

const openCommand =
  process.platform === 'win32'
    ? `start "" "${authUrl}"`
    : process.platform === 'darwin'
    ? `open "${authUrl}"`
    : `xdg-open "${authUrl}"`;
exec(openCommand, (err) => {
  if (err) {
    console.log('(Could not auto-open a browser — please copy the URL above manually.)\n');
  }
});

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith('/oauth2callback')) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authorization failed: ${error}</h2><p>You can close this tab.</p>`);
    console.error('\nAuthorization failed:', error);
    console.error('If it says "access_denied" because the app is unverified: go to Google Cloud Console >');
    console.error('APIs & Services > OAuth consent screen > Test users, add your own email, and try again.\n');
    server.close(() => process.exit(1));
    return;
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Success! You can close this tab and go back to the terminal.</h2>');

    if (tokens.refresh_token) {
      console.log('\nGot it. Add this line to your .env file:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nThen restart the server (npm start).\n');
    } else {
      console.log('\nNo refresh token was returned. This usually means you have already');
      console.log('authorized this app before. Go to https://myaccount.google.com/permissions,');
      console.log('remove access for this app, then run this script again.\n');
    }
  } catch (err) {
    console.error('\nFailed to exchange code for tokens:', err.message, '\n');
  } finally {
    server.close(() => {
      setTimeout(() => process.exit(0), 300);
    });
  }
});

server.listen(PORT);
