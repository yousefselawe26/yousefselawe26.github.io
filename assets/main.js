// Page behaviour: theme, the colour shift between apps, the dock, the icon-to-app
// launch, the orbit, the catalog's filters, the screenshot strip, page-to-page
// transitions, reveal on scroll and the phone clocks. The demos live in demos.js, quick
// search in palette.js.

import { initDemos } from './demos.js?v=f5901ba729';
import { initPalette, normalize } from './palette.js?v=f5901ba729';

window.__sqReady = true;
const root = document.documentElement;
const narrow = window.matchMedia('(max-width: 900px)');
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// MARK: Theme

const toggle = document.querySelector('[data-theme-toggle]');
function labelToggle() {
  if (!toggle) return;
  const dark = root.dataset.theme === 'dark';
  toggle.setAttribute('aria-label', dark ? toggle.dataset.labelLight : toggle.dataset.labelDark);
}
function setTheme(theme) {
  root.dataset.theme = theme;
  store.set('sq-theme', theme);
  labelToggle();
  applyTint();
}

/** The new theme spreads out in a circle from the button that asked for it. */
function switchTheme(from = toggle) {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reduceMotion() || !from) { setTheme(next); return; }
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('is-theming');
  const vt = document.startViewTransition(() => setTheme(next));
  vt.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
  vt.finished.finally(() => root.classList.remove('is-theming'));
}
toggle?.addEventListener('click', () => switchTheme(toggle));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (store.get('sq-theme')) return;
  root.dataset.theme = e.matches ? 'dark' : 'light';
  labelToggle();
  applyTint();
});
labelToggle();

document.querySelectorAll('[data-lang]').forEach((a) => a.addEventListener('click', () => store.set('sq-lang', a.dataset.lang)));

// MARK: Nav border once the page scrolls

const nav = document.querySelector('[data-nav]');
const sentinel = document.createElement('div');
sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none';
document.body.prepend(sentinel);
new IntersectionObserver(([e]) => nav?.toggleAttribute('data-scrolled', !e.isIntersecting)).observe(sentinel);

// MARK: Each app tints the page with its colour while it's in the middle of the screen

const sections = [...document.querySelectorAll('[data-app]')];
const dock = document.querySelector('[data-dock]');
const dockLinks = dock ? [...dock.querySelectorAll('[data-dock-link]')] : [];
let active = null;

function applyTint() {
  if (active) document.body.style.setProperty('--tint', getComputedStyle(active).getPropertyValue('--p').trim());
  else document.body.style.removeProperty('--tint');
  dockLinks.forEach((a) => a.setAttribute('aria-current', String(!!active && a.dataset.dockLink === active.dataset.app)));
}

const centred = new Set();
const tintObserver = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) centred.add(e.target); else centred.delete(e.target);
  }
  active = sections.find((s) => centred.has(s)) ?? null;
  applyTint();
}, { rootMargin: '-50% 0px -50% 0px' });
sections.forEach((s) => tintObserver.observe(s));

// The dock shows while the apps fill the middle of the screen.
const apps = document.getElementById('apps');
if (dock && apps) {
  dock.inert = true;
  new IntersectionObserver(([e]) => {
    dock.classList.toggle('is-visible', e.isIntersecting);
    dock.inert = !e.isIntersecting;
  }, { rootMargin: '-35% 0px -45% 0px' }).observe(apps);
}

// On small screens the dock steps aside while you scroll down through a demo, and comes
// back when you scroll up or stop.
if (dock) {
  let lastY = window.scrollY, idle;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (narrow.matches) {
      dock.classList.toggle('is-tucked', y > lastY);
      clearTimeout(idle);
      idle = setTimeout(() => dock.classList.remove('is-tucked'), 900);
    }
    lastY = y;
  }, { passive: true });
}

// MARK: Launch — a home-screen or dock icon grows into the app's own screen

function launch(id, from) {
  const section = document.getElementById(`app-${id}`);
  const device = document.getElementById(`device-${id}`);
  const heading = document.getElementById(`${id}-title`);
  if (!section) return;
  const target = narrow.matches && device ? device : section;
  const block = narrow.matches ? 'center' : 'start';
  const finish = () => {
    heading?.focus({ preventScroll: true });
    history.replaceState(null, '', `#app-${id}`);
  };

  if (!document.startViewTransition || reduceMotion() || !device) {
    target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block });
    finish();
    return;
  }
  from.style.viewTransitionName = 'launch';
  const vt = document.startViewTransition(() => {
    from.style.viewTransitionName = '';
    device.style.viewTransitionName = 'launch';
    target.scrollIntoView({ behavior: 'instant', block });
  });
  // A transition the browser skips (window resized, tab hidden) still scrolls; it just
  // rejects `ready`, which is expected rather than an error.
  vt.ready.catch(() => {});
  vt.finished.finally(() => { device.style.viewTransitionName = ''; finish(); });
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-launch], [data-dock-link]');
  if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  const icon = link.querySelector('img') ?? link.closest('.app-card')?.querySelector('img') ?? link;
  launch(link.dataset.launch ?? link.dataset.dockLink, icon);
});

// MARK: Page to page — the app's icon carries over into its page

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href*="/apps/"]');
  if (!link || link.origin !== location.origin || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const icon = link.querySelector('img') ?? link.closest('.app-card')?.querySelector('img');
  if (!icon) return;
  // Only one element may carry the name; on an app page that's its own icon until now.
  document.querySelectorAll('.ap-icon').forEach((el) => { el.style.viewTransitionName = 'none'; });
  icon.style.viewTransitionName = 'app-icon';
});
// Coming back with the back button restores the page as it was; clear the borrowed name.
window.addEventListener('pageshow', () => {
  document.querySelectorAll('img').forEach((img) => { if (img.style.viewTransitionName) img.style.viewTransitionName = ''; });
});

// MARK: The orbit — icons near the pointer swell a little, and the whole orbit leans

const stage = document.querySelector('[data-orbit-stage]');
const orbit = stage?.querySelector('.orbit-inner');
if (orbit && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const icons = [...orbit.querySelectorAll('.orbit-app')];
  let frame = 0;
  stage.addEventListener('pointermove', (e) => {
    if (reduceMotion()) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect();
      orbit.style.setProperty('--px', `${(((e.clientX - box.left) / box.width - 0.5) * -14).toFixed(1)}px`);
      orbit.style.setProperty('--py', `${(((e.clientY - box.top) / box.height - 0.5) * -14).toFixed(1)}px`);
      for (const icon of icons) {
        const r = icon.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        const pull = Math.max(0, 1 - dist / (r.width * 2.4));
        icon.style.setProperty('--m', (1 + pull * 0.18).toFixed(3));
      }
    });
  });
  stage.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    orbit.style.setProperty('--px', '0px');
    orbit.style.setProperty('--py', '0px');
    icons.forEach((icon) => icon.style.setProperty('--m', '1'));
  });
}

// MARK: Catalog — filter by category, search by name

const catalog = document.querySelector('[data-catalog]');
if (catalog) {
  const cards = [...catalog.children];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const search = document.querySelector('[data-catalog-search]');
  const empty = document.querySelector('[data-catalog-empty]');
  const haystacks = new Map(cards.map((c) => [c, normalize(c.dataset.search)]));
  let group = 'all';

  const apply = () => {
    const q = normalize(search.value);
    let shown = 0;
    for (const card of cards) {
      const show = (group === 'all' || card.dataset.group === group) && (!q || haystacks.get(card).includes(q));
      card.hidden = !show;
      if (show) shown += 1;
    }
    empty.hidden = shown > 0;
  };
  // Cards glide to their new places when a filter changes.
  const animate = (update) => {
    if (!document.startViewTransition || reduceMotion()) return update();
    cards.forEach((c) => { c.style.viewTransitionName = c.id; });
    const vt = document.startViewTransition(update);
    vt.ready.catch(() => {});
    vt.finished.finally(() => cards.forEach((c) => { c.style.viewTransitionName = ''; }));
  };

  filters.forEach((btn) => btn.addEventListener('click', () => {
    group = btn.dataset.filter;
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    animate(apply);
  }));
  search.addEventListener('input', apply);
}

// MARK: Screenshot strip — buttons, drag with the mouse, and arrow keys

document.querySelectorAll('[data-shots]').forEach((track) => {
  const section = track.closest('section');
  const rtl = document.dir === 'rtl';
  const step = (dir) => {
    const shot = track.querySelector('.shot');
    const w = shot ? shot.getBoundingClientRect().width + 20 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * w * (rtl ? -1 : 1), behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  section.querySelectorAll('[data-shots-step]').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.shotsStep))));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(rtl ? -1 : 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(rtl ? 1 : -1); }
  });
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    track.classList.add('is-dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    track.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    track.classList.remove('is-dragging');
    drag = null;
  });
  track.addEventListener('dragstart', (e) => e.preventDefault());
});

// MARK: Reveal on scroll

const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('is-in');
    revealer.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));

// MARK: Phone clocks show the visitor's time

function tickClocks() {
  const now = new Date();
  const text = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
  document.querySelectorAll('[data-clock]').forEach((c) => { c.textContent = text; });
}
tickClocks();
setInterval(tickClocks, 20000);

// MARK: Copy the contact address

document.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
  const label = btn.querySelector('[data-copy-label]');
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const was = label.textContent;
    label.textContent = btn.dataset.copied;
    label.removeAttribute('dir');
    setTimeout(() => { label.textContent = was; label.setAttribute('dir', 'ltr'); }, 1800);
  } catch {
    window.location.href = `mailto:${btn.dataset.copy}`;
  }
}));

initDemos();
initPalette({ onTheme: () => switchTheme(toggle) });
