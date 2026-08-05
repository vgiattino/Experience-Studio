import { describe, expect, it } from 'vitest';

import dashboardJson from '../../../apps/viewer/public/definitions/operations-dashboard.page.json';
import {
  childNodesOf,
  componentIdsOf,
  describeExperience,
  experienceOf,
  pageOf,
  sectionsOf,
  text,
  widgetNodesOf,
  type Container,
  type ExperienceDefinition,
  type PageDefinition,
} from './index';

/**
 * The shipped sample, so the tests exercise a real artifact rather than a hand-made shape.
 *
 * Imported rather than read from disk: these specs run in a browser environment, where there is no
 * filesystem — the same reason the validator's shipped-artifacts gate imports its fixtures.
 */
const dashboard = dashboardJson as unknown as PageDefinition;

describe('section traversal', () => {
  it('finds every container in the layout', () => {
    const sections = sectionsOf(dashboard.layout);
    // root grid + kpi row + charts grid + two panels
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.every((section) => section.kind === 'container')).toBe(true);
  });

  it('finds every widget, and each one names a declared component', () => {
    const widgets = widgetNodesOf(dashboard.layout);
    expect(widgets.length).toBeGreaterThan(6);
    for (const id of componentIdsOf(dashboard.layout)) {
      // An orphan widget node is a page with a hole in it, so this is the invariant worth asserting.
      expect(dashboard.components[id], `component "${id}"`).toBeTruthy();
    }
  });

  it('reads children from every container shape, not only `children`', () => {
    // The irregularity is the point: a split holds primary/secondary and a tab set holds one list per
    // tab plus a shared template. A traversal that only knew `children` would silently skip them, and
    // the skip would look like an empty region rather than a bug.
    const split: Container = {
      type: 'split',
      primary: [{ kind: 'widget', id: 'a', component: 'ca' }],
      secondary: [{ kind: 'widget', id: 'b', component: 'cb' }],
    } as Container;
    expect(childNodesOf(split).map((n) => n.id)).toEqual(['a', 'b']);

    const tabs: Container = {
      type: 'tabs',
      source: {
        mode: 'static',
        tabs: [
          { id: 't1', label: 'One', content: [{ kind: 'widget', id: 'w1', component: 'c1' }] },
          { id: 't2', label: 'Two', content: [{ kind: 'widget', id: 'w2', component: 'c2' }] },
        ],
      },
    } as unknown as Container;
    expect(childNodesOf(tabs).map((n) => n.id)).toEqual(['w1', 'w2']);
  });
});

describe('experience outline', () => {
  it('summarises a page the way the UI reports it', () => {
    const experience = experienceOf(dashboard);
    const outline = describeExperience(experience);

    expect(outline.pages).toHaveLength(1);
    const page = outline.pages[0];
    expect(page.widgets).toBe(widgetNodesOf(dashboard.layout).length);
    expect(page.dataSources).toBe(Object.keys(dashboard.dataSources ?? {}).length);
    expect(page.entities).toContain('dq.exception');
    expect(page.componentTypes).toContain('analytics.kpi-card');
    expect(outline.totalWidgets).toBe(page.widgets);
  });

  it('wraps a page as a one-page experience with a resolvable home page', () => {
    const experience = experienceOf(dashboard);
    // The app routes and stores experiences, so a generated page has to become one. If the home page
    // did not resolve, the runtime would land on an id that is not there.
    expect(experience.navigation?.homePage).toBe(dashboard.id);
    expect(pageOf(experience, dashboard.id)?.id).toBe(dashboard.id);
  });

  it('returns null for a page held by reference rather than guessing', () => {
    const byRef: ExperienceDefinition = {
      ...experienceOf(dashboard),
      pages: { elsewhere: { $pageRef: 'elsewhere.page.json' } },
    };
    // Null, so the caller can say "this came from somewhere else" instead of rendering a blank page.
    expect(pageOf(byRef, 'elsewhere')).toBeNull();
  });
});

describe('i18n text', () => {
  it('accepts a plain string, an object form, and nothing at all', () => {
    expect(text('Plain')).toBe('Plain');
    expect(text({ key: 'k', default: 'Object' })).toBe('Object');
    expect(text(undefined, 'fallback')).toBe('fallback');
  });
});
