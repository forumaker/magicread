import app from 'flarum/forum/app';
import type Discussion from 'flarum/common/models/Discussion';
import type PostStreamState from 'flarum/forum/states/PostStreamState';
import { holdStream, releaseStream } from './streamGuard';
import {
  getPerPage,
  isDiscussionPage,
  getDiscussionModel,
  getDiscussionId,
  getDiscussionSlug,
  getCurrentPage,
  getTotalPages,
  getNearFromUrl,
  navigateToDiscussionPage,
} from './paginationUtils';

declare const m: any;

let renderTimer: number | null = null;
let observer: MutationObserver | null = null;
let lastRenderKey = '';
let lastAppliedPageKey = '';

let heldStream: PostStreamState | null = null;
let pagerActive = false;

function discussionPagerEnabled(): boolean {
  return !!app.forum.attribute('magicread_enable_discussion_pager');
}

function isMobilePager(): boolean {
  return window.matchMedia('(max-width: 600px)').matches;
}

function getDiscussionStream(): PostStreamState | null {
  return (app.current?.get('stream') as PostStreamState | undefined) ?? null;
}

function getPageBounds(page: number): { start: number; end: number; near: number } {
  const perPage = getPerPage();
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * perPage;
  const end = start + perPage;
  const near = start + 1;

  return { start, end, near };
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

/** Holds the stream on the current page: core's own «load next / previous» (scroll, button) stays quiet (see streamGuard). */
function ensureStreamHeld(stream: PostStreamState): void {
  if (heldStream === stream) return;

  releaseHeldStream();

  heldStream = stream;
  holdStream(stream);
}

function releaseHeldStream(): void {
  if (!heldStream) return;

  releaseStream(heldStream);
  heldStream = null;
}

function lockStreamToPage(stream: PostStreamState, page: number): Promise<void> {
  const { start, end, near } = getPageBounds(page);
  const pageKey = `${getDiscussionId(stream.discussion)}|${page}|${start}|${end}`;

  ensureStreamHeld(stream);

  if (pageKey === lastAppliedPageKey) {
    return Promise.resolve();
  }

  lastAppliedPageKey = pageKey;

  stream.reset(start, end);

  return stream.loadRange(start, end).then((posts) => {
    stream.show(posts);
    stream.visibleStart = start;
    stream.visibleEnd = Math.min(end, stream.count());
    stream.index = start;
    stream.number = near;
    stream.targetPost = null;
    stream.needsScroll = false;
    stream.animateScroll = false;

    m.redraw();

    requestAnimationFrame(scrollPageTop);
  });
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

  const stream = (root.querySelector('.DiscussionPage-stream') as HTMLElement | null) || (root.querySelector('.PostStream') as HTMLElement | null);

  if (!stream) return { top: null, bottom: null };

  let top = root.querySelector('.MagicRead-DiscussionPagerHost--top') as HTMLElement | null;
  let bottom = root.querySelector('.MagicRead-DiscussionPagerHost--bottom') as HTMLElement | null;

  if (!top) {
    top = createPagerHost('top');
    stream.parentNode?.insertBefore(top, stream);
  }

  if (!bottom) {
    bottom = createPagerHost('bottom');
    if (stream.nextSibling) {
      stream.parentNode?.insertBefore(bottom, stream.nextSibling);
    } else {
      stream.parentNode?.appendChild(bottom);
    }
  }

  return { top, bottom };
}

function removePagerHosts(): void {
  releaseHeldStream();
  pagerActive = false;
  document.querySelectorAll('.MagicRead-DiscussionPagerHost').forEach((el) => el.remove());
  lastRenderKey = '';
  lastAppliedPageKey = '';
}

/**
 * The «Показать ещё» of core's post stream goes to the next page of the pager instead of loading more posts below. One
 * listener on the document, in the capture phase, answers every click on it (core binds its own handler to the button
 * on each render, so nothing is attached to the button itself).
 */
function onLoadMoreClick(event: MouseEvent): void {
  if (!pagerActive) return;

  const button = (event.target as Element | null)?.closest('.PostStream-loadMore .Button, .PostStream-loadMore button') as HTMLButtonElement | null;
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const discussion = getDiscussionModel();
  if (!discussion) return;

  const totalPages = getTotalPages(discussion);
  const currentPage = getCurrentPage(totalPages);
  if (currentPage < totalPages) navigateToDiscussionPage(discussion, currentPage + 1);

  button.blur();
}

function enhanceLoadMoreButton(currentPage: number, totalPages: number): void {
  document.querySelectorAll<HTMLElement>('.PostStream-loadMore').forEach((wrapper) => {
    wrapper.classList.add('MagicRead-LoadMoreWrap');

    const button = wrapper.querySelector<HTMLButtonElement>('.Button, button');
    if (!button) return;

    button.classList.add('MagicRead-LoadMoreButton');
    button.disabled = currentPage >= totalPages;
  });
}

function buildPager(discussion: Discussion, currentPage: number, totalPages: number): HTMLElement {
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

function buildRenderKey(discussion: Discussion, currentPage: number, totalPages: number): string {
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

  pagerActive = enabled && onDiscussion;
  document.body.classList.toggle('MagicRead--discussionPagerEnabled', pagerActive);

  if (!enabled || !onDiscussion) {
    removePagerHosts();
    return;
  }

  const discussion = getDiscussionModel();
  const stream = getDiscussionStream();

  if (!discussion || !stream) {
    removePagerHosts();
    return;
  }

  const totalPages = getTotalPages(discussion);
  const currentPage = getCurrentPage(totalPages);
  const renderKey = buildRenderKey(discussion, currentPage, totalPages);

  const { top, bottom } = ensurePagerHosts();
  if (!top || !bottom) return;

  lockStreamToPage(stream, currentPage).then(() => {
    enhanceLoadMoreButton(currentPage, totalPages);
  });

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

  document.addEventListener('click', onLoadMoreClick, true);

  observer = new MutationObserver((mutations) => {
    if (!discussionPagerEnabled() || !isDiscussionPage()) return;

    // Mithril redraws can take our hosts away together with the stream around them: put them back.
    const hostRemoved = mutations.some((mutation) =>
      Array.from(mutation.removedNodes).some(
        (node) =>
          node instanceof HTMLElement && (node.matches('.MagicRead-DiscussionPagerHost') || !!node.querySelector('.MagicRead-DiscussionPagerHost'))
      )
    );

    const shouldReact =
      hostRemoved ||
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.closest?.('.MagicRead-DiscussionPagerHost')) return false;

          return (
            node.matches?.('.DiscussionPage, .DiscussionPage-stream, .DiscussionPage-nav, .PostStream, .PostStream-item, .PostStream-loadMore') ||
            !!node.querySelector?.(
              '.DiscussionPage, .DiscussionPage-stream, .DiscussionPage-nav, .PostStream, .PostStream-item, .PostStream-loadMore'
            )
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
  releaseHeldStream();
  document.removeEventListener('click', onLoadMoreClick, true);
  pagerActive = false;

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
