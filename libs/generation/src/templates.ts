/**
 * The template library — grounding data, not only a user feature (ai-architecture.md §6).
 *
 * Curated, human-approved definitions retrieved by similarity to the request are the
 * exemplars in the model's context. Each good template improves output for every similar
 * future prompt, which is why curating templates is an engineering investment rather than a
 * content task.
 *
 * Templates serve two purposes here, and the second is the one that matters when things go
 * wrong: they are also the DETERMINISTIC FALLBACK. When repair is exhausted, the closest
 * template is instantiated with the retrieved bindings and the user is told plainly what
 * happened. A user must never receive a validation trace.
 *
 * `exemplarEligible` is separate from availability on purpose: being a good example is a
 * different judgement from being instantiable, and cross-tenant exemplar use is a security
 * boundary (security-architecture.md §7).
 */

import type { PageIntent } from './intake';

export interface LayoutTemplate {
  id: string;
  name: string;
  pageIntent: PageIntent;
  /** One line, for the model's exemplar context. */
  summary: string;
  /** Terms that make this template a good match. */
  keywords: string[];
  /**
   * The shape, not a finished page: how many of each widget kind, and in what order.
   * The generator fills it against the grounding pack.
   */
  shape: {
    intro: boolean;
    kpiCount: [min: number, max: number];
    chart: 'none' | 'trend' | 'breakdown';
    tables: number;
    tabbedTables: boolean;
  };
  exemplarEligible: boolean;
  /** Platform-curated templates may cross tenant boundaries; tenant ones may not. */
  scope: 'platform' | 'tenant';
}

export const TEMPLATES: readonly LayoutTemplate[] = [
  {
    id: 'platform.ops-dashboard-kpi-trend-queue',
    name: 'Operational dashboard: KPI row, trend, queue',
    pageIntent: 'dashboard',
    summary:
      'A row of headline figures above a trend chart and a record queue. The standard shape for "how is today going" questions.',
    keywords: [
      'processing', 'status', 'health', 'today', 'operational', 'failed', 'late', 'exceptions',
      'queue', 'backlog', 'files', 'new',
    ],
    shape: { intro: true, kpiCount: [2, 4], chart: 'trend', tables: 1, tabbedTables: true },
    exemplarEligible: true,
    scope: 'platform',
  },
  {
    id: 'platform.kpi-only-summary',
    name: 'Summary: headline figures only',
    pageIntent: 'dashboard',
    summary: 'A row of headline figures with no chart or table. For a scoreboard.',
    keywords: ['summary', 'scoreboard', 'figures', 'counts', 'totals', 'kpi', 'overview'],
    shape: { intro: true, kpiCount: [2, 6], chart: 'none', tables: 0, tabbedTables: false },
    exemplarEligible: true,
    scope: 'platform',
  },
  {
    id: 'platform.breakdown-dashboard',
    name: 'Breakdown dashboard: figures and a categorical split',
    pageIntent: 'dashboard',
    summary:
      'Headline figures above a chart broken down by a category, and a supporting table. For "by source", "by severity" questions.',
    keywords: ['by', 'per', 'breakdown', 'split', 'across', 'grouped', 'category', 'source'],
    shape: { intro: true, kpiCount: [1, 3], chart: 'breakdown', tables: 1, tabbedTables: false },
    exemplarEligible: true,
    scope: 'platform',
  },
  {
    id: 'platform.record-queue',
    name: 'Record queue',
    pageIntent: 'workspace',
    summary: 'A single record table with a count above it. For review and remediation work.',
    keywords: ['queue', 'list', 'review', 'remediate', 'work', 'assigned', 'outstanding'],
    shape: { intro: true, kpiCount: [1, 2], chart: 'none', tables: 1, tabbedTables: false },
    exemplarEligible: true,
    scope: 'platform',
  },
];

export interface TemplateMatch {
  template: LayoutTemplate;
  score: number;
  /** Stated so a reviewer can see why this shape was chosen. */
  rationale: string;
}

/**
 * Select a template. Scored rather than pattern-matched so the choice is explainable and so
 * adding a template changes behaviour without changing code.
 */
export function selectTemplate(
  pageIntent: PageIntent,
  terms: readonly string[],
  signals: {
    measureCount: number;
    hasTemporalAttribute: boolean;
    wantsList: boolean;
    wantsBreakdown: boolean;
  },
): TemplateMatch {
  const lowered = terms.map((t) => t.toLowerCase());

  const scored = TEMPLATES.map((template) => {
    let score = 0;
    const reasons: string[] = [];

    if (template.pageIntent === pageIntent) {
      score += 2;
      reasons.push(`matches the ${pageIntent} intent`);
    }

    const keywordHits = template.keywords.filter((k) =>
      lowered.some((t) => t === k || t.startsWith(k) || k.startsWith(t)),
    );
    if (keywordHits.length) {
      score += Math.min(keywordHits.length, 4);
      reasons.push(`prompt mentions ${keywordHits.slice(0, 3).join(', ')}`);
    }

    const [minKpi, maxKpi] = template.shape.kpiCount;
    if (signals.measureCount >= minKpi && signals.measureCount <= maxKpi) {
      score += 1.5;
      reasons.push(`${signals.measureCount} measures fit its ${minKpi}–${maxKpi} figure row`);
    } else if (signals.measureCount > maxKpi) {
      score -= 0.5;
    }

    if (template.shape.chart === 'trend') {
      if (signals.hasTemporalAttribute) {
        score += 1;
        reasons.push('a date attribute is available for a trend');
      } else {
        score -= 1.5;
        reasons.push('no date attribute, so a trend would have no x axis');
      }
    }
    if (template.shape.chart === 'breakdown' && signals.wantsBreakdown) {
      score += 1.5;
      reasons.push('the prompt asks for a breakdown');
    }
    if (template.shape.tables > 0 && signals.wantsList) {
      score += 1;
      reasons.push('the prompt asks for records');
    }
    if (template.shape.tables === 0 && signals.wantsList) {
      score -= 1;
    }

    return {
      template,
      score,
      rationale: reasons.length ? reasons.join('; ') : 'default shape',
    };
  }).sort((a, b) => b.score - a.score);

  return scored[0]!;
}

export function templateById(id: string): LayoutTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Exemplars for the model's context: platform-curated and eligible only. */
export function exemplarsFor(match: TemplateMatch): LayoutTemplate[] {
  return TEMPLATES.filter(
    (t) =>
      t.exemplarEligible &&
      t.scope === 'platform' &&
      (t.id === match.template.id || t.pageIntent === match.template.pageIntent),
  ).slice(0, 3);
}
