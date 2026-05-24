import app from 'flarum/forum/app';
import TextEditor from 'flarum/common/components/TextEditor';

interface MagicReadEditor extends TextEditor {
  magicReadCounterEl?: HTMLElement | null;
  magicReadUpdate?: () => void;
  magicReadTa?: HTMLTextAreaElement | null;
  attrs: {
    composer?: {
      editor?: {
        el?: HTMLTextAreaElement;
      };
    };
  };
}

function counterEnabled(): boolean {
  return app.forum.attribute('magicread_enable_counter') !== false;
}

function getTextarea(ctx: MagicReadEditor): HTMLTextAreaElement | null {
  const legacy = (ctx as any)?.attrs?.composer?.editor?.el as HTMLTextAreaElement | undefined;
  if (legacy && document.body.contains(legacy)) return legacy;

  const composer = document.querySelector('.Composer:not(.minimized)') as HTMLElement | null;
  return (composer?.querySelector('.TextEditor textarea') as HTMLTextAreaElement) || null;
}

function createCounterLi(): { li: HTMLLIElement; span: HTMLSpanElement } {
  const li = document.createElement('li');
  li.className = 'item-magicread-counter';

  const span = document.createElement('span');
  span.className = 'MagicRead-CharCounter';
  span.textContent = '0';
  span.setAttribute('aria-live', 'polite');

  li.appendChild(span);
  return { li, span };
}

function mountCounterLeft(ctx: MagicReadEditor): HTMLSpanElement | null {
  const ta = getTextarea(ctx);
  if (!ta) return null;

  const composer = ta.closest('.Composer');
  if (!composer) return null;

  const controls = composer.querySelector('.Composer-controls');
  if (!controls) return null;

  let li = controls.querySelector('li.item-magicread-counter') as HTMLLIElement | null;
  let span: HTMLSpanElement | null = null;

  if (li) {
    span = li.querySelector('.MagicRead-CharCounter');
  } else {
    const nodes = createCounterLi();
    li = nodes.li;
    span = nodes.span;
    controls.insertAdjacentElement('afterbegin', li);
  }

  return span;
}

export function bindCounter(ctx: MagicReadEditor): void {
  if (!counterEnabled()) return;

  const ta = getTextarea(ctx);
  if (!ta) return;

  const counter = mountCounterLeft(ctx);
  if (!counter) return;

  if (ctx.magicReadTa === ta && typeof ctx.magicReadUpdate === 'function') {
    ctx.magicReadUpdate();
    return;
  }

  if (ctx.magicReadTa && ctx.magicReadUpdate) {
    ctx.magicReadTa.removeEventListener('input', ctx.magicReadUpdate);
  }

  const update = () => {
    counter.textContent = String(ta.value.length);
  };

  ta.addEventListener('input', update);
  update();

  ctx.magicReadTa = ta;
  ctx.magicReadCounterEl = counter;
  ctx.magicReadUpdate = update;
}

export function destroyCounter(ctx: MagicReadEditor): void {
  if (ctx.magicReadTa && ctx.magicReadUpdate) {
    ctx.magicReadTa.removeEventListener('input', ctx.magicReadUpdate);
  }
}