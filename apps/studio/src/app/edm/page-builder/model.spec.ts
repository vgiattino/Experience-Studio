/**
 * The flow map's layout, asserted rather than eyeballed.
 *
 * `autoLayout` is the one piece of this screen with a real algorithm in it, and its failure modes are
 * quiet: a cycle hangs the tab, an unreachable page stacks invisibly under another, a page that links
 * to itself stops being an entry. None of those show up as an exception, so each has a test.
 */

import {
  NODE_H,
  NODE_W,
  autoLayout,
  labelOf,
  linksOf,
  paintOrder,
  structureOf,
  type PageDef,
  type Widget,
} from './model';

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

/**
 * The page structure, asserted rather than eyeballed.
 *
 * Nesting is *derived* from the rectangles here, so the rule has to be exact: full enclosure, ties
 * broken by which widget was added first, and no widget ever its own ancestor. Each of those is a way
 * the panel could silently show the wrong tree.
 */
describe('structureOf', () => {
  const widget = (
    id: string,
    type: Widget['type'],
    x: number,
    y: number,
    w: number,
    h: number,
    props: Record<string, unknown> = {},
  ): Widget => ({ id, type, x, y, w, h, props });

  const shape = (rows: readonly { widget: Widget; depth: number; parentId: string | null }[]) =>
    rows.map((row) => `${'  '.repeat(row.depth)}${row.widget.id}`).join('\n');

  it('nests a widget that sits fully inside a section', () => {
    const rows = structureOf([
      widget('sec', 'section', 0, 2, 12, 6),
      widget('kpi', 'kpi', 1, 3, 4, 3),
    ]);

    expect(shape(rows)).toBe('sec\n  kpi');
    expect(rows[1]!.parentId).toBe('sec');
  });

  it('leaves a widget that only overlaps a section at the top level', () => {
    // One row lower and it would hang over the section's bottom edge — an ambiguous case, and the rule
    // says top level rather than guessing.
    const rows = structureOf([
      widget('sec', 'section', 0, 2, 12, 4),
      widget('over', 'kpi', 1, 5, 4, 3),
    ]);

    expect(shape(rows)).toBe('sec\nover');
    expect(rows[1]!.parentId).toBeNull();
  });

  it('nests into the innermost section, not the outermost', () => {
    const rows = structureOf([
      widget('outer', 'section', 0, 0, 12, 10),
      widget('inner', 'section', 1, 1, 6, 5),
      widget('kpi', 'kpi', 2, 2, 3, 2),
    ]);

    expect(shape(rows)).toBe('outer\n  inner\n    kpi');
  });

  it('orders siblings by row then column, not by the order they were added', () => {
    const rows = structureOf([
      widget('c', 'kpi', 8, 4, 4, 3),
      widget('a', 'kpi', 0, 1, 4, 3),
      widget('b', 'kpi', 4, 1, 4, 3),
    ]);

    expect(rows.map((row) => row.widget.id)).toEqual(['a', 'b', 'c']);
  });

  it('never makes a widget its own ancestor when two sections have identical bounds', () => {
    const rows = structureOf([
      widget('first', 'section', 0, 0, 12, 5),
      widget('second', 'section', 0, 0, 12, 5),
    ]);

    // The earlier one wins the tie, so the later nests inside it — and nothing loops.
    expect(shape(rows)).toBe('first\n  second');
    expect(rows.length).toBe(2);
  });

  it('marks the widgets whose overlap makes paint order matter', () => {
    const rows = structureOf([
      widget('under', 'kpi', 0, 1, 6, 3),
      widget('over', 'kpi', 3, 1, 6, 3),
      widget('clear', 'kpi', 0, 6, 4, 3),
    ]);

    const stacked = rows.filter((row) => row.stacked).map((row) => row.widget.id).sort();
    expect(stacked).toEqual(['over', 'under']);
    // And paint order is reported as the array index, which is what restacking moves.
    expect(rows.find((row) => row.widget.id === 'over')!.index).toBe(1);
  });

  it('does not call a widget stacked because it sits inside a section', () => {
    const rows = structureOf([
      widget('sec', 'section', 0, 0, 12, 6),
      widget('kpi', 'kpi', 1, 1, 4, 3),
    ]);

    expect(rows.every((row) => !row.stacked)).toBe(true);
  });

  it('lists every widget exactly once, whatever the geometry', () => {
    const widgets = [
      widget('sec', 'section', 0, 0, 12, 8),
      widget('nested', 'section', 1, 1, 6, 4),
      widget('deep', 'kpi', 2, 2, 3, 2),
      widget('outside', 'kpi', 0, 9, 4, 3),
      widget('straddling', 'kpi', 10, 7, 4, 3),
    ];

    const rows = structureOf(widgets);
    expect(rows.length).toBe(widgets.length);
    expect(new Set(rows.map((row) => row.widget.id)).size).toBe(widgets.length);
  });

  it('returns nothing for an empty page', () => {
    expect(structureOf([])).toEqual([]);
  });
});

describe('labelOf', () => {
  it('prefers the widget’s own words to its kind', () => {
    expect(labelOf({ id: 'w', type: 'kpi', x: 0, y: 0, w: 4, h: 3, props: { label: 'Coverage' } })).toBe(
      'Coverage',
    );
    expect(
      labelOf({ id: 'w', type: 'chart', x: 0, y: 0, w: 6, h: 6, props: { title: 'By asset type' } }),
    ).toBe('By asset type');
  });

  it('falls back to the kind when there is nothing to read, blank included', () => {
    expect(labelOf({ id: 'w', type: 'kpi', x: 0, y: 0, w: 4, h: 3, props: { label: '   ' } })).toBe(
      'Metric / KPI',
    );
    expect(labelOf({ id: 'w', type: 'divider', x: 0, y: 0, w: 12, h: 1, props: {} })).toBe('Divider');
  });

  it('names a chart by its kind, since six palette entries are one type', () => {
    expect(
      labelOf({ id: 'w', type: 'chart', x: 0, y: 0, w: 5, h: 6, props: { kind: 'donut' } }),
    ).toBe('donut chart');
  });
});

describe('paintOrder', () => {
  const w = (id: string, type: Widget['type'], x: number, y: number, ww: number, h: number): Widget => ({
    id,
    type,
    x,
    y,
    w: ww,
    h,
    props: {},
  });

  it('puts a section before the widgets it holds, however late it was added', () => {
    // The array order that broke it: the KPI exists, then a section is drawn around it, so the section
    // painted last and covered it.
    const order = paintOrder([w('kpi', 'kpi', 1, 1, 4, 3), w('sec', 'section', 0, 0, 12, 8)]);
    expect(order.map((one) => one.id)).toEqual(['sec', 'kpi']);
  });

  it('keeps array order between siblings, because that is what restacking moves', () => {
    const order = paintOrder([
      w('under', 'kpi', 0, 0, 6, 3),
      w('over', 'kpi', 3, 0, 6, 3),
    ]);
    expect(order.map((one) => one.id)).toEqual(['under', 'over']);
    // And the reverse array gives the reverse paint order — nothing else decides it.
    const flipped = paintOrder([w('over', 'kpi', 3, 0, 6, 3), w('under', 'kpi', 0, 0, 6, 3)]);
    expect(flipped.map((one) => one.id)).toEqual(['over', 'under']);
  });

  it('does not reorder siblings into reading order — that is the panel’s job, not the canvas’s', () => {
    const order = paintOrder([w('lower', 'kpi', 0, 6, 4, 3), w('upper', 'kpi', 0, 1, 4, 3)]);
    expect(order.map((one) => one.id)).toEqual(['lower', 'upper']);
  });

  it('nests to any depth, ancestors first', () => {
    const order = paintOrder([
      w('kpi', 'kpi', 2, 2, 3, 2),
      w('inner', 'section', 1, 1, 6, 5),
      w('outer', 'section', 0, 0, 12, 10),
    ]);
    expect(order.map((one) => one.id)).toEqual(['outer', 'inner', 'kpi']);
  });

  it('paints every widget exactly once', () => {
    const widgets = [
      w('a', 'kpi', 0, 0, 4, 3),
      w('sec', 'section', 0, 0, 12, 8),
      w('b', 'kpi', 5, 1, 4, 3),
      w('c', 'kpi', 0, 9, 4, 3),
    ];
    const order = paintOrder(widgets);
    expect(order.length).toBe(widgets.length);
    expect(new Set(order.map((one) => one.id)).size).toBe(widgets.length);
  });
});
