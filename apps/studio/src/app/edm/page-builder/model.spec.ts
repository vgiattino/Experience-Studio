/**
 * The flow map's layout, asserted rather than eyeballed.
 *
 * `autoLayout` is the one piece of this screen with a real algorithm in it, and its failure modes are
 * quiet: a cycle hangs the tab, an unreachable page stacks invisibly under another, a page that links
 * to itself stops being an entry. None of those show up as an exception, so each has a test.
 */

import { NODE_H, NODE_W, autoLayout, linksOf, type PageDef, type Widget } from './model';

const COL = NODE_W + 150;
const ROW = NODE_H + 56;
const X0 = 34;
const Y0 = 30;

/** A page whose only widgets are nav buttons — enough for `linksOf` to derive edges from. */
function page(id: string, ...targets: string[]): PageDef {
  const widgets: Widget[] = targets.map((target, index) => ({
    id: `${id}-b${index}`,
    type: 'button',
    x: 0,
    y: index * 2,
    w: 3,
    h: 2,
    props: { label: `To ${target}`, style: 'primary', action: 'navigate', target },
  }));
  return { id, name: id.toUpperCase(), icon: 'page', widgets };
}

function layout(pages: PageDef[]) {
  return autoLayout(pages, linksOf(pages));
}

describe('autoLayout', () => {
  it('puts a chain in one column per step, reading left to right', () => {
    const pages = [page('a', 'b'), page('b', 'c'), page('c')];
    const at = layout(pages);

    expect(at.get('a')).toEqual({ x: X0, y: Y0 });
    expect(at.get('b')).toEqual({ x: X0 + COL, y: Y0 });
    expect(at.get('c')).toEqual({ x: X0 + 2 * COL, y: Y0 });
  });

  it('stacks two entry pages in the first column', () => {
    const pages = [page('a', 'c'), page('b', 'c'), page('c')];
    const at = layout(pages);

    expect(at.get('a')).toEqual({ x: X0, y: Y0 });
    expect(at.get('b')).toEqual({ x: X0, y: Y0 + ROW });
    expect(at.get('c')).toEqual({ x: X0 + COL, y: Y0 });
  });

  it('puts a page behind every page that navigates to it, not beside them', () => {
    // a → b, a → c and b → c. A shortest-distance layering puts b and c in the same column and then
    // b → c has to be drawn sideways, which on screen is indistinguishable from a return link.
    const pages = [page('a', 'b', 'c'), page('b', 'c'), page('c')];
    const at = layout(pages);

    expect(at.get('a')?.x).toBe(X0);
    expect(at.get('b')?.x).toBe(X0 + COL);
    expect(at.get('c')?.x).toBe(X0 + 2 * COL);
  });

  it('leaves no forward edge inside a column, for any acyclic shape', () => {
    const shapes = [
      [page('a', 'b', 'c'), page('b', 'c'), page('c')],
      [page('a', 'b', 'c'), page('b', 'd'), page('c', 'd'), page('d')],
      [page('a', 'b'), page('b', 'c', 'd'), page('c', 'd'), page('d', 'e'), page('e')],
      [page('a', 'c'), page('b', 'c'), page('c', 'd'), page('d')],
    ];

    for (const pages of shapes) {
      const at = layout(pages);
      for (const link of linksOf(pages)) {
        expect(at.get(link.to)!.x).toBeGreaterThan(at.get(link.from)!.x);
      }
    }
  });

  it('stacks a column without overlapping it', () => {
    const pages = [page('a', 'c'), page('b', 'c'), page('c')];
    const at = layout(pages);

    expect(at.get('a')?.y).not.toBe(at.get('b')?.y);
    expect(Math.abs(at.get('a')!.y - at.get('b')!.y)).toBeGreaterThanOrEqual(NODE_H);
  });

  it('lays out a cycle that has no entry at all, rather than hanging or returning nothing', () => {
    const pages = [page('a', 'b'), page('b', 'a')];
    const at = layout(pages);

    expect(at.size).toBe(2);
    expect(at.get('a')).toEqual({ x: X0, y: Y0 });
    expect(at.get('b')).toEqual({ x: X0 + COL, y: Y0 });
  });

  it('lays an island out as its own flow rather than stacking it on the origin', () => {
    // `c` and `d` link to each other and nothing links in from `a`'s side: an island, and a cyclic one,
    // so it is reachable from no entry at all.
    const pages = [page('a', 'b'), page('b'), page('c', 'd'), page('d', 'c')];
    const at = layout(pages);

    expect(at.get('c')?.x).toBe(X0);
    expect(at.get('d')?.x).toBe(X0 + COL);
    // And it does not land on top of the flow that does have an entry.
    expect(at.get('c')?.y).not.toBe(at.get('a')?.y);
  });

  it('still treats a page that links to itself as an entry', () => {
    const pages = [page('a', 'a', 'b'), page('b')];
    const at = layout(pages);

    expect(at.get('a')).toEqual({ x: X0, y: Y0 });
    expect(at.get('b')?.x).toBe(X0 + COL);
  });

  it('places every page exactly once, whatever the shape', () => {
    const pages = [page('a', 'b', 'c'), page('b', 'a'), page('c', 'c'), page('d'), page('e', 'd')];
    const at = layout(pages);

    expect(at.size).toBe(pages.length);
    for (const one of pages) expect(at.get(one.id)).toBeTruthy();
  });

  it('returns nothing for no pages', () => {
    expect(autoLayout([], []).size).toBe(0);
  });

  it('ignores a button whose target is not a page', () => {
    const pages = [page('a', 'gone'), page('b')];
    expect(linksOf(pages)).toEqual([]);
    // Both are entries, so both sit in the first column.
    const at = layout(pages);
    expect(at.get('a')?.x).toBe(X0);
    expect(at.get('b')?.x).toBe(X0);
  });
});
