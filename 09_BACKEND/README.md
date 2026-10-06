# TAAP Waitlist Backend

A small Node.js/Express server that:
- Serves the TAAP landing page and Privacy Policy page (static files in `public/`)
- Accepts real waitlist form submissions at `POST /api/waitlist`
- Writes each signup as a new row in a **Google Sheet** you control
- Lets you view or export signups through two admin-only endpoints

## 1. Install

Requires Node.js 22.5+ (for the built-in `node:sqlite` dependency-free setup this was originally built on — no longer used now that storage is Google Sheets, but the Node version requirement stays since nothing here needs an older runtime).

```
cd 09_BACKEND
npm install
```

## 2. Setting up Google Sheets (OAuth)

Submissions are stored in a Google Sheet. This project authenticates using an **OAuth Client ID + Secret** (the kind you get from "Credentials → Create Credentials → OAuth client ID" in Google Cloud Console) plus a one-time authorization step that produces a long-lived **refresh token**. After that one-time step, the server renews its own access automatically — no further logins needed.

**a) Make sure the Sheets API is enabled**
1. Go to [console.cloud.google.com](https://console.cloud.google.com/) → select the project your OAuth client belongs to
2. **APIs & Services → Library** → search "Google Sheets API" → **Enable**

**b) Add a redirect URI to your existing OAuth client**
1. **APIs & Services → Credentials** → click your OAuth 2.0 Client ID
2. Under **Authorized redirect URIs**, click **Add URI** and add exactly:
   ```
   http://localhost:8085/oauth2callback
   ```
3. Save

**c) If your OAuth consent screen is in "Testing" mode**
Unverified apps in testing mode only work for emails you've explicitly added. To avoid a "this app isn't verified" / "access blocked" error:
1. **APIs & Services → OAuth consent screen → Test users**
2. **Add users** → add the Google account you'll sign in with (likely your own) → Save

**d) Put your Client ID and Secret in `.env`**
```
cp .env.example .env
```
Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` with the values from your OAuth client.

**e) Run the one-time authorization helper**
```
node get-refresh-token.js
```
It prints a URL — open it in your browser, sign in with the Google account that can edit your target Sheet, and approve access. The terminal will then print a line like:
```
GOOGLE_REFRESH_TOKEN=1//0g...
```
Copy that whole line into `.env`.

**f) Create the Sheet itself**
1. Go to [sheets.google.com](https://sheets.google.com) → create a new blank spreadsheet, name it whatever you like (e.g. "TAAP Waitlist")
2. Look at its URL: `https://docs.google.com/spreadsheets/d/THIS_LONG_ID_HERE/edit`
3. Copy that long ID → goes in `.env` as `GOOGLE_SHEET_ID`
4. Rename the tab at the bottom (double-click it) to `Waitlist` — or use any name you like and set `GOOGLE_SHEET_TAB` in `.env` to match
5. Make sure it's owned by (or shared as Editor with) the same Google account you signed in with in step (e) — no extra sharing step is needed if you created it with that account.

That's it — the server can now read and write that Sheet using the refresh token. The header row and column names are created automatically the first time someone submits the form (or the first time you call the admin list endpoint).

**Security note:** `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` are as sensitive as a password to that Sheet — never commit `.env` or paste these values anywhere public. If either has ever been exposed (e.g. pasted into a chat, a public repo, a screenshot), regenerate the client secret in Google Cloud Console and re-run `get-refresh-token.js`.

## 3. Configure and run

```
cp .env.example .env
```

Fill in `.env` with: `ADMIN_API_KEY` (any long random string — this protects the admin endpoints), and the three `GOOGLE_...` values from step 2.

```
npm start
```

Open **http://localhost:3000** — submit the waitlist form, then check your Google Sheet. The row should appear within a second or two.

## 4. Check it worked

```
curl http://localhost:3000/healthz
```
should return `{"ok":true}`.

```
curl -H "x-admin-key: YOUR_ADMIN_API_KEY" http://localhost:3000/api/waitlist
```
returns every signup as JSON, read live from the Sheet.

```
curl -H "x-admin-key: YOUR_ADMIN_API_KEY" http://localhost:3000/api/waitlist/export.csv -o waitlist.csv
```
downloads the same data as a CSV (though honestly, once it's in Sheets you can just use File → Download there instead).

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/waitlist` | none (rate-limited: 20 / 15 min per IP) | Submit a new signup → appends a row to the Sheet |
| GET | `/api/waitlist` | `x-admin-key` header | List all signups as JSON, read live from the Sheet |
| GET | `/api/waitlist/export.csv` | `x-admin-key` header | Download all signups as CSV |
| GET | `/healthz` | none | Health check |

A submission that reuses an email address already in the Sheet returns `200` with `{"status":"already_on_list"}` instead of adding a duplicate row (checked by reading the Email column before appending).

## Deploying it somewhere real

This is a single Node process with no local database file to worry about — all the data lives in your Google Sheet, which makes deployment simpler than the old SQLite version.

- Set `ADMIN_API_KEY` and the three `GOOGLE_...` variables as environment variables on your host (Render, Railway, etc.) — don't rely on `.env` being there.
- `GOOGLE_PRIVATE_KEY` often needs its newlines kept as literal `\n` when pasted into a hosting provider's environment-variable UI — the code already handles converting `\n` back into real newlines, so just paste it as one line with `\n` in it, same as in `.env.example`.
- Put the deployed URL's domain behind HTTPS (most platforms do this for you automatically).

## What changed on the frontend

`public/index.html`'s waitlist form does a real `fetch()` POST to `/api/waitlist`. If the Sheet isn't reachable (bad credentials, not shared with the service account, etc.) the submitter sees a friendly error instead of a silent fake success.

The hosted Claude artifact version (the `claude.ai/artifact/...` link) is unaffected by any of this — Claude artifacts can't run a Node server, so that link still uses the client-side-only demo behavior. This backend is for when you deploy the site somewhere that can actually run it.
