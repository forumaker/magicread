import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import CommentPost from 'flarum/forum/components/CommentPost';
import { extend } from 'flarum/common/extend';

interface MagicReadEditor extends TextEditor {
  magicReadCounterEl?: HTMLElement | null;
  magicReadUpdate?: () => void;
  magicReadTa?: HTMLTextAreaElement | null;
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

function injectReadMoreCssOnce(): void {
  if (document.getElementById('MagicRead-ReadMoreStyle')) return;

  const style = document.createElement('style');
  style.id = 'MagicRead-ReadMoreStyle';
  style.textContent = `
    .MagicRead-ReadMoreBody.MagicRead-ReadMoreBody--collapsed{
      max-height:${READMORE_MAX_HEIGHT}px;
      overflow:hidden;
      position:relative;
    }
    .MagicRead-ReadMoreBody.MagicRead-ReadMoreBody--collapsed::after{
      content:'';
      position:absolute;
      left:0; right:0; bottom:0;
      height:64px;
      pointer-events:none;
      background: linear-gradient(to bottom, rgba(0,0,0,0), var(--body-bg));
    }
    .MagicRead-ReadMoreBtn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      margin-top:10px;
      border:0;
      border-radius:999px;
      padding:6px 10px;
      cursor:pointer;
      font-size:13px;
      font-weight:700;
      line-height:1;
      background: var(--primary-color, var(--control-bg));
      color: var(--body-bg, #fff);
      box-shadow:0 1px 0 rgba(0,0,0,.12);
      opacity:.95;
    }
    .MagicRead-ReadMoreBtn:hover{ opacity:1; }
  `;
  document.head.appendChild(style);
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
  injectReadMoreCssOnce();
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

function handleRouteChange(): void {
  if (routeTimer) window.clearTimeout(routeTimer);
  routeTimer = window.setTimeout(() => {
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