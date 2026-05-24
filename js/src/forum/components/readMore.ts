import app from 'flarum/forum/app';
import { currentUrlKey } from './paginationUtils';

const READMORE_MAX_HEIGHT = 240;

let readMoreObserver: MutationObserver | null = null;
let routeTimer: number | null = null;
let urlWatchTimer: number | null = null;
let lastUrl = '';

function readMoreEnabled(): boolean {
  return app.forum.attribute('magicread_enable_readmore') !== false;
}

function isUserPage(): boolean {
  const routeName = (app.current as any)?.routeName as string | undefined;
  if (routeName && routeName.startsWith('user')) return true;

  const path = (typeof location !== 'undefined' && location.pathname) || '';
  if (path.startsWith('/u/')) return true;

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
      display:flex;
      align-items:center;
      justify-content:center;
      margin:10px auto 0;
      border:0;
      border-radius:999px;
      padding:6px 10px;
      cursor:pointer;
      font-size:12px;
      font-weight:700;
      line-height:1;
      font-family:inherit;
      background: var(--control-bg);
      color: var(--text-color) !important;
      opacity:.95;
      transition: opacity .15s ease, transform .15s ease;
    }
    .MagicRead-ReadMoreBtn,
    .MagicRead-ReadMoreBtn:visited,
    .MagicRead-ReadMoreBtn:hover,
    .MagicRead-ReadMoreBtn:active,
    .MagicRead-ReadMoreBtn:focus{
      color: var(--text-color) !important;
    }
    .MagicRead-ReadMoreBtn *{
      color: inherit !important;
    }
    .MagicRead-ReadMoreBtn:hover{
      opacity:1;
      transform:translateY(-1px);
    }
    .MagicRead-ReadMoreBtn:active{
      transform:translateY(0);
    }
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

  const existing = body.parentElement?.querySelector(
    `.MagicRead-ReadMoreBtn[data-for="${body.dataset.magicreadId}"]`
  ) as HTMLElement | null;

  if (existing) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'MagicRead-ReadMoreBtn';
  btn.dataset.for = body.dataset.magicreadId;
  btn.textContent = String(app.translator.trans('forumaker-magicread.forum.read_more'));

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

function resetReadMoreProcessed(): void {
  const bodies = Array.from(document.querySelectorAll('.UserPage .CommentPost .Post-body')) as HTMLElement[];

  bodies.forEach((b) => {
    if (b.dataset.magicreadExpanded === '1') return;

    b.dataset.magicreadProcessed = '0';
    b.classList.remove('MagicRead-ReadMoreBody', 'MagicRead-ReadMoreBody--collapsed');

    const btn = b.parentElement?.querySelector(
      `.MagicRead-ReadMoreBtn[data-for="${b.dataset.magicreadId || ''}"]`
    );
    if (btn) btn.remove();
  });
}

function bindReadMoreObserver(): void {
  if (readMoreObserver) return;
  if (!readMoreEnabled() || !isUserPage()) return;

  readMoreObserver = new MutationObserver(() => {
    applyReadMoreOnce();
  });

  readMoreObserver.observe(document.body, { childList: true, subtree: true });
  applyReadMoreOnce();
}

function unbindReadMoreObserver(): void {
  if (!readMoreObserver) return;
  readMoreObserver.disconnect();
  readMoreObserver = null;
}

function rerenderAfterRouteChange(): void {
  handleReadMoreRouteChange();
  setTimeout(handleReadMoreRouteChange, 80);
  setTimeout(handleReadMoreRouteChange, 180);
  setTimeout(handleReadMoreRouteChange, 320);
}

export function applyReadMoreToPost(root: HTMLElement): void {
  if (!readMoreEnabled()) return;

  const body = root.querySelector('.Post-body') as HTMLElement | null;
  if (!body) return;

  const isOnUserPage =
    !!root.closest('.UserPage') ||
    !!document.querySelector('.UserPage') ||
    ((typeof location !== 'undefined' && location.pathname) || '').startsWith('/u/');

  if (!isOnUserPage) return;
  if (body.dataset.magicreadExpanded === '1') return;

  body.dataset.magicreadProcessed = '0';
  collapseBodyIfNeeded(body);
}

export function handleReadMoreRouteChange(): void {
  if (routeTimer) window.clearTimeout(routeTimer);

  routeTimer = window.setTimeout(() => {
    if (readMoreEnabled() && isUserPage()) {
      injectReadMoreCssOnce();
      bindReadMoreObserver();
      resetReadMoreProcessed();
      applyReadMoreOnce();

      setTimeout(() => {
        resetReadMoreProcessed();
        applyReadMoreOnce();
      }, 120);

      setTimeout(() => {
        resetReadMoreProcessed();
        applyReadMoreOnce();
      }, 260);
    } else {
      unbindReadMoreObserver();
    }
  }, 0);
}

export function startReadMoreUrlWatch(): void {
  if (urlWatchTimer) return;

  lastUrl = currentUrlKey();
  urlWatchTimer = window.setInterval(() => {
    const now = currentUrlKey();
    if (now !== lastUrl) {
      lastUrl = now;
      rerenderAfterRouteChange();
    }
  }, 120);
}

export function stopReadMoreUrlWatch(): void {
  if (urlWatchTimer) {
    window.clearInterval(urlWatchTimer);
    urlWatchTimer = null;
  }
  if (routeTimer) {
    window.clearTimeout(routeTimer);
    routeTimer = null;
  }
  unbindReadMoreObserver();
}
