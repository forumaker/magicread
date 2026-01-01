export default function Pager(vnode) {
  const attrs = vnode.attrs;

  const total = () => attrs.total || 0;
  const per = () => Math.max(1, attrs.perPage || 20);
  const pages = () => Math.max(1, Math.ceil(total() / per()));
  const get = () => Math.min(pages(), Math.max(1, attrs.page || 1));
  const set = (n) => attrs.onPage && attrs.onPage(Math.min(pages(), Math.max(1, n)));

  const windowSize = 5;

  return {
    view() {
      if (pages() <= 1) return null;

      const current = get();
      const start = Math.max(1, current - Math.floor(windowSize / 2));
      const end = Math.min(pages(), start + windowSize - 1);
      const items = [];

      const addBtn = (label, target, key, disabled = false) =>
        m(
          'button',
          {
            key,
            className: 'Button Button--rounded' + (disabled ? ' disabled' : ''),
            disabled,
            onclick: () => !disabled && set(target),
          },
          label
        );

      items.push(addBtn('«', 1, current === 1, 'first'));
      items.push(addBtn('‹', current - 1, current === 1, 'prev'));

      for (let i = start; i <= end; i++) {
        const page = i;
        items.push(
          m(
            'button',
            {
              key: 'p' + page,
              className:
                'Button Button--rounded' + (page === current ? ' is-active' : ''),
              onclick: () => set(page),
            },
            String(page)
          )
        );
      }

      items.push(addBtn('›', current + 1, current === pages(), 'next'));
      items.push(addBtn('»', pages(), current === pages(), 'last'));

      return m('div.MagicRead-Pager', items);
    },
  };
}