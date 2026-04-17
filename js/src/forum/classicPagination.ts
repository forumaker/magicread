import app from 'flarum/forum/app';

declare const m: any;

let renderTimer: number | null = null;
let observer: MutationObserver | null = null;
let urlWatchTimer: number | null = null;
let keepAliveTimer: number | null = null;
let lastRenderKey = '';
let lastUrl = '';

function isMobile(): boolean {
  return window.matchMedia('(max-width: 800px)').matches;
}

function classicPaginationEnabled(): boolean {
  const v = app.forum.attribute('magicread_enable_pagination');
  return v !== false && !app.forum.attribute('magicread_enable_discussion_pager') && !isMobile();
}

function isDiscussionPage(): boolean {
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  return path.startsWith('/d/') || !!document.querySelector('.DiscussionPage');
}

function getPerPage(): number {
  const raw = Number(app.forum.attribute('magicread_per_page') || 20);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

function getDiscussionModel(): any | null {
  try {
    return (app.current as any)?.get?.('discussion') || null;
  } catch {}

  return null;
}

function getDiscussionId(discussion: any): string {
  try {
    if (typeof discussion?.id === 'function') return String(discussion.id());
    if (discussion?.data?.id) return String(discussion.data.id);
    if (discussion?.id) return String(discussion.id);
  } catch {}

  return '';
}

function getDiscussionSlug(discussion: any): string {
  try {
    if (typeof discussion?.slug === 'function') return String(discussion.slug());
    if (typeof discussion?.attribute === 'function') return String(discussion.attribute('slug') || '');
    if (discussion?.data?.attributes?.slug) return String(discussion.data.attributes.slug);
    if (discussion?.slug) return String(discussion.slug);
  } catch {}

  return '';
}

function getLastPostNumber(discussion: any): number {
  let byLast = 0;
  let byCount = 0;

  try {
    if (typeof discussion?.lastPostNumber === 'function') {
      byLast = Number(discussion.lastPostNumber() || 0);
    } else if (typeof discussion?.attribute === 'function') {
      byLast = Number(discussion.attribute('lastPostNumber') || 0);
    } else if (discussion?.data?.attributes?.lastPostNumber) {
      byLast = Number(discussion.data.attributes.lastPostNumber || 0);
    }
  } catch {}

  try {
    if (typeof discussion?.commentCount === 'function') {
      byCount = Number(discussion.commentCount() || 0) + 1;
    } else if (typeof discussion?.attribute === 'function') {
      byCount = Number(discussion.attribute('commentCount') || 0) + 1;
    } else if (discussion?.data?.attributes?.commentCount) {
      byCount = Number(discussion.data.attributes.commentCount || 0) + 1;
    }
  } catch {}

  const total = Math.max(byLast, byCount, 1);
  return Number.isFinite(total) && total > 0 ? total : 1;
}

function getNearFromUrl(): number {
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  const match = path.match(/\/d\/[^/]+(?:\/(\d+))?/);
  const near = match?.[1] ? parseInt(match[1], 10) : 1;
  return Number.isFinite(near) && near > 0 ? near : 1;
}

function getTotalPages(discussion: any): number {
  return Math.max(1, Math.ceil(getLastPostNumber(discussion) / getPerPage()));
}

function getCurrentPage(totalPages: number): number {
  const perPage = getPerPage();
  const near = getNearFromUrl();
  const page = Math.ceil(near / perPage);
  return Math.min(Math.max(page, 1), totalPages);
}

function makeDiscussionPath(discussion: any, page: number): string {
  const id = getDiscussionId(discussion);
  const slug = getDiscussionSlug(discussion);
  const safePage = Math.max(1, page);
  const near = (safePage - 1) * getPerPage() + 1;

  if (!id || !slug) return location.pathname;

  return safePage <= 1 ? `/d/${id}-${slug}` : `/d/${id}-${slug}/${near}`;
}

function navigateToDiscussionPage(discussion: any, page: number): void {
  const path = makeDiscussionPath(discussion, page);

  try {
    if (typeof m !== 'undefined' && typeof m.route?.set === 'function') {
      m.route.set(path);
      return;
    }
  } catch {}

  window.location.assign(path);
}

function currentUrlKey(): string {
  const p = (typeof location !== 'undefined' && location.pathname) || '';
  const s = (typeof location !== 'undefined' && location.search) || '';
  const h = (typeof location !== 'undefined' && location.hash) || '';
  return p + s + h;
}

function getNavRoot(root: HTMLElement): HTMLElement | null {
  return (
    (root.querySelector('.DiscussionPage-nav') as HTMLElement | null) ||
    (root.querySelector('.PostStreamScrubber')?.closest('.DiscussionPage-nav') as HTMLElement | null) ||
    (root.querySelector('.item-scrubber')?.closest('.DiscussionPage-nav') as HTMLElement | null)
  );
}

function getScrubberElement(navRoot: HTMLElement): HTMLElement | null {
  return (
    (navRoot.querySelector('.item-scrubber') as HTMLElement | null) ||
    (navRoot.querySelector('.PostStreamScrubber') as HTMLElement | null)
  );
}

function findTimelineHost(): HTMLElement | null {
  const root = document.querySelector('.DiscussionPage') as HTMLElement | null;
  if (!root) return null;

  const navRoot = getNavRoot(root);
  if (!navRoot) return null;

  const scrubber = getScrubberElement(navRoot);

  let host = navRoot.querySelector('.MagicRead-TimelinePagerHost') as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.className = 'MagicRead-TimelinePagerHost';
  }

  if (scrubber && scrubber.parentNode) {
    if (host.parentNode !== scrubber.parentNode || host.previousElementSibling !== scrubber) {
      host.remove();

      if (scrubber.nextSibling) {
        scrubber.parentNode.insertBefore(host, scrubber.nextSibling);
      } else {
        scrubber.parentNode.appendChild(host);
      }
    }
  } else if (host.parentNode !== navRoot) {
    host.remove();
    navRoot.appendChild(host);
  }

  return host;
}

function removeClassicPagerHost(): void {
  document.querySelectorAll('.MagicRead-TimelinePagerHost').forEach((el) => el.remove());
  lastRenderKey = '';
}

function buildClassicPager(discussion: any, currentPage: number, totalPages: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'MagicRead-TimelinePager';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(totalPages);
  input.step = '1';
  input.value = String(currentPage);
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', String(app.translator.trans('forumaker-magicread.forum.pager.input_label')));

  const fitInputWidth = () => {
    const len = Math.max(1, input.value.length, String(totalPages).length);
    input.style.width = `${Math.min(Math.max(len + 0.2, 2), 4)}ch`;
  };

  input.addEventListener('input', fitInputWidth);
  fitInputWidth();

  const sep = document.createElement('span');
  sep.className = 'MagicRead-Sep';
  sep.textContent = '/';

  const total = document.createElement('span');
  total.className = 'MagicRead-Total';
  total.textContent = String(totalPages);

  const submit = () => {
    const wanted = parseInt(input.value, 10);
    if (!Number.isFinite(wanted)) return;

    const page = Math.min(Math.max(wanted, 1), totalPages);
    navigateToDiscussionPage(discussion, page);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  input.addEventListener('change', submit);

  wrap.appendChild(input);
  wrap.appendChild(sep);
  wrap.appendChild(total);

  return wrap;
}

function buildRenderKey(discussion: any, currentPage: number, totalPages: number): string {
  return [
    getDiscussionId(discussion),
    getDiscussionSlug(discussion),
    currentPage,
    totalPages,
    getNearFromUrl(),
    location.pathname,
    isMobile() ? 'm' : 'd',
  ].join('|');
}

function applyClassicPagination(force = false): void {
  const enabled = classicPaginationEnabled();
  const onDiscussion = isDiscussionPage();

  document.body.classList.toggle('MagicRead--classicPaginationEnabled', enabled && onDiscussion);

  if (!enabled || !onDiscussion) {
    removeClassicPagerHost();
    return;
  }

  const discussion = getDiscussionModel();
  if (!discussion) return;

  const totalPages = getTotalPages(discussion);
  const currentPage = getCurrentPage(totalPages);
  const renderKey = buildRenderKey(discussion, currentPage, totalPages);

  const host = findTimelineHost();
  if (!host) return;

  if (!force && renderKey === lastRenderKey && host.childElementCount > 0) {
    return;
  }

  lastRenderKey = renderKey;
  host.replaceChildren(buildClassicPager(discussion, currentPage, totalPages));
}

function rerenderAfterRouteChange(): void {
  scheduleClassicPaginationRender(0, true);
  setTimeout(() => scheduleClassicPaginationRender(80, true), 80);
  setTimeout(() => scheduleClassicPaginationRender(180, true), 180);
  setTimeout(() => scheduleClassicPaginationRender(320, true), 320);
  setTimeout(() => scheduleClassicPaginationRender(500, true), 500);
}

function startUrlWatch(): void {
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

function startKeepAlive(): void {
  if (keepAliveTimer) return;

  keepAliveTimer = window.setInterval(() => {
    if (!classicPaginationEnabled() || !isDiscussionPage()) return;

    const host = findTimelineHost();
    if (!host || !host.firstElementChild) {
      scheduleClassicPaginationRender(0, true);
    }
  }, 400);
}

export function scheduleClassicPaginationRender(delay = 0, force = false): void {
  if (renderTimer) window.clearTimeout(renderTimer);

  renderTimer = window.setTimeout(() => {
    applyClassicPagination(force);
  }, delay);
}

export function mountClassicPagination(): void {
  if (!urlWatchTimer) startUrlWatch();
  if (!keepAliveTimer) startKeepAlive();
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!classicPaginationEnabled() || !isDiscussionPage()) return;

    const shouldReact = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest?.('.MagicRead-TimelinePagerHost')) return false;

        return (
          node.matches?.('.DiscussionPage, .DiscussionPage-nav, .PostStreamScrubber, .item-scrubber, .PostStream, .PostStream-item') ||
          !!node.querySelector?.('.DiscussionPage, .DiscussionPage-nav, .PostStreamScrubber, .item-scrubber, .PostStream, .PostStream-item')
        );
      })
    );

    if (!shouldReact) return;
    scheduleClassicPaginationRender(30, true);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}