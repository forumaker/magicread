import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import CommentPost from 'flarum/forum/components/CommentPost';
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
  const legacy = (ctx as any)?.attrs?.composer?.editor?.el as HTMLTextAreaElement | undefined;
  if (legacy && document.body.contains(legacy)) return legacy;

  const composer = document.querySelector('.Composer:not(.minimized)') as HTMLElement | null;
  return (composer?.querySelector('.TextEditor textarea') as HTMLTextAreaElement) || null;
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

const READMORE_MAX_HEIGHT = 240;
let readMoreObserver: MutationObserver | null = null;

function readMoreEnabled(): boolean {
  const v = app.forum.attribute('magicread_enable_readmore');
  return v !== false;
}

function isUserPage(): boolean {
  const rn = (app.current as any)?.routeName as string | undefined;
  if (rn && rn.startsWith('user')) return true;

  const p = (typeof location !== 'undefined' && location.pathname) || '';
  if (p.startsWith('/u/')) return true;

  return !!document.querySelector('.UserPage');
}

function collapseBodyIfNeeded(body: HTMLElement): void {
  if (body.dataset.magicreadProcessed === '1') return;
  body.dataset.magicreadProcessed = '1';

  if (body.dataset.magicreadExpanded === '1') return;

  const fullHeight = body.scrollHeight;
  if (fullHeight <= READMORE_MAX_HEIGHT + 40) return;

  body.classList.add('MagicRead-ReadMoreBody', 'MagicRead-ReadMoreBody--collapsed');

  if (!body.dataset.magicreadId) {
    body.dataset.magicreadId = String(Math.random()).slice(2);
  }

  const prevBtn = body.parentElement?.querySelector(`.MagicRead-ReadMoreBtn[data-for="${body.dataset.magicreadId}"]`);
  if (prevBtn) prevBtn.remove();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'MagicRead-ReadMoreBtn';
  btn.dataset.for = body.dataset.magicreadId;
  btn.textContent = app.translator.trans('forumaker-magicread.forum.read_more');

  btn.addEventListener('click', () => {
    body.classList.remove('MagicRead-ReadMoreBody--collapsed');
    body.dataset.magicreadExpanded = '1';
    btn.remove();
  });

  body.insertAdjacentElement('afterend', btn);
}

function applyReadMoreOnce(): void {
  if (!readMoreEnabled() || !isUserPage()) return;
  const bodies = Array.from(document.querySelectorAll('.UserPage .CommentPost .Post-body')) as HTMLElement[];
  bodies.forEach(collapseBodyIfNeeded);
}

function bindReadMoreObserver(): void {
  if (readMoreObserver) return;
  if (!readMoreEnabled() || !isUserPage()) return;

  readMoreObserver = new MutationObserver(() => applyReadMoreOnce());
  readMoreObserver.observe(document.body, { childList: true, subtree: true });
  applyReadMoreOnce();
}

function unbindReadMoreObserver(): void {
  if (!readMoreObserver) return;
  readMoreObserver.disconnect();
  readMoreObserver = null;
}

function resetReadMoreProcessed(): void {
  const bodies = Array.from(document.querySelectorAll('.UserPage .CommentPost .Post-body')) as HTMLElement[];
  bodies.forEach((b) => {
    if (b.dataset.magicreadExpanded === '1') return;
    b.dataset.magicreadProcessed = '0';
    b.classList.remove('MagicRead-ReadMoreBody', 'MagicRead-ReadMoreBody--collapsed');
    const btn = b.parentElement?.querySelector(`.MagicRead-ReadMoreBtn[data-for="${b.dataset.magicreadId || ''}"]`);
    if (btn) btn.remove();
  });
}

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

    if (readMoreEnabled() && isUserPage()) {
      bindReadMoreObserver();
      resetReadMoreProcessed();
      applyReadMoreOnce();
      setTimeout(() => {
        resetReadMoreProcessed();
        applyReadMoreOnce();
      }, 120);
    } else {
      unbindReadMoreObserver();
    }
  }, 0);
}

function handleResize(): void {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => handleRouteChange(), 120);
}

let urlWatchTimer: number | null = null;
let lastUrl = '';

function currentUrlKey(): string {
  const p = (typeof location !== 'undefined' && location.pathname) || '';
  const s = (typeof location !== 'undefined' && location.search) || '';
  const h = (typeof location !== 'undefined' && location.hash) || '';
  return p + s + h;
}

function startUrlWatch(): void {
  if (urlWatchTimer) return;
  lastUrl = currentUrlKey();
  urlWatchTimer = window.setInterval(() => {
    const now = currentUrlKey();
    if (now !== lastUrl) {
      lastUrl = now;
      handleRouteChange();
      setTimeout(handleRouteChange, 100);
      setTimeout(handleRouteChange, 250);
    }
  }, 120);
}

app.initializers.add('forumaker-magicread', () => {
  try {
    const n = Number(app.forum.attribute('magicread_per_page'));
    if (!isNaN(n) && n > 0) PER_PAGE = n;
  } catch {}

  extend(CommentPost.prototype, 'oncreate', function (vnode: any) {
    try {
      if (!readMoreEnabled() || !isUserPage()) return;
      const root = vnode.dom as HTMLElement;
      const body = root.querySelector('.Post-body') as HTMLElement | null;
      if (body) {
        body.dataset.magicreadProcessed = '0';
        collapseBodyIfNeeded(body);
      }
    } catch {}
  });

  extend(CommentPost.prototype, 'onupdate', function (vnode: any) {
    try {
      if (!readMoreEnabled() || !isUserPage()) return;
      const root = vnode.dom as HTMLElement;
      const body = root.querySelector('.Post-body') as HTMLElement | null;
      if (body) {
        if (body.dataset.magicreadExpanded === '1') return;
        body.dataset.magicreadProcessed = '0';
        collapseBodyIfNeeded(body);
      }
    } catch {}
  });

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
      ta.addEventListener('input', this.magicReadUpdate!);
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

  startUrlWatch();

  handleRouteChange();
  setTimeout(handleRouteChange, 120);
  setTimeout(handleRouteChange, 300);

  window.addEventListener('popstate', handleRouteChange as any, { passive: true });
  window.addEventListener('hashchange', handleRouteChange as any, { passive: true });
  window.addEventListener('resize', handleResize as any, { passive: true });

  try {
    const h = (app as any).history;
    if (h?.on) {
      h.on('change', () => {
        handleRouteChange();
        setTimeout(handleRouteChange, 120);
      });
    }
  } catch {}
});