/* ——— Machine à écrire ——— */
'use strict';

const $ = s => document.querySelector(s);
const stage = $('#stage'), mover = $('#mover'), paper = $('#paper'), zone = $('#zone');
const ta = $('#ta'), mirror = $('#mirror'), caretEl = $('#caret');
const railMark = $('#rail-marker'), stamp = $('#stamp');
const panel = $('#panel'), scrim = $('#scrim'), list = $('#sheet-list');

const LS_KEY = 'ag.machine.v1';
// ligne de frappe — sur la hauteur visible (clavier virtuel ouvert compris)
const VH = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);
const STRIKE = () => VH() * 0.70;

/* ——— état ——— */

function newProject() {
  return {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
    text: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && Array.isArray(s.projects) && s.projects.length) {
      s.sounds = Object.assign({ keys: true, carriage: true }, s.sounds);
      return s;
    }
  } catch (e) { /* réinitialise */ }
  const p = newProject();
  return { projects: [p], currentId: p.id, sounds: { keys: true, carriage: true } };
}

const store = loadStore();
let cur = store.projects.find(p => p.id === store.currentId) || store.projects[0];

let ty = 0;                 // translation verticale de la feuille
let padTop = 0, padRight = 0;
let mouseDown = false;
let belled = false;         // sonnette déjà tintée sur cette ligne
let justTyped = false;
let saveTimer = null;
let spanBefore = null, spanRest = null;

function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }
function flush() { cur.text = ta.value; cur.updatedAt = Date.now(); persist(); }
function scheduleSave() {
  cur.text = ta.value; cur.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

/* ——— rendu du miroir (l'encre) ———
   Le textarea est transparent et reçoit toute l'édition native ;
   le miroir affiche le même texte, scindé au niveau du curseur pour
   pouvoir mesurer sa position exacte (technique « textarea-caret »). */

function caretIndex() {
  return ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
}

function render() {
  const text = ta.value;
  const i = caretIndex();
  spanBefore = document.createElement('span');
  spanBefore.textContent = text.slice(0, i);
  spanRest = document.createElement('span');
  spanRest.textContent = text.slice(i) + '​';
  mirror.replaceChildren(spanBefore, spanRest);
  // garde-fous : le navigateur peut scroller en douce un overflow:hidden
  // pour « montrer » le caret natif (pourtant invisible)
  if (ta.scrollTop) ta.scrollTop = 0;
  if (stage.scrollTop || stage.scrollLeft) { stage.scrollTop = 0; stage.scrollLeft = 0; }
  const se = document.scrollingElement;
  if (se && (se.scrollTop || se.scrollLeft)) { se.scrollTop = 0; se.scrollLeft = 0; }
  positionCaret();
}

function caretRect() {
  const r = spanRest && spanRest.getClientRects()[0];
  return r || null;
}

function positionCaret() {
  const r = caretRect();
  if (!r) { caretEl.style.display = 'none'; return; }
  const zr = zone.getBoundingClientRect();
  const focused = document.activeElement === ta;
  const hasSel = ta.selectionStart !== ta.selectionEnd;
  caretEl.style.display = (focused && !hasSel) ? 'block' : 'none';
  caretEl.style.left = (r.left - zr.left) + 'px';
  caretEl.style.top = (r.top - zr.top + r.height * 0.18) + 'px';
  caretEl.style.height = (r.height * 0.62) + 'px';
  railMark.style.transform = 'translateX(' + (r.left - 4.5) + 'px)';

  // la sonnette, à l'approche de la marge droite
  if (justTyped && store.sounds.carriage) {
    const pr = paper.getBoundingClientRect();
    const distRight = (pr.right - padRight) - r.left;
    if (distRight < 85) { if (!belled) { belled = true; S.bell(); } }
    else if (distRight > 170) belled = false;
  }
  justTyped = false;
}

/* ——— ancrage : la ligne en cours reste sur la ligne de frappe ——— */

function setTy(v, smooth) {
  const strike = STRIKE();
  const minTy = strike - (padTop + mirror.offsetHeight);
  const maxTy = strike - padTop;
  ty = Math.min(maxTy, Math.max(minTy, v));
  mover.style.transition = smooth ? 'transform 120ms cubic-bezier(.25,.6,.3,1)' : 'none';
  mover.style.transform = 'translate3d(0,' + ty + 'px,0)';
}

function anchor(smooth) {
  const r = caretRect();
  if (!r) return;
  const offsetInMover = r.top - mover.getBoundingClientRect().top;
  const target = STRIKE() - offsetInMover - r.height;
  if (Math.abs(target - ty) < 1) return;
  setTy(target, smooth);
}

/* ——— sons, synthétisés (aucun fichier) ——— */

const S = (() => {
  let ctx = null, master = null, noise = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.25);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // claquement : souffle filtré + petit choc sourd
  function thock(freq, dur, vol, thump) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * (0.85 + Math.random() * 0.3);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * (0.8 + Math.random() * 0.4), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(105 + Math.random() * 35, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.045);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * thump, t);
    g2.gain.exponentialRampToValueAtTime(0.0008, t + 0.055);
    o.connect(g2); g2.connect(master);
    o.start(t); o.stop(t + 0.06);
  }

  function bell() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    [[2093, 0.10], [2794, 0.045]].forEach(([f, v]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (0.995 + Math.random() * 0.01);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 1.15);
    });
    thock(4200, 0.02, 0.05, 0.0); // l'impact du marteau sur le timbre
  }

  // retour chariot : glissement filtré qui descend, puis butée
  function cr() {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0008, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.17);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.18);
    setTimeout(() => thock(700, 0.06, 0.4, 0.8), 145); // la butée
  }

  return {
    key:   () => thock(2300, 0.05, 0.42, 0.5),
    space: () => thock(850, 0.07, 0.34, 0.65),
    back:  () => thock(1400, 0.05, 0.3, 0.45),
    bell, cr,
    warm: ensure,
  };
})();

/* ——— événements d'édition ——— */

ta.addEventListener('input', () => {
  justTyped = true;
  render();
  anchor(true);
  scheduleSave();
});

document.addEventListener('selectionchange', () => {
  if (document.activeElement !== ta) return;
  render();
  if (!mouseDown) anchor(true);
});

ta.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '    ');
    if (store.sounds.keys) S.key();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    flush();
    return;
  }
  if (e.isComposing) return;
  if (e.key === 'Enter') {
    belled = false;
    if (store.sounds.carriage) S.cr();
    carriageNudge();
    return;
  }
  if (!store.sounds.keys || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Backspace' || e.key === 'Delete') S.back();
  else if (e.key === ' ') S.space();
  else if (e.key.length === 1) S.key();
});

function carriageNudge() {
  paper.animate(
    [{ transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
    { duration: 150, easing: 'cubic-bezier(.2,.8,.3,1)' }
  );
}

/* souris : pas d'ancrage pendant une sélection au cran */
ta.addEventListener('pointerdown', () => { mouseDown = true; });
window.addEventListener('pointerup', () => { mouseDown = false; });

ta.addEventListener('focus', positionCaret);
ta.addEventListener('blur', positionCaret);

/* cliquer le papier (hors texte) ramène au texte */
stage.addEventListener('mousedown', (e) => {
  if (e.target === ta) return;
  e.preventDefault();
  const n = ta.value.length;
  ta.setSelectionRange(n, n);
  ta.focus({ preventScroll: true });
});

/* ——— défilement : la molette déplace la feuille ——— */

window.addEventListener('wheel', (e) => {
  if (panel.classList.contains('open') && panel.contains(e.target)) return;
  e.preventDefault();
  setTy(ty - e.deltaY, false);
}, { passive: false });

let touchY = null;
window.addEventListener('touchstart', (e) => {
  if (panel.contains(e.target)) return;
  touchY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (touchY === null || panel.contains(e.target)) return;
  e.preventDefault();
  const y = e.touches[0].clientY;
  setTy(ty + (y - touchY), false);
  touchY = y;
}, { passive: false });
window.addEventListener('touchend', () => { touchY = null; });

/* ——— feuilles (projets) ——— */

function title(p) {
  const l = (p.text.split('\n').find(x => x.trim()) || '').trim();
  if (!l) return 'sans titre';
  return l.length > 36 ? l.slice(0, 36) + '…' : l;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
function meta(p) {
  const w = p.text.trim() ? p.text.trim().split(/\s+/).length : 0;
  return w.toLocaleString('fr-FR') + (w > 1 ? ' mots · ' : ' mot · ') + dateFmt.format(p.updatedAt);
}

function loadProject(p) {
  cur = p;
  store.currentId = p.id;
  ta.value = p.text;
  const n = p.text.length;
  ta.setSelectionRange(n, n);
  render();
  anchor(false);
  persist();
}

function removeProject(p) {
  store.projects = store.projects.filter(x => x.id !== p.id);
  if (!store.projects.length) store.projects.push(newProject());
  if (cur.id === p.id) {
    const next = [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    loadProject(next);
  }
  persist();
  renderList();
}

function renderList() {
  list.replaceChildren();
  const ps = [...store.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const p of ps) {
    const li = document.createElement('li');
    if (p.id === cur.id) li.classList.add('active');

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sheet';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = title(p);
    const m = document.createElement('span');
    m.className = 'm';
    m.textContent = meta(p);
    b.append(t, m);
    b.addEventListener('click', () => {
      if (p.id !== cur.id) { flush(); loadProject(p); }
      closePanel();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '×';
    del.title = 'supprimer';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (del.dataset.arm === '1') removeProject(p);
      else {
        del.dataset.arm = '1';
        del.textContent = 'sûr ?';
        setTimeout(() => { del.dataset.arm = ''; del.textContent = '×'; }, 2400);
      }
    });

    li.append(b, del);
    list.append(li);
  }
}

/* ——— volet ——— */

function openPanel() {
  flush();
  renderList();
  refreshOpts();
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  scrim.classList.add('on');
  stamp.classList.add('active');
}
function closePanel() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  scrim.classList.remove('on');
  stamp.classList.remove('active');
  ta.focus({ preventScroll: true });
}
stamp.addEventListener('click', () => {
  panel.classList.contains('open') ? closePanel() : openPanel();
});
scrim.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
});

$('#new-sheet').addEventListener('click', () => {
  flush();
  const p = newProject();
  store.projects.push(p);
  loadProject(p);
  closePanel();
});

/* options */
const tglKeys = $('#tgl-keys'), tglCarriage = $('#tgl-carriage');
function refreshOpts() {
  tglKeys.textContent = 'frappe sonore — ' + (store.sounds.keys ? 'oui' : 'non');
  tglCarriage.textContent = 'chariot & sonnette — ' + (store.sounds.carriage ? 'oui' : 'non');
}
tglKeys.addEventListener('click', () => {
  store.sounds.keys = !store.sounds.keys;
  if (store.sounds.keys) { S.warm(); S.key(); }
  refreshOpts(); persist();
});
tglCarriage.addEventListener('click', () => {
  store.sounds.carriage = !store.sounds.carriage;
  if (store.sounds.carriage) { S.warm(); S.bell(); }
  refreshOpts(); persist();
});

$('#export').addEventListener('click', () => {
  flush();
  const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = title(cur).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'feuille';
  a.download += '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* ——— mesure & démarrage ——— */

function measure() {
  const cs = getComputedStyle(paper);
  padTop = parseFloat(cs.paddingTop);
  padRight = parseFloat(cs.paddingRight);
}

window.addEventListener('resize', () => { measure(); render(); anchor(false); });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { render(); anchor(false); });
}
window.addEventListener('beforeunload', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

measure();
loadProject(cur);
ta.focus({ preventScroll: true });

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { measure(); render(); anchor(false); });
}
