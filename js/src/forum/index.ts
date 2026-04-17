import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import { extend } from 'flarum/common/extend';

import { bindCounter, destroyCounter } from './counter';
import { applyReadMoreToPost, handleReadMoreRouteChange } from './readMore';
import { mountDiscussionPager, scheduleDiscussionPagerRender } from './discussionPager';
import { mountClassicPagination, scheduleClassicPaginationRender } from './classicPagination';

export { default as extend } from './extend';

app.initializers.add('forumaker-magicread', () => {
  extend(TextEditor.prototype, 'oncreate', function () {
    try {
      bindCounter(this as any);
    } catch {}
  });

  extend(TextEditor.prototype, 'onupdate', function () {
    try {
      bindCounter(this as any);
    } catch {}
  });

  extend(TextEditor.prototype, 'onremove', function () {
    try {
      destroyCounter(this as any);
    } catch {}
  });

  extend(CommentPost.prototype, 'oncreate', function (vnode: any) {
    try {
      applyReadMoreToPost(vnode.dom as HTMLElement);
    } catch {}
  });

  extend(CommentPost.prototype, 'onupdate', function (vnode: any) {
    try {
      applyReadMoreToPost(vnode.dom as HTMLElement);
    } catch {}
  });

  extend(DiscussionPage.prototype, 'oncreate', function () {
    try {
      mountDiscussionPager();
      mountClassicPagination();

      scheduleDiscussionPagerRender(0);
      scheduleClassicPaginationRender(0);

      setTimeout(() => {
        scheduleDiscussionPagerRender(120);
        scheduleClassicPaginationRender(120);
      }, 120);

      setTimeout(() => {
        scheduleDiscussionPagerRender(260);
        scheduleClassicPaginationRender(260);
      }, 260);
    } catch {}
  });

  extend(DiscussionPage.prototype, 'onupdate', function () {
    try {
      scheduleDiscussionPagerRender(30);
      scheduleClassicPaginationRender(30);
    } catch {}
  });

  handleReadMoreRouteChange();

  window.addEventListener('popstate', handleReadMoreRouteChange as any, { passive: true });
  window.addEventListener('hashchange', handleReadMoreRouteChange as any, { passive: true });
  window.addEventListener(
    'resize',
    () => {
      handleReadMoreRouteChange();
      scheduleDiscussionPagerRender(100);
      scheduleClassicPaginationRender(100);
    },
    { passive: true }
  );

  try {
    const h = (app as any).history;
    if (h?.on) {
      h.on('change', () => {
        handleReadMoreRouteChange();
        scheduleDiscussionPagerRender(30);
        scheduleClassicPaginationRender(30);

        setTimeout(() => {
          scheduleDiscussionPagerRender(160);
          scheduleClassicPaginationRender(160);
        }, 160);
      });
    }
  } catch {}
});