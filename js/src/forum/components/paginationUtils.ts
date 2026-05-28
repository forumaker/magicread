import app from 'flarum/forum/app';

declare const m: any;

export function getPerPage(): number {
  return Number(app.forum.attribute('perPage')) || 20;
}

export function isDiscussionPage(): boolean {
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  return path.startsWith('/d/') || !!document.querySelector('.DiscussionPage');
}

export function getDiscussionModel(): any | null {
  try {
    return (app.current as any)?.get?.('discussion') || null;
  } catch {
    return null;
  }
}

export function getDiscussionId(discussion: any): string {
  try {
    if (typeof discussion?.id === 'function') return String(discussion.id());
    if (discussion?.data?.id) return String(discussion.data.id);
    if (discussion?.id) return String(discussion.id);
  } catch {}

  return '';
}

export function getDiscussionSlug(discussion: any): string {
  try {
    if (typeof discussion?.slug === 'function') return String(discussion.slug());
    if (typeof discussion?.attribute === 'function') return String(discussion.attribute('slug') || '');
    if (discussion?.data?.attributes?.slug) return String(discussion.data.attributes.slug);
    if (discussion?.slug) return String(discussion.slug);
  } catch {}

  return '';
}

export function getLastPostNumber(discussion: any): number {
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

export function getNearFromUrl(): number {
  const path = (typeof location !== 'undefined' && location.pathname) || '';
  const match = path.match(/\/d\/[^/]+(?:\/(\d+))?/);
  const near = match?.[1] ? parseInt(match[1], 10) : 1;
  return Number.isFinite(near) && near > 0 ? near : 1;
}

export function getTotalPages(discussion: any): number {
  return Math.max(1, Math.ceil(getLastPostNumber(discussion) / getPerPage()));
}

export function getCurrentPage(totalPages: number): number {
  const perPage = getPerPage();
  const near = getNearFromUrl();
  const page = Math.ceil(near / perPage);
  return Math.min(Math.max(page, 1), totalPages);
}

export function makeDiscussionPath(discussion: any, page: number): string {
  const id = getDiscussionId(discussion);
  const slug = getDiscussionSlug(discussion);
  const safePage = Math.max(1, page);
  const near = (safePage - 1) * getPerPage() + 1;

  if (!id || !slug) return location.pathname;

  return safePage <= 1 ? `/d/${id}-${slug}` : `/d/${id}-${slug}/${near}`;
}

export function navigateToDiscussionPage(discussion: any, page: number): void {
  const path = makeDiscussionPath(discussion, page);

  try {
    if (typeof m !== 'undefined' && typeof m.route?.set === 'function') {
      m.route.set(path);
      return;
    }
  } catch {}

  window.location.assign(path);
}

export function currentUrlKey(): string {
  const p = (typeof location !== 'undefined' && location.pathname) || '';
  const s = (typeof location !== 'undefined' && location.search) || '';
  const h = (typeof location !== 'undefined' && location.hash) || '';
  return p + s + h;
}
