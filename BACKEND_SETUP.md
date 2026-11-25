# LENA backend: accounts (Google v36, email v39)

A LENA account backs up a person's mood, sleep, journal, screening
results, safety plan and settings, so they are there on any device they
sign in on. There are two ways to have one:

- **Continue with Google** (steps 1 to 4), and
- **email and password** (step 5), with a 6-digit code emailed to check
  the address, and "Forgot password?".

One email address is one account, whichever way is used. Guests keep
everything on their device, as before.

Until the settings are in place the app works exactly as it did: the
Google button appears once Google is set up, and the email form makes
real accounts once Gmail is set up. Before that, the email form keeps
working on the device only.

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

## 5. Email accounts (v39, about 10 minutes)

### 5a. Gmail App password (on the team account)
1. Sign in to Google as **lena.platform.iium@gmail.com**.
2. Go to <https://myaccount.google.com/security> and turn on
   **2-Step Verification** (it needs a phone number).
3. Go to <https://myaccount.google.com/apppasswords>, type `LENA` as the
   app name, and click **Create**.
4. Google shows a 16-letter password **once**. Keep the window open for
   the next step. If it ever leaks, delete it on the same page and make
   a new one.

### 5b. Vercel settings
Settings -> Environment Variables -> Add New, ticking Production and Preview:

| Name | Value |
|---|---|
| `GMAIL_USER` | `lena.platform.iium@gmail.com` |
| `GMAIL_APP_PASSWORD` | the 16 letters (spaces or no spaces both work) |

### 5c. Database
Neon -> SQL Editor -> paste all of `db/schema.sql` again -> Run. It adds
the tables for codes and for slowing down password guessing, and leaves
everything already there alone.

### 5d. Redeploy and check
1. Commit and push (this adds `nodemailer`, the email library, to
   `package.json`), wait for **Ready**, then Deployments -> ⋯ -> Redeploy
   so the new settings are read.
2. `https://lenaplatform.vercel.app/api/config` should now show
   `"emailAccounts":true`.
3. In an Incognito window: **Register** with a real email you can open,
   a name and a password of 10+ characters. A code arrives from LENA
   (check spam the first time and mark it "Not spam"). Type it in: you
   are in.
4. Sign out, then **Forgot password?** with the same email: a code
   arrives, choose a new password, sign in with it.

If the code never arrives: check both Gmail settings, that 2-Step
Verification is still on, and Vercel -> Logs for `register email failed`.
Gmail allows about 500 emails a day from one account.

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
  its entries on the server, then everything on the device. Accounts
  with a password type it to confirm.
- `api/auth/email.js` (one file, because Vercel's free plan allows 12
  server functions and LENA now has 9) does register, code, sign in,
  forgot and reset, following the OWASP cheat sheets and NIST SP 800-63B:
  - Passwords: at least 10 characters, no symbol rules, common and
    leaked passwords refused (Have I Been Pwned, only 5 characters of
    the hash leave the server), stored with scrypt.
  - Codes: 6 random digits, only a hash stored, 15 minutes, 5 tries, a
    new one at most once a minute, no links in the emails.
  - The screens never say whether an email has an account; the email
    to that address does.
  - Wrong passwords slow down (30 s, growing to 5 min) per connection
    instead of locking the account; 30 misses from anywhere in an hour
    pause the address for 15 minutes.
  - After a reset every device is signed out and the owner is emailed.
  - Registering with an address that has a Google account adds a
    password to it after the code; Google sign-in on an email account
    keeps its password.

## Tests

With a throwaway Postgres (never the live one):

```
DATABASE_URL=postgres://user@127.0.0.1:5432/lenatest node tests/test_google.mjs
DATABASE_URL=postgres://user@127.0.0.1:5432/lenatest node tests/test_email.mjs
node tests/test_auth.mjs
```

`test_google.mjs` stands in for Google with its own key pair and checks
36 things, including tokens for other websites, expired, forged and
altered tokens, account joining, sync, sign-out and deletion.
`test_email.mjs` stands in for Gmail and checks 84 things: password
rules, codes (wrong, used up, expired, resent), the same answers for
known and unknown addresses, slowing down guessing, forgot and reset,
joining with Google both ways, and deleting.

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
