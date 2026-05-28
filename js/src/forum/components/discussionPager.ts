import app from 'flarum/forum/app';
import {
  isDiscussionPage,
  getDiscussionModel,
  getDiscussionId,
  getDiscussionSlug,
  getCurrentPage,
  getTotalPages,
  getNearFromUrl,
  navigateToDiscussionPage,
} from './paginationUtils';

let renderTimer: number | null = null;
let observer: MutationObserver | null = null;
let lastRenderKey = '';
let lastAppliedPageKey = '';

let savedLoadNext: (() => void) | null = null;
let savedLoadPrevious: (() => void) | null = null;
let patchedStream: any | null = null;

function discussionPagerEnabled(): boolean {
  return !!app.forum.attribute('magicread_enable_discussion_pager');
}

function isMobilePager(): boolean {
  return window.matchMedia('(max-width: 600px)').matches;
}

function getDiscussionStream(): any | null {
  try {
    const current = app.current as any;
    let stream = current?.get?.('stream') || null;
    if (!stream) stream = current?.stream || null;
    if (!stream) {
      const el = document.querySelector('.DiscussionPage .PostStream') as any;
      if (el?.__stream) stream = el.__stream;
    }
    return stream || null;
  } catch {
    return null;
  }
}

function getVisiblePages(current: number, total: number): number[] {
  const maxVisible = isMobilePager() ? 3 : 10;

  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  let end = start + maxVisible - 1;

  if (end > total) {
    end = total;
    start = Math.max(1, end - maxVisible + 1);
  }

  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

function scrollPageTop(): void {
  const pager = document.querySelector('.MagicRead-DiscussionPagerHost--top') as HTMLElement | null;
  const nav = document.querySelector('.DiscussionPage-nav') as HTMLElement | null;
  const target = pager || nav;

  if (!target) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  const top = window.scrollY + target.getBoundingClientRect().top - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function ensureStreamPatched(stream: any): void {
  if (patchedStream === stream) return;

  if (patchedStream) {
    restoreStream();
  }

  savedLoadNext = stream.loadNext;
  savedLoadPrevious = stream.loadPrevious;
  patchedStream = stream;

  stream.paused = true;
  stream.loadNext = () => {};
  stream.loadPrevious = () => {};
}

function restoreStream(): void {
  if (!patchedStream) return;

  if (savedLoadNext !== null) patchedStream.loadNext = savedLoadNext;
  if (savedLoadPrevious !== null) patchedStream.loadPrevious = savedLoadPrevious;
  patchedStream.paused = false;

  patchedStream = null;
  savedLoadNext = null;
  savedLoadPrevious = null;
}

function lockStreamToPage(stream: any, page: number): void {
  const pageKey = `${getDiscussionId(getDiscussionModel())}|${page}`;

  ensureStreamPatched(stream);

  if (pageKey === lastAppliedPageKey) return;

  lastAppliedPageKey = pageKey;
  requestAnimationFrame(scrollPageTop);
}

function createPagerButton(options: {
  className?: string;
  text: string;
  title: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
}): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `Button MagicRead-DiscussionPager-btn ${options.className || ''}`.trim();
  btn.textContent = options.text;
  btn.title = options.title;
  btn.setAttribute('aria-label', options.title);

  if (options.active) {
    btn.classList.add('active');
    btn.setAttribute('aria-current', 'page');
  }

  if (options.disabled) {
    btn.disabled = true;
  } else if (options.onClick) {
    btn.addEventListener('click', (e) => {
      options.onClick?.();
      window.setTimeout(() => {
        (e.currentTarget as HTMLButtonElement | null)?.blur();
      }, 0);
    });

    btn.addEventListener('touchend', (e) => {
      window.setTimeout(() => {
        (e.currentTarget as HTMLButtonElement | null)?.blur();
      }, 0);
    });
  }

  return btn;
}

function createPagerHost(kind: 'top' | 'bottom'): HTMLDivElement {
  const host = document.createElement('div');
  host.className = `MagicRead-DiscussionPagerHost MagicRead-DiscussionPagerHost--${kind}`;
  return host;
}

function ensurePagerHosts(): { top: HTMLElement | null; bottom: HTMLElement | null } {
  const root = document.querySelector('.DiscussionPage') as HTMLElement | null;
  if (!root) return { top: null, bottom: null };

  const container =
    (root.querySelector('.DiscussionPage-list') as HTMLElement | null) ||
    (root.querySelector('.DiscussionPage-stream') as HTMLElement | null);

  if (!container) return { top: null, bottom: null };

  const stream = container.querySelector('.PostStream') as HTMLElement | null;
  if (!stream) return { top: null, bottom: null };

  let top = root.querySelector('.MagicRead-DiscussionPagerHost--top') as HTMLElement | null;
  let bottom = root.querySelector('.MagicRead-DiscussionPagerHost--bottom') as HTMLElement | null;

  if (!top) {
    top = createPagerHost('top');
    container.insertBefore(top, stream);
  }

  if (!bottom) {
    bottom = createPagerHost('bottom');
    if (stream.nextSibling) {
      container.insertBefore(bottom, stream.nextSibling);
    } else {
      container.appendChild(bottom);
    }
  }

  return { top, bottom };
}

function removePagerHosts(): void {
  restoreStream();
  document.querySelectorAll('.MagicRead-DiscussionPagerHost').forEach((el) => el.remove());
  lastRenderKey = '';
  lastAppliedPageKey = '';
}

function enhanceLoadMoreButton(discussion: any, currentPage: number, totalPages: number): void {
  const wrappers = Array.from(document.querySelectorAll('.PostStream-loadMore')) as HTMLElement[];

  wrappers.forEach((wrapper) => {
    wrapper.classList.add('MagicRead-LoadMoreWrap');

    const button = wrapper.querySelector('.Button, button') as HTMLButtonElement | null;
    if (!button) return;

    button.classList.add('MagicRead-LoadMoreButton');

    if (currentPage >= totalPages) {
      button.disabled = true;
      return;
    }

    button.disabled = false;
    button.onclick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      navigateToDiscussionPage(discussion, currentPage + 1);
      button.blur();
    };
  });
}

function buildPager(discussion: any, currentPage: number, totalPages: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'MagicRead-DiscussionPager';

  const controls = document.createElement('div');
  controls.className = 'MagicRead-DiscussionPager-controls';

  const pages = document.createElement('div');
  pages.className = 'MagicRead-DiscussionPager-pages';

  const jump = document.createElement('form');
  jump.className = 'MagicRead-DiscussionPager-jump';
  jump.setAttribute('novalidate', 'novalidate');

  controls.appendChild(
    createPagerButton({
      className: 'MagicRead-DiscussionPager-btn--nav',
      text: '«',
      title: String(app.translator.trans('forumaker-magicread.forum.pager.first')),
      disabled: currentPage <= 1,
      onClick: () => navigateToDiscussionPage(discussion, 1),
    })
  );

  controls.appendChild(
    createPagerButton({
      className: 'MagicRead-DiscussionPager-btn--nav',
      text: '‹',
      title: String(app.translator.trans('forumaker-magicread.forum.pager.prev')),
      disabled: currentPage <= 1,
      onClick: () => navigateToDiscussionPage(discussion, currentPage - 1),
    })
  );

  getVisiblePages(currentPage, totalPages).forEach((page) => {
    pages.appendChild(
      createPagerButton({
        className: 'MagicRead-DiscussionPager-btn--page',
        text: String(page),
        title: `${String(app.translator.trans('forumaker-magicread.forum.pager.page'))} ${page}`,
        active: page === currentPage,
        onClick: () => navigateToDiscussionPage(discussion, page),
      })
    );
  });

  controls.appendChild(pages);

  controls.appendChild(
    createPagerButton({
      className: 'MagicRead-DiscussionPager-btn--nav',
      text: '›',
      title: String(app.translator.trans('forumaker-magicread.forum.pager.next')),
      disabled: currentPage >= totalPages,
      onClick: () => navigateToDiscussionPage(discussion, currentPage + 1),
    })
  );

  controls.appendChild(
    createPagerButton({
      className: 'MagicRead-DiscussionPager-btn--nav',
      text: '»',
      title: String(app.translator.trans('forumaker-magicread.forum.pager.last')),
      disabled: currentPage >= totalPages,
      onClick: () => navigateToDiscussionPage(discussion, totalPages),
    })
  );

  const input = document.createElement('input');
  input.className = 'FormControl';
  input.type = 'number';
  input.min = '1';
  input.max = String(totalPages);
  input.step = '1';
  input.value = String(currentPage);
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', String(app.translator.trans('forumaker-magicread.forum.pager.input_label')));

  const fitInputWidth = () => {
    const len = Math.max(input.value.length, String(totalPages).length, 1);
    input.style.width = `${Math.min(Math.max(len + 2.2, 4.6), 8)}ch`;
  };

  input.addEventListener('input', fitInputWidth);
  fitInputWidth();

  const total = document.createElement('span');
  total.className = 'MagicRead-DiscussionPager-total';
  total.textContent = `/ ${totalPages}`;

  const go = document.createElement('button');
  go.type = 'submit';
  go.className = 'Button MagicRead-DiscussionPager-btn MagicRead-DiscussionPager-btn--go';
  go.innerHTML = '<i class="fas fa-arrow-right"></i>';
  go.setAttribute('aria-label', String(app.translator.trans('forumaker-magicread.forum.pager.go')));
  go.title = String(app.translator.trans('forumaker-magicread.forum.pager.go'));

  jump.addEventListener('submit', (e) => {
    e.preventDefault();

    const wanted = parseInt(input.value, 10);
    if (!Number.isFinite(wanted)) return;

    const page = Math.min(Math.max(wanted, 1), totalPages);
    navigateToDiscussionPage(discussion, page);
    go.blur();
    input.blur();
  });

  wrap.appendChild(controls);
  jump.appendChild(input);
  jump.appendChild(total);
  jump.appendChild(go);
  wrap.appendChild(jump);

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
    isMobilePager() ? 'm' : 'd',
  ].join('|');
}

function applyDiscussionPager(): void {
  const enabled = discussionPagerEnabled();
  const onDiscussion = isDiscussionPage();

  document.body.classList.toggle('MagicRead--discussionPagerEnabled', enabled && onDiscussion);

  if (!enabled || !onDiscussion) {
    removePagerHosts();
    return;
  }

  const discussion = getDiscussionModel();
  const stream = getDiscussionStream();

  if (!discussion) {
    removePagerHosts();
    return;
  }

  const totalPages = getTotalPages(discussion);
  const currentPage = getCurrentPage(totalPages);
  const renderKey = buildRenderKey(discussion, currentPage, totalPages);

  const { top, bottom } = ensurePagerHosts();
  if (!top || !bottom) return;

  if (stream) {
    lockStreamToPage(stream, currentPage);
    enhanceLoadMoreButton(discussion, currentPage, totalPages);
  }

  if (renderKey === lastRenderKey && top.childElementCount > 0 && bottom.childElementCount > 0) {
    return;
  }

  lastRenderKey = renderKey;

  top.replaceChildren(buildPager(discussion, currentPage, totalPages));
  bottom.replaceChildren(buildPager(discussion, currentPage, totalPages));
}

export function scheduleDiscussionPagerRender(delay = 0): void {
  if (renderTimer) window.clearTimeout(renderTimer);

  renderTimer = window.setTimeout(() => {
    applyDiscussionPager();
  }, delay);
}

export function mountDiscussionPager(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!discussionPagerEnabled() || !isDiscussionPage()) return;

    const shouldReact = mutations.some((mutation) =>
      Array.from(mutation.addedNodes).some((node) => {
        if (!(node instanceof HTMLElement)) return false;
        if (node.closest?.('.MagicRead-DiscussionPagerHost')) return false;

        return (
          node.matches?.('.DiscussionPage, .DiscussionPage-stream, .DiscussionPage-nav, .PostStream, .PostStream-item, .PostStream-loadMore') ||
          !!node.querySelector?.('.DiscussionPage, .DiscussionPage-stream, .DiscussionPage-nav, .PostStream, .PostStream-item, .PostStream-loadMore')
        );
      })
    );

    if (!shouldReact) return;
    scheduleDiscussionPagerRender(30);
  });

  const root = (document.querySelector('.DiscussionPage') as HTMLElement | null) ?? document.body;
  observer.observe(root, {
    childList: true,
    subtree: true,
  });
}

export function unmountDiscussionPager(): void {
  restoreStream();

  if (renderTimer) {
    window.clearTimeout(renderTimer);
    renderTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  removePagerHosts();
}
