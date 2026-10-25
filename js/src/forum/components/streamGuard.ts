import { override } from 'flarum/common/extend';
import PostStreamState from 'flarum/forum/states/PostStreamState';

/** Streams whose loading is held by the page pager: scrolling and «load more» must not pull in the next posts. */
const held = new WeakSet<PostStreamState>();

/**
 * Makes PostStreamState's `_loadNext` / `_loadPrevious` do nothing for a held stream. Core builds `loadNext` and
 * `loadPrevious` of every stream from these two prototype methods when the stream is created, so this has to run
 * before the first discussion opens (the forum initializer does it).
 */
export function installStreamGuard(): void {
  override(PostStreamState.prototype as any, '_loadNext', function (this: PostStreamState, original: () => void) {
    if (held.has(this)) return;

    return original();
  });

  override(PostStreamState.prototype as any, '_loadPrevious', function (this: PostStreamState, original: () => void) {
    if (held.has(this)) return;

    return original();
  });
}

export function holdStream(stream: PostStreamState): void {
  held.add(stream);
  stream.paused = true;
}

export function releaseStream(stream: PostStreamState): void {
  held.delete(stream);
  stream.paused = false;
}
