// The working demos inside the featured app sections. Each one starts the first time
// its device comes near the viewport.

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : ms));
// Keeps a Latin run like "8.6 GB" in order inside an Arabic sentence.
const isolate = (s) => `\u2066${s}\u2069`;
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

/** Tweens a number into `el` over `ms`, written by `write`. */
function tween(from, to, ms, write) {
  if (reduceMotion() || ms === 0) { write(to); return Promise.resolve(); }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      write(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

function toast(el, text, ms = 2400) {
  el.textContent = text;
  el.classList.add('is-shown');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-shown'), ms);
}

// MARK: Coco English — flip a word card, rate yourself; "Again" sends it to the back.

function cocoenglish(device, d, cards) {
  const card = $(device, '[data-ac-card]');
  const front = $(device, '.ac-front');
  const back = $(device, '.ac-back');
  const grades = $$(device, '[data-ac-grade]');
  const bar = $(device, '[data-ac-bar]');
  const count = $(device, '[data-ac-count]');
  const done = $(device, '[data-ac-done]');
  const doneBody = $(device, '[data-ac-done-body]');
  const streakEl = $(device, '[data-ac-streak]');
  const fields = {
    word: $(device, '[data-ac-word]'),
    trans: $(device, '[data-ac-trans]'),
    translit: $(device, '[data-ac-translit]'),
    ex: $(device, '[data-ac-ex]'),
    exTr: $(device, '[data-ac-ex-tr]'),
  };
  let queue, pos, streak = 7, flipped = false, busy = false;
  const requeued = new Set();

  function start() {
    queue = cards.map((_, i) => i);
    pos = 0;
    requeued.clear();
    done.hidden = true;
    card.hidden = false;
    show();
  }

  function show() {
    const c = cards[queue[pos]];
    fields.word.textContent = c.word;
    fields.trans.textContent = c.meaning;
    fields.translit.textContent = c.say;
    fields.ex.textContent = c.example;
    fields.exTr.textContent = c.exampleAr;
    count.textContent = fmt(d.cardOf, { n: pos + 1, total: queue.length });
    bar.style.setProperty('--progress', `${(pos / queue.length) * 100}%`);
    card.setAttribute('aria-label', `${c.word} — ${d.flip}`);
  }

  function flip(to = !flipped) {
    flipped = to;
    card.setAttribute('aria-pressed', String(flipped));
    front.setAttribute('aria-hidden', String(flipped));
    back.setAttribute('aria-hidden', String(!flipped));
    grades.forEach((g) => { g.disabled = !flipped; });
  }

  async function grade(kind) {
    if (busy || !flipped) return;
    busy = true;
    grades.forEach((g) => { g.disabled = true; });
    if (kind === 'again' && !requeued.has(queue[pos])) {
      requeued.add(queue[pos]);
      queue.push(queue[pos]);
    }
    const dir = (kind === 'again' || kind === 'hard' ? -1 : 1) * (document.dir === 'rtl' ? -1 : 1);
    if (!reduceMotion()) {
      await card.animate(
        [{ transform: 'rotateY(180deg)' }, { transform: `rotateY(180deg) translateX(${-dir * 70}%) rotate(${-dir * 10}deg)`, opacity: 0 }],
        { duration: 340, easing: 'cubic-bezier(.4,0,.8,.4)' },
      ).finished;
    }
    pos += 1;
    card.style.transition = 'none';
    flip(false);
    void card.offsetWidth;
    card.style.transition = '';
    if (pos >= queue.length) {
      bar.style.setProperty('--progress', '100%');
      streak += 1;
      streakEl.textContent = streak;
      doneBody.textContent = fmt(d.doneBody, { streak });
      card.hidden = true;
      done.hidden = false;
      $(done, '[data-ac-restart]').focus({ preventScroll: true });
      busy = false;
      return;
    }
    show();
    if (!reduceMotion()) {
      card.animate([{ transform: 'translateY(14px) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    busy = false;
  }

  card.addEventListener('click', () => flip());
  grades.forEach((g) => g.addEventListener('click', () => grade(g.dataset.acGrade)));
  $(device, '[data-ac-restart]').addEventListener('click', () => { start(); card.focus({ preventScroll: true }); });
  start();
  flip(false);
}

// MARK: PuzzleBox — a Connect board: join every pair of dots and fill the whole board.

const N = 5;
// One solved board; each path's two ends are the dots. Every other level mirrors it.
const SOLUTION = [
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4]],
  [[1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]],
  [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 4], [4, 4], [4, 3]],
  [[2, 1], [2, 2], [3, 2], [3, 1]],
];
const COLORS = ['#FF4FB8', '#22D3EE', '#FFC53D', '#4ADE80'];

function puzzlebox(device, d) {
  const svg = $(device, '[data-pb-svg]');
  const done = $(device, '[data-pb-done]');
  const movesEl = $(device, '[data-pb-moves]');
  const levelEl = $(device, '[data-pb-level]');
  const key = (r, c) => r * N + c;
  const rc = (k) => [Math.floor(k / N), k % N];
  let level = 0, dots, paths, moves, active = null, changed = false, solved = false;

  function load() {
    const mirror = level % 2 === 1;
    const sol = SOLUTION.map((path) => path.map(([r, c]) => key(r, mirror ? N - 1 - c : c)));
    dots = new Map();
    sol.forEach((path, i) => { dots.set(path[0], i); dots.set(path[path.length - 1], i); });
    paths = sol.map(() => []);
    moves = 0;
    solved = false;
    movesEl.textContent = '0';
    levelEl.textContent = fmt(d.level, { n: level + 1 });
    done.hidden = true;
    render();
  }

  const owner = (k) => paths.findIndex((path) => path.includes(k));
  function complete(i) {
    const path = paths[i];
    return path.length > 1 && path[0] !== path[path.length - 1] && dots.get(path[0]) === i && dots.get(path[path.length - 1]) === i;
  }

  function render() {
    const out = [];
    for (let k = 0; k < N * N; k += 1) {
      const [r, c] = rc(k);
      const i = owner(k);
      out.push(`<rect class="pb-cell${i >= 0 ? ' is-on' : ''}" x="${c + 0.04}" y="${r + 0.04}" width=".92" height=".92" rx=".18"${i >= 0 ? ` style="--pc:${COLORS[i]}"` : ''}/>`);
    }
    paths.forEach((path, i) => {
      if (path.length < 2) return;
      const pts = path.map((k) => { const [r, c] = rc(k); return `${c + 0.5},${r + 0.5}`; }).join(' ');
      out.push(`<polyline class="pb-line" points="${pts}" style="--pc:${COLORS[i]}"/>`);
    });
    dots.forEach((i, k) => {
      const [r, c] = rc(k);
      out.push(`<circle class="pb-dot${complete(i) ? ' is-done' : ''}" cx="${c + 0.5}" cy="${r + 0.5}" r=".32" style="--pc:${COLORS[i]}"/>`);
    });
    svg.innerHTML = out.join('');
  }

  function cellAt(e) {
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 5.2 - 0.1;
    const y = ((e.clientY - box.top) / box.height) * 5.2 - 0.1;
    const c = Math.floor(x), r = Math.floor(y);
    return r < 0 || r >= N || c < 0 || c >= N ? null : key(r, c);
  }

  /** Moves the active path one cell, to a neighbour of its end. */
  function step(k) {
    const path = paths[active];
    const idx = path.indexOf(k);
    if (idx >= 0) { paths[active] = path.slice(0, idx + 1); changed = true; return; }
    if (complete(active)) return;
    if (dots.has(k)) {
      if (dots.get(k) !== active) return;
      path.push(k);
      changed = true;
      return;
    }
    const other = owner(k);
    if (other >= 0) paths[other] = paths[other].slice(0, paths[other].indexOf(k));
    path.push(k);
    changed = true;
  }

  svg.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const k = cellAt(e);
    if (k == null) return;
    if (dots.has(k)) {
      active = dots.get(k);
      paths[active] = [k];
    } else {
      const i = owner(k);
      if (i < 0) return;
      active = i;
      paths[i] = paths[i].slice(0, paths[i].indexOf(k) + 1);
    }
    changed = true;
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    e.preventDefault();
    render();
  });

  svg.addEventListener('pointermove', (e) => {
    if (active == null) return;
    const k = cellAt(e);
    if (k == null) return;
    // A quick drag can skip cells: walk there one neighbour at a time along a row or column.
    for (let guard = 0; guard < N * 2; guard += 1) {
      const path = paths[active];
      const end = path[path.length - 1];
      if (end === k) break;
      const [r0, c0] = rc(end), [r1, c1] = rc(k);
      if (r0 !== r1 && c0 !== c1) break;
      const next = key(r0 + Math.sign(r1 - r0), c0 + Math.sign(c1 - c0));
      step(next);
      // Blocked (another colour's dot, or the pair is already joined): stop here.
      if (paths[active][paths[active].length - 1] !== next) break;
    }
    render();
  });

  const finish = () => {
    if (active == null) return;
    active = null;
    if (changed) { moves += 1; movesEl.textContent = String(moves); changed = false; }
    const filled = new Set(paths.flat()).size === N * N;
    if (filled && paths.every((_, i) => complete(i))) {
      solved = true;
      render();
      done.hidden = false;
      $(done, '[data-pb-next]').focus({ preventScroll: true });
    }
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  $(device, '[data-pb-reset]').addEventListener('click', load);
  $(device, '[data-pb-next]').addEventListener('click', () => { level += 1; load(); });
  load();
}

// MARK: Wiring

export function initDemos() {
  const holder = document.getElementById('demo-data');
  if (!holder) return;
  const data = JSON.parse(holder.textContent);
  const start = {
    cocoenglish: (el) => cocoenglish(el, data.demo.cocoenglish, data.cards),
    puzzlebox: (el) => puzzlebox(el, data.demo.puzzlebox),
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      start[entry.target.dataset.demo]?.(entry.target);
    }
  }, { rootMargin: '300px 0px' });
  document.querySelectorAll('[data-demo]').forEach((el) => io.observe(el));
}
