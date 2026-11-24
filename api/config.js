// GET /api/config
//
// What the page needs to know about this server before showing the
// sign-in screen. The Google client ID is public by design (it appears
// in every Google sign-in button on the web), so it is fine to send;
// keeping it in a Vercel setting rather than in index.html means the
// page does not have to change if the ID ever does.
//   GOOGLE_CLIENT_ID   from Google Cloud Console, see BACKEND_SETUP.md
// Email sign-up is not switched on yet: until it is, the email form
// keeps working on this device only, as before.
export default function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'method_not_allowed' }); }
  res.setHeader('Cache-Control', 'public, max-age=300');
  const id = process.env.GOOGLE_CLIENT_ID || '';
  return res.status(200).json({
    googleClientId: /^[\w.-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null,
    emailAccounts: false
  });
}
