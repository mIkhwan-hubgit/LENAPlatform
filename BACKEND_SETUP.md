# LENA backend: Continue with Google (v36)

Signing in with Google gives each person a LENA account. Their mood,
sleep, journal, screening results, safety plan and settings are backed
up to it, so they are there on any device they sign in on. Guests and
the email form keep working on the device only, as before. Email
accounts are the next step.

Until the three settings below are in place, the app looks and works
exactly as it did: the Google button only appears once the server says
Google sign-in is set up.

**Keep every key and connection string out of GitHub and out of chats.**
They go in Vercel's Environment Variables only, like `LENA_API_KEY`.

---

## 1. Google: make a sign-in client ID (about 10 minutes)

1. Go to <https://console.cloud.google.com/> and sign in with the team's
   Google account. Create a project called `LENA`.
2. **Google Auth Platform → Branding** (older consoles: *APIs & Services →
   OAuth consent screen*). App name `LENA`, support email
   `lena.platform.iium@gmail.com`.
   Audience: **External**. Do not upload a logo (a logo makes Google
   ask for a brand review that takes weeks). Fill in:
   - Application home page: `https://lenaplatform.vercel.app`
   - Application privacy policy link: `https://lenaplatform.vercel.app/privacy.html`
   - Authorized domains: `lenaplatform.vercel.app` (not `vercel.app`,
     which Google refuses because it is shared by every Vercel site)
3. **Clients → Create client** (older: *Credentials → Create credentials
   → OAuth client ID*). Type **Web application**, name `LENA web`.
   - **Authorized JavaScript origins**: `https://lenaplatform.vercel.app`
     (no slash at the end). Add any other address you test on.
   - Authorized redirect URIs: leave empty. LENA uses the pop-up flow.
4. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`.
   This one is public by design and is safe to paste into Vercel. There
   is also a *client secret*: LENA does not need it, do not use it.
5. Publishing needs the privacy policy link, so push this build (it
   adds `privacy.html`) before step 6.
6. While the app is in **Testing** mode only the test users you list can
   sign in. To let anyone sign in, press **Publish app**. LENA asks only
   for name, email and picture (the basic scopes), so Google does not
   need to review it.

## 2. Database: Neon through Vercel (about 5 minutes)

1. Vercel project → **Storage** → **Create Database** → **Neon**.
   Region **Singapore (ap-southeast-1)**, free plan. Connect it to the
   LENA project. Vercel adds `DATABASE_URL` for you.
2. Check `DATABASE_URL` is the **pooled** one (its host has `-pooler`).
3. Neon dashboard → **SQL Editor** → paste all of `db/schema.sql` → Run.
   It is safe to run again later.

## 3. Vercel settings

Project → Settings → Environment Variables, for Production (and Preview
if you test there):

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 1 |
| `DATABASE_URL` | set by the Neon step; check it is pooled |

Then redeploy (Deployments → ⋯ → Redeploy). `package.json` now lists
`pg`, the Postgres driver, so Vercel installs it during the build.

## 4. Check it

- `https://lenaplatform.vercel.app/api/config` should show your client ID.
- `https://lenaplatform.vercel.app/api/auth/me` should show `{"user":null}`.
  `"degraded":true` means the database cannot be reached: check
  `DATABASE_URL` and that the schema ran.
- Open LENA signed out: **Continue with Google** appears above the email
  form. Sign in, log a mood, then open LENA on another device or browser
  and sign in with the same Google account: the mood is there.

Live Server on your laptop has no `/api`, so the Google button does not
appear there. That is expected. Test sign-in on the Vercel address.

---

## What it does, briefly

- `api/auth/google.js` checks Google's token: Google's signature, issued
  by Google, issued for LENA's client ID, not expired, email verified.
  Then it finds the account by Google's permanent account number, or
  makes one, and sets a session cookie (HttpOnly, Secure, SameSite=Lax,
  30 days; the database keeps only a hash of it).
- Every request that changes something must come from LENA's own pages
  (Origin check), on top of the SameSite cookie.
- `api/sync.js` backs entries up and brings them back (last edit wins).
  Deleting an entry is now carried across devices too.
- Sign Out backs up first, then removes the backed-up entries from that
  device, so the next person on a shared phone does not see them.
- Delete everything (Privacy & Data) deletes the LENA account and all of
  its entries on the server, then everything on the device.

## Tests

With a throwaway Postgres (never the live one):

```
DATABASE_URL=postgres://user@127.0.0.1:5432/lenatest node tests/test_google.mjs
node tests/test_auth.mjs
```

`test_google.mjs` stands in for Google with its own key pair and checks
36 things, including tokens for other websites, expired, forged and
altered tokens, account joining, sync, sign-out and deletion.

## Before real students use it

- **Privacy notice and consent.** Entries are now stored on a server.
  Under PDPA 2010 people should be told plainly before they sign in, and
  for students under 18 the school or a parent may need to agree. The
  sign-in screen and Privacy & Data now say what is stored; check with
  your supervisor whether a consent step is needed for the programme.
- **The paper.** The passages that say entries never leave the device
  are true for guests only once this is live.
- **No penetration test has been done.**
- `api/chat.js` should require a session and a daily limit once accounts
  are live (the `chat_usage` table is ready for it).
