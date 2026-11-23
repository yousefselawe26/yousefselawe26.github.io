// Quick search: ⌘K / Ctrl+K (or "/") opens a list of every app, the home page's sections
// and a couple of actions. Type to filter; arrows and Enter to pick.

/** Lower-case, no harakat, and the Arabic letters people type interchangeably made equal. */
export const normalize = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[ً-ْٰ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();

const GLYPHS = {
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  spark: '<path d="M12 3l2 6.5L20.5 12 14 14.5 12 21l-2-6.5L3.5 12 10 9.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  lang: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z"/>',
};
const glyph = (name) => `<svg class="palette-glyph" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] ?? ''}</svg>`;
const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function initPalette({ onTheme } = {}) {
  const dialog = document.querySelector('[data-palette]');
  const holder = document.getElementById('palette-data');
  if (!dialog || !holder) return;
  const { items, groups, empty: emptyText } = JSON.parse(holder.textContent);
  const input = dialog.querySelector('[data-palette-input]');
  const list = dialog.querySelector('[data-palette-list]');
  const empty = dialog.querySelector('[data-palette-empty]');
  const haystacks = items.map((it) => normalize(`${it.label} ${it.hint ?? ''} ${it.keywords ?? ''}`));
  let shown = [];
  let active = 0;

  // The shortcut hint reads ⌘K on Apple devices and Ctrl K elsewhere.
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    document.querySelectorAll('[data-shortcut]').forEach((k) => { k.textContent = 'Ctrl K'; });
  }

  function render() {
    const q = normalize(input.value);
    shown = items.map((it, i) => ({ it, i })).filter(({ i }) => !q || haystacks[i].includes(q));
    let html = '';
    let lastGroup = '';
    shown.forEach(({ it }, n) => {
      if (it.group !== lastGroup) {
        html += `<li class="palette-group" role="presentation">${escapeHTML(groups[it.group])}</li>`;
        lastGroup = it.group;
      }
      const media = it.icon ? `<img src="${it.icon}" alt="" width="32" height="32">` : glyph(it.glyph);
      html += `<li class="palette-item" role="option" id="pal-${n}" data-n="${n}" aria-selected="false">${media}<span class="palette-text"><span class="palette-label"${it.lang ? ` lang="${it.lang}"` : ''}>${escapeHTML(it.label)}</span>${it.hint ? `<span class="palette-hint">${escapeHTML(it.hint)}</span>` : ''}</span><svg class="palette-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></li>`;
    });
    list.innerHTML = html;
    empty.hidden = shown.length > 0;
    if (!shown.length) empty.textContent = emptyText.replace('{q}', input.value.trim());
    setActive(0);
  }

  function setActive(n) {
    if (!shown.length) { input.removeAttribute('aria-activedescendant'); return; }
    active = (n + shown.length) % shown.length;
    list.querySelectorAll('.palette-item').forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.n) === active)));
    const el = list.querySelector(`#pal-${active}`);
    input.setAttribute('aria-activedescendant', el.id);
    el.scrollIntoView({ block: 'nearest' });
  }

  function choose(n) {
    const entry = shown[n];
    if (!entry) return;
    const { it } = entry;
    if (it.action === 'theme') {
      dialog.close();
      onTheme?.();
      return;
    }
    if (it.lang) { try { localStorage.setItem('sq-lang', it.lang); } catch { /* private mode */ } }
    const target = new URL(it.href, location.href);
    dialog.close();
    // A section of the page we're on: scroll there instead of reloading.
    if (target.pathname === location.pathname && target.hash) {
      document.querySelector(target.hash)?.scrollIntoView({ behavior: 'smooth' });
      history.replaceState(null, '', target.hash);
      return;
    }
    // Let the app's icon carry over into its page.
    const img = list.querySelector(`#pal-${n} img`);
    if (img) img.style.viewTransitionName = 'app-icon';
    location.href = target.href;
  }

  function open() {
    if (dialog.open) return;
    input.value = '';
    render();
    dialog.showModal();
    input.focus();
  }

  document.querySelectorAll('[data-palette-open]').forEach((b) => b.addEventListener('click', open));
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dialog.open) dialog.close(); else open();
      return;
    }
    const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (e.key === '/' && !typing && !dialog.open) {
      e.preventDefault();
      open();
    }
  });

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  });
  list.addEventListener('pointermove', (e) => {
    const item = e.target.closest('.palette-item');
    if (item && Number(item.dataset.n) !== active) setActive(Number(item.dataset.n));
  });
  list.addEventListener('click', (e) => {
    const item = e.target.closest('.palette-item');
    if (item) choose(Number(item.dataset.n));
  });
  // A click on the dimmed backdrop (the dialog itself, outside its box) closes it.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
