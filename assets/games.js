/* ════════════════════════════════════════════════════════════════════
   LENA Pop & Squeeze

   Five sections:
     Free Pop         pop-it (Easy, Medium, Hard) and bubble wrap with
                      four pop sounds.
     Thought Pop      pop the thinking traps, let balanced thoughts float
                      away. Three lives.
     Word Hunt        tap the giveaway words in a trap sentence.
     Evidence Court   does each fact back up a character's thought, go
                      against it, or is it just a feeling? A scale tips,
                      then pick the fairer thought.
     Reframe Builder  three small steps: tap the trap word, pick what's
                      true, pick something you can do.
   The thinking games use made-up characters and general sentences,
   never the player's own life, the same rule as the daily check.

   Every bubble is a real <button>, so it works with a keyboard and a
   screen reader, not only a finger. Sounds are made in code, so nothing
   extra downloads. The red "missed" signal is one soft pulse, never
   repeated flashing, which can trigger seizures.

   Usage: LenaPop.mount(element, { output: AudioNode, mode: 'thought' })
          both optional. output is where sound goes; mode picks the
          section to open on.
   ════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const CSS = `
.lp{--lp-bg:var(--bg,#F0F9F6);--lp-card:var(--card,#fff);--lp-text:var(--text,#1E3D35);--lp-text2:var(--text2,#365A50);
  --lp-border:var(--border2,rgba(43,184,154,.28));--lp-fill:var(--fill,#1F846F);--lp-on:var(--on-fill,#fff);
  font-family:var(--ff-b,system-ui,sans-serif);color:var(--lp-text);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.lp-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.lp-tab{padding:9px 16px;border-radius:999px;border:1.5px solid var(--lp-border);background:var(--lp-card);color:var(--lp-text);
  font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;transition:transform .25s cubic-bezier(.34,1.56,.64,1),background .2s}
.lp-tab[aria-pressed="true"]{background:var(--lp-fill);border-color:var(--lp-fill);color:var(--lp-on)}
.lp-tab:active{transform:scale(.94)}
.lp-sp{flex:1}
.lp-mute{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--lp-border);background:var(--lp-card);font-size:17px;cursor:pointer}
.lp [hidden]{display:none!important}
.lp-sub{display:flex;gap:6px;margin:-4px 0 12px}
.lp-sub .lp-tab{padding:6px 13px;font-size:12px}
.lp-stage{position:relative;border-radius:22px;overflow:hidden;min-height:420px;background:var(--lp-bg);touch-action:none}
.lp-msg{text-align:center;font-size:14px;color:var(--lp-text2);min-height:22px;margin:12px 0 2px;line-height:1.5}
.lp-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.lp-fx{position:absolute;inset:0;pointer-events:none}

/* ── pop-it ── */
.lp-popit-wrap{display:flex;justify-content:center;align-items:center;padding:22px;perspective:1100px;min-height:420px}
.lp-round~.lp-popit-wrap,.lp-popit-wrap.hard{padding-top:54px}
.lp-board{display:grid;gap:9px;padding:18px;border-radius:30px;background:#EEF4F2;
  box-shadow:0 10px 30px rgba(0,0,0,.10),inset 0 2px 0 rgba(255,255,255,.8),inset 0 -3px 0 rgba(0,0,0,.05);
  transform-style:preserve-3d;transition:transform .7s cubic-bezier(.45,.05,.3,1.2)}
.lp-board.flip{transform:rotateY(180deg)}
.lp-b{--c:#9CC9F0;width:var(--s,48px);height:var(--s,48px);border-radius:50%;border:none;padding:0;cursor:pointer;position:relative;
  background:radial-gradient(circle at 34% 30%,color-mix(in srgb,var(--c) 45%,#fff) 0%,var(--c) 52%,color-mix(in srgb,var(--c) 78%,#000) 100%);
  box-shadow:0 4px 0 color-mix(in srgb,var(--c) 70%,#000),0 6px 10px rgba(0,0,0,.14);
  transform:translateY(0) scale(1);transition:transform .32s cubic-bezier(.34,1.8,.5,1),box-shadow .2s,background .2s}
.lp-b.press{transform:translateY(3px) scale(.92);box-shadow:0 1px 0 color-mix(in srgb,var(--c) 70%,#000),0 2px 4px rgba(0,0,0,.12);transition-duration:.07s}
.lp-b.down{background:radial-gradient(circle at 50% 58%,color-mix(in srgb,var(--c) 78%,#000) 0%,color-mix(in srgb,var(--c) 88%,#000) 45%,var(--c) 78%,color-mix(in srgb,var(--c) 55%,#fff) 100%);
  box-shadow:inset 0 6px 10px rgba(0,0,0,.28),inset 0 -3px 4px rgba(255,255,255,.45),0 1px 0 rgba(255,255,255,.6);transform:translateY(3px) scale(.94)}
.lp-b:focus-visible{outline:3px solid var(--lp-fill);outline-offset:3px}

/* ── bubble wrap ── */
.lp-wrap-sheet{position:relative;margin:18px auto;padding:16px 10px;border-radius:16px;
  background:linear-gradient(160deg,rgba(225,240,248,.9),rgba(205,228,240,.9));box-shadow:0 8px 24px rgba(0,0,0,.08)}
.lp-wrow{display:flex;justify-content:center;gap:6px}
.lp-wrow+.lp-wrow{margin-top:-4px}
.lp-wrow.odd{transform:translateX(calc(var(--s,44px) / 2 + 3px))}
.lp-w{width:var(--s,44px);height:var(--s,44px);border-radius:50%;border:none;padding:0;cursor:pointer;
  background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.98) 0 12%,rgba(255,255,255,.35) 32%,rgba(170,205,225,.45) 70%,rgba(120,165,195,.55) 100%);
  box-shadow:inset -3px -4px 8px rgba(80,130,165,.25),0 2px 4px rgba(60,100,130,.18);transition:transform .25s cubic-bezier(.34,1.7,.5,1),opacity .25s}
.lp-w.pop{transform:scale(.82) rotate(8deg);opacity:.55;cursor:default;border-radius:46% 54% 40% 60%/55% 42% 58% 45%;
  background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.3),rgba(150,190,210,.35));box-shadow:inset 0 1px 3px rgba(80,130,165,.3)}
.lp-w:focus-visible{outline:3px solid var(--lp-fill);outline-offset:2px}
.lp-sheet-in{animation:lpSheet .55s cubic-bezier(.3,1.4,.5,1)}
@keyframes lpSheet{from{transform:translateY(40px) scale(.96);opacity:0}to{transform:none;opacity:1}}


/* ── thought pop ── */
.lp-thoughts{position:relative;height:460px;overflow:hidden}
.lp-t{position:absolute;left:0;top:0;width:var(--d,140px);height:var(--d,140px);border-radius:50%;border:none;padding:14px;cursor:pointer;
  font:600 12.5px/1.35 inherit;font-family:inherit;color:#1E3D35;display:flex;align-items:center;justify-content:center;text-align:center;
  background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 10%,rgba(255,255,255,.55) 30%,var(--c) 100%);
  box-shadow:inset -6px -8px 16px rgba(0,0,0,.06),0 6px 18px rgba(0,0,0,.08);will-change:transform}
.lp-t:focus-visible{outline:3px solid var(--lp-fill);outline-offset:3px}
.lp-t.kept{transition:transform 1.4s ease-in,opacity 1.4s;opacity:0}
.lp-label{position:absolute;padding:6px 12px;border-radius:999px;font-weight:700;font-size:12px;font-family:inherit;white-space:nowrap;
  background:var(--lp-card);color:var(--lp-text);box-shadow:0 4px 14px rgba(0,0,0,.12);pointer-events:none;
  animation:lpLabel 1.9s ease-out forwards;transform:translate(-50%,-50%)}
@keyframes lpLabel{0%{opacity:0;transform:translate(-50%,-30%) scale(.8)}15%{opacity:1;transform:translate(-50%,-50%) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-90%)}}
.lp-legend{text-align:center;font-size:12.5px;line-height:1.5;color:var(--lp-text2);padding:8px 20px 14px}
.lp{--lp-red:#D3364C;--lp-good:#1E8A5F}
.lp-row2{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:-4px 0 12px}
.lp-row2 .lp-lbl{font-size:12px;color:var(--lp-text2);font-weight:600;margin-right:2px}
.lp-row2 .lp-tab{padding:6px 13px;font-size:12px}
/* score bar, pinned to the top of the play area */
.lp-hud{position:absolute;left:12px;right:12px;top:10px;display:flex;justify-content:space-between;align-items:center;z-index:3;pointer-events:none;
  font-weight:700;font-size:14px;color:var(--lp-text);font-variant-numeric:tabular-nums}
.lp-hud .lp-pill{background:var(--lp-card);padding:6px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.08);display:flex;gap:10px;align-items:center}
.lp-hearts{color:var(--lp-red);letter-spacing:2px;font-size:15px}
.lp-hearts .off{opacity:.2}
.lp-streak{font-size:12px;color:var(--lp-text2)}
.lp-bump{animation:lpBump .35s cubic-bezier(.34,1.8,.5,1)}
@keyframes lpBump{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
/* one soft red pulse round the edge for a miss. Never repeated. */
.lp-pulse{position:absolute;inset:0;pointer-events:none;z-index:2;border-radius:22px;opacity:0;
  box-shadow:inset 0 0 0 4px var(--lp-red),inset 0 0 60px rgba(211,54,76,.35)}
.lp-pulse.go{animation:lpPulse .7s ease-out}
@keyframes lpPulse{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
.lp-label.bad{background:var(--lp-red);color:#fff}
.lp-label.good{background:var(--lp-good);color:#fff}
.lp-over{position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;padding:20px;
  background:color-mix(in srgb,var(--lp-bg) 70%,transparent);backdrop-filter:blur(3px)}
.lp-card{background:var(--lp-card);border-radius:20px;padding:24px 26px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.14);max-width:320px}
.lp-card h3{font-family:var(--ff-d,Georgia,serif);font-size:24px;margin:0 0 6px;font-weight:600}
.lp-card p{font-size:13.5px;color:var(--lp-text2);line-height:1.6;margin:0 0 6px}
.lp-card .lp-big{font-size:40px;font-weight:700;color:var(--lp-fill);margin:4px 0 2px;font-variant-numeric:tabular-nums}
.lp-card .lp-tab{margin-top:12px;background:var(--lp-fill);border-color:var(--lp-fill);color:var(--lp-on);padding:10px 22px}
/* hard pop-it */
.lp-b.dbl::after{content:'';position:absolute;inset:22%;border-radius:50%;border:2.5px dashed rgba(255,255,255,.85)}
.lp-b.half{filter:saturate(1.5) brightness(.93)}
.lp-b.half::after{border-style:solid;inset:30%}
.lp-b.refill{animation:lpRefill .45s cubic-bezier(.34,1.8,.5,1)}
@keyframes lpRefill{0%{transform:translateY(3px) scale(.9)}60%{transform:translateY(-2px) scale(1.08)}100%{transform:none}}
.lp-round{position:absolute;left:12px;top:10px;z-index:3;background:var(--lp-card);padding:6px 12px;border-radius:999px;
  font-weight:700;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.08);font-variant-numeric:tabular-nums}

@media (prefers-reduced-motion:reduce){
  .lp-board,.lp-b,.lp-w,.lp-tab{transition-duration:.01s!important}
  .lp-sheet-in,.lp-label{animation-duration:.01s}
}`;

/* ── sound, all made in code ──────────────────────────────────────── */
let ac = null, out = null, muted = false, extOut = null;
function audio(){
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ac = (extOut && extOut.context) || new C();
    out = ac.createGain(); out.gain.value = 0.9;
    out.connect(extOut || ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function noiseBuf(){
  if (noiseBuf.b) return noiseBuf.b;
  const b = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf.b = b);
}
const vary = (v, p) => v * (1 + (Math.random() * 2 - 1) * p);
function tone(f0, f1, dur, vol, type){
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function burst(freq, q, dur, vol, type){
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.02);
}
// Bubble wrap pop styles. Each pop also varies a little in pitch, so a
// row of pops never sounds like the same sample repeated.
const WRAP_SOUNDS = {
  crisp: { name: 'Crisp', play(){ burst(vary(3200, .2), .9, .045, .55); burst(900, .7, .03, .2); tone(vary(140, .1), 70, .04, .25); } },
  soft:  { name: 'Soft',  play(){ burst(vary(1100, .2), .7, .07, .4, 'lowpass'); tone(vary(190, .1), 90, .06, .22); } },
  deep:  { name: 'Deep',  play(){ tone(vary(170, .1), 55, .13, .6); burst(vary(650, .15), .8, .07, .25); } },
  bloop: { name: 'Bloop', play(){ tone(vary(300, .1), vary(1150, .08), .085, .32); burst(2500, 1.5, .012, .06); } }
};
let wrapSound = 'crisp';
const SND = {
  // silicone pop-it: a soft low "thock" with a little click on top
  popit(){ if (muted || !audio()) return; tone(vary(300, .12), 120, .09, .55); burst(vary(2400, .2), 1.2, .018, .18); },
  wrap(style){ if (muted || !audio()) return; (WRAP_SOUNDS[style || wrapSound] || WRAP_SOUNDS.crisp).play(); },
  // hard pop-it: a bubble filling back up
  refill(){ if (muted || !audio()) return; tone(vary(180, .1), vary(420, .05), .12, .16, 'triangle'); },
  half(){ if (muted || !audio()) return; tone(vary(420, .1), 260, .06, .3); },
  // thought pop
  right(){ if (muted || !audio()) return; tone(660, 660, .12, .14, 'triangle'); setTimeout(() => tone(990, 990, .22, .12, 'triangle'), 80); burst(2400, 1.2, .02, .1); },
  wrong(){ if (muted || !audio()) return; tone(220, 150, .28, .22, 'sawtooth'); tone(233, 156, .28, .12, 'square'); },
  nope(){ if (muted || !audio()) return; tone(330, 250, .16, .14, 'triangle'); },
  tick(){ if (muted || !audio()) return; burst(vary(1800, .1), 2, .015, .12); },
  over(){ if (muted || !audio()) return; [523, 440, 349].forEach((f, i) => setTimeout(() => tone(f, f, .32, .1, 'triangle'), i * 180)); },
  flip(){ if (muted || !audio()) return; burst(500, .5, .25, .12, 'lowpass'); tone(220, 330, .22, .08, 'triangle'); },
  soft(){ if (muted || !audio()) return; tone(vary(520, .08), 260, .14, .35); burst(1800, 1, .02, .08); },
  keep(){ if (muted || !audio()) return; tone(880, 880, .35, .07); setTimeout(() => tone(1320, 1320, .45, .05), 90); },
  chime(){ if (muted || !audio()) return; tone(660, 660, .9, .05); setTimeout(() => tone(990, 990, 1.1, .04), 140); }
};
const buzz = (ms) => { try { if (!muted && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* ── little burst ring on the effects canvas ──────────────────────── */
function Fx(stage){
  const c = document.createElement('canvas'); c.className = 'lp-fx'; stage.appendChild(c);
  const ctx = c.getContext('2d'); let rings = [], raf = 0;
  function size(){ const r = stage.getBoundingClientRect(), d = devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); }
  size(); window.addEventListener('resize', size);
  function frame(){
    const r = stage.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height);
    rings.forEach(g => { g.t = Math.min(1, g.t + 1 / 22); });
    rings = rings.filter(g => g.t < 1);
    rings.forEach(g => {
      const e = 1 - Math.pow(1 - g.t, 3);
      ctx.globalAlpha = (1 - g.t) * .55; ctx.strokeStyle = g.col; ctx.lineWidth = Math.max(.5, 2.5 * (1 - g.t) + .5);
      ctx.beginPath(); ctx.arc(g.x, g.y, g.r0 + e * g.r0 * .9, 0, 7); ctx.stroke();
      g.dots.forEach(d => { ctx.fillStyle = g.col; ctx.beginPath(); ctx.arc(g.x + Math.cos(d) * (g.r0 + e * g.r0 * 1.3), g.y + Math.sin(d) * (g.r0 + e * g.r0 * 1.3), Math.max(0, 2.2 * (1 - g.t)), 0, 7); ctx.fill(); });
    });
    ctx.globalAlpha = 1;
    raf = rings.length ? requestAnimationFrame(frame) : 0;
  }
  return {
    ring(el, col){
      if (reduced()) return;
      const s = stage.getBoundingClientRect(), b = el.getBoundingClientRect();
      const n = 6, base = Math.random() * 6;
      rings.push({ x: b.left - s.left + b.width / 2, y: b.top - s.top + b.height / 2, r0: b.width * .42, t: 0, col: col || 'rgba(31,132,111,.9)',
        dots: Array.from({ length: n }, (_, i) => base + i * (Math.PI * 2 / n)) });
      if (!raf) raf = requestAnimationFrame(frame);
    },
    resize: size
  };
}

/* ── arrow keys move between bubbles in a grid ────────────────────── */
function gridKeys(container, cols){
  container.addEventListener('keydown', (e) => {
    const list = Array.from(container.querySelectorAll('button'));
    const i = list.indexOf(document.activeElement); if (i < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(list.length - 1, i + step));
    list[j].focus();
  });
}

const PALETTE = ['#F4A7A7', '#F7C38A', '#F2DE84', '#A6DBB3', '#9CC7EE', '#C3AAE9'];
const PALETTE_B = ['#C3AAE9', '#9CC7EE', '#A6DBB3', '#F2DE84', '#F7C38A', '#F4A7A7'];

/* ════ FREE POP: pop-it ════════════════════════════════════════════ */
function popit(stage, ui, level){
  // Three levels. Easy never refills. Medium refills slowly and has no
  // double bubbles. Hard refills fast and adds double bubbles each round.
  const L = { easy: null,
    medium: { start: 9000, step: 500, min: 4500, dbl: 0, key: 'lena_pop_best_round_medium' },
    hard:   { start: 6000, step: 650, min: 2200, dbl: 3, key: 'lena_pop_best_round' } }[level] || null;
  const hard = !!L;
  const wrap = document.createElement('div'); wrap.className = 'lp-popit-wrap' + (hard ? ' hard' : '');
  const board = document.createElement('div'); board.className = 'lp-board';
  wrap.appendChild(board); stage.appendChild(wrap);
  const fx = Fx(stage);
  const roundTag = document.createElement('div'); roundTag.className = 'lp-round'; roundTag.setAttribute('aria-hidden', 'true');
  if (hard) stage.appendChild(roundTag);
  const w = stage.clientWidth, cols = w < 420 ? 5 : 6, rows = 6;
  const s = Math.max(40, Math.min(56, Math.floor((Math.min(w, 520) - 80 - (cols - 1) * 9) / cols)));
  board.style.gridTemplateColumns = `repeat(${cols}, ${s}px)`;
  let side = 0, left = 0, flipping = false, round = 1, alive = true;
  let best = 1; try { if (L) best = +localStorage.getItem(L.key) || 1; } catch (e) {}
  const bubbles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lp-b';
    b.style.setProperty('--s', s + 'px'); b.dataset.r = r;
    board.appendChild(b); bubbles.push(b);
  }
  // Each round refills a little faster, and on Hard more bubbles become
  // "double" bubbles that need two presses.
  const refillMs = () => Math.max(L.min, L.start - (round - 1) * L.step);
  const doubles = () => Math.min(Math.floor(bubbles.length / 2), (round - 1) * L.dbl);
  function label(b){
    const r = +b.dataset.r + 1, st = b.classList.contains('down') ? 'popped' : b.dataset.hits === '1' ? 'needs one more press' : b.dataset.need === '2' ? 'needs two presses' : 'raised';
    b.setAttribute('aria-label', 'Bubble, row ' + r + ', ' + st);
  }
  function paint(){
    const pal = side ? PALETTE_B : PALETTE;
    const dbl = new Set(hard ? bubbles.map((b, i) => i).sort(() => Math.random() - .5).slice(0, doubles()) : []);
    bubbles.forEach((b, i) => {
      clearTimeout(b._t);
      b.style.setProperty('--c', pal[+b.dataset.r]);
      b.classList.remove('down', 'press', 'half', 'dbl', 'refill');
      b.dataset.need = dbl.has(i) ? '2' : '1'; b.dataset.hits = '0';
      if (dbl.has(i)) b.classList.add('dbl');
      b.setAttribute('aria-pressed', 'false'); label(b);
    });
    left = bubbles.length;
    if (hard) roundTag.textContent = 'Round ' + round + (best > 1 ? '  ·  best ' + best : '');
  }
  paint();
  function refill(b){
    if (!alive || flipping || !b.classList.contains('down')) return;
    b.classList.remove('down'); b.classList.add('refill'); b.dataset.hits = '0';
    if (b.dataset.need === '2') b.classList.add('dbl');
    b.setAttribute('aria-pressed', 'false'); label(b);
    setTimeout(() => b.classList.remove('refill'), 460);
    left++; SND.refill();
  }
  function pop(b){
    if (flipping || b.classList.contains('down')) return;
    b.classList.remove('press');
    // a double bubble takes two presses
    if (b.dataset.need === '2' && b.dataset.hits === '0') {
      b.dataset.hits = '1'; b.classList.add('half'); SND.half(); buzz(5); label(b); return;
    }
    b.classList.remove('half', 'dbl'); b.classList.add('down'); b.setAttribute('aria-pressed', 'true'); label(b);
    SND.popit(); buzz(8); fx.ring(b, getComputedStyle(b).getPropertyValue('--c'));
    if (--left === 0) { bubbles.forEach(x => clearTimeout(x._t)); setTimeout(flip, 420); return; }
    if (hard) b._t = setTimeout(() => refill(b), refillMs());
  }
  function flip(){
    flipping = true; SND.flip();
    if (hard) {
      round++;
      if (round > best) { best = round; try { localStorage.setItem(L.key, String(best)); } catch (e) {} }
      ui.say('Round ' + round + '. Bubbles fill back up a little faster.');
    } else ui.say('Flip it over');
    if (reduced()) { side ^= 1; paint(); flipping = false; if (!hard) ui.say('All popped. Here is the other side.'); return; }
    board.classList.toggle('flip');
    setTimeout(() => { side ^= 1; paint(); }, 330);
    setTimeout(() => { flipping = false; if (!hard) ui.say(''); }, 720);
  }
  let pressed = null;
  board.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.lp-b'); if (!b || b.classList.contains('down') || flipping) return;
    audio(); pressed = b; b.classList.add('press');
  });
  const release = (e) => {
    if (!pressed) return;
    const b = pressed; pressed = null;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over && over.closest('.lp-b') === b) pop(b); else b.classList.remove('press');
  };
  const cancel = () => { if (pressed) pressed.classList.remove('press'); pressed = null; };
  window.addEventListener('pointerup', release); window.addEventListener('pointercancel', cancel);
  board.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('lp-b')) { e.preventDefault(); if (!e.repeat) e.target.classList.add('press'); }
  });
  board.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('lp-b')) { e.preventDefault(); pop(e.target); }
  });
  gridKeys(board, cols);
  ui.say(level === 'hard' ? 'Pop them all before they fill back up. Dashed bubbles need two presses.' : hard ? 'Pop them all before they fill back up. No rush, you have time.' : 'Press a bubble, then let go.');
  return () => { alive = false; bubbles.forEach(b => clearTimeout(b._t)); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', cancel); };
}

/* ════ FREE POP: bubble wrap ═══════════════════════════════════════ */
function wrapMode(stage, ui){
  const fx = Fx(stage);
  const w = stage.clientWidth, cols = w < 420 ? 6 : 9, rows = w < 420 ? 8 : 7;
  const s = Math.max(38, Math.min(52, Math.floor((Math.min(w, 620) - 60 - cols * 6) / (cols + .5))));
  let sheet = null, left = 0, dragging = false;
  function newSheet(){
    if (sheet) sheet.remove();
    sheet = document.createElement('div'); sheet.className = 'lp-wrap-sheet lp-sheet-in';
    sheet.style.width = (cols * (s + 6) + s / 2 + 20) + 'px'; sheet.style.maxWidth = 'calc(100% - 20px)';
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div'); row.className = 'lp-wrow' + (r % 2 ? ' odd' : '');
      row.style.setProperty('--s', s + 'px');
      for (let c = 0; c < cols; c++) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'lp-w'; b.style.setProperty('--s', s + 'px');
        b.setAttribute('aria-label', 'Bubble'); row.appendChild(b);
      }
      sheet.appendChild(row);
    }
    stage.insertBefore(sheet, stage.firstChild);
    left = rows * cols;
    gridKeys(sheet, cols);
    fx.resize();
  }
  function pop(b){
    if (!b || b.classList.contains('pop')) return;
    b.classList.add('pop'); b.setAttribute('aria-label', 'Popped'); b.disabled = false;
    SND.wrap(); buzz(6); fx.ring(b, 'rgba(90,150,190,.9)');
    if (--left === 0) { ui.say('Fresh sheet coming…'); setTimeout(() => { newSheet(); ui.say(''); }, 900); }
  }
  newSheet();
  // A drag can start anywhere on the sheet, even between bubbles.
  stage.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.lp-wrap-sheet')) return;
    audio(); dragging = true; try { stage.setPointerCapture(e.pointerId); } catch (x) {}
    pop(e.target.closest('.lp-w')); e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList.contains('lp-w')) pop(el);
  });
  const end = () => { dragging = false; };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('lp-w')) { e.preventDefault(); pop(e.target); }
  });
  ui.say('Tap a bubble, or drag your finger across a row.');
  return () => {};
}

/* ════ THOUGHT POP ═════════════════════════════════════════════════ */
// Thinking traps, five of each, using the same twelve names as the daily
// thinking check so the two teach the same words.
const TRAPS = [
  // overgeneralising
  ['I always mess everything up.', 'Overgeneralising'], ['One bad day means a bad week.', 'Overgeneralising'],
  ['Nobody ever listens to me.', 'Overgeneralising'], ['I never get picked for anything.', 'Overgeneralising'],
  ['Every time I try, it goes wrong.', 'Overgeneralising'],
  // mind reading
  ['Everyone thinks I\'m weird.', 'Mind reading'], ['No reply. They must hate me.', 'Mind reading'],
  ['My teacher thinks I\'m lazy.', 'Mind reading'], ['They laughed. It was about me.', 'Mind reading'],
  ['My parents think I\'m a failure.', 'Mind reading'],
  // catastrophising
  ['If I fail this, my life is over.', 'Catastrophising'], ['This presentation will be a disaster.', 'Catastrophising'],
  ['One bad grade will ruin my future.', 'Catastrophising'], ['If I\'m late, everything falls apart.', 'Catastrophising'],
  ['I forgot my homework. I\'m doomed.', 'Catastrophising'],
  // labelling
  ['I\'m such a loser.', 'Labelling'], ['I\'m hopeless at everything.', 'Labelling'], ['I\'m a failure.', 'Labelling'],
  ['I\'m so annoying.', 'Labelling'], ['I\'m the weird one in class.', 'Labelling'],
  // should statements
  ['I should never feel sad.', 'Should statements'], ['I should be over this by now.', 'Should statements'],
  ['I should be better than this.', 'Should statements'], ['I must never make mistakes.', 'Should statements'],
  ['I should always be happy.', 'Should statements'],
  // fortune telling
  ['I\'ll definitely fail tomorrow.', 'Fortune telling'], ['I just know it won\'t work out.', 'Fortune telling'],
  ['Nobody will talk to me there.', 'Fortune telling'], ['I\'ll freeze and forget it all.', 'Fortune telling'],
  ['If I say no, they\'ll leave me.', 'Fortune telling'],
  // personalising
  ['Their bad mood is my fault.', 'Personalising'], ['My parents argue because of me.', 'Personalising'],
  ['We lost the match. It\'s on me.', 'Personalising'], ['My friend is sad. I did something.', 'Personalising'],
  ['The group got a C. My fault.', 'Personalising'],
  // emotional reasoning
  ['I feel stupid, so I am stupid.', 'Emotional reasoning'], ['I\'m nervous, so it will go badly.', 'Emotional reasoning'],
  ['I feel guilty, so I did wrong.', 'Emotional reasoning'], ['I feel left out, so I\'m unwanted.', 'Emotional reasoning'],
  ['I feel scared, so it\'s dangerous.', 'Emotional reasoning'],
  // mental filter
  ['Nothing good ever happens to me.', 'Mental filter'], ['One mistake ruined the whole talk.', 'Mental filter'],
  ['One comment ruined my whole day.', 'Mental filter'], ['I only see what went wrong.', 'Mental filter'],
  ['9 right, 1 wrong. I keep seeing the 1.', 'Mental filter'],
  // discounting the positive
  ['That A doesn\'t count. It was easy.', 'Discounting the positive'], ['They\'re only being nice to me.', 'Discounting the positive'],
  ['I only passed because I was lucky.', 'Discounting the positive'], ['Anyone could have done that.', 'Discounting the positive'],
  ['My win doesn\'t really mean anything.', 'Discounting the positive'],
  // comparing
  ['Everyone else has it together.', 'Comparing'], ['She\'s smarter, so I\'m dumb.', 'Comparing'],
  ['Everyone\'s life online is better.', 'Comparing'], ['My cousin did better. I\'m a let-down.', 'Comparing'],
  ['They all get it. Why can\'t I?', 'Comparing'],
  // all-or-nothing
  ['If it\'s not perfect, it\'s worthless.', 'All-or-nothing thinking'], ['Either I\'m the best or I quit.', 'All-or-nothing thinking'],
  ['I missed one day. It\'s all ruined.', 'All-or-nothing thinking'], ['They either love me or hate me.', 'All-or-nothing thinking'],
  ['If I can\'t do it all, why start?', 'All-or-nothing thinking']
];
// Balanced thoughts. Realistic, not forced cheerfulness: "everything
// will be perfect" would itself be fortune telling.
const GOOD = [
  'One bad quiz isn\'t my whole semester.', 'I don\'t know what they think. I could ask.', 'I made a mistake. I can fix it.',
  'Feeling nervous is normal.', 'Some things went well today too.', 'One step at a time is enough.',
  'Feeling stupid isn\'t being stupid.', 'It\'s okay to ask for help.', 'I\'m learning. Learning is messy.',
  'This is hard, not hopeless.', 'Good enough is good enough.', 'I can\'t control everything, and that\'s okay.',
  'Tomorrow is another try.', 'A setback is not a verdict.', 'I did my best with what I knew.', 'My friends have bad days too.',
  'I got some wrong. I got some right too.', 'I\'m nervous and I can still try.', 'My worth isn\'t my grade.',
  'Maybe they\'re busy, not upset.', 'I can say no and still be kind.', 'I\'m not the only one who struggles.',
  'Posts online show the best bits.', 'Resting isn\'t the same as failing.', 'It went wrong. What can I learn?',
  'Mistakes mean I\'m trying.', 'I can\'t fix their mood. I can be kind.', 'Done is better than perfect.',
  'Feelings pass. This one will too.', 'I\'m allowed to take a break.', 'Asking a question isn\'t stupid.',
  'I\'ll prepare, then see what happens.', 'Their success doesn\'t cancel mine.', 'I can be sad and still be okay.',
  'Not everyone has to like me.', 'I did better than last time.', 'I don\'t have to do it all today.',
  'Some people do care about me.', 'A low mark shows me what to practise.', 'I can start small.'
];
function thoughts(stage, ui){
  const field = document.createElement('div'); field.className = 'lp-thoughts';
  const legend = document.createElement('div'); legend.className = 'lp-legend';
  legend.textContent = 'Pop the thinking traps. Let the balanced thoughts float away.';
  const hud = document.createElement('div'); hud.className = 'lp-hud';
  hud.innerHTML = '<div class="lp-pill"><span>Score <b class="lp-score">0</b></span><span class="lp-hearts" role="img"></span></div><div class="lp-pill lp-streak" hidden></div>';
  const pulse = document.createElement('div'); pulse.className = 'lp-pulse';
  stage.appendChild(field); stage.appendChild(hud); stage.appendChild(pulse); stage.appendChild(legend);
  const fx = Fx(stage);
  const scoreEl = hud.querySelector('.lp-score'), heartsEl = hud.querySelector('.lp-hearts'), streakEl = hud.querySelector('.lp-streak');
  let items = [], raf = 0, last = 0, spawnAt = 0, lastLane = -1, deckT = [], deckG = [];
  let score = 0, streak = 0, lives = 3, playing = true, best = 0;
  try { best = +localStorage.getItem('lena_pop_best') || 0; } catch (e) {}
  const W = () => field.clientWidth, H = () => field.clientHeight;
  const draw = (deck, src) => { if (!deck.length) deck.push(...src.map((x, i) => i).sort(() => Math.random() - .5)); return deck.pop(); };
  // It speeds up gently as the score climbs, up to a little over twice
  // the starting pace.
  const pace = () => Math.min(2.3, 1 + score * 0.05);
  function paintHud(){
    scoreEl.textContent = score;
    heartsEl.innerHTML = [0, 1, 2].map(i => '<span' + (i < lives ? '' : ' class="off"') + '>\u2665</span>').join('');
    heartsEl.setAttribute('aria-label', 'Lives: ' + lives + ' of 3');
    streakEl.hidden = streak < 3; streakEl.textContent = streak + ' in a row';
  }
  function bump(el){ el.classList.remove('lp-bump'); void el.offsetWidth; el.classList.add('lp-bump'); }
  function spawn(){
    if (!playing || items.length >= (W() < 420 ? 3 : 4)) return;
    const trap = Math.random() < .62;
    const text = trap ? TRAPS[draw(deckT, TRAPS)] : GOOD[draw(deckG, GOOD)];
    const label = trap ? text[1] : null, words = trap ? text[0] : text;
    const d = Math.max(120, Math.min(150, 96 + words.length * 1.3));
    const lanes = Math.max(2, Math.floor(W() / (d + 12)));
    let lane; do { lane = Math.floor(Math.random() * lanes); } while (lane === lastLane && lanes > 1);
    lastLane = lane;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lp-t'; b.textContent = words;
    b.style.setProperty('--d', d + 'px');
    b.style.setProperty('--c', ['rgba(156,199,238,.95)', 'rgba(166,219,179,.95)', 'rgba(195,170,233,.9)', 'rgba(247,195,138,.9)'][Math.floor(Math.random() * 4)]);
    b.setAttribute('aria-label', words); b.dataset.k = trap ? 't' : 'g';
    const x = (W() - d) * (lanes === 1 ? .5 : lane / (lanes - 1));
    const it = { b, trap, label, d, x, y: H() + 10, sp: (22 + Math.random() * 10) * pace(), ph: Math.random() * 6, gone: false };
    if (reduced()) it.y = Math.random() * (H() - d - 60) + 50;
    b.onclick = () => hit(it);
    field.appendChild(b); items.push(it); place(it, 0);
    if (reduced()) it.timer = setTimeout(() => escape(it), Math.max(4500, 9000 / pace()));
  }
  function place(it, t){
    const sway = reduced() ? 0 : Math.sin(t / 900 + it.ph) * 10;
    const x = Math.max(6, Math.min(W() - it.d - 6, it.x + sway));
    it.b.style.transform = `translate(${x}px, ${it.y}px)`;
  }
  function tag(x, y, text, kind){
    const l = document.createElement('div'); l.className = 'lp-label' + (kind ? ' ' + kind : ''); l.textContent = text;
    l.style.top = Math.max(64, y) + 'px';
    field.appendChild(l);
    // keep the whole label on screen, and clear of the score bar
    const hw = l.offsetWidth / 2 + 8;
    l.style.left = Math.max(hw, Math.min(W() - hw, x)) + 'px'; setTimeout(() => l.remove(), 1950);
  }
  function at(it){ const s = field.getBoundingClientRect(), r = it.b.getBoundingClientRect(); return [r.left - s.left + r.width / 2, r.top - s.top + r.height / 2]; }
  function miss(x, y, text, say){
    lives--; streak = 0; SND.wrong(); buzz([30, 40, 30]);
    pulse.classList.remove('go'); void pulse.offsetWidth; pulse.classList.add('go');
    tag(x, y, text, 'bad'); ui.say(say);
    paintHud(); bump(heartsEl);
    if (lives <= 0) gameOver();
  }
  function remove(it){ it.gone = true; clearTimeout(it.timer); items = items.filter(o => o !== it); }
  function hit(it){
    if (it.gone || !playing) return; audio();
    const [x, y] = at(it);
    remove(it);
    if (it.trap) {
      score++; streak++; SND.right(); buzz(8); fx.ring(it.b, 'rgba(30,138,95,.9)');
      tag(x, y, it.label, 'good'); ui.say('Thinking trap: ' + it.label + '. Score ' + score + '.');
      it.b.remove(); paintHud(); bump(scoreEl);
    } else {
      it.b.classList.add('kept'); it.b.disabled = true; setTimeout(() => it.b.remove(), 1400);
      miss(x, y, 'That one is balanced. Let it go.', 'That was a balanced thought. Let those float away. Lives left: ' + Math.max(0, lives - 1) + '.');
    }
  }
  // Something left the top. A trap that gets away costs a life; a
  // balanced thought floating off is exactly right.
  function escape(it){
    if (it.gone) return;
    const x = Math.max(80, Math.min(W() - 80, it.x + it.d / 2));
    remove(it); it.b.remove();
    if (it.trap && playing) miss(x, 64, 'Missed: ' + it.label, 'Missed a thinking trap: ' + it.label + '. Lives left: ' + Math.max(0, lives - 1) + '.');
  }
  function gameOver(){
    playing = false; SND.over();
    items.forEach(it => { clearTimeout(it.timer); it.b.remove(); }); items = [];
    const newBest = score > best; if (newBest) { best = score; try { localStorage.setItem('lena_pop_best', String(best)); } catch (e) {} }
    const over = document.createElement('div'); over.className = 'lp-over';
    over.innerHTML = '<div class="lp-card" role="dialog" aria-label="Game over"><h3>Game over</h3><p>Thinking traps spotted</p><div class="lp-big"></div>' +
      '<p class="lp-best"></p><p>Every trap you notice here is easier to notice in your own head.</p><button type="button" class="lp-tab">Play again</button></div>';
    over.querySelector('.lp-big').textContent = score;
    over.querySelector('.lp-best').textContent = newBest && score > 0 ? 'A new best!' : 'Your best: ' + best;
    over.querySelector('button').onclick = () => { over.remove(); score = 0; streak = 0; lives = 3; playing = true; spawnAt = 0; paintHud(); ui.say('New game. Pop the thinking traps.'); field.focus(); };
    stage.appendChild(over);
    ui.say('Game over. You spotted ' + score + (score === 1 ? ' thinking trap.' : ' thinking traps.'));
    setTimeout(() => over.querySelector('button').focus(), 60);
  }
  function frame(t){
    const dt = last ? Math.min(50, t - last) : 16; last = t;
    if (playing && t >= spawnAt) { spawn(); spawnAt = t + Math.max(1100, (reduced() ? 3500 : 2600 + Math.random() * 900) / pace()); }
    if (!reduced()) items.slice().forEach(it => { it.y -= it.sp * dt / 1000; place(it, t); if (it.y < -it.d * 0.55) escape(it); });
    raf = requestAnimationFrame(frame);
  }
  paintHud();
  field.tabIndex = -1;
  raf = requestAnimationFrame(frame);
  ui.say('Pop the thinking traps. Let the balanced thoughts float away. You have three lives.');
  const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', vis);
  return () => { playing = false; cancelAnimationFrame(raf); items.forEach(it => clearTimeout(it.timer)); document.removeEventListener('visibilitychange', vis); };
}

/* ════ THINKING GAMES: shared bits ═════════════════════════════════
   Word Hunt, Evidence Court and Reframe Builder. All three are about
   made-up characters or general sentences, never the player's own life,
   the same rule as the daily thinking check. A wrong answer is never
   "wrong": it shows the answer and why, because the point is practice. */
const MIND_CSS = `
/* the how-to-play card: describes only the section that's open */
.lp-intro{--tint:#9B85D6;display:flex;gap:12px;align-items:center;margin:0 0 12px;padding:12px 14px;border-radius:18px;
  background:color-mix(in srgb,var(--tint) 13%,var(--lp-card));border:1px solid color-mix(in srgb,var(--tint) 30%,transparent)}
.lp-intro .ic{flex:none;width:44px;height:44px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:23px;
  background:color-mix(in srgb,var(--tint) 30%,var(--lp-card));box-shadow:inset 0 -2px 0 color-mix(in srgb,var(--tint) 35%,transparent)}
.lp-intro h4{margin:0 0 2px;font-family:var(--ff-d,Georgia,serif);font-size:17px;font-weight:600;color:var(--lp-text);letter-spacing:-.01em}
.lp-intro p{margin:0;font-size:13px;line-height:1.5;color:var(--lp-text)}
.lp-intro p b{font-weight:700;color:color-mix(in srgb,var(--tint) 45%,var(--lp-text))}
.lp-intro.in{animation:lmIn .3s ease-out}
@media (prefers-reduced-motion: reduce){.lp-intro.in{animation:none}}
.lp-stage.lm-stage{touch-action:auto}
.lm{padding:18px 16px 20px;display:flex;flex-direction:column;gap:14px;min-height:420px;box-sizing:border-box}
.lm-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;color:var(--lp-text2);font-weight:600}
.lm-pill{background:var(--lp-card);padding:6px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.06);font-variant-numeric:tabular-nums;color:var(--lp-text)}
.lm-q{font-size:15px;font-weight:600;line-height:1.5;margin:0}
.lm-card{background:var(--lp-card);border-radius:18px;padding:16px;box-shadow:0 4px 18px rgba(0,0,0,.06)}
.lm-fb{border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.55;background:var(--lp-card)}
.lm-fb b{font-weight:700}
.lm-fb.good{background:color-mix(in srgb,var(--lp-good) 13%,var(--lp-card));color:color-mix(in srgb,var(--lp-good) 62%,var(--lp-text))}
.lm-fb.warn{background:color-mix(in srgb,#E0A030 18%,var(--lp-card));color:color-mix(in srgb,#B07400 40%,var(--lp-text))}
.lm-go{align-self:center;padding:11px 26px;border-radius:999px;border:none;background:var(--lp-fill);color:var(--lp-on);font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.lm-go:active{transform:scale(.94)}
.lm-go.ghost{background:var(--lp-card);color:var(--lp-text);border:1.5px solid var(--lp-border)}
.lm-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.lm :focus-visible{outline:3px solid var(--lp-fill);outline-offset:2px}
@keyframes lmShake{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes lmIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.lm-in{animation:lmIn .3s ease-out}
/* word hunt */
.lm-sent{display:flex;flex-wrap:wrap;gap:6px 4px;justify-content:center;padding:22px 10px;font-family:var(--ff-d,Georgia,serif)}
.lm-w{font-weight:500;font-size:21px;font-family:inherit;color:var(--lp-text);background:transparent;border:2px solid transparent;border-radius:10px;padding:3px 6px;cursor:pointer;
  transition:background .2s,color .2s,transform .2s}
.lm-w:hover{background:color-mix(in srgb,var(--lp-fill) 8%,transparent)}
.lm-w.found{background:var(--lp-good);color:#fff;transform:scale(1.06)}
.lm-w.no{animation:lmShake .35s;border-color:color-mix(in srgb,var(--lp-red) 60%,transparent)}
.lm-w.hint{border-color:color-mix(in srgb,#E0A030 70%,transparent);border-style:dashed}
/* evidence court */
.lm-who{display:flex;gap:12px;align-items:flex-start}
.lm-av{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;background:var(--c,#6C9BD2)}
.lm-thought{background:color-mix(in srgb,#F7C38A 38%,var(--lp-card));border-radius:4px 16px 16px 16px;padding:10px 14px;font-size:15px;line-height:1.45}
.lm-thought small{display:block;font-size:12px;color:var(--lp-text);font-weight:700;margin-bottom:2px;letter-spacing:.02em}
.lm-ev{font-size:16px;line-height:1.5;text-align:center;padding:18px 16px;min-height:56px;display:flex;align-items:center;justify-content:center}
.lm-bins{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.lm-bin{border-radius:14px;border:1.5px solid var(--lp-border);background:var(--lp-card);padding:10px 4px 12px;font-weight:700;font-size:13px;font-family:inherit;color:var(--lp-text);cursor:pointer;line-height:1.3;
  display:flex;flex-direction:column;align-items:center;gap:4px;transition:transform .25s cubic-bezier(.34,1.56,.64,1)}
.lm-bin .ic{font-size:24px;line-height:1}
.lm-bin:active{transform:scale(.94)}
.lm-bin[disabled]{cursor:default}
.lm-bin.pick{border-color:var(--lp-good);background:color-mix(in srgb,var(--lp-good) 12%,var(--lp-card))}
.lm-scale{display:block;width:100%;max-width:300px;margin:0 auto}
.lm-scale .beam{transition:transform .6s cubic-bezier(.34,1.4,.64,1);transform-origin:150px 22px}
.lm-scale text{font:700 12px var(--ff-b,system-ui);fill:var(--lp-text)}
.lm-opt{text-align:left;width:100%;border-radius:14px;border:1.5px solid var(--lp-border);background:var(--lp-card);padding:12px 14px;font-weight:500;font-size:15px;font-family:inherit;color:var(--lp-text);cursor:pointer;line-height:1.45}
.lm-opt.good{border-color:var(--lp-good);background:color-mix(in srgb,var(--lp-good) 13%,var(--lp-card))}
.lm-opt.warn{border-color:#E0A030;background:color-mix(in srgb,#E0A030 14%,var(--lp-card))}
/* reframe builder */
.lm-slots{display:flex;flex-direction:column;gap:8px}
.lm-slot{border:2px dashed var(--lp-border);border-radius:14px;padding:8px 12px;font-size:15px;line-height:1.4;min-height:22px;background:var(--lp-card);transition:background .3s,border-color .3s}
.lm-slot small{display:block;font-size:11.5px;font-weight:700;color:var(--lp-text2);letter-spacing:.02em}
.lm-slot.f{border-style:solid;border-color:var(--lp-good);background:color-mix(in srgb,var(--lp-good) 11%,var(--lp-card))}
.lm-slot.now{border-color:var(--lp-fill)}
.lm-words{display:flex;flex-wrap:wrap;gap:6px 4px;justify-content:center;padding:6px 0;font-family:var(--ff-d,Georgia,serif)}
@media (prefers-reduced-motion: reduce){.lm-in,.lm-w.no{animation:none}.lm-w,.lm-go,.lm-bin,.lm-slot,.lm-scale .beam{transition:none}}
`;
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function mk(tag, cls, html){ const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, String(v)); } catch (e) { return null; } }
// The end-of-round card, shared by all three games.
function endCard(stage, title, big, lines, again){
  const over = mk('div', 'lp-over');
  over.innerHTML = '<div class="lp-card" role="dialog" aria-label="' + esc(title) + '"><h3>' + esc(title) + '</h3><div class="lp-big">' + esc(big) + '</div>' +
    lines.map(l => '<p>' + esc(l) + '</p>').join('') + '<button type="button" class="lp-tab">Play again</button></div>';
  over.querySelector('button').onclick = () => { over.remove(); again(); };
  stage.appendChild(over);
  setTimeout(() => over.querySelector('button').focus(), 60);
}

/* ════ WORD HUNT ═══════════════════════════════════════════════════
   Tap the words that give the trap away. [square brackets] mark them.
   After three misses on one sentence, the trap words get a dashed
   outline as a hint. */
const HUNT = [
  ['I [always] get picked last. [Nobody] wants me on the team.', 'Overgeneralising', 'Try: "I got picked last today."'],
  ['I [never] do anything right.', 'Overgeneralising', 'Try: "This went wrong. Other things go right."'],
  ['I [can\'t] do [anything] right today.', 'Overgeneralising', 'Try: "A few things went wrong today."'],
  ['[Nobody] [ever] listens to me.', 'Overgeneralising', 'Try: "My friend didn\'t listen this time."'],
  ['[Everyone] in class thinks I\'m weird.', 'Mind reading', 'Try: "I don\'t know what they think."'],
  ['She didn\'t text back. She [definitely] hates me.', 'Mind reading', 'Try: "She might be busy."'],
  ['They [all] think I\'m annoying.', 'Mind reading', 'Try: "One person seemed annoyed once."'],
  ['I [should] be better at this by now.', 'Should statements', 'Try: "I\'m still learning this."'],
  ['I [shouldn\'t] feel nervous.', 'Should statements', 'Try: "Feeling nervous before a test is normal."'],
  ['I [have to] be happy [all] the time.', 'Should statements', 'Try: "Everyone has sad days, me too."'],
  ['I [must] get full marks or I\'m [worthless].', 'All-or-nothing thinking', 'Try: "Full marks would be great. Less is still okay."'],
  ['If I\'m not the best, I\'m a [total] [failure].', 'All-or-nothing thinking', 'Try: "I don\'t need to be the best to do well."'],
  ['This test is a [disaster]. My future is [ruined].', 'Catastrophising', 'Try: "This test went badly. It\'s one test."'],
  ['One bad mark and [everything] is [ruined].', 'Catastrophising', 'Try: "One bad mark is one bad mark."'],
  ['I\'m such an [idiot] for forgetting.', 'Labelling', 'Try: "I forgot. Everyone forgets sometimes."'],
  ['I\'m [hopeless] at Maths.', 'Labelling', 'Try: "Maths is hard for me right now."'],
  ['I\'m [just] not a maths person.', 'Labelling', 'Try: "I haven\'t got the hang of this topic yet."'],
  ['I\'ll [definitely] fail tomorrow.', 'Fortune telling', 'Try: "I\'m worried about tomorrow. I can prepare."'],
  ['I\'ll [never] make friends here.', 'Fortune telling', 'Try: "Making friends at a new school takes time."'],
  ['I\'m anxious, so it\'s [obviously] going to go wrong.', 'Emotional reasoning', 'Try: "Feeling anxious doesn\'t decide how it goes."'],
  ['It\'s [all] my fault the group did badly.', 'Personalising', 'Try: "I was one part of the group."'],
  ['[Nothing] good [ever] happens to me.', 'Mental filter', 'Try: "Today was hard. Some good things still happened this week."'],
  ['That A was [only] luck.', 'Discounting the positive', 'Try: "I worked for that A."'],
  ['[Everyone] else has their life sorted.', 'Comparing', 'Try: "Other people struggle too. I just don\'t see it."']
];
function parseHunt(s){
  const out = [], re = /\[([^\]]+)\]([^\s\[]*)|(\S+)/g; let m;
  while ((m = re.exec(s))) out.push(m[3] != null ? { t: m[3], k: false } : { t: m[1] + m[2], k: true });
  return out;
}
function wordHunt(stage, ui, level){
  stage.classList.add('lm-stage');
  const timed = level === 'timed', ROUND = 8, TIME = 60;
  const box = mk('div', 'lm'); stage.appendChild(box);
  let deck = [], idx = 0, done = 0, clean = 0, misses = 0, left = TIME, timer = 0, alive = true, busy = false;
  const best = () => +store('lena_hunt_best') || 0;
  function draw(){ if (!deck.length) deck = shuffle(HUNT); return deck.pop(); }
  function head(){
    return '<div class="lm-head"><span class="lm-pill">' + (timed ? '⏱ <span class="lm-t">' + fmt(left) + '</span>' : 'Sentence ' + Math.min(idx + 1, ROUND) + ' of ' + ROUND) +
      '</span><span class="lm-pill">Found <b class="lm-score">' + done + '</b></span></div>';
  }
  const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function show(){
    if (!alive || (timed && left <= 0)) return;
    const [text, trap, tip] = draw(), toks = parseHunt(text);
    let need = toks.filter(t => t.k).length; misses = 0; busy = false;
    box.innerHTML = head() + '<p class="lm-q">Tap the words that give the thinking trap away.</p>';
    const card = mk('div', 'lm-card lm-in'); const sent = mk('div', 'lm-sent');
    sent.setAttribute('role', 'group'); sent.setAttribute('aria-label', 'Sentence: ' + toks.map(t => t.t).join(' '));
    const fb = mk('div', 'lm-fb'); fb.hidden = true;
    toks.forEach(t => {
      const b = mk('button', 'lm-w'); b.type = 'button'; b.textContent = t.t;
      b.onclick = () => {
        if (busy || b.classList.contains('found')) return; audio();
        if (t.k) {
          b.classList.add('found'); b.setAttribute('aria-pressed', 'true'); SND.half(); buzz(6);
          if (--need === 0) solved();
        } else {
          misses++; SND.nope(); buzz(20);
          b.classList.remove('no'); void b.offsetWidth; b.classList.add('no');
          let note = 'Not that one.';
          if (misses >= 3) { sent.querySelectorAll('.lm-w').forEach((x, i) => { if (toks[i].k && !x.classList.contains('found')) x.classList.add('hint'); }); note = 'Hint: look for words like always, never, everyone or should. They have a dashed outline now.'; }
          fb.className = 'lm-fb warn'; fb.hidden = false; fb.textContent = note; ui.say(note);
        }
      };
      sent.appendChild(b);
    });
    card.appendChild(sent); box.appendChild(card); box.appendChild(fb);
    function solved(){
      busy = true; done++; if (!misses) clean++;
      SND.right(); box.querySelector('.lm-score').textContent = done;
      fb.className = 'lm-fb good lm-in'; fb.hidden = false;
      fb.innerHTML = '<b>' + esc(trap) + '.</b> ' + esc(tip);
      ui.say(trap + '. ' + tip);
      if (timed) { setTimeout(show, 1300); return; }
      idx++;
      const next = mk('button', 'lm-go', idx >= ROUND ? 'See results' : 'Next'); next.type = 'button';
      next.onclick = () => idx >= ROUND ? finish() : show();
      box.appendChild(next); next.focus();
    }
    const first = sent.querySelector('.lm-w'); if (first && idx > 0) first.focus();
  }
  function finish(){
    if (timed) {
      clearInterval(timer); busy = true;
      const nb = done > best(); if (nb) store('lena_hunt_best', done);
      SND.over();
      endCard(stage, 'Time’s up', done, [done === 1 ? 'sentence cleared' : 'sentences cleared', nb && done > 0 ? 'A new best!' : 'Your best: ' + best()], start);
      ui.say('Time is up. You cleared ' + done + '.');
    } else {
      SND.over();
      endCard(stage, 'Round done', clean + ' / ' + ROUND, ['found with no misses', 'Spotting the giveaway word is the first step to catching a trap in your own head.'], start);
      ui.say('Round done. ' + clean + ' of ' + ROUND + ' with no misses.');
    }
  }
  function start(){
    idx = 0; done = 0; clean = 0; left = TIME; clearInterval(timer);
    if (timed) timer = setInterval(() => {
      if (document.hidden || !alive) return;
      left--; const t = box.querySelector('.lm-t'); if (t) t.textContent = fmt(left);
      if (left <= 0) finish();
    }, 1000);
    show();
  }
  ui.say(timed ? 'Clear as many sentences as you can in one minute.' : 'Tap the words that give each thinking trap away.');
  start();
  return () => { alive = false; clearInterval(timer); };
}

/* ════ EVIDENCE COURT ══════════════════════════════════════════════
   For each card the question is the same plain one: "Does this back up
   their thought?" Three answers: backs it up, goes against it, or just a
   feeling. A scale tips as the cards are sorted. Then two short verdicts:
   the original thought, or a fairer one in the character's own words.
   A wrong answer gets a nudge first, then the answer and why. Nobody
   gets stuck.
   kinds: f = backs it up, a = goes against it, n = just a feeling */
const COURT = [
  { who: 'Hana', c: '#E28FA8', th: 'Everyone in class thinks I\'m boring.', fair: 'Some people enjoy being with me.', ev: [
    ['Two classmates checked their phones while she was talking.', 'f', 'A little. People check their phones for lots of reasons.'],
    ['Siti sat with her at lunch today.', 'a', 'Someone chose to spend time with her.'],
    ['She was asked to join a group project.', 'a', 'People wanted her in their group.'],
    ['She feels boring today.', 'n', 'A real feeling, but feelings aren\'t proof.']] },
  { who: 'Arjun', c: '#6C9BD2', th: 'I\'m going to fail SPM.', fair: 'One test was hard, but my marks are improving.', ev: [
    ['He got a D in his last Chemistry test.', 'f', 'One result that fits the worry.'],
    ['His Chemistry marks went up over the past year.', 'a', 'The trend is going the right way.'],
    ['His teacher said he understands the basics.', 'a', 'Someone who knows his work thinks he can do it.'],
    ['He has a bad feeling about the exam.', 'n', 'A worry, not a fact about how the exam will go.']] },
  { who: 'Mei Ling', c: '#9B85D6', th: 'My best friend is angry with me.', fair: 'She might just be busy. I can ask her.', ev: [
    ['Her friend replied with just "ok".', 'f', 'A little. Short replies can mean lots of things.'],
    ['Her friend mentioned a family event this week.', 'a', 'There\'s another reason she might be quiet.'],
    ['They made plans for Saturday two days ago.', 'a', 'Things were fine very recently.'],
    ['Mei Ling feels like the "ok" sounded cold.', 'n', 'A guess about tone. Texts are hard to read.']] },
  { who: 'Danial', c: '#4FAE8B', th: 'I\'m useless at football.', fair: 'I missed one penalty. I\'m still good enough for the team.', ev: [
    ['He missed a penalty in the last match.', 'f', 'One moment that fits the thought.'],
    ['He scored twice in training this week.', 'a', 'Recent proof he can play.'],
    ['The coach picked him for the team.', 'a', 'The coach thinks he\'s good enough.'],
    ['He feels embarrassed about the penalty.', 'n', 'Embarrassment makes sense, but it isn\'t proof.']] },
  { who: 'Wei Jie', c: '#E3A04F', th: 'Nobody wants me in their group.', fair: 'I wasn\'t picked first, but someone did ask me.', ev: [
    ['He wasn\'t picked first for the group project.', 'f', 'A little.'],
    ['Aiman asked him to join his group.', 'a', 'Someone did want him.'],
    ['Most groups were made by people sitting together.', 'a', 'Where people sat decided a lot of it.'],
    ['He feels left out.', 'n', 'That feeling matters, but it isn\'t proof.']] },
  { who: 'Kavitha', c: '#D27C6C', th: 'My presentation was a disaster.', fair: 'I forgot one line, and the rest went okay.', ev: [
    ['She forgot one line in the middle.', 'f', 'A real slip.'],
    ['She finished the whole presentation.', 'a', 'She got through all of it.'],
    ['Two friends said her slides were clear.', 'a', 'Other people saw it differently.'],
    ['Her face felt hot the whole time.', 'n', 'A body feeling, not how the talk actually went.']] },
  { who: 'Siti', c: '#5DA9C9', th: 'My parents think I\'m a disappointment.', fair: 'Mum seemed worried about one report. My parents still show they care.', ev: [
    ['Her mum sighed when she saw the report card.', 'f', 'A little. A sigh could also mean worry or tiredness.'],
    ['Her dad helped her with homework last night.', 'a', 'He\'s putting time into her.'],
    ['Her parents came to her school event.', 'a', 'They showed up for her.'],
    ['Siti feels she let them down.', 'n', 'A heavy feeling, but not proof of what they think.']] },
  { who: 'Aiman', c: '#8AA65A', th: 'I\'m bad at making friends.', fair: 'It\'s early at a new school. I\'ve made friends before.', ev: [
    ['He eats lunch alone some days at his new school.', 'f', 'A little.'],
    ['A classmate borrowed his notes and they chatted.', 'a', 'A friendship can start like that.'],
    ['He had good friends at his old school.', 'a', 'He has made friends before.'],
    ['He feels lonely at lunch.', 'n', 'Loneliness is worth caring about, but it isn\'t proof.']] }
];
const BINS = [['f', '👍', 'Backs it up'], ['a', '👎', 'Goes against it'], ['n', '💭', 'Just a feeling']];
function scaleSvg(f, a){
  const tilt = Math.max(-12, Math.min(12, (a - f) * 6));
  return '<svg class="lm-scale" viewBox="0 0 300 76" role="img" aria-label="Scale: ' + f + ' backs it up, ' + a + ' goes against it">' +
    '<line x1="150" y1="22" x2="150" y2="68" stroke="var(--lp-text2)" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="122" y1="70" x2="178" y2="70" stroke="var(--lp-text2)" stroke-width="3" stroke-linecap="round"/>' +
    '<g class="beam" style="transform:rotate(' + tilt + 'deg)"><line x1="48" y1="22" x2="252" y2="22" stroke="var(--lp-text2)" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="14" y="27" width="88" height="28" rx="10" fill="color-mix(in srgb,#E0A030 30%,var(--lp-card))"/><text x="58" y="45" text-anchor="middle">👍 ' + f + '</text>' +
    '<rect x="198" y="27" width="88" height="28" rx="10" fill="color-mix(in srgb,var(--lp-good) 22%,var(--lp-card))"/><text x="242" y="45" text-anchor="middle">👎 ' + a + '</text></g></svg>';
}
function court(stage, ui){
  stage.classList.add('lm-stage');
  const box = mk('div', 'lm'); stage.appendChild(box);
  let right = 0, total = 0;
  function header(k, f, a){
    const c = COURT[k];
    return '<div class="lm-head"><span class="lm-pill">Case ' + (k + 1) + ' of ' + COURT.length + '</span><span class="lm-pill">First try <b class="lm-score">' + right + '</b></span></div>' +
      '<div class="lm-who"><div class="lm-av" style="--c:' + c.c + '" aria-hidden="true">' + esc(c.who[0]) + '</div><div class="lm-thought"><small>' + esc(c.who) + ' thinks</small>"' + esc(c.th) + '"</div></div>' +
      scaleSvg(f, a);
  }
  function open(k){
    const c = COURT[k], cards = shuffle(c.ev), tally = { f: 0, a: 0, n: 0 };
    let i = 0;
    function card(){
      const [text, ans, why] = cards[i]; let tries = 0;
      box.innerHTML = header(k, tally.f, tally.a);
      const ev = mk('div', 'lm-card lm-ev lm-in'); ev.textContent = text; box.appendChild(ev);
      box.appendChild(mk('p', 'lm-q', 'Does this back up ' + esc(c.who) + '’s thought?'));
      const bins = mk('div', 'lm-bins'); bins.setAttribute('role', 'group'); bins.setAttribute('aria-label', 'Your answer');
      const fb = mk('div', 'lm-fb'); fb.hidden = true;
      BINS.forEach(([k2, ic, name]) => {
        const b = mk('button', 'lm-bin', '<span class="ic" aria-hidden="true">' + ic + '</span>' + name); b.type = 'button';
        b.onclick = () => {
          audio();
          if (k2 === ans) return settle(b, true);
          tries++; SND.nope();
          if (tries < 2) {
            // a nudge, not the answer
            const nudge = ans === 'n' ? 'Not quite. Is this something that happened, or something ' + c.who + ' feels?' :
              k2 === 'n' ? 'Not quite. This one really happened. Does it make the thought more true, or less?' :
              'Not quite. Does this make the thought more true, or less true?';
            fb.className = 'lm-fb warn lm-in'; fb.hidden = false; fb.textContent = nudge; ui.say(nudge);
          } else settle(bins.querySelector('[data-k="' + ans + '"]'), false);
        };
        b.dataset.k = k2; bins.appendChild(b);
      });
      box.append(bins, fb);
      function settle(b, first){
        if (first && tries === 0) right++;
        total++; tally[ans]++;
        if (first) SND.right();
        bins.querySelectorAll('button').forEach(x => x.disabled = true); b.classList.add('pick');
        const nm = BINS.find(x => x[0] === ans)[2];
        const msg = first ? 'Yes. ' + why : 'It’s “' + nm + '”. ' + why;
        fb.className = 'lm-fb lm-in ' + (first ? 'good' : 'warn'); fb.hidden = false; fb.textContent = msg; ui.say(msg);
        box.querySelector('.lm-score').textContent = right;
        box.querySelector('.lm-scale').outerHTML = scaleSvg(tally.f, tally.a);
        i++;
        const go = mk('button', 'lm-go', i < cards.length ? 'Next card' : 'See the verdict'); go.type = 'button';
        go.onclick = () => i < cards.length ? card() : verdict();
        box.appendChild(go); go.focus();
      }
      bins.querySelector('button').focus();
      ui.say(text + ' Does this back up ' + c.who + '’s thought?');
    }
    function verdict(){
      box.innerHTML = header(k, tally.f, tally.a);
      const lean = tally.a > tally.f ? 'The scale tips against ' + c.who + '’s thought.' : tally.a === tally.f ? 'The scale is about even.' : 'The scale tips towards the thought, but not all the way.';
      box.appendChild(mk('p', 'lm-q', esc(lean) + ' Which is fairer?'));
      const fb = mk('div', 'lm-fb'); fb.hidden = true;
      shuffle([[c.th, false], [c.fair, true]]).forEach(([t, good]) => {
        const b = mk('button', 'lm-opt'); b.type = 'button'; b.textContent = '“' + t + '”';
        b.onclick = () => {
          audio();
          if (!good) {
            SND.nope(); b.classList.add('warn'); b.disabled = true;
            const m = 'That’s the original thought. Most of the facts go against it. Try the other one.';
            fb.className = 'lm-fb warn lm-in'; fb.hidden = false; fb.textContent = m; ui.say(m); return;
          }
          SND.right(); buzz(10); b.classList.add('good');
          box.querySelectorAll('.lm-opt').forEach(x => x.disabled = true);
          const m = 'Case closed. That fits the evidence.' + (tally.n ? ' The feeling was set aside.' : '');
          fb.className = 'lm-fb good lm-in'; fb.hidden = false; fb.innerHTML = '<b>Case closed.</b> That fits the evidence.' + (tally.n ? ' The feeling was set aside.' : ''); ui.say(m);
          store('lena_court_case', (k + 1) % COURT.length);
          const go = mk('button', 'lm-go', k + 1 < COURT.length ? 'Next case' : 'See results'); go.type = 'button';
          go.onclick = () => k + 1 < COURT.length ? open(k + 1) : endCard(stage, 'All cases closed', right + ' / ' + total, ['cards sorted on the first try', 'Checking the facts, not just the feeling, is the core skill in CBT.'], () => { right = 0; total = 0; store('lena_court_case', 0); open(0); });
          box.appendChild(go); go.focus();
        };
        box.appendChild(b);
      });
      box.appendChild(fb);
      box.querySelector('.lm-opt').focus();
      ui.say(lean + ' Which is fairer?');
    }
    card();
  }
  ui.say('Sort the facts, then pick the fairer thought.');
  open((+store('lena_court_case') || 0) % COURT.length);
  return () => {};
}

/* ════ REFRAME BUILDER ═════════════════════════════════════════════
   Three small steps instead of free building:
     1. tap the word that makes it a trap
     2. pick what's actually true (2 choices)
     3. pick something you can do (2 choices)
   The balanced thought fills two labelled slots as you go.
   trap: word numbers that count as the trap (any one is right).
   true / step: [good, why], [not helpful, why] */
const REFRAME = [
  { t: 'I always fail Maths.', trap: [1], why: '"Always" turns one bad test into every test.',
    tru: [['I failed this test.', 'Exact. It\'s about one test, not your whole life.'], ['I fail at everything.', 'That makes it even bigger. Try the exact one.']],
    step: [['I can ask for help with one topic.', 'Small and doable.'], ['I should just give up.', 'That won\'t help. Pick a step you could really do.']] },
  { t: 'Everyone thinks I\'m weird.', trap: [0], why: '"Everyone" is a guess about a lot of people.',
    tru: [['I don\'t know what everyone thinks.', 'True. You can\'t read minds.'], ['Everyone definitely thinks it.', 'That\'s still a guess. Try the other one.']],
    step: [['I can talk to someone I get on with.', 'A good step towards people who like you.'], ['I\'ll stay quiet forever.', 'That keeps you stuck. Pick the other one.']] },
  { t: 'I\'m a total failure.', trap: [2, 3], why: '"Total failure" labels your whole self from one result.',
    tru: [['I didn\'t do well this time.', 'Exact. It describes what happened, not who you are.'], ['I fail at everything I try.', 'That makes it bigger. Try the exact one.']],
    step: [['I can work out what to try differently.', 'A step you can actually take.'], ['I\'ll stop trying.', 'That won\'t help. Pick the other one.']] },
  { t: 'This presentation will be a disaster.', trap: [2, 5], why: '"Will be a disaster" predicts the worst before it happens.',
    tru: [['I\'m nervous about the presentation.', 'True, and nerves are normal.'], ['It\'s going to go horribly.', 'Still predicting the worst. Try the other one.']],
    step: [['I can practise it once more tonight.', 'A small step that really helps.'], ['I\'ll skip school that day.', 'Avoiding it makes the fear bigger next time.']] },
  { t: 'No reply. She must hate me.', trap: [3, 4], why: '"Must hate me" guesses her feelings from one quiet chat.',
    tru: [['She hasn\'t replied yet.', 'Just the facts.'], ['She\'s ignoring me on purpose.', 'Still a guess. Try the other one.']],
    step: [['I can wait, or ask if she\'s okay.', 'Kind and simple.'], ['I\'ll stop talking to her.', 'That could hurt a friendship over a guess.']] },
  { t: 'I should never make mistakes.', trap: [1, 2], why: '"Should never" is a rule no one can keep.',
    tru: [['Everyone makes mistakes, me too.', 'True for every person alive.'], ['Mistakes mean I\'m bad.', 'That\'s the trap again. Try the other one.']],
    step: [['I can learn from this one.', 'That turns a mistake into something useful.'], ['I\'ll hide my mistakes.', 'Hiding them makes them heavier.']] },
  { t: 'If it\'s not perfect, it\'s worthless.', trap: [3, 5], why: '"Worthless" says anything less than perfect counts for nothing.',
    tru: [['It isn\'t perfect, but it\'s still good work.', 'Fair. Good work counts.'], ['It\'s rubbish.', 'That\'s all-or-nothing again.']],
    step: [['I can hand it in and ask for feedback.', 'Done, and you\'ll learn from it.'], ['I\'ll redo it all night.', 'You need rest more than another redo.']] },
  { t: 'Their bad mood is my fault.', trap: [4, 5], why: '"My fault" takes all the blame for someone else\'s mood.',
    tru: [['Their mood could have lots of causes.', 'True. Lots of things affect a mood.'], ['I always ruin things.', 'That\'s even bigger. Try the other one.']],
    step: [['I can ask if they\'re okay.', 'Kind, and you\'ll find out more.'], ['I\'ll keep apologising.', 'You don\'t need to apologise for their mood.']] },
  { t: 'That A doesn\'t count. It was easy.', trap: [2, 3, 6], why: '"Doesn\'t count" throws away something you earned.',
    tru: [['I got an A because I worked for it.', 'Yes. Give yourself the credit.'], ['It was just luck.', 'That throws your effort away again.']],
    step: [['I can let myself feel proud.', 'You earned it.'], ['I\'ll pretend it didn\'t happen.', 'Your wins deserve to be noticed.']] },
  { t: 'She\'s smarter, so I\'m dumb.', trap: [2, 4], why: '"So I\'m dumb" turns one comparison into a label.',
    tru: [['She\'s good at this. I\'m good at other things.', 'Both can be true.'], ['I\'m the worst in class.', 'That\'s another comparison. Try the other one.']],
    step: [['I can ask her how she studies.', 'Learning from someone, not competing.'], ['I\'ll stop trying in this subject.', 'That won\'t help. Pick the other one.']] }
];
function reframe(stage, ui){
  stage.classList.add('lm-stage');
  const box = mk('div', 'lm'); stage.appendChild(box);
  let solved = 0, timer = 0;
  function open(k){
    const P = REFRAME[k], words = P.t.split(' '), got = { tru: '', step: '' };
    let st = 0;
    function head(){
      const slot = (key, label, now) => '<div class="lm-slot' + (got[key] ? ' f' : now ? ' now' : '') + '"><small>' + label + '</small>' + (got[key] ? esc(got[key]) : '&nbsp;') + '</div>';
      return '<div class="lm-head"><span class="lm-pill">Thought ' + (k + 1) + ' of ' + REFRAME.length + '</span><span class="lm-pill">Rebuilt <b class="lm-score">' + solved + '</b></span></div>' +
        '<div class="lm-who"><div class="lm-av" style="--c:#E3A04F" aria-hidden="true">!</div><div class="lm-thought"><small>Thinking trap</small>"' + esc(P.t) + '"</div></div>' +
        '<div class="lm-slots" aria-label="Your balanced thought">' + slot('tru', 'What’s true', st === 1) + slot('step', 'What I can do', st === 2) + '</div>';
    }
    function step(){
      clearTimeout(timer);
      box.innerHTML = head();
      const fb = mk('div', 'lm-fb'); fb.hidden = true;
      const say = (cls, t) => { fb.className = 'lm-fb lm-in ' + cls; fb.hidden = false; fb.textContent = t; ui.say(t); };
      const next = () => { timer = setTimeout(() => { st++; step(); }, reduced() ? 600 : 1300); };
      if (st === 0) {
        box.appendChild(mk('p', 'lm-q', 'Step 1 of 3 · Tap the word that makes this a trap.'));
        const row = mk('div', 'lm-words'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Words in the thought');
        let miss = 0;
        words.forEach((w, i) => {
          const b = mk('button', 'lm-w'); b.type = 'button'; b.textContent = w;
          b.onclick = () => {
            audio();
            if (P.trap.includes(i)) {
              SND.right(); row.querySelectorAll('button').forEach((x, j) => { x.disabled = true; if (P.trap.includes(j)) x.classList.add('found'); });
              say('good', P.why); next();
            } else {
              miss++; SND.nope(); b.classList.remove('no'); void b.offsetWidth; b.classList.add('no');
              if (miss >= 2) { row.querySelectorAll('button').forEach((x, j) => { if (P.trap.includes(j)) x.classList.add('hint'); }); say('warn', 'Here’s a hint. It’s the word with the dashed outline.'); }
              else say('warn', 'Not that one. Look for a word that makes it bigger or harsher than it really is.');
            }
          };
          row.appendChild(b);
        });
        box.append(row, fb);
        row.querySelector('button').focus();
        ui.say('Thinking trap: ' + P.t + '. Step 1 of 3. Tap the word that makes this a trap.');
        return;
      }
      if (st === 3) {
        solved++;
        box.innerHTML = head();
        box.querySelector('.lm-score').textContent = solved;
        say('good', 'Balanced. You made it exact and added a step you can take. That’s the whole skill.');
        fb.innerHTML = '<b>Balanced.</b> You made it exact and added a step you can take. That’s the whole skill.';
        box.appendChild(fb);
        store('lena_reframe_n', (k + 1) % REFRAME.length);
        const go = mk('button', 'lm-go', k + 1 < REFRAME.length ? 'Next thought' : 'See results'); go.type = 'button';
        go.onclick = () => k + 1 < REFRAME.length ? open(k + 1) : endCard(stage, 'All thoughts rebuilt', solved, ['balanced thoughts built', 'Finding a fairer version of a thought gets easier the more you practise.'], () => { solved = 0; store('lena_reframe_n', 0); open(0); });
        box.appendChild(go); go.focus();
        ui.say('Balanced thought: ' + got.tru + ' ' + got.step);
        return;
      }
      const key = st === 1 ? 'tru' : 'step';
      box.appendChild(mk('p', 'lm-q', st === 1 ? 'Step 2 of 3 · Make it exact. What’s actually true?' : 'Step 3 of 3 · Add something you can do.'));
      shuffle([[P[key][0], true], [P[key][1], false]]).forEach(([[t, why], good]) => {
        const b = mk('button', 'lm-opt'); b.type = 'button'; b.textContent = t;
        b.onclick = () => {
          audio();
          if (!good) { SND.nope(); b.classList.add('warn'); b.disabled = true; say('warn', why); return; }
          SND.right(); b.classList.add('good'); box.querySelectorAll('.lm-opt').forEach(x => x.disabled = true);
          got[key] = t; say('good', why); next();
        };
        box.appendChild(b);
      });
      box.appendChild(fb);
      box.querySelector('.lm-opt').focus();
      ui.say(st === 1 ? 'Step 2 of 3. What is actually true?' : 'Step 3 of 3. Add something you can do.');
    }
    step();
  }
  ui.say('Three small steps to a more balanced thought.');
  open((+store('lena_reframe_n') || 0) % REFRAME.length);
  return () => clearTimeout(timer);
}

/* ════ shell ═══════════════════════════════════════════════════════ */
// What each section is, in one or two short sentences.
function introFor(mode, free, level, hstyle){
  if (mode === 'free' && free === 'wrap') return ['#6C9BD2', '\uD83E\uDEE7', 'Bubble wrap', 'Tap a bubble, or <b>drag your finger</b> across a row. Pick the pop sound you like best.'];
  if (mode === 'free') return ['#E28FA8', '\uD83D\uDFE3', 'Pop-it', 'Press a bubble and let go to pop it. Pop them all to flip the board. ' +
    ({ easy: '<b>Easy:</b> no rush at all.', medium: '<b>Medium:</b> popped bubbles fill back up if you\u2019re slow.', hard: '<b>Hard:</b> they refill faster, and dashed bubbles need <b>two presses</b>.' })[level]];
  if (mode === 'thought') return ['#9B85D6', '\uD83D\uDCAD', 'Thought Pop', '<b>Pop the thinking traps</b> before they float away. Let the balanced thoughts go. You have three lives.'];
  if (mode === 'words') return ['#E3A04F', '\uD83D\uDD0E', 'Word Hunt', 'Tap the words that give a thinking trap away, like <b>always</b>, <b>never</b> or <b>should</b>.' +
    (hstyle === 'timed' ? ' Clear as many as you can in <b>one minute</b>.' : '')];
  if (mode === 'court') return ['#4FAE8B', '\u2696\uFE0F', 'Evidence Court', 'Does each fact <b>back up</b> the thought, <b>go against</b> it, or is it <b>just a feeling</b>? Then pick the fairer thought.'];
  return ['#D27C6C', '\uD83E\uDDE9', 'Reframe Builder', 'Three small steps. <b>Find the trap word</b>, say <b>what\u2019s true</b>, then add <b>something you can do</b>.'];
}

function mount(root, opts){
  opts = opts || {};
  if (opts.output) extOut = opts.output;
  if (!document.getElementById('lp-css')) { const st = document.createElement('style'); st.id = 'lp-css'; st.textContent = CSS + MIND_CSS; document.head.appendChild(st); }
  try { muted = localStorage.getItem('lena_pop_muted') === '1'; } catch (e) {}
  try { const ws = localStorage.getItem('lena_pop_wrapsnd'); if (WRAP_SOUNDS[ws]) wrapSound = ws; } catch (e) {}
  root.classList.add('lp');
  root.innerHTML =
    '<div class="lp-top" role="group" aria-label="Game mode">' +
    '<button type="button" class="lp-tab" data-m="free">Free Pop</button>' +
    '<button type="button" class="lp-tab" data-m="thought">Thought Pop</button>' +
    '<button type="button" class="lp-tab" data-m="words">Word Hunt</button>' +
    '<button type="button" class="lp-tab" data-m="court">Evidence Court</button>' +
    '<button type="button" class="lp-tab" data-m="reframe">Reframe Builder</button>' +
    '<span class="lp-sp"></span><button type="button" class="lp-mute"></button></div>' +
    '<div class="lp-sub" role="group" aria-label="Free Pop style">' +
    '<button type="button" class="lp-tab" data-f="popit">Pop-it</button><button type="button" class="lp-tab" data-f="wrap">Bubble wrap</button></div>' +
    '<div class="lp-row2 lp-level" role="group" aria-label="Pop-it level"><span class="lp-lbl">Level</span>' +
    '<button type="button" class="lp-tab" data-l="easy">Easy</button><button type="button" class="lp-tab" data-l="medium">Medium</button><button type="button" class="lp-tab" data-l="hard">Hard</button></div>' +
    '<div class="lp-row2 lp-hunt" role="group" aria-label="Word Hunt style"><span class="lp-lbl">Style</span>' +
    '<button type="button" class="lp-tab" data-h="relaxed">Relaxed</button><button type="button" class="lp-tab" data-h="timed">1 minute</button></div>' +
    '<div class="lp-row2 lp-snd" role="group" aria-label="Pop sound"><span class="lp-lbl">Sound</span>' +
    Object.keys(WRAP_SOUNDS).map(k => '<button type="button" class="lp-tab" data-s="' + k + '">' + WRAP_SOUNDS[k].name + '</button>').join('') + '</div>' +
    '<div class="lp-intro"><span class="ic" aria-hidden="true"></span><div><h4></h4><p></p></div></div>' +
    '<div class="lp-stage"></div><div class="lp-msg" aria-hidden="true"></div><div class="lp-live" aria-live="polite"></div>';
  const intro = root.querySelector('.lp-intro'), msg = root.querySelector('.lp-msg'), live = root.querySelector('.lp-live');
  const sub = root.querySelector('.lp-sub'), lvl = root.querySelector('.lp-level'), hunt = root.querySelector('.lp-hunt'), snd = root.querySelector('.lp-snd'), mute = root.querySelector('.lp-mute');
  const ui = { say(t){ msg.textContent = t; live.textContent = t; } };
  let stage = root.querySelector('.lp-stage');
  let mode = 'free', free = 'popit', level = 'easy', hstyle = 'relaxed', stop = null;
  const MODES = ['free', 'thought', 'words', 'court', 'reframe'];
  try { const s = JSON.parse(localStorage.getItem('lena_pop_mode') || 'null'); if (s) { mode = MODES.includes(s.m) ? s.m : 'free'; hstyle = s.h === 'timed' ? 'timed' : 'relaxed'; free = s.f === 'wrap' ? 'wrap' : 'popit'; level = ['medium', 'hard'].includes(s.l) ? s.l : 'easy'; } } catch (e) {}
  // opts.mode opens a particular section, e.g. from a shortcut elsewhere in LENA
  if (opts.mode && MODES.includes(opts.mode)) mode = opts.mode;
  function paintMute(){ mute.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; mute.setAttribute('aria-label', muted ? 'Sound off. Turn sound on.' : 'Sound on. Turn sound off.'); }
  function mark(sel, attr, val){ root.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val))); }
  function start(){
    // a fresh stage each time, so no listeners from the last mode linger
    if (stop) stop();
    const fresh = document.createElement('div'); fresh.className = 'lp-stage';
    stage.replaceWith(fresh); stage = fresh;
    mark('[data-m]', 'm', mode); mark('[data-f]', 'f', free); mark('[data-l]', 'l', level); mark('[data-s]', 's', wrapSound); mark('[data-h]', 'h', hstyle);
    sub.hidden = mode !== 'free'; lvl.hidden = !(mode === 'free' && free === 'popit'); snd.hidden = !(mode === 'free' && free === 'wrap'); hunt.hidden = mode !== 'words';
    // the thinking games show feedback inside the card, so the line under
    // the stage would only repeat it. Screen readers still hear it.
    msg.hidden = ['words', 'court', 'reframe'].includes(mode);
    const [tint, icon, title, text] = introFor(mode, free, level, hstyle);
    intro.style.setProperty('--tint', tint);
    intro.querySelector('.ic').textContent = icon; intro.querySelector('h4').textContent = title; intro.querySelector('p').innerHTML = text;
    intro.classList.remove('in'); void intro.offsetWidth; intro.classList.add('in');
    stop = mode === 'thought' ? thoughts(stage, ui) : mode === 'words' ? wordHunt(stage, ui, hstyle) : mode === 'court' ? court(stage, ui) : mode === 'reframe' ? reframe(stage, ui) : free === 'wrap' ? wrapMode(stage, ui) : popit(stage, ui, level);
    try { localStorage.setItem('lena_pop_mode', JSON.stringify({ m: mode, f: free, l: level, h: hstyle })); } catch (e) {}
  }
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; start(); });
  root.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { free = b.dataset.f; start(); });
  root.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hstyle = b.dataset.h; start(); });
  root.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { level = b.dataset.l; start(); });
  // Picking a sound plays it straight away, so this row doubles as the sound test.
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    wrapSound = b.dataset.s; mark('[data-s]', 's', wrapSound);
    try { localStorage.setItem('lena_pop_wrapsnd', wrapSound); } catch (e) {}
    // a preview plays even when the game is muted, since you asked to hear it
    const hear = () => { if (audio()) WRAP_SOUNDS[wrapSound].play(); };
    hear(); setTimeout(hear, 170);
  });
  mute.onclick = () => { muted = !muted; try { localStorage.setItem('lena_pop_muted', muted ? '1' : '0'); } catch (e) {} paintMute(); };
  paintMute(); start();
  return { stop(){ if (stop) stop(); stop = null; } };
}

window.LenaPop = { mount };
})();
