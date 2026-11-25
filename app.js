/* ——— Machine à écrire ——— */
'use strict';

const $ = s => document.querySelector(s);
const stage = $('#stage'), mover = $('#mover'), doc = $('#doc'), meas = $('#meas');
const ta = $('#ta'), caretEl = $('#caret');
const railMark = $('#rail-marker');
const panel = $('#panel'), scrim = $('#scrim'), list = $('#sheet-list');
const printRoot = $('#print-root');

const LS_KEY = 'ag.machine.v1';
const LINES_PER_PAGE = 21;

/* géométrie A4, à l'échelle k de l'écran (680 px ↔ 210 mm) */
let K = 1, LH = 38, PAD_TOP = 82, PAD_LEFT = 84, PAD_RIGHT = 64, SHEET_W = 680,
    SHEET_H = 962, GAP = 42, TEXT_W = 532;

const VH = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);
const STRIKE = () => VH() * 0.70; // ligne de frappe

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
      s.bg = s.bg || 'bureau';
      return s;
    }
  } catch (e) { /* réinitialise */ }
  const p = newProject();
  return { projects: [p], currentId: p.id, sounds: { keys: true, carriage: true }, bg: 'bureau' };
}

const store = loadStore();
let cur = store.projects.find(p => p.id === store.currentId) || store.projects[0];

let ty = 0;
let pages = [];            // [{start, end, el, textEl}]
let lastPaginatedText = null;
let belled = false;
let justTyped = false;
let saveTimer = null;
let caretViewport = null;  // dernier rect du caret (coordonnées écran)

function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }
function flush() { cur.text = ta.value; cur.updatedAt = Date.now(); persist(); }
function scheduleSave() {
  cur.text = ta.value; cur.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

/* ——— pagination ———
   Le texte est mesuré dans #meas (mêmes métriques, même largeur) ;
   chaque feuille A4 reçoit la tranche de texte de ses 21 lignes. */

function measureGeometry() {
  SHEET_W = Math.min(680, Math.floor(window.innerWidth * 0.94));
  K = SHEET_W / 680;
  LH = 38 * K; PAD_TOP = 82 * K; PAD_LEFT = 84 * K; PAD_RIGHT = 64 * K;
  SHEET_H = 962 * K; GAP = Math.round(42 * K);
  TEXT_W = SHEET_W - PAD_LEFT - PAD_RIGHT;
  const r = document.documentElement.style;
  r.setProperty('--sheet-w', SHEET_W + 'px');
  r.setProperty('--sheet-h', SHEET_H + 'px');
  r.setProperty('--pad-top', PAD_TOP + 'px');
  r.setProperty('--pad-bottom', PAD_TOP + 'px');
  r.setProperty('--pad-left', PAD_LEFT + 'px');
  r.setProperty('--pad-right', PAD_RIGHT + 'px');
  r.setProperty('--fs', (20 * K) + 'px');
  r.setProperty('--lh', LH + 'px');
  r.setProperty('--gap', GAP + 'px');
}

function paginate(text) {
  meas.textContent = text + '​';
  const tn = meas.firstChild;
  const total = text.length;
  const measTop = meas.getBoundingClientRect().top;
  const range = document.createRange();

  function lineOf(i) { // n° de ligne visuelle du caractère i (sentinelle comprise)
    range.setStart(tn, i);
    range.setEnd(tn, Math.min(i + 1, total + 1));
    const r = range.getClientRects()[0] || range.getBoundingClientRect();
    return Math.round((r.top - measTop) / LH);
  }

  const totalLines = lineOf(total) + 1;
  const nPages = Math.max(1, Math.ceil(totalLines / LINES_PER_PAGE));
  const bounds = [0];
  for (let p = 1; p < nPages; p++) {
    const target = p * LINES_PER_PAGE;
    let lo = bounds[p - 1], hi = total; // plus petit i tel que lineOf(i) >= target
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lineOf(mid) >= target) hi = mid; else lo = mid + 1;
    }
    bounds.push(lo);
  }
  bounds.push(total);
  return bounds;
}

function syncPages(text) {
  const bounds = paginate(text);
  const n = bounds.length - 1;
  while (pages.length > n) { pages.pop().el.remove(); }
  while (pages.length < n) {
    const el = document.createElement('div');
    el.className = 'sheet';
    const textEl = document.createElement('div');
    textEl.className = 'ptext sheet-text';
    textEl.dataset.page = pages.length;
    el.appendChild(textEl);
    // chaque feuille porte son tampon, poinçonné au coin supérieur gauche
    const st = document.createElement('button');
    st.type = 'button';
    st.className = 'stamp';
    st.textContent = 'AG';
    st.title = 'Feuilles';
    st.setAttribute('aria-label', 'Ouvrir les feuilles');
    st.addEventListener('click', togglePanel);
    el.appendChild(st);
    doc.appendChild(el);
    pages.push({ start: 0, end: 0, el, textEl });
  }
  for (let i = 0; i < n; i++) { pages[i].start = bounds[i]; pages[i].end = bounds[i + 1]; }
}

/* ——— rendu : tranches, sélection, caret ——— */

let focusSpan = null; // le span qui commence à l'index du caret (son 1er rect = position du caret)

function render() {
  const text = ta.value;
  if (text !== lastPaginatedText) {
    syncPages(text);
    lastPaginatedText = text;
  }
  const s = ta.selectionStart, e = ta.selectionEnd;
  const f = ta.selectionDirection === 'backward' ? s : e;
  focusSpan = null;

  for (let i = 0; i < pages.length; i++) {
    const pg = pages[i];
    const frag = document.createDocumentFragment();
    const last = i === pages.length - 1;
    // segments découpés à s et e (le segment commençant à f sert de repère caret)
    const cuts = [pg.start, Math.min(Math.max(s, pg.start), pg.end),
                  Math.min(Math.max(e, pg.start), pg.end), pg.end];
    const focusInPage = f >= pg.start && (f < pg.end || (last && f === pg.end));
    for (let c = 0; c < 3; c++) {
      const a = cuts[c], b = cuts[c + 1];
      const isFocusHere = focusInPage && a === f;
      if (a >= b && !isFocusHere && !(last && c === 2)) continue;
      const span = document.createElement('span');
      if (c === 1 && b > a) span.className = 'sel';
      span.textContent = text.slice(a, b) + ((last && c === 2) ? '​' : '');
      frag.appendChild(span);
      // le dernier span ouvert à l'index f a toujours un rect mesurable
      if (isFocusHere) focusSpan = span;
    }
    pg.textEl.replaceChildren(frag);
  }
  positionCaret();
}

function caretRect() {
  if (!focusSpan) return null;
  return focusSpan.getClientRects()[0] || null;
}

function positionCaret() {
  const r = caretRect();
  caretViewport = r;
  if (!r) { caretEl.style.display = 'none'; return; }
  const dr = doc.getBoundingClientRect();
  const hasSel = ta.selectionStart !== ta.selectionEnd;
  caretEl.style.display = hasSel ? 'none' : 'block';
  caretEl.style.left = (r.left - dr.left) + 'px';
  caretEl.style.top = (r.top - dr.top + r.height * 0.18) + 'px';
  caretEl.style.height = (r.height * 0.62) + 'px';
  railMark.style.transform = 'translateX(' + (r.left - 4.5) + 'px)';

  if (justTyped && store.sounds.carriage) {
    const pg = pages.find(p => p.textEl.contains(focusSpan));
    if (pg) {
      const distRight = pg.textEl.getBoundingClientRect().right - r.left;
      if (distRight < 85 * K) { if (!belled) { belled = true; S.bell(); } }
      else if (distRight > 170 * K) belled = false;
    }
  }
  justTyped = false;
}

/* ——— ancrage : la ligne en cours reste sur la ligne de frappe ——— */

function setTy(v, smooth) {
  const strike = STRIKE();
  const docH = doc.offsetHeight;
  const nv = Math.min(strike, Math.max(strike - docH, v));
  if (smooth) {
    // un saut de page voyage un peu plus longtemps qu'un simple interligne
    const d = Math.min(300, 90 + Math.abs(nv - ty) * 0.3);
    mover.style.transition = 'transform ' + d + 'ms cubic-bezier(.25,.6,.3,1)';
  } else {
    mover.style.transition = 'none';
  }
  ty = nv;
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

/* ——— sons : enregistrements réels d'une machine à écrire ———
   (projet daktilo, licence MIT/Apache-2.0 — fichiers dans sounds/) */

const S = (() => {
  const FILES = {
    key: 'sounds/key.wav',       // frappe d'une touche
    keyup: 'sounds/keyup.wav',   // relâchement
    stroke: 'sounds/stroke.wav', // frappe sèche (espace, effacement)
    cr: 'sounds/retour.wav',     // retour chariot
    bell: 'sounds/sonnette.wav', // sonnette de marge
  };
  const GAIN = { key: .9, keyup: .22, stroke: .55, cr: .8, bell: .5 };
  let ctx = null, master = null;
  const raw = {}, buffers = {}, audioEls = {};

  // les octets sont chargés tout de suite ; décodés au premier geste.
  // en file:// (fetch interdit), des éléments <audio> prennent le relais.
  const viaAudioEl = location.protocol === 'file:';
  for (const n in FILES) {
    if (viaAudioEl) {
      const a = new Audio(FILES[n]);
      a.preload = 'auto';
      audioEls[n] = a;
      continue;
    }
    fetch(FILES[n]).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => { raw[n] = b; decode(n); })
      .catch(() => {
        const a = new Audio(FILES[n]);
        a.preload = 'auto';
        audioEls[n] = a;
      });
  }
  function decode(n) {
    if (!ctx || !raw[n] || buffers[n]) return;
    ctx.decodeAudioData(raw[n].slice(0)).then(b => { buffers[n] = b; }).catch(() => {});
  }
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      for (const n in FILES) decode(n);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function play(n, rate, gain) {
    if (ensure() && buffers[n]) {
      const src = ctx.createBufferSource();
      src.buffer = buffers[n];
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = GAIN[n] * gain;
      src.connect(g); g.connect(master);
      src.start();
    } else if (audioEls[n]) {
      const a = audioEls[n].cloneNode();
      a.volume = Math.min(1, GAIN[n] * gain * 0.9);
      a.playbackRate = rate;
      try { a.preservesPitch = false; } catch (e) {}
      a.play().catch(() => {});
    }
  }
  const j = (a, b) => a + Math.random() * (b - a);
  return {
    warm: ensure,
    key: () => play('key', j(.94, 1.08), j(.85, 1.15)),
    keyup: () => play('keyup', j(.92, 1.1), j(.8, 1.2)),
    space: () => play('stroke', j(.8, .88), j(.7, .9)),
    back: () => play('stroke', j(1.02, 1.12), j(.6, .8)),
    cr: () => play('cr', j(.97, 1.03), 1),
    bell: () => play('bell', 1, 1),
  };
})();

/* ——— frappe ——— */

ta.addEventListener('input', () => {
  justTyped = true;
  render();
  anchor(true);
  scheduleSave();
});

/* l'ancrage ne suit que le clavier : au clic on repositionne le chariot
   à la main, le papier ne bouge qu'à la frappe suivante */
let lastKeyAt = 0;
document.addEventListener('selectionchange', () => {
  if (document.activeElement !== ta) return;
  render();
  if (!dragging && performance.now() - lastKeyAt < 250) anchor(true);
});

let keyDowned = false;
ta.addEventListener('keydown', (e) => {
  lastKeyAt = performance.now();
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '    ');
    if (store.sounds.keys) S.key();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault(); flush(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault(); printPDF(); return;
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
  else if (e.key.length === 1) { S.key(); keyDowned = true; }
});
ta.addEventListener('keyup', (e) => {
  if (keyDowned && store.sounds.keys && e.key.length === 1) S.keyup();
  keyDowned = false;
});

function carriageNudge() {
  doc.animate(
    [{ transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
    { duration: 150, easing: 'cubic-bezier(.2,.8,.3,1)' }
  );
}

/* ——— souris : le clic sur les feuilles pilote le texte caché ——— */

let dragging = false, dragMode = 'char', dragAnchor = 0, dragAnchorRange = null;

function globalIndexFromNode(node, offset) {
  const host = node.nodeType === 3 ? node.parentElement : node;
  const pt = host && host.closest ? host.closest('.ptext') : null;
  if (!pt || node.nodeType !== 3) return null;
  const pg = pages[+pt.dataset.page];
  if (!pg) return null;
  let acc = 0;
  const walker = document.createTreeWalker(pt, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (n === node) return Math.min(pg.end, pg.start + acc + offset);
    acc += n.nodeValue.length;
  }
  return null;
}

function pointToRange(x, y) {
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) return [r.startContainer, r.startOffset];
  } else if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) return [p.offsetNode, p.offset];
  }
  return [null, 0];
}

function indexFromPoint(x, y) {
  let [node, off] = pointToRange(x, y);
  let idx = node !== null ? globalIndexFromNode(node, off) : null;
  if (idx !== null) return idx;

  // hors du texte : viser l'intérieur de la feuille la plus proche
  const text = ta.value;
  for (let i = 0; i < pages.length; i++) {
    const r = pages[i].textEl.getBoundingClientRect();
    const zone = pages[i].el.getBoundingClientRect();
    if (y < zone.top - GAP / 2) return i === 0 ? 0 : pages[i - 1].end;
    if (y <= zone.bottom + GAP / 2 || i === pages.length - 1) {
      const cx = Math.min(Math.max(x, r.left + 2), r.right - 2);
      const cy = Math.min(Math.max(y, r.top + 2), r.bottom - 2);
      [node, off] = pointToRange(cx, cy);
      idx = node !== null ? globalIndexFromNode(node, off) : null;
      if (idx !== null) return idx;
      return y < (r.top + r.bottom) / 2 ? pages[i].start : pages[i].end;
    }
  }
  return text.length;
}

const WORD_RE = /[\p{L}\p{N}_'’-]/u;
function wordBounds(i) {
  const t = ta.value;
  let a = i, b = i;
  if (i < t.length && WORD_RE.test(t[i])) { b = i + 1; }
  while (a > 0 && WORD_RE.test(t[a - 1])) a--;
  while (b < t.length && WORD_RE.test(t[b])) b++;
  if (a === b && a > 0) a--; // rien à mordre : prend le caractère précédent
  return [a, b];
}
function lineBounds(i) {
  const t = ta.value;
  let a = t.lastIndexOf('\n', i - 1) + 1;
  let b = t.indexOf('\n', i);
  if (b === -1) b = t.length; else b++;
  return [a, b];
}

function applyDrag(f) {
  let a0 = dragAnchor, f0 = f, fr = null;
  if (dragMode !== 'char') {
    fr = dragMode === 'word' ? wordBounds(f) : lineBounds(f);
    if (fr[0] < dragAnchorRange[0]) { a0 = dragAnchorRange[1]; f0 = fr[0]; }
    else { a0 = dragAnchorRange[0]; f0 = fr[1]; }
  }
  if (f0 < a0) ta.setSelectionRange(f0, a0, 'backward');
  else ta.setSelectionRange(a0, f0, 'forward');
}

/* les pointer events portent detail=0 : on compte les clics nous-mêmes */
let clickCount = 0, lastClickAt = 0, lastClickX = 0, lastClickY = 0;

doc.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest && e.target.closest('.stamp')) return; // le tampon garde son clic
  e.preventDefault();
  const now = performance.now();
  if (now - lastClickAt < 450 && Math.abs(e.clientX - lastClickX) < 6 &&
      Math.abs(e.clientY - lastClickY) < 6) clickCount++;
  else clickCount = 1;
  lastClickAt = now; lastClickX = e.clientX; lastClickY = e.clientY;

  const idx = indexFromPoint(e.clientX, e.clientY);
  if (e.shiftKey) {
    dragMode = 'char';
    dragAnchor = ta.selectionDirection === 'backward' ? ta.selectionEnd : ta.selectionStart;
    applyDrag(idx);
  } else if (clickCount >= 3) {
    dragMode = 'line'; dragAnchorRange = lineBounds(idx); dragAnchor = idx;
    ta.setSelectionRange(dragAnchorRange[0], dragAnchorRange[1]);
  } else if (clickCount === 2) {
    dragMode = 'word'; dragAnchorRange = wordBounds(idx); dragAnchor = idx;
    ta.setSelectionRange(dragAnchorRange[0], dragAnchorRange[1]);
  } else {
    dragMode = 'char'; dragAnchor = idx;
    ta.setSelectionRange(idx, idx);
  }
  dragging = true;
  try { doc.setPointerCapture(e.pointerId); } catch (err) {}
  ta.focus({ preventScroll: true });
  render();
});

doc.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  applyDrag(indexFromPoint(e.clientX, e.clientY));
  render();
});

window.addEventListener('pointerup', () => { dragging = false; });

/* cliquer le bureau ramène le clavier sans bouger le caret */
stage.addEventListener('mousedown', (e) => {
  if (doc.contains(e.target)) return;
  e.preventDefault();
  ta.focus({ preventScroll: true });
});

ta.addEventListener('focus', positionCaret);
ta.addEventListener('blur', positionCaret);

/* ——— défilement : la molette déplace les feuilles ——— */

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
  lastPaginatedText = null;
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
    b.className = 'sheet-item';
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
}
function closePanel() {
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  scrim.classList.remove('on');
  ta.focus({ preventScroll: true });
}
function togglePanel() {
  panel.classList.contains('open') ? closePanel() : openPanel();
}
scrim.addEventListener('click', closePanel);
/* Échap ouvre et ferme le volet — utile quand aucun coin de feuille n'est à l'écran */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') togglePanel();
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
  document.querySelectorAll('.bg-dot').forEach(d => {
    if (d.dataset.bg === store.bg) d.setAttribute('data-on', '');
    else d.removeAttribute('data-on');
  });
}

/* le fond, au choix */
function applyBg() {
  if (store.bg && store.bg !== 'bureau') document.body.dataset.bg = store.bg;
  else delete document.body.dataset.bg;
}
document.querySelectorAll('.bg-dot').forEach(d => {
  d.addEventListener('click', () => {
    store.bg = d.dataset.bg;
    applyBg();
    refreshOpts();
    persist();
  });
});
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

/* imprimer / PDF : les mêmes lignes, sur de vraies pages A4 */
function printPDF() {
  flush();
  printRoot.textContent = ta.value;
  window.print();
}
$('#print-pdf').addEventListener('click', () => { closePanel(); printPDF(); });
window.addEventListener('beforeprint', () => {
  if (!printRoot.textContent) printRoot.textContent = ta.value;
});
window.addEventListener('afterprint', () => { printRoot.textContent = ''; });

$('#export').addEventListener('click', () => {
  flush();
  const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (title(cur).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'feuille') + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

/* ——— démarrage ——— */

window.addEventListener('resize', () => { measureGeometry(); lastPaginatedText = null; render(); anchor(false); });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { render(); anchor(false); });
}
window.addEventListener('beforeunload', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* un premier geste réveille l'audio */
window.addEventListener('pointerdown', () => S.warm(), { once: true });
window.addEventListener('keydown', () => S.warm(), { once: true });

measureGeometry();
applyBg();
loadProject(cur);
ta.focus({ preventScroll: true });

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { lastPaginatedText = null; render(); anchor(false); });
}
