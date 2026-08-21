/**
 * The palette: how the app talks about the component vocabulary.
 *
 * One entry per registered type. The list is asserted against the registry by a unit test, so a
 * component added without a palette entry — or an entry for a type that no longer exists — fails the
 * build rather than showing up as a blank tile.
 *
 * The `generates` field is the one users care about most on the Create screen: it answers "what can I
 * ask for?" before they type. A prompt box with no indication of the vocabulary invites requests the
 * catalog cannot serve, and an honest decline is a worse first experience than a good suggestion.
 */

import type { ComponentTypeRef } from '@opus/contracts';

export interface PaletteEntry {
  type: ComponentTypeRef;
  label: string;
  /** `business` is the PRD's Enterprise family — the contract's own name for it. */
  category: 'analytics' | 'data' | 'content' | 'input' | 'layout' | 'business';
  /** Material icon name. */
  icon: string;
  description: string;
  /** What a prompt might say to get this. */
  generates: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  {
    type: 'analytics.kpi-card',
    label: 'KPI card',
    category: 'analytics',
    icon: 'speed',
    description: 'One number with its threshold emphasis, taken from the measure’s own metadata.',
    generates: '“files processed”, “late files”, “open exceptions”',
  },
  {
    type: 'analytics.chart',
    label: 'Chart',
    category: 'analytics',
    icon: 'bar_chart',
    description:
      'Mark plus encodings rather than a chart-type menu — bar, line, area, point over the same model.',
    generates: '“trend over the last 14 days”, “by severity”, “breakdown by rule”',
  },
  {
    type: 'data.table',
    label: 'Table',
    category: 'data',
    icon: 'table_rows',
    description: 'Sortable columns with catalog formatting, row selection and row-click drill-down.',
    generates: '“recent exceptions”, “list securities”, “the queue”',
  },
  {
    type: 'input.filter-bar',
    label: 'Search and facets',
    category: 'input',
    icon: 'search',
    description: 'Debounced search plus declared facets. Writes nothing itself — it emits, the page decides.',
    generates: '“searchable”, “filter by asset class”, “find a security”',
  },
  {
    type: 'content.text',
    label: 'Text',
    category: 'content',
    icon: 'title',
    description: 'Headings and prose with token substitution from data. Interpolated, never injected.',
    generates: '“with a summary line”, “explain what this shows”',
  },
  {
    type: 'business.exception-queue',
    label: 'Exception queue',
    category: 'business',
    icon: 'warning',
    description:
      'A work queue, not a grid: ordered by severity then age, unassigned work first, and items past their ageing threshold marked.',
    generates: '“a triage queue”, “open breaks by severity”, “what needs working on”',
  },
  {
    type: 'business.source-comparison',
    label: 'Source comparison',
    category: 'business',
    icon: 'compare',
    description:
      'The mastered value beside every contributing source’s value, one row per field and one column per source. It pivots the long form, so the reader does not have to.',
    generates:
      '“where did this value come from”, “put the current record and contributing source values side by side”, “which vendors disagree”',
  },
];

const CATEGORY_LABELS: Record<PaletteEntry['category'], string> = {
  analytics: 'Analytics',
  data: 'Data',
  content: 'Content',
  input: 'Input',
  layout: 'Layout',
  business: 'Enterprise',
};

export function categoryLabel(category: PaletteEntry['category']): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function paletteEntry(type: ComponentTypeRef): PaletteEntry | undefined {
  return PALETTE.find((entry) => entry.type === type);
}

export function paletteForCategory(category: PaletteEntry['category']): readonly PaletteEntry[] {
  return PALETTE.filter((entry) => entry.category === category);
}
