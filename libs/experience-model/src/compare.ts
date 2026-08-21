/**
 * Compare Experience — PRD §16.4, FR-22.
 *
 * ── IT IS A THREE-WAY COMPARISON, AND THAT IS THE WHOLE DESIGN ────────────────
 *
 * §16.4's goal sentence is the specification:
 *
 *   > "The goal is to clearly show **what the product changed** and **what the client changed**."
 *
 * A two-way diff of the client variant against the new standard cannot answer that. Presented with a
 * column that is on the standard and not on the variant, it has no way to tell "the product added it"
 * from "the client removed it" — and those call for opposite decisions. So the comparison takes three
 * artifacts:
 *
 *     BASELINE   the standard version the variant was derived from   (`derivedFrom.standardVersion`)
 *        │  └────── product change ──→  STANDARD   what the product ships now
 *        └───────── client change  ──→  CLIENT     the variant as it stands
 *
 * `baseline → standard` is what the product did. `baseline → client` is what the client did. A subject
 * both sides touched is a **conflict**, and it is the only kind of difference where a synchronisation
 * has to ask rather than act.
 *
 * The baseline is why `deployStandards` archives the standard it replaces. Before that it did not, so a
 * v2.0 deployment destroyed the only artifact that makes this function correct — and a three-way
 * comparison with a guessed baseline is worse than no comparison, because it attributes the product's
 * changes to the client and the client's to the product.
 *
 * ── PER CHANGE, NOT ONE BLOB — BECAUSE §16.5 SAYS SO ─────────────────────────
 *
 * §16.5 defers *selective* synchronisation to a later phase and gives the example: adopt the new AI
 * Search, keep the custom columns, adopt the new exception visualisation, keep the custom navigation.
 * That is only ever buildable on a comparison whose output is a **list of individually addressable
 * changes**. So every `Difference` carries a stable `id`, and nothing here returns a diff of whole
 * documents. The comparison being per-change is not a nicety; it is the constraint that decides whether
 * §16.5's future half is reachable at all.
 *
 * ── THE NINE ITEMS ARE NOT NINE CATEGORIES ───────────────────────────────────
 *
 * §16.4 lists nine things a comparison should identify, and the ninth — "Client-specific
 * customizations" — is not a *kind* of change like the other eight. It is a *provenance*: every change
 * with `side: 'client'` is a client-specific customisation, whichever of the eight kinds it is. Making
 * it a tenth category would double-count every client change and leave a reader unable to tell whether
 * a list of twelve differences meant twelve or six. So this module has eight categories and three
 * sides, and the ninth item is the `side: 'client'` slice.
 */

import { isPageRef } from '@opus/contracts';
import type {
  Action,
  ComponentInstance,
  ExperienceDefinition,
  LayoutNode,
  PageDefinition,
} from '@opus/contracts';

// ── 1. what a difference is ─────────────────────────────────────────────────

/** §16.4's list, less its ninth item — see the header. Closed. */
export type DifferenceCategory =
  | 'capability-added'
  | 'capability-removed'
  | 'layout-changed'
  | 'columns-changed'
  | 'filters-changed'
  | 'chart-changed'
  | 'navigation-changed'
  | 'business-rules-changed';

/** Which of the two lines moved. `both` is a conflict, and the only case a sync must ask about. */
export type DifferenceSide = 'product' | 'client' | 'both';

export interface Difference {
  /**
   * Stable and addressable — this is what selective synchronisation will name.
   *
   * Derived from the subject rather than from a position, so it survives a reordering: the same change
   * to the same component has the same id whether it is the third difference or the eleventh.
   */
  id: string;
  category: DifferenceCategory;
  side: DifferenceSide;
  /** The page it is in, absent for an experience-level change. */
  pageId?: string;
  /** What changed, named the way a business user would name it. */
  subject: string;
  /** One sentence, in §19's register — the same register a refinement explains itself in. */
  summary: string;
  /** On a conflict, what each side did. Absent on a one-sided difference, where `summary` says it. */
  productChange?: string;
  clientChange?: string;
}

export interface Comparison {
  standardId: string;
  /** What the client is based on. */
  baselineVersion: string;
  /** What the product ships now. */
  standardVersion: string;
  differences: readonly Difference[];
  counts: {
    product: number;
    client: number;
    conflicts: number;
  };
}

/**
 * Why a comparison could not be produced. Reported rather than approximated.
 *
 * `baselineUnavailable` is the one that matters: it happens on a store that predates version archival,
 * and the honest answer is "this cannot be compared" rather than a two-way diff mislabelled as a
 * three-way one. A caller can still offer Keep My Version, which needs no comparison.
 */
export type ComparisonRefusal =
  | { code: 'notDerived'; detail: string }
  | { code: 'noUpdate'; detail: string }
  | { code: 'standardNotShipped'; detail: string }
  | { code: 'baselineUnavailable'; detail: string }
  /**
   * A page is an unresolved `$pageRef`. Cannot happen through the store — `resolvePageRefs` runs on
   * every write and every deployment — which is exactly why it is worth refusing rather than skipping:
   * a comparison that quietly omitted a page would be *wrong* in the one direction that matters, and it
   * would look complete. If this ever fires, the store's resolution has a hole.
   */
  | { code: 'pagesUnresolved'; detail: string };

export type ComparisonOutcome =
  | { ok: true; comparison: Comparison }
  | { ok: false } & ComparisonRefusal;

// ── 2. the entry point ──────────────────────────────────────────────────────

/**
 * Compare a client variant against a newer standard, through the baseline both descend from.
 *
 * The baseline is supplied rather than looked up, because this library has no store — the same reason
 * `updateAvailableFor` takes the shipped standards as an argument. `null` is a legitimate value and
 * produces `baselineUnavailable`.
 */
export function compareWithStandard(input: {
  client: ExperienceDefinition;
  standard: ExperienceDefinition;
  baseline: ExperienceDefinition | null;
}): ComparisonOutcome {
  const { client, standard, baseline } = input;

  const lineage = client.derivedFrom;
  if (!lineage) {
    return {
      ok: false,
      code: 'notDerived',
      detail: `“${client.id}” is not derived from a product standard, so there is nothing to compare it against.`,
    };
  }
  if (!standard.standard) {
    return {
      ok: false,
      code: 'standardNotShipped',
      detail: `“${standard.id}” is not a product standard.`,
    };
  }
  if (!baseline) {
    return {
      ok: false,
      code: 'baselineUnavailable',
      detail:
        `This experience is based on v${lineage.standardVersion} of ${lineage.standardId}, and that version is no longer ` +
        `in the store — so which side of a difference each change came from cannot be established. ` +
        `Keeping your version needs no comparison, and a comparison will be available for the next release.`,
    };
  }

  const unresolved = [baseline, standard, client].flatMap((definition) =>
    Object.entries(definition.pages ?? {})
      .filter(([, page]) => isPageRef(page))
      .map(([id]) => `${definition.id}/${id}`),
  );
  if (unresolved.length) {
    return {
      ok: false,
      code: 'pagesUnresolved',
      detail: `These pages are unresolved references and cannot be compared: ${unresolved.join(', ')}.`,
    };
  }

  const differences = merge(
    describeChanges(baseline, standard),
    describeChanges(baseline, client),
  );

  return {
    ok: true,
    comparison: {
      standardId: lineage.standardId,
      baselineVersion: lineage.standardVersion,
      standardVersion: standard.standard.version,
      differences,
      counts: {
        product: differences.filter((d) => d.side === 'product').length,
        client: differences.filter((d) => d.side === 'client').length,
        conflicts: differences.filter((d) => d.side === 'both').length,
      },
    },
  };
}

/**
 * Fold the two one-sided change lists into one, keyed by `id`.
 *
 * The merge is where conflicts are found: a subject present in both lists was touched by both sides,
 * and that is the only fact a synchronisation cannot decide on its own. Ordering is by page then
 * category then subject, so two runs over the same artifacts read identically — a comparison whose rows
 * move between refreshes is a comparison nobody trusts.
 */
function merge(
  productSide: readonly OneSided[],
  clientSide: readonly OneSided[],
): readonly Difference[] {
  const byId = new Map<string, Difference>();

  for (const change of productSide) {
    byId.set(change.id, { ...change, side: 'product' });
  }

  for (const change of clientSide) {
    const existing = byId.get(change.id);
    if (!existing) {
      byId.set(change.id, { ...change, side: 'client' });
      continue;
    }
    /*
      Both sides moved the same subject. The two summaries are kept side by side rather than merged
      into one sentence, because the reader's next question is "what did each of them do" and a merged
      sentence answers neither half.
    */
    byId.set(change.id, {
      ...existing,
      side: 'both',
      summary: `Both the product and this experience changed ${quoted(change.subject)}.`,
      productChange: existing.summary,
      clientChange: change.summary,
    });
  }

  return [...byId.values()].sort(
    (a, b) =>
      (a.pageId ?? '').localeCompare(b.pageId ?? '') ||
      a.category.localeCompare(b.category) ||
      a.subject.localeCompare(b.subject),
  );
}

/** A change before it is known which side made it. */
type OneSided = Omit<Difference, 'side'>;

// ── 3. one side of the comparison ───────────────────────────────────────────

/**
 * Every change from `before` to `after`, as a flat list of addressable differences.
 *
 * Called twice — once for each side — which is what keeps the two halves symmetric. A comparison whose
 * product half and client half were computed by different code would be a comparison that reported
 * asymmetries the artifacts do not have.
 */
function describeChanges(before: ExperienceDefinition, after: ExperienceDefinition): OneSided[] {
  const out: OneSided[] = [];

  out.push(...experienceNavigationChanges(before, after));
  out.push(...pageMembershipChanges(before, after));

  const beforePages = before.pages ?? {};
  const afterPages = after.pages ?? {};
  for (const [pageId, afterPage] of Object.entries(afterPages)) {
    const beforePage = beforePages[pageId];
    // A whole new page is reported by `pageMembershipChanges`. Refs are refused before we get here.
    if (!beforePage || isPageRef(beforePage) || isPageRef(afterPage)) continue;
    out.push(...pageChanges(pageId, beforePage, afterPage));
  }

  return out;
}

/** §16.4 — Changed navigation, at the experience level. */
function experienceNavigationChanges(
  before: ExperienceDefinition,
  after: ExperienceDefinition,
): OneSided[] {
  const out: OneSided[] = [];
  const b = before.navigation;
  const a = after.navigation;

  const beforeItems = navLabels(b?.items);
  const afterItems = navLabels(a?.items);
  if (!same(beforeItems, afterItems)) {
    out.push({
      id: 'nav:items',
      category: 'navigation-changed',
      subject: 'the navigation menu',
      summary: describeList('The navigation menu', beforeItems, afterItems),
    });
  }

  const beforeTargets = Object.keys(b?.drilldownTargets ?? {}).sort();
  const afterTargets = Object.keys(a?.drilldownTargets ?? {}).sort();
  if (!same(beforeTargets, afterTargets)) {
    out.push({
      id: 'nav:drilldown',
      category: 'navigation-changed',
      subject: 'drill-down targets',
      summary: describeList('Drill-down', beforeTargets, afterTargets),
    });
  }

  if ((b?.homePage ?? '') !== (a?.homePage ?? '')) {
    out.push({
      id: 'nav:home',
      category: 'navigation-changed',
      subject: 'the landing page',
      summary: `The landing page is now ${quoted(a?.homePage ?? 'unset')}, was ${quoted(b?.homePage ?? 'unset')}.`,
    });
  }

  return out;
}

/**
 * §16.4 — Added and removed capabilities, at page granularity.
 *
 * A whole page is the largest capability an experience has, so a page arriving is reported as an added
 * capability rather than under a category of its own. §16.4's list has no "added pages" entry, and
 * inventing one would mean a reader of the PRD could not find it.
 */
function pageMembershipChanges(
  before: ExperienceDefinition,
  after: ExperienceDefinition,
): OneSided[] {
  const out: OneSided[] = [];
  const beforeIds = Object.keys(before.pages ?? {});
  const afterIds = Object.keys(after.pages ?? {});

  for (const id of afterIds.filter((i) => !beforeIds.includes(i))) {
    const page = pageAt(after, id);
    out.push({
      id: `page:${id}`,
      category: 'capability-added',
      pageId: id,
      subject: title(page?.name) || id,
      summary: `A new screen, ${quoted(title(page?.name) || id)}, with ${count(Object.keys(page?.components ?? {}).length, 'widget')}.`,
    });
  }

  for (const id of beforeIds.filter((i) => !afterIds.includes(i))) {
    const page = pageAt(before, id);
    out.push({
      id: `page:${id}`,
      category: 'capability-removed',
      pageId: id,
      subject: title(page?.name) || id,
      summary: `The screen ${quoted(title(page?.name) || id)} is gone.`,
    });
  }

  return out;
}

// ── 4. inside one page ──────────────────────────────────────────────────────

function pageChanges(pageId: string, before: PageDefinition, after: PageDefinition): OneSided[] {
  const out: OneSided[] = [];

  out.push(...componentMembershipChanges(pageId, before, after));
  out.push(...componentConfigChanges(pageId, before, after));
  out.push(...layoutChanges(pageId, before, after));
  out.push(...filterChannelChanges(pageId, before, after));
  out.push(...actionChanges(pageId, before, after));
  out.push(...pageNavigationChanges(pageId, before, after));

  return out;
}

/** §16.4 — Added and removed capabilities, at widget granularity. */
function componentMembershipChanges(
  pageId: string,
  before: PageDefinition,
  after: PageDefinition,
): OneSided[] {
  const out: OneSided[] = [];
  const b = before.components ?? {};
  const a = after.components ?? {};

  for (const [id, component] of Object.entries(a)) {
    if (b[id]) continue;
    out.push({
      id: `component:${pageId}:${id}`,
      category: 'capability-added',
      pageId,
      subject: nameOf(component, id),
      summary: `A new ${kindWord(component.type)}, ${quoted(nameOf(component, id))}.`,
    });
  }

  for (const [id, component] of Object.entries(b)) {
    if (a[id]) continue;
    out.push({
      id: `component:${pageId}:${id}`,
      category: 'capability-removed',
      pageId,
      subject: nameOf(component, id),
      summary: `The ${kindWord(component.type)} ${quoted(nameOf(component, id))} is gone.`,
    });
  }

  return out;
}

/**
 * The three categories that are all "a component changed", separated by what changed.
 *
 * §16.4 asks for columns, charts and filters as distinct items, and they are distinct *to a reader* —
 * "a column was added" and "the chart became a line chart" are different news even though both are one
 * component's configuration. So the category is chosen from **what moved**, not from the component's
 * type: a filter bar whose defaults changed is a filter change, and a table whose columns changed is a
 * column change, and the same component can produce one of each.
 */
function componentConfigChanges(
  pageId: string,
  before: PageDefinition,
  after: PageDefinition,
): OneSided[] {
  const out: OneSided[] = [];
  const b = before.components ?? {};
  const a = after.components ?? {};

  for (const [id, afterComponent] of Object.entries(a)) {
    const beforeComponent = b[id];
    if (!beforeComponent) continue;

    const name = nameOf(afterComponent, id);
    const base = `component:${pageId}:${id}`;

    // Columns — §16.4's "New/removed columns".
    const beforeColumns = columnsOf(beforeComponent);
    const afterColumns = columnsOf(afterComponent);
    if (!same(beforeColumns, afterColumns)) {
      out.push({
        id: `${base}:columns`,
        category: 'columns-changed',
        pageId,
        subject: name,
        summary: describeList(`The columns on ${quoted(name)}`, beforeColumns, afterColumns),
      });
    }

    // Charts — §16.4's "Changed charts". Encodings as well as the mark, because a chart that changed
    // what it plots has changed more than one that changed how it draws it.
    if (isChart(afterComponent.type)) {
      const beforeMark = String(beforeComponent.config?.['mark'] ?? '');
      const afterMark = String(afterComponent.config?.['mark'] ?? '');
      if (beforeMark !== afterMark) {
        out.push({
          id: `${base}:mark`,
          category: 'chart-changed',
          pageId,
          subject: name,
          summary: `${quoted(name)} is now a ${afterMark} chart, was a ${beforeMark} chart.`,
        });
      }
      const beforeEncodings = encodingLabels(beforeComponent);
      const afterEncodings = encodingLabels(afterComponent);
      if (!same(beforeEncodings, afterEncodings)) {
        out.push({
          id: `${base}:encodings`,
          category: 'chart-changed',
          pageId,
          subject: name,
          summary: describeList(`What ${quoted(name)} plots`, beforeEncodings, afterEncodings),
        });
      }
    }

    // Filters — §16.4's "Changed filters", when the component is what does the filtering.
    if (isFilter(afterComponent.type)) {
      const beforeFilters = configKeysAndValues(beforeComponent);
      const afterFilters = configKeysAndValues(afterComponent);
      if (!same(beforeFilters, afterFilters)) {
        out.push({
          id: `${base}:filters`,
          category: 'filters-changed',
          pageId,
          subject: name,
          summary: describeList(`The filters on ${quoted(name)}`, beforeFilters, afterFilters),
        });
      }
    }

    /*
      Everything else about the configuration, as one difference rather than one per key.

      A component whose grouping, density and page size all moved is one change to a reader — they
      reconfigured that widget — and three rows would make a comparison of a real release unreadable.
      The keys are named in the sentence, so nothing is hidden by the grouping.
    */
    const otherKeys = changedConfigKeys(beforeComponent, afterComponent).filter(
      (key) => !(isChart(afterComponent.type) && key === 'mark'),
    );
    if (otherKeys.length && !isFilter(afterComponent.type)) {
      out.push({
        id: `${base}:config`,
        category: isChart(afterComponent.type) ? 'chart-changed' : 'layout-changed',
        pageId,
        subject: name,
        summary: `${quoted(name)} was reconfigured: ${otherKeys.join(', ')}.`,
      });
    }

    /*
      A RENAME, and §16.4's eight kinds have no slot for one.

      Found by running the comparison on the real shipped standard: a client had retitled a chart, the
      product had changed its mark, and the comparison reported only the product's half. Leaving it out
      is the worse option by a distance — a synchronisation that adopted the product's version would
      silently discard the client's own name for the widget, which is precisely the class of loss §16
      exists to prevent. So it is reported, under the closest of the eight: a title is how the screen
      presents itself, short of what it does.

      The stretch is recorded rather than hidden. It is evidence that §16.4's list is a reader's list
      rather than an exhaustive one, and `STANDARD-LIFECYCLE.md` says so.
    */
    const beforeName = title(beforeComponent.title) || title(beforeComponent.subtitle);
    const afterName = title(afterComponent.title) || title(afterComponent.subtitle);
    if (beforeName !== afterName) {
      out.push({
        id: `${base}:title`,
        category: 'layout-changed',
        pageId,
        subject: afterName || id,
        summary: `Renamed ${quoted(beforeName || id)} to ${quoted(afterName || id)}.`,
      });
    }

    // Visibility is a business rule, not a layout property — it decides who sees what.
    if (JSON.stringify(beforeComponent.visible ?? null) !== JSON.stringify(afterComponent.visible ?? null)) {
      out.push({
        id: `${base}:visible`,
        category: 'business-rules-changed',
        pageId,
        subject: name,
        summary: `When ${quoted(name)} is shown has changed.`,
      });
    }
  }

  return out;
}

/**
 * §16.4 — Changed layouts.
 *
 * Compared as the **flattened order of widgets**, which is the layout property a reader can see. A
 * structural diff of the container tree would also report a panel gaining a `gap`, and a comparison
 * that says "the layout changed" for a spacing tweak is a comparison whose layout rows get skipped.
 */
function layoutChanges(pageId: string, before: PageDefinition, after: PageDefinition): OneSided[] {
  const beforeOrder = widgetOrder(before.layout);
  const afterOrder = widgetOrder(after.layout);

  // Only the ORDER, and only among widgets present on both sides: an added or removed widget is
  // already reported as a capability, and letting it also reorder the list would report it twice.
  const shared = new Set(beforeOrder.filter((id) => afterOrder.includes(id)));
  const b = beforeOrder.filter((id) => shared.has(id));
  const a = afterOrder.filter((id) => shared.has(id));
  if (same(b, a)) return [];

  const moved = a
    .filter((id, index) => b[index] !== id)
    .map((id) => nameOf(after.components?.[id], id));

  return [
    {
      id: `layout:${pageId}`,
      category: 'layout-changed',
      pageId,
      subject: `the ${quotedPlain(title(after.name) || pageId)} layout`,
      summary: `Widgets were reordered${moved.length ? `: ${moved.slice(0, 3).map(quoted).join(', ')}${moved.length > 3 ? ` and ${moved.length - 3} more` : ''}` : ''}.`,
    },
  ];
}

/** §16.4 — Changed filters, at the page's own filter channels. */
function filterChannelChanges(
  pageId: string,
  before: PageDefinition,
  after: PageDefinition,
): OneSided[] {
  const b = Object.keys(before.filters ?? {}).sort();
  const a = Object.keys(after.filters ?? {}).sort();
  if (same(b, a)) return [];
  return [
    {
      id: `filters:${pageId}`,
      category: 'filters-changed',
      pageId,
      subject: `the ${quotedPlain(title(after.name) || pageId)} filters`,
      summary: describeList('The filters on this screen', b, a),
    },
  ];
}

/**
 * §16.4 — Changed business rules.
 *
 * Actions are the business rules this model has: an action is what a page *does* — approve, suppress,
 * export, run a workflow — and a change to one changes what the screen is allowed to do. Compared by
 * kind as well as by name, because an action that kept its name and changed from `navigate` to
 * `mutate` is the most consequential change in this list.
 */
function actionChanges(pageId: string, before: PageDefinition, after: PageDefinition): OneSided[] {
  const out: OneSided[] = [];
  const b = before.actions ?? {};
  const a = after.actions ?? {};

  for (const id of Object.keys(a)) {
    if (!b[id]) {
      out.push({
        id: `action:${pageId}:${id}`,
        category: 'business-rules-changed',
        pageId,
        subject: actionName(a[id], id),
        summary: `A new action, ${quoted(actionName(a[id], id))}.`,
      });
    } else if (a[id]!.kind !== b[id]!.kind) {
      out.push({
        id: `action:${pageId}:${id}`,
        category: 'business-rules-changed',
        pageId,
        subject: actionName(a[id], id),
        summary: `${quoted(actionName(a[id], id))} is now a ${a[id]!.kind} action, was ${b[id]!.kind}.`,
      });
    }
  }

  for (const id of Object.keys(b)) {
    if (a[id]) continue;
    out.push({
      id: `action:${pageId}:${id}`,
      category: 'business-rules-changed',
      pageId,
      subject: actionName(b[id], id),
      summary: `The action ${quoted(actionName(b[id], id))} is gone.`,
    });
  }

  return out;
}

/** §16.4 — Changed navigation, at the page level: what a row click does. */
function pageNavigationChanges(
  pageId: string,
  before: PageDefinition,
  after: PageDefinition,
): OneSided[] {
  const out: OneSided[] = [];
  const b = before.components ?? {};
  const a = after.components ?? {};

  for (const [id, afterComponent] of Object.entries(a)) {
    const beforeComponent = b[id];
    if (!beforeComponent) continue;
    const beforeEvents = JSON.stringify(beforeComponent.eventActions ?? null);
    const afterEvents = JSON.stringify(afterComponent.eventActions ?? null);
    if (beforeEvents === afterEvents) continue;
    out.push({
      id: `events:${pageId}:${id}`,
      category: 'navigation-changed',
      pageId,
      subject: nameOf(afterComponent, id),
      summary: `What happens when you interact with ${quoted(nameOf(afterComponent, id))} has changed.`,
    });
  }

  return out;
}

// ── 5. reading the model ────────────────────────────────────────────────────

/** One page, narrowed past the `$pageRef` alternative the contract allows. */
function pageAt(definition: ExperienceDefinition, id: string): PageDefinition | undefined {
  const page = definition.pages?.[id];
  return page && !isPageRef(page) ? page : undefined;
}

function columnsOf(component: ComponentInstance | undefined): string[] {
  const bindings = (component?.bindings ?? {}) as Record<string, unknown>;
  const role = Object.entries(bindings).find(([, value]) => Array.isArray(value));
  if (!role) return [];
  return (role[1] as { field?: string }[]).map((c) => c.field).filter((f): f is string => !!f);
}

/**
 * What a chart plots, as `channel=field` pairs.
 *
 * The field is at `binding.field`, not at `field`. The first version of this reached for `encoding.field`
 * behind a cast, which is always `undefined` — so every encoding read as `x=` and **no chart encoding
 * change could ever be detected**. The cast is what hid it: without one, the compiler says so. Nothing
 * in this file casts past the contract for that reason.
 */
function encodingLabels(component: ComponentInstance | undefined): string[] {
  return (component?.encodings ?? [])
    .map((encoding) => `${encoding.channel}=${encoding.binding?.field ?? ''}`)
    .sort();
}

function configKeysAndValues(component: ComponentInstance | undefined): string[] {
  return Object.entries(component?.config ?? {})
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .sort();
}

function changedConfigKeys(before: ComponentInstance, after: ComponentInstance): string[] {
  const keys = new Set([
    ...Object.keys(before.config ?? {}),
    ...Object.keys(after.config ?? {}),
  ]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(before.config?.[key] ?? null) !== JSON.stringify(after.config?.[key] ?? null),
    )
    .sort();
}

/** Widget ids in the order the layout places them, depth first. */
function widgetOrder(node: LayoutNode | undefined): string[] {
  const out: string[] = [];
  const walk = (current: unknown): void => {
    if (!current || typeof current !== 'object') return;
    const candidate = current as { kind?: string; component?: string; container?: Record<string, unknown> };
    if (candidate.kind === 'widget' && candidate.component) {
      out.push(candidate.component);
      return;
    }
    for (const value of Object.values(candidate.container ?? {})) {
      if (Array.isArray(value)) value.forEach(walk);
    }
  };
  walk(node);
  return out;
}

function isChart(type: string | undefined): boolean {
  return (type ?? '').startsWith('analytics.') && (type ?? '').includes('chart');
}

function isFilter(type: string | undefined): boolean {
  return (type ?? '').startsWith('input.');
}

/**
 * A word for a component type that a business user would use.
 *
 * Derived from the type's local name rather than mapped per component, so a component added tomorrow
 * gets a reasonable word without this file changing — the same reason `refine.ts` derives its kind
 * synonyms from the type.
 */
function kindWord(type: string | undefined): string {
  const local = (type ?? '').split('.').pop() ?? 'widget';
  return local.replace(/-/g, ' ') || 'widget';
}

function nameOf(component: ComponentInstance | undefined, fallback: string): string {
  return title(component?.title) || title(component?.subtitle) || fallback;
}

function actionName(action: Action | undefined, fallback: string): string {
  return title((action as { label?: unknown } | undefined)?.label) || fallback;
}

function navLabels(items: readonly unknown[] | undefined): string[] {
  return (items ?? [])
    .map((item) => {
      const i = item as { label?: unknown; page?: string; id?: string };
      return title(i.label) || i.page || i.id || '';
    })
    .filter(Boolean)
    .sort();
}

function title(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'default' in value) {
    return String((value as { default?: unknown }).default ?? '');
  }
  return '';
}

// ── 6. saying it ────────────────────────────────────────────────────────────

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * A list change as a sentence naming what arrived and what left.
 *
 * "The columns changed" is true and useless. Naming the two sets is what makes the row actionable, and
 * a list that only grew or only shrank says so rather than reporting an empty half.
 */
function describeList(what: string, before: readonly string[], after: readonly string[]): string {
  const added = after.filter((value) => !before.includes(value));
  const removed = before.filter((value) => !after.includes(value));
  const parts: string[] = [];
  if (added.length) parts.push(`added ${added.map(quoted).join(', ')}`);
  if (removed.length) parts.push(`removed ${removed.map(quoted).join(', ')}`);
  // Same members, different order — real, and the only thing left once both halves are empty.
  if (!parts.length) return `${what} was reordered.`;
  return `${what}: ${parts.join('; ')}.`;
}

function quoted(value: string): string {
  return `“${value}”`;
}

/** For a subject that is already being read as a phrase — "the X layout" — where quotes would be noise. */
function quotedPlain(value: string): string {
  return value;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
