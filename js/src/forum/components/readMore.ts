import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';

/** Posts taller than this (plus a margin) are collapsed under «Читать далее». The same height is in forum.less. */
const READMORE_MAX_HEIGHT = 240;

let readMoreObserver: MutationObserver | null = null;

function readMoreEnabled(): boolean {
  return app.forum.attribute('magicread_enable_readmore') !== false;
}

function isUserPage(): boolean {
  return !!app.current?.matches(UserPage);
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

  const existing = body.parentElement?.querySelector(`.MagicRead-ReadMoreBtn[data-for="${body.dataset.magicreadId}"]`);

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

  document.querySelectorAll<HTMLElement>('.UserPage .CommentPost .Post-body').forEach(collapseBodyIfNeeded);
}

function resetReadMoreProcessed(): void {
  document.querySelectorAll<HTMLElement>('.UserPage .CommentPost .Post-body').forEach((b) => {
    if (b.dataset.magicreadExpanded === '1') return;

    b.dataset.magicreadProcessed = '0';
    b.classList.remove('MagicRead-ReadMoreBody', 'MagicRead-ReadMoreBody--collapsed');

    b.parentElement?.querySelector(`.MagicRead-ReadMoreBtn[data-for="${b.dataset.magicreadId || ''}"]`)?.remove();
  });
}

function bindReadMoreObserver(): void {
  if (readMoreObserver) return;

  readMoreObserver = new MutationObserver(applyReadMoreOnce);

  const root = document.querySelector('.UserPage') ?? document.body;
  readMoreObserver.observe(root, { childList: true, subtree: true });
}

function unbindReadMoreObserver(): void {
  readMoreObserver?.disconnect();
  readMoreObserver = null;
}

export function applyReadMoreToPost(root: HTMLElement): void {
  if (!readMoreEnabled() || !isUserPage()) return;

  const body = root.querySelector<HTMLElement>('.Post-body');
  if (!body || body.dataset.magicreadExpanded === '1') return;

  body.dataset.magicreadProcessed = '0';
  collapseBodyIfNeeded(body);
}

/**
 * Re-measures the posts of a user page: on opening it, after the page redraws (the user tab changes) and when the window
 * is resized. Called from the UserPage hooks in index.ts, so no timer has to watch the address.
 */
export function refreshReadMore(): void {
  if (!readMoreEnabled() || !isUserPage()) {
    unbindReadMoreObserver();
    return;
  }

  bindReadMoreObserver();
  resetReadMoreProcessed();
  applyReadMoreOnce();
}

export function stopReadMore(): void {
  unbindReadMoreObserver();
}
