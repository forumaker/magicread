import app from 'flarum/forum/app';
import type Discussion from 'flarum/common/models/Discussion';
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

let renderTimer: number | null = null;
let observer: MutationObserver | null = null;
let lastRenderKey = '';

function isMobile(): boolean {
  return window.matchMedia('(max-width: 800px)').matches;
}

function classicPaginationEnabled(): boolean {
  const v = app.forum.attribute('magicread_enable_pagination');
  return v !== false && !app.forum.attribute('magicread_enable_discussion_pager') && !isMobile();
}

function getNavRoot(root: HTMLElement): HTMLElement | null {
  return (
    (root.querySelector('.DiscussionPage-nav') as HTMLElement | null) ||
    (root.querySelector('.PostStreamScrubber')?.closest('.DiscussionPage-nav') as HTMLElement | null) ||
    (root.querySelector('.item-scrubber')?.closest('.DiscussionPage-nav') as HTMLElement | null)
  );
}

function getScrubberElement(navRoot: HTMLElement): HTMLElement | null {
  return (navRoot.querySelector('.item-scrubber') as HTMLElement | null) || (navRoot.querySelector('.PostStreamScrubber') as HTMLElement | null);
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

function buildClassicPager(discussion: Discussion, currentPage: number, totalPages: number): HTMLElement {
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

function buildRenderKey(discussion: Discussion, currentPage: number, totalPages: number): string {
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

export function scheduleClassicPaginationRender(delay = 0, force = false): void {
  if (renderTimer) window.clearTimeout(renderTimer);

  renderTimer = window.setTimeout(() => {
    applyClassicPagination(force);
  }, delay);
}

export function mountClassicPagination(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!classicPaginationEnabled() || !isDiscussionPage()) return;

    // A Mithril redraw can take our host away together with the scrubber around it: put it back (this replaces the
    // timer that used to look for it every 400 ms).
    const hostRemoved = mutations.some((mutation) =>
      Array.from(mutation.removedNodes).some(
        (node) =>
          node instanceof HTMLElement && (node.matches('.MagicRead-TimelinePagerHost') || !!node.querySelector('.MagicRead-TimelinePagerHost'))
      )
    );

    const shouldReact =
      hostRemoved ||
      mutations.some((mutation) =>
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

  const root = (document.querySelector('.DiscussionPage') as HTMLElement | null) ?? document.body;
  observer.observe(root, {
    childList: true,
    subtree: true,
  });
}

export function unmountClassicPagination(): void {
  if (renderTimer) {
    window.clearTimeout(renderTimer);
    renderTimer = null;
  }

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  removeClassicPagerHost();
}
