// ════════════════════════════════════════════════════════════════════
// The emails LENA sends: sign-up codes, password reset codes, and the
// notices that go with them.
//
// They go out through the team's Gmail (lena.platform.iium@gmail.com)
// using a Gmail App password. Both live in Vercel's settings only:
//   GMAIL_USER           lena.platform.iium@gmail.com
//   GMAIL_APP_PASSWORD   the 16 letters from myaccount.google.com/apppasswords
// Gmail allows about 500 emails a day from one account, far more than
// the programme needs.
//
// Each email is written in the language the person was using LENA in.
// They contain no links: codes are typed into the page, so a scanner
// that opens links in emails (common in schools) cannot use them up,
// and a fake email pretending to be LENA has nothing to imitate.
// ════════════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer';

let transport = null;

function mailConfigured() {
  return !!(globalThis.__lenaMailTransport ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD));
}

function getTransport() {
  // The tests hand in a stand-in that records the emails instead.
  if (globalThis.__lenaMailTransport) return globalThis.__lenaMailTransport;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.GMAIL_USER, pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '') },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000
    });
  }
  return transport;
}

const FOOT = {
  en: 'LENA, Live Emotional Needs Assistant. IIUM KICT.\nYou got this email because this address was typed into LENA at lenaplatform.vercel.app.',
  ms: 'LENA, Live Emotional Needs Assistant. IIUM KICT.\nAwak terima e-mel ini kerana alamat ini ditaip dalam LENA di lenaplatform.vercel.app.'
};

const hi = (lang, name) => lang === 'ms'
  ? (name ? 'Hai ' + name + ',' : 'Hai,')
  : (name ? 'Hi ' + name + ',' : 'Hi,');

const T = {
  en: {
    signup_code: (v) => ({
      subject: 'Your LENA code: ' + v.code,
      lines: [hi('en', v.name), 'Your code to finish creating your LENA account is:'],
      code: v.code,
      after: ['Type it into LENA. It works for 15 minutes.',
              'If you did not try to make a LENA account, ignore this email. Nothing will happen.']
    }),
    google_register: (v) => ({
      subject: 'You already have a LENA account',
      lines: [hi('en', v.name), 'Someone, hopefully you, tried to register on LENA with this email, but you already have a LENA account made with Continue with Google.',
              'To get in, open LENA and choose Continue with Google, using this same Google account.'],
      after: ['If this was not you, you can ignore this email. Nobody can get into your account with it.']
    }),
    google_forgot: (v) => ({
      subject: 'About your LENA password',
      lines: [hi('en', v.name), 'Someone, hopefully you, asked to reset the LENA password for this email.',
              'Your LENA account was made with Continue with Google, so it has no LENA password to reset. To get in, open LENA and choose Continue with Google.'],
      after: ['If this was not you, you can ignore this email. Nothing has changed.']
    }),
    already: (v) => ({
      subject: 'You already have a LENA account',
      lines: [hi('en', v.name), 'Someone, hopefully you, tried to register on LENA with this email, but you already have an account.',
              'To get in, open LENA and sign in with your email and password.',
              'Forgot your password? Choose "Forgot password?" on the sign-in screen and LENA will send you a code.'],
      after: ['If this was not you, you can ignore this email. Nobody can get into your account with it.']
    }),
    reset_code: (v) => ({
      subject: 'Your LENA password reset code: ' + v.code,
      lines: [hi('en', v.name), 'Your code to choose a new LENA password is:'],
      code: v.code,
      after: ['Type it into LENA. It works for 15 minutes.',
              'If you did not ask to reset your password, ignore this email. Your password stays the same.']
    }),
    pw_changed: (v) => ({
      subject: 'Your LENA password was changed',
      lines: [hi('en', v.name), 'The password for your LENA account was just changed, and LENA signed you out on your other devices.'],
      after: ['If this was you, there is nothing else to do.',
              'If it was not, reset your password straight away from the LENA sign-in screen, and email lena.platform.iium@gmail.com.']
    })
  },
  ms: {
    signup_code: (v) => ({
      subject: 'Kod LENA awak: ' + v.code,
      lines: [hi('ms', v.name), 'Kod untuk melengkapkan akaun LENA awak ialah:'],
      code: v.code,
      after: ['Taip kod ini dalam LENA. Ia sah selama 15 minit.',
              'Jika awak tidak cuba membuat akaun LENA, abaikan e-mel ini. Tiada apa-apa akan berlaku.']
    }),
    google_register: (v) => ({
      subject: 'Awak sudah ada akaun LENA',
      lines: [hi('ms', v.name), 'Seseorang, harapnya awak, cuba mendaftar di LENA dengan e-mel ini, tetapi awak sudah ada akaun LENA yang dibuat dengan Teruskan dengan Google.',
              'Untuk masuk, buka LENA dan pilih Teruskan dengan Google, menggunakan akaun Google yang sama.'],
      after: ['Jika ini bukan awak, abaikan sahaja e-mel ini. Tiada sesiapa boleh masuk ke akaun awak dengannya.']
    }),
    google_forgot: (v) => ({
      subject: 'Tentang kata laluan LENA awak',
      lines: [hi('ms', v.name), 'Seseorang, harapnya awak, meminta untuk menetapkan semula kata laluan LENA bagi e-mel ini.',
              'Akaun LENA awak dibuat dengan Teruskan dengan Google, jadi ia tiada kata laluan LENA untuk ditetapkan semula. Untuk masuk, buka LENA dan pilih Teruskan dengan Google.'],
      after: ['Jika ini bukan awak, abaikan sahaja e-mel ini. Tiada apa-apa yang berubah.']
    }),
    already: (v) => ({
      subject: 'Awak sudah ada akaun LENA',
      lines: [hi('ms', v.name), 'Seseorang, harapnya awak, cuba mendaftar di LENA dengan e-mel ini, tetapi awak sudah ada akaun.',
              'Untuk masuk, buka LENA dan log masuk dengan e-mel dan kata laluan awak.',
              'Terlupa kata laluan? Pilih "Lupa kata laluan?" di skrin log masuk dan LENA akan menghantar kod kepada awak.'],
      after: ['Jika ini bukan awak, abaikan sahaja e-mel ini. Tiada sesiapa boleh masuk ke akaun awak dengannya.']
    }),
    reset_code: (v) => ({
      subject: 'Kod tetapan semula kata laluan LENA: ' + v.code,
      lines: [hi('ms', v.name), 'Kod untuk memilih kata laluan LENA yang baharu ialah:'],
      code: v.code,
      after: ['Taip kod ini dalam LENA. Ia sah selama 15 minit.',
              'Jika awak tidak meminta untuk menetapkan semula kata laluan, abaikan e-mel ini. Kata laluan awak kekal sama.']
    }),
    pw_changed: (v) => ({
      subject: 'Kata laluan LENA awak telah ditukar',
      lines: [hi('ms', v.name), 'Kata laluan akaun LENA awak baru sahaja ditukar, dan LENA telah melog keluar awak daripada peranti lain.'],
      after: ['Jika ini awak, tiada apa-apa lagi yang perlu dibuat.',
              'Jika bukan, tetapkan semula kata laluan awak dengan segera dari skrin log masuk LENA, dan e-mel lena.platform.iium@gmail.com.']
    })
  }
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function build(kind, lang, vars) {
  const L = lang === 'ms' ? 'ms' : 'en';
  const m = T[L][kind](vars || {});
  const text = [...m.lines, ...(m.code ? ['', '    ' + m.code, ''] : ['']), ...m.after, '', '--', FOOT[L]].join('\n');
  const p = (s) => '<p style="margin:0 0 12px">' + esc(s) + '</p>';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1E3D35;max-width:520px;margin:0 auto;padding:24px">' +
    '<div style="font-family:Georgia,serif;font-size:26px;color:#1A705D;margin-bottom:18px">LENA</div>' +
    m.lines.map(p).join('') +
    (m.code ? '<div style="font-family:Consolas,Menlo,monospace;font-size:32px;letter-spacing:8px;font-weight:bold;background:#E4F4EF;color:#15493E;border-radius:12px;padding:14px 0;text-align:center;margin:6px 0 18px">' + esc(m.code) + '</div>' : '') +
    m.after.map(p).join('') +
    '<hr style="border:none;border-top:1px solid #D4EDE6;margin:20px 0 12px">' +
    '<p style="margin:0;font-size:12px;color:#4A6963">' + FOOT[L].split('\n').map(esc).join('<br>') + '</p></div>';
  return { subject: m.subject, text, html };
}

async function sendMail(to, kind, lang, vars) {
  const m = build(kind, lang, vars);
  const from = process.env.GMAIL_USER || 'lena.platform.iium@gmail.com';
  await getTransport().sendMail({ from: { name: 'LENA', address: from }, to, subject: m.subject, text: m.text, html: m.html });
}

export { mailConfigured, sendMail, build };
