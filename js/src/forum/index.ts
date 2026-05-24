import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';
import CommentPost from 'flarum/forum/components/CommentPost';
import DiscussionPage from 'flarum/forum/components/DiscussionPage';
import { extend } from 'flarum/common/extend';

import { bindCounter, destroyCounter } from './components/counter';
import { applyReadMoreToPost, handleReadMoreRouteChange, startReadMoreUrlWatch, stopReadMoreUrlWatch } from './components/readMore';
import { mountDiscussionPager, scheduleDiscussionPagerRender, unmountDiscussionPager } from './components/discussionPager';
import { mountClassicPagination, scheduleClassicPaginationRender, unmountClassicPagination } from './components/classicPagination';

app.initializers.add('forumaker-magicread', () => {
  extend(TextEditor.prototype, 'oncreate', function () {
    try {
      bindCounter(this as any);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(TextEditor.prototype, 'onupdate', function () {
    try {
      bindCounter(this as any);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(TextEditor.prototype, 'onremove', function () {
    try {
      destroyCounter(this as any);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(CommentPost.prototype, 'oncreate', function (vnode: any) {
    try {
      applyReadMoreToPost(vnode.dom as HTMLElement);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(CommentPost.prototype, 'onupdate', function (vnode: any) {
    try {
      applyReadMoreToPost(vnode.dom as HTMLElement);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
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
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(DiscussionPage.prototype, 'onupdate', function () {
    try {
      scheduleDiscussionPagerRender(30);
      scheduleClassicPaginationRender(30);
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  extend(DiscussionPage.prototype, 'onremove', function () {
    try {
      unmountDiscussionPager();
      unmountClassicPagination();
    } catch (e) {
      console.error('[MagicRead]', e);
    }
  });

  startReadMoreUrlWatch();
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
  } catch (e) {
    console.error('[MagicRead]', e);
  }

  window.addEventListener('beforeunload', () => {
    stopReadMoreUrlWatch();
    unmountDiscussionPager();
    unmountClassicPagination();
  });
});
