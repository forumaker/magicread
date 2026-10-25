import app from 'flarum/forum/app';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import type Discussion from 'flarum/common/models/Discussion';

declare const m: any;

export function getPerPage(): number {
  return Number(app.forum.attribute('perPage')) || 20;
}

export function isDiscussionPage(): boolean {
  return !!app.current?.matches(DiscussionPage);
}

export function getDiscussionModel(): Discussion | null {
  return (app.current?.get('discussion') as Discussion | undefined) ?? null;
}

export function getDiscussionId(discussion: Discussion): string {
  return String(discussion.id() ?? '');
}

export function getDiscussionSlug(discussion: Discussion): string {
  return String(discussion.slug() ?? '');
}

export function getLastPostNumber(discussion: Discussion): number {
  const byLast = Number(discussion.lastPostNumber() ?? 0);
  const byCount = Number(discussion.commentCount() ?? 0) + 1;
  const total = Math.max(byLast, byCount, 1);

  return Number.isFinite(total) ? total : 1;
}

/** The `near` of the current route (/d/1-slug/21 is 21); 1 on the first page and for «reply». */
export function getNearFromUrl(): number {
  const near = parseInt(m.route.param('near'), 10);

  return Number.isFinite(near) && near > 0 ? near : 1;
}

export function getTotalPages(discussion: Discussion): number {
  return Math.max(1, Math.ceil(getLastPostNumber(discussion) / getPerPage()));
}

export function getCurrentPage(totalPages: number): number {
  const page = Math.ceil(getNearFromUrl() / getPerPage());

  return Math.min(Math.max(page, 1), totalPages);
}

/** The route of a page of the discussion, built by Flarum's own URL generator (so a subdirectory install works too). */
export function makeDiscussionPath(discussion: Discussion, page: number): string {
  const safePage = Math.max(1, page);

  return safePage <= 1 ? app.route.discussion(discussion) : app.route.discussion(discussion, (safePage - 1) * getPerPage() + 1);
}

export function navigateToDiscussionPage(discussion: Discussion, page: number): void {
  m.route.set(makeDiscussionPath(discussion, page));
}
