
interface PagerAttrs {
  total?: number;
  perPage?: number;
  page?: number;
  onPage?: (n: number) => void;
}

const windowSize = 5;

const Pager: m.Component<PagerAttrs> = {
  view({ attrs }) {
    const total = attrs.total ?? 0;
    const per = Math.max(1, attrs.perPage ?? 20);
    const pages = Math.max(1, Math.ceil(total / per));
    const current = Math.min(pages, Math.max(1, attrs.page ?? 1));
    const set = (n: number) => attrs.onPage?.(Math.min(pages, Math.max(1, n)));

    if (pages <= 1) return null;

    const items: m.Children[] = [];

    const addBtn = (label: string, target: number, disabled: boolean, key: string) =>
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

    const start = Math.max(1, current - Math.floor(windowSize / 2));
    const end = Math.min(pages, start + windowSize - 1);

    for (let page = start; page <= end; page++) {
      items.push(
        m(
          'button',
          {
            key: 'p' + page,
            className: 'Button Button--rounded' + (page === current ? ' is-active' : ''),
            onclick: () => set(page),
          },
          String(page)
        )
      );
    }

    items.push(addBtn('›', current + 1, current === pages, 'next'));
    items.push(addBtn('»', pages, current === pages, 'last'));

    return m('div.MagicRead-Pager', items);
  },
};

export default Pager;