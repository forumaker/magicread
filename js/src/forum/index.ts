import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import UserPage from 'flarum/forum/components/UserPage';
import { extend } from 'flarum/common/extend';

import { bindCounter, destroyCounter, type MagicReadEditor } from './components/counter';
import { applyReadMoreToPost, refreshReadMore, stopReadMore } from './components/readMore';
import { mountDiscussionPager, scheduleDiscussionPagerRender, unmountDiscussionPager } from './components/discussionPager';
import { mountClassicPagination, scheduleClassicPaginationRender, unmountClassicPagination } from './components/classicPagination';
import { installStreamGuard } from './components/streamGuard';

/** A failure in one of the extension's hooks is logged and must not break the page it hooks into. */
function guarded(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    console.error('[MagicRead]', e);
  }
}

app.initializers.add('forumaker-magicread', () => {
  installStreamGuard();

  extend(TextEditor.prototype, ['oncreate', 'onupdate'], function (this: TextEditor) {
    guarded(() => bindCounter(this as MagicReadEditor));
  });

  extend(TextEditor.prototype, 'onremove', function (this: TextEditor) {
    guarded(() => destroyCounter(this as MagicReadEditor));
  });

  extend(CommentPost.prototype, ['oncreate', 'onupdate'], function (_: unknown, vnode: { dom: Element }) {
    guarded(() => applyReadMoreToPost(vnode.dom as HTMLElement));
  });

  // The pagers are built next to Flarum's own post stream and scrubber. They are rendered when the discussion page is
  // created and again after each of its redraws; the observers they mount put them back if a redraw takes them away.
  extend(DiscussionPage.prototype, 'oncreate', function () {
    guarded(() => {
      mountDiscussionPager();
      mountClassicPagination();

      scheduleDiscussionPagerRender(0);
      scheduleClassicPaginationRender(0);
    });
  });

  extend(DiscussionPage.prototype, 'onupdate', function () {
    guarded(() => {
      scheduleDiscussionPagerRender(30);
      scheduleClassicPaginationRender(30);
    });
  });

  extend(DiscussionPage.prototype, 'onremove', function () {
    guarded(() => {
      unmountDiscussionPager();
      unmountClassicPagination();
    });
  });

  // «Read more» on the user pages: measured again whenever the user page is created or redrawn (the tab changed).
  extend(UserPage.prototype, ['oncreate', 'onupdate'], function () {
    guarded(refreshReadMore);
  });

  extend(UserPage.prototype, 'onremove', function () {
    guarded(stopReadMore);
  });

  window.addEventListener(
    'resize',
    () => {
      guarded(() => {
        refreshReadMore();
        scheduleDiscussionPagerRender(100);
        scheduleClassicPaginationRender(100);
      });
    },
    { passive: true }
  );
});
