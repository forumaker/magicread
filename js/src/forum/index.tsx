import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import { extend } from 'flarum/common/extend';

interface MagicReadEditor extends TextEditor {
  magicReadCounterEl?: HTMLElement | null;
  magicReadUpdate?: () => void;
  attrs: {
    composer?: {
      editor?: {
        el?: HTMLTextAreaElement;
      };
    };
  };
}

function getTextarea(ctx: MagicReadEditor): HTMLTextAreaElement | null {
  return ctx?.attrs?.composer?.editor?.el || null;
}

function createCounterLi(): { li: HTMLLIElement; span: HTMLSpanElement } {
  const li = document.createElement('li');
  li.className = 'item-magicread-counter';
  const span = document.createElement('span');
  span.className = 'MagicRead-CharCounter';
  span.textContent = '0';
  span.setAttribute('aria-live', 'polite');
  li.appendChild(span);
  return { li, span };
}

function mountCounterLeft(ctx: MagicReadEditor): HTMLSpanElement | null {
  const ta = getTextarea(ctx);
  if (!ta) return null;

  const composer = ta.closest('.Composer');
  if (!composer) return null;

  const controls = composer.querySelector('.Composer-controls');
  if (!controls) return null;

  let li = controls.querySelector('li.item-magicread-counter') as HTMLLIElement | null;
  let span: HTMLSpanElement | null = null;

  if (li) {
    span = li.querySelector('.MagicRead-CharCounter');
  } else {
    const nodes = createCounterLi();
    li = nodes.li;
    span = nodes.span;
    controls.insertAdjacentElement('afterbegin', li);
  }
  return span;
}

let PER_PAGE = 20;
let pagerUpdate: (() => void) | null = null;
let mo: MutationObserver | null = null;
let routeTimer: number | null = null;
let resizeTimer: number | null = null;
let winListenersBound = false;

function isDiscussionPage(): boolean {
  return !!document.querySelector('.DiscussionPage');
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 800px)').matches;
}

function paginationEnabled(): boolean {
  const v = app.forum.attribute('magicread_enable_pagination');
  return v !== false;
}

function getDiscussion(): any | null {
  if (!app.current) return null;
  if (typeof (app.current as any).get === 'function') return (app.current as any).get('discussion') || null;
  return null;
}

function getStream(): any | null {
  if (!app.current) return null;
  let s: any | null = null;
  if (typeof (app.current as any).get === 'function') s = (app.current as any).get('stream');
  if (!s && (app.current as any).stream) s = (app.current as any).stream;

  if (!s) {
    const el = document.querySelector('.DiscussionPage .PostStream') as any;
    if (el && el.__stream) s = el.__stream;
  }
  return s || null;
}

function totalPages(): number {
  const d = getDiscussion();
  const total = d && typeof d.commentCount === 'function' ? d.commentCount() : 0;
  const pages = Math.ceil((total || 0) / PER_PAGE);
  return pages > 0 ? pages : 1;
}

function currentPage(): number {
  const s = getStream();
  const idx = s && typeof s.index === 'number' ? s.index : 0;
  const p = Math.floor(idx / PER_PAGE) + 1;
  return p > 0 ? p : 1;
}

function gotoPage(n: string | number): void {
  const all = totalPages();
  let num = parseInt(String(n), 10);
  if (!num || num < 1) num = 1;
  if (num > all) num = all;

  const s = getStream();
  const byIndex = (num - 1) * PER_PAGE;
  const byNumber = byIndex + 1;

  if (s?.goToNumber) s.goToNumber(byNumber);
  else if (s?.goToIndex) s.goToIndex(byIndex);
}

function ensurePagerHost(): HTMLDivElement | null {
  const scrubber = document.querySelector('.DiscussionPage .PostStreamScrubber');
  if (!scrubber) return null;

  let host = scrubber.parentElement?.querySelector(':scope > .MagicRead-TimelinePagerHost') as HTMLDivElement | null;

  if (!host) {
    host = document.createElement('div');
    host.className = 'MagicRead-TimelinePagerHost';
    scrubber.insertAdjacentElement('afterend', host);
  }
  return host;
}

function digits(n: string | number): number {
  let v = parseInt(String(n), 10);
  if (isNaN(v) || v < 0) v = 0;
  return String(v).length;
}

function fitWidth(el: HTMLElement, n: string | number, padCh = 0): void {
  const ch = digits(n) + padCh;
  el.setAttribute('style', `width:${ch}ch`);
}

function buildPagerDom(host: HTMLDivElement): () => void {
  host.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'MagicRead-TimelinePager';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.className = 'MagicRead-Input';

  const sep = document.createElement('span');
  sep.className = 'MagicRead-Sep';
  sep.textContent = '/';

  const total = document.createElement('span');
  total.className = 'MagicRead-Total';

  wrap.appendChild(input);
  wrap.appendChild(sep);
  wrap.appendChild(total);
  host.appendChild(wrap);

  function sanitize() {
    const v = input.value.replace(/[^\d]/g, '');
    input.value = v;
    fitWidth(input, v || 0, 0.5);
  }

  function commit() {
    let v = input.value;
    if (!v) v = '1';
    gotoPage(v);
  }

  input.addEventListener('input', sanitize);
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') commit();
  });
  input.addEventListener('blur', commit);

  function sync() {
    const cur = currentPage();
    const all = totalPages();
    input.value = String(cur);
    total.textContent = String(all);
    fitWidth(input, cur, 0.5);
    fitWidth(total, all, 0.5);
  }

  sync();
  return sync;
}

function mountPager(): void {
  if (!isDiscussionPage() || isMobile() || !paginationEnabled()) {
    unmountPager();
    return;
  }

  const host = ensurePagerHost();
  if (!host) return;

  pagerUpdate = buildPagerDom(host);

  const streamNode = document.querySelector('.DiscussionPage .PostStream');
  if (streamNode) {
    if (mo) mo.disconnect();
    mo = new MutationObserver(() => {
      pagerUpdate?.();
    });
    mo.observe(streamNode, { childList: true, subtree: true });
  }

  if (!winListenersBound) {
    window.addEventListener('popstate', handleRouteChange as any, { passive: true });
    window.addEventListener('hashchange', handleRouteChange as any, { passive: true });
    window.addEventListener('resize', handleResize as any, { passive: true });
    winListenersBound = true;
  }
}

function unmountPager(): void {
  if (mo) {
    mo.disconnect();
    mo = null;
  }
  const host = document.querySelector('.MagicRead-TimelinePagerHost');
  if (host?.parentNode) host.parentNode.removeChild(host);
  pagerUpdate = null;
}

function handleRouteChange(): void {
  if (routeTimer) window.clearTimeout(routeTimer);
  routeTimer = window.setTimeout(() => {
    if (!isDiscussionPage() || isMobile() || !paginationEnabled()) {
      unmountPager();
    } else {
      mountPager();
      pagerUpdate?.();
    }
  }, 60);
}

function handleResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => handleRouteChange(), 120);
}

app.initializers.add('forumaker-magicread', () => {
  // === COUNTER ===
  function counterEnabled(): boolean {
    const v = app.forum.attribute('magicread_enable_counter');
    return v !== false;
  }

  const oldCreate = TextEditor.prototype.oncreate;
  TextEditor.prototype.oncreate = function (this: MagicReadEditor, vnode: any) {
    if (oldCreate) oldCreate.call(this, vnode);
    if (!counterEnabled()) return;

    this.magicReadCounterEl = mountCounterLeft(this);

    this.magicReadUpdate = () => {
      const ta = getTextarea(this);
      const val = ta?.value?.length ?? 0;
      if (this.magicReadCounterEl) this.magicReadCounterEl.textContent = String(val);
    };

    const ta = getTextarea(this);
    if (ta) {
      ta.addEventListener('input', this.magicReadUpdate);
      this.magicReadUpdate();
    }
  };

  const oldUpdate = TextEditor.prototype.onupdate;
  TextEditor.prototype.onupdate = function (this: MagicReadEditor, vnode: any) {
    if (oldUpdate) oldUpdate.call(this, vnode);
    if (!counterEnabled()) return;

    if (!this.magicReadCounterEl || !document.body.contains(this.magicReadCounterEl)) {
      this.magicReadCounterEl = mountCounterLeft(this);
      this.magicReadUpdate?.();
    }
  };

  const oldRemove = TextEditor.prototype.onremove;
  TextEditor.prototype.onremove = function (this: MagicReadEditor, vnode: any) {
    try {
      const ta = getTextarea(this);
      if (ta && this.magicReadUpdate) ta.removeEventListener('input', this.magicReadUpdate);
      const li = this.magicReadCounterEl?.closest('.item-magicread-counter');
      if (li?.parentNode) li.parentNode.removeChild(li);
    } catch {}
    if (oldRemove) oldRemove.call(this, vnode);
  };

  extend(DiscussionPage.prototype, 'oncreate', function () {
    setTimeout(handleRouteChange, 0);
  });

  extend(DiscussionPage.prototype, 'onupdate', function () {
    if (pagerUpdate) pagerUpdate();
    else handleRouteChange();
  });

  extend(DiscussionPage.prototype, 'onremove', function () {
    unmountPager();
  });

  window.addEventListener('popstate', handleRouteChange as any, { passive: true });
  window.addEventListener('hashchange', handleRouteChange as any, { passive: true });
  window.addEventListener('resize', handleResize as any, { passive: true });
});