/**
 * Synchronization and Reversion — PRD §16.5, FR-23.
 *
 * §16.5's minimum is four actions, and three of them are here:
 *
 *   **Sync all changes**   adopt every product change, keep every customisation that does not collide
 *   **Revert to standard** discard the customisations and take the standard as it ships
 *   **Preview before sync** produce the result without saving it
 *   *Keep client version*  already built — it records a decline and changes nothing (`declineUpdate`)
 *
 * ── SYNC IS A REBASE, NOT AN OVERWRITE ───────────────────────────────────────
 *
 * Principle 5: *"Product updates must never automatically overwrite client customizations."* So "sync
 * all changes" cannot mean "replace the variant with the new standard" — that is Revert, and §16.5 lists
 * the two separately precisely because they are different acts.
 *
 * Sync starts from **the client's own artifact** and applies the product's changes onto it. The
 * direction matters more than it looks: starting from the standard and re-applying the client's changes
 * would silently drop anything the comparison did not decompose, because whatever the applier does not
 * know how to carry across is simply absent from the result. Starting from the client, an unhandled
 * aspect stays as the client has it — which is the conservative direction, and the one Principle 5 asks
 * for. A synchronisation that loses a customisation nobody listed is the failure this whole section
 * exists to prevent.
 *
 * ── EVERY CHANGE IS OPTIONAL, WHICH IS WHY §16.5's FUTURE HALF IS REACHABLE ──
 *
 * `adopt` is a set of difference ids. Sync-all passes every product-side and conflicting difference;
 * §16.5's deferred *selective* synchronisation — "adopt new AI Search, keep custom columns" — is the
 * same call with a smaller set. That is not scope creep, it is the shape falling out of a per-change
 * comparison: having built the list, refusing to let a caller filter it would have taken extra code.
 *
 * What is deliberately *not* built is a UI for choosing. §16.5 defers that, and a screen for picking
 * among differences needs a preview per selection to be usable rather than alarming.
 *
 * ── A CLIENT-SIDE DIFFERENCE IS NEVER "ADOPTED" ──────────────────────────────
 *
 * It is already in the client artifact. Adopting it would mean overwriting the client's own value with
 * the client's own value, and *not* adopting it means leaving it alone — so it is a no-op either way and
 * accepting one in `adopt` is a caller error worth reporting rather than absorbing. What a caller wants
 * when they say "drop my change to X" is Revert, scoped — and §16.5 does not ask for that.
 */

import type { ComponentInstance, ExperienceDefinition, LayoutNode, PageDefinition } from '@opus/contracts';

import type { Comparison, Difference } from './compare';

// ── what comes back ─────────────────────────────────────────────────────────

export interface SyncResult {
  /** The merged artifact. Not saved — the caller decides, which is what makes Preview possible. */
  definition: ExperienceDefinition;
  /** The differences that were applied, in the order they were applied. */
  applied: readonly Difference[];
  /**
   * Differences that were adopted and could not be applied, with the reason.
   *
   * Reported rather than silently skipped. A synchronisation that claims to have adopted a change it
   * did not is worse than one that refuses: the reader believes their page has the new capability and
   * finds out from somebody else that it does not.
   */
  skipped: readonly { difference: Difference; reason: string }[];
  /**
   * Whether the lineage baseline moved.
   *
   * True only when every product change was adopted. A partial adoption leaves the baseline where it is
   * — see the comment in `synchronise` — so a caller must not report "you are now on v2.0" from the fact
   * that a sync succeeded.
   */
  baselineMoved: boolean;
  /**
   * Customisations the reader still has, and customisations they lost.
   *
   * `supersededCustomisations` is the whole cost of a sync, stated: a conflict that was adopted took the
   * product's value over the reader's. §16.5 offers no third option for a conflict, so the honest thing
   * is to name what it cost rather than to report a clean success.
   */
  keptCustomisations: readonly Difference[];
  supersededCustomisations: readonly Difference[];
}

export type SyncRefusal =
  | { code: 'notDerived'; detail: string }
  | { code: 'nothingToAdopt'; detail: string }
  | { code: 'notAdoptable'; detail: string };

export type SyncOutcome = { ok: true; result: SyncResult } | ({ ok: false } & SyncRefusal);

// ── sync ────────────────────────────────────────────────────────────────────

/**
 * §16.5 — synchronise a client variant with a newer standard.
 *
 * `adopt` defaults to every difference the product made, conflicts included, which is "Sync all
 * changes". Passing a subset is selective synchronisation and the function does not care which it is.
 *
 * The lineage baseline **moves** — that is what a synchronisation is — and `syncedAt`/`syncedFromVersion`
 * record that it moved rather than that it was always there, so "has this client ever adopted a product
 * update" is answerable from the artifact and not only from the audit log.
 */
export function synchronise(input: {
  client: ExperienceDefinition;
  standard: ExperienceDefinition;
  comparison: Comparison;
  /** Difference ids to adopt. Omitted means every product-side and conflicting difference. */
  adopt?: readonly string[];
  actorId: string;
  now: string;
}): SyncOutcome {
  const { client, standard, comparison, actorId, now } = input;

  if (!client.derivedFrom) {
    return {
      ok: false,
      code: 'notDerived',
      detail: `“${client.id}” is not derived from a product standard, so there is nothing to synchronise it with.`,
    };
  }

  const adoptable = comparison.differences.filter((d) => d.side === 'product' || d.side === 'both');
  const chosen =
    input.adopt === undefined
      ? adoptable
      : adoptable.filter((d) => input.adopt!.includes(d.id));

  if (input.adopt !== undefined) {
    /*
      A client-side id in `adopt` is a caller error, not a no-op to absorb. It means the caller believes
      adopting it will do something — and what it would do is overwrite the client's value with the
      client's own value. Saying so is how they find out they wanted Revert.
    */
    const clientSide = input.adopt.filter((id) =>
      comparison.differences.some((d) => d.id === id && d.side === 'client'),
    );
    if (clientSide.length) {
      return {
        ok: false,
        code: 'notAdoptable',
        detail:
          `These are your own changes and are already in your experience, so there is nothing to adopt: ` +
          `${clientSide.join(', ')}. Leaving them out of the set keeps them; reverting to the standard drops them.`,
      };
    }
  }

  if (!chosen.length) {
    return {
      ok: false,
      code: 'nothingToAdopt',
      detail:
        comparison.counts.product + comparison.counts.conflicts === 0
          ? 'The product has not changed anything since this experience was derived.'
          : 'None of the changes named are ones the product made, so there is nothing to adopt.',
    };
  }

  let definition = client;
  const applied: Difference[] = [];
  const skipped: { difference: Difference; reason: string }[] = [];

  /*
    Removals before additions, and additions before edits.

    Not cosmetic. Adopting a component addition also inserts its layout node; adopting a layout change
    replaces the whole tree. Doing the layout first and the addition second would place the new widget
    into a tree that is then thrown away, so the widget would exist and never render — a page that
    validates and is missing something. Ordering by kind makes that impossible rather than unlikely.
  */
  for (const difference of [...chosen].sort(byApplicationOrder)) {
    const outcome = applyDifference(definition, standard, difference);
    if ('reason' in outcome) {
      skipped.push({ difference, reason: outcome.reason });
      continue;
    }
    definition = outcome.definition;
    applied.push(difference);
  }

  const conflictsAdopted = applied.filter((d) => d.side === 'both');
  const clientChanges = comparison.differences.filter((d) => d.side === 'client');

  /*
    THE BASELINE ADVANCES ONLY ON A FULL ADOPTION, and this was a defect before it was a rule.

    A baseline is the point both sides descend from. An experience that adopted the new chart and
    declined the new KPI has cherry-picked from v2.0 and is still *based on* v1.0 — so writing 2.0 into
    `standardVersion` after a partial sync makes the next comparison diff against a version the variant
    does not contain, and every un-adopted product change then reads as a CLIENT change. Verified against
    a live API: after adopting one of three product changes, the comparison reported "The kpi card ESG
    coverage is gone" and "The action Escalate is gone" as customisations — telling the reader they had
    deleted things they never saw, permanently.

    Leaving the baseline where it is means the notification still says v2.0 is available. That is correct:
    a partial adoption is not an adoption of v2.0.
  */
  const adoptedEverything = applied.length === adoptable.length && skipped.length === 0;

  return {
    ok: true,
    result: {
      definition: {
        ...definition,
        derivedFrom: {
          ...client.derivedFrom,
          ...(adoptedEverything
            ? {
                // A full sync is the one act in §16 that advances the baseline — which is why declining
                // an update deliberately does not.
                standardVersion: comparison.standardVersion,
                ...(standard.standard?.productRelease
                  ? { productRelease: standard.standard.productRelease }
                  : {}),
                /*
                  A decline is cleared, because adopting v2.0 answers "I do not want v2.0" the other way.
                  Only on a full adoption: a partial sync has not accepted the version, so a decline of it
                  still stands.
                */
                declinedVersion: undefined,
                declinedAt: undefined,
                declinedBy: undefined,
              }
            : {}),
          syncedAt: now,
          syncedFromVersion: comparison.baselineVersion,
          syncedBy: actorId,
        },
      } as ExperienceDefinition,
      applied,
      skipped,
      /** True when the baseline moved. False after a partial adoption, where it deliberately did not. */
      baselineMoved: adoptedEverything,
      keptCustomisations: clientChanges,
      supersededCustomisations: conflictsAdopted,
    },
  };
}

/**
 * §16.5 — **Revert to standard**.
 *
 * Takes the standard as it ships and discards every customisation. Destructive, and the one action here
 * that is: which is why it returns the count of what it drops rather than a bare definition, so a caller
 * can say what will be lost before doing it. The store's own append-only history is what makes it
 * recoverable afterwards.
 *
 * The identity stays the client's — id, name, owner. Reverting the *content* to the standard is not the
 * same as ceasing to be a client experience, and taking the standard's id would collide with the
 * standard itself and make the variant unreachable.
 */
export function revertToStandard(input: {
  client: ExperienceDefinition;
  standard: ExperienceDefinition;
  actorId: string;
  now: string;
}): SyncOutcome {
  const { client, standard, actorId, now } = input;

  if (!client.derivedFrom) {
    return {
      ok: false,
      code: 'notDerived',
      detail: `“${client.id}” is not derived from a product standard, so there is nothing to revert to.`,
    };
  }
  if (!standard.standard) {
    return {
      ok: false,
      code: 'notAdoptable',
      detail: `“${standard.id}” is not a product standard.`,
    };
  }

  return {
    ok: true,
    result: {
      definition: {
        ...standard,
        // The client's identity survives the content being replaced.
        id: client.id,
        name: client.name,
        ...(client.owner ? { owner: client.owner } : {}),
        version: client.version,
        // No longer a standard — leaving this on would make the store refuse every future save to it.
        standard: undefined,
        derivedFrom: {
          ...client.derivedFrom,
          standardVersion: standard.standard.version,
          ...(standard.standard.productRelease ? { productRelease: standard.standard.productRelease } : {}),
          syncedAt: now,
          syncedFromVersion: client.derivedFrom.standardVersion,
          syncedBy: actorId,
          declinedVersion: undefined,
          declinedAt: undefined,
          declinedBy: undefined,
        },
      } as ExperienceDefinition,
      applied: [],
      skipped: [],
      // A revert takes the standard whole, so the baseline genuinely is the standard's version.
      baselineMoved: true,
      keptCustomisations: [],
      supersededCustomisations: [],
    },
  };
}

// ── applying one difference ─────────────────────────────────────────────────

/**
 * Removals, then additions, then edits, then layout.
 *
 * Layout last because it replaces the whole tree, and an addition that inserted a node into a tree the
 * layout step then discards would leave a component that exists and never renders.
 */
const ORDER: Record<string, number> = {
  'capability-removed': 0,
  'capability-added': 1,
  'columns-changed': 2,
  'chart-changed': 2,
  'filters-changed': 2,
  'business-rules-changed': 2,
  'navigation-changed': 2,
  'layout-changed': 3,
};

function byApplicationOrder(a: Difference, b: Difference): number {
  return (ORDER[a.category] ?? 2) - (ORDER[b.category] ?? 2) || a.id.localeCompare(b.id);
}

type ApplyOutcome = { definition: ExperienceDefinition } | { reason: string };

/**
 * Copy one difference's target from the standard into the client.
 *
 * Every branch is driven by `difference.target`, which the comparison produced where it found the
 * difference — so this function never re-derives a location and cannot disagree with the comparison
 * about where something lives.
 */
function applyDifference(
  client: ExperienceDefinition,
  standard: ExperienceDefinition,
  difference: Difference,
): ApplyOutcome {
  const { target } = difference;

  switch (target.kind) {
    case 'navigation':
      return applyNavigation(client, standard, target.field);

    case 'page':
      return applyPage(client, standard, target.pageId);

    case 'component':
      return onPage(client, target.pageId, (clientPage, pageId) =>
        applyComponent(clientPage, pageAt(standard, pageId), target.memberId),
      );

    case 'componentField':
      return onPage(client, target.pageId, (clientPage, pageId) =>
        applyComponentField(clientPage, pageAt(standard, pageId), target.memberId, target.field, target.keys),
      );

    case 'action':
      return onPage(client, target.pageId, (clientPage, pageId) =>
        applyAction(clientPage, pageAt(standard, pageId), target.memberId),
      );

    case 'pageFilters':
      return onPage(client, target.pageId, (clientPage, pageId) => {
        const standardPage = pageAt(standard, pageId);
        if (!standardPage) return { reason: 'That screen is not in the new standard.' };
        return { page: { ...clientPage, filters: standardPage.filters } as PageDefinition };
      });

    case 'layout':
      return onPage(client, target.pageId, (clientPage, pageId) => {
        const standardPage = pageAt(standard, pageId);
        if (!standardPage) return { reason: 'That screen is not in the new standard.' };
        /*
          The standard's ORDER, over the client's own widgets.

          Taking the standard's tree wholesale would delete every widget the client added and resurrect
          every one they removed — silently, as a side effect of adopting a reorder. So the client's
          layout keeps its own membership and adopts the standard's relative order; widgets the client
          added stay, at the end.
        */
        return { page: { ...clientPage, layout: reorderLike(clientPage.layout, standardPage.layout) } };
      });
  }
}

function applyNavigation(
  client: ExperienceDefinition,
  standard: ExperienceDefinition,
  field: string | undefined,
): ApplyOutcome {
  if (!field) return { reason: 'No navigation member was named.' };
  const from = (standard.navigation ?? {}) as unknown as Record<string, unknown>;
  const onto = (client.navigation ?? { items: [] }) as unknown as Record<string, unknown>;
  return {
    definition: {
      ...client,
      navigation: { ...onto, [field]: from[field] },
    } as unknown as ExperienceDefinition,
  };
}

function applyPage(
  client: ExperienceDefinition,
  standard: ExperienceDefinition,
  pageId: string | undefined,
): ApplyOutcome {
  if (!pageId) return { reason: 'No screen was named.' };
  const standardPage = pageAt(standard, pageId);
  const pages = { ...(client.pages ?? {}) } as Record<string, unknown>;

  if (standardPage) {
    pages[pageId] = standardPage;
  } else {
    // Adopting a removal. Deleting rather than blanking, so the navigation and the page list agree.
    delete pages[pageId];
  }
  return { definition: { ...client, pages } as ExperienceDefinition };
}

function applyComponent(
  clientPage: PageDefinition,
  standardPage: PageDefinition | undefined,
  memberId: string | undefined,
): { page: PageDefinition } | { reason: string } {
  if (!memberId) return { reason: 'No widget was named.' };
  const components = { ...(clientPage.components ?? {}) } as Record<string, ComponentInstance>;
  const incoming = standardPage?.components?.[memberId];

  if (!incoming) {
    // A removal. The layout node goes with it: a widget node pointing at nothing is a render error.
    delete components[memberId];
    return {
      page: {
        ...clientPage,
        components,
        layout: withoutWidget(clientPage.layout, memberId),
      } as PageDefinition,
    };
  }

  components[memberId] = incoming;
  /*
    An addition has to reach the LAYOUT too, or the component exists and never renders.

    The comparison deliberately reports no layout change for an added widget — otherwise every addition
    in every release would produce a spurious reorder row — which means the placement is this function's
    job and nobody else's. Placed where the standard places it relative to widgets the client also has,
    so an insert lands in the middle rather than always at the end.
  */
  return {
    page: {
      ...clientPage,
      components,
      layout: withWidget(clientPage.layout, standardPage!.layout, memberId),
    } as PageDefinition,
  };
}

function applyComponentField(
  clientPage: PageDefinition,
  standardPage: PageDefinition | undefined,
  memberId: string | undefined,
  field: string | undefined,
  keys: readonly string[] | undefined,
): { page: PageDefinition } | { reason: string } {
  if (!memberId || !field) return { reason: 'No widget field was named.' };
  const clientComponent = clientPage.components?.[memberId];
  const standardComponent = standardPage?.components?.[memberId];
  if (!clientComponent) return { reason: 'That widget is not on your version of the screen.' };
  if (!standardComponent) return { reason: 'That widget is not in the new standard.' };

  const current = clientComponent as unknown as Record<string, unknown>;
  const incoming = standardComponent as unknown as Record<string, unknown>;

  let value: unknown;
  if (keys?.length) {
    /*
      Only the named keys. `config` is one object holding independent settings, so copying it wholesale
      to adopt the product's `mark` would also take its `density` — including over a density the client
      had deliberately changed, and without that appearing anywhere as an adopted difference.
    */
    const merged = { ...((current[field] ?? {}) as Record<string, unknown>) };
    for (const key of keys) {
      const from = (incoming[field] ?? {}) as Record<string, unknown>;
      if (key in from) merged[key] = from[key];
      else delete merged[key];
    }
    value = merged;
  } else {
    value = incoming[field];
  }

  const components = {
    ...(clientPage.components ?? {}),
    [memberId]: { ...clientComponent, [field]: value } as ComponentInstance,
  };
  return { page: { ...clientPage, components } as PageDefinition };
}

function applyAction(
  clientPage: PageDefinition,
  standardPage: PageDefinition | undefined,
  memberId: string | undefined,
): { page: PageDefinition } | { reason: string } {
  if (!memberId) return { reason: 'No action was named.' };
  const actions = { ...(clientPage.actions ?? {}) } as Record<string, unknown>;
  const incoming = standardPage?.actions?.[memberId];
  if (incoming) actions[memberId] = incoming;
  else delete actions[memberId];
  return { page: { ...clientPage, actions } as PageDefinition };
}

/** Run a page-level edit, keeping the experience shape and reporting a missing page rather than throwing. */
function onPage(
  client: ExperienceDefinition,
  pageId: string | undefined,
  edit: (page: PageDefinition, pageId: string) => { page: PageDefinition } | { reason: string },
): ApplyOutcome {
  if (!pageId) return { reason: 'No screen was named.' };
  const page = pageAt(client, pageId);
  if (!page) return { reason: 'That screen is not on your version of this experience.' };

  const outcome = edit(page, pageId);
  if ('reason' in outcome) return outcome;
  return {
    definition: {
      ...client,
      pages: { ...(client.pages ?? {}), [pageId]: outcome.page },
    } as ExperienceDefinition,
  };
}

function pageAt(definition: ExperienceDefinition, pageId: string): PageDefinition | undefined {
  const page = definition.pages?.[pageId];
  return page && !('$pageRef' in page) ? (page as PageDefinition) : undefined;
}

// ── layout surgery ──────────────────────────────────────────────────────────

/**
 * The standard's relative order, over the client's own membership.
 *
 * Adopting a reorder must not change *which* widgets are on the page. Taking the standard's tree
 * wholesale would delete every widget the client added and resurrect every one they removed — as a
 * silent side effect of adopting a reorder, which is the kind of loss §16.5 exists to avoid. So widgets
 * the standard also has take the standard's order, and widgets only the client has keep their relative
 * order after them.
 */
function reorderLike(clientLayout: LayoutNode, standardLayout: LayoutNode): LayoutNode {
  const standardOrder = widgetOrder(standardLayout);
  const nodes = widgetNodes(clientLayout);

  const known = nodes
    .filter((node) => standardOrder.includes(node.component))
    .sort((a, b) => standardOrder.indexOf(a.component) - standardOrder.indexOf(b.component));
  const extra = nodes.filter((node) => !standardOrder.includes(node.component));

  return replaceWidgets(clientLayout, [...known, ...extra].map((n) => n.node));
}

interface WidgetRef {
  component: string;
  node: LayoutNode;
}

function widgetNodes(node: LayoutNode | undefined): WidgetRef[] {
  const out: WidgetRef[] = [];
  const walk = (current: unknown): void => {
    if (!current || typeof current !== 'object') return;
    const candidate = current as { kind?: string; component?: string; container?: Record<string, unknown> };
    if (candidate.kind === 'widget' && candidate.component) {
      out.push({ component: candidate.component, node: current as LayoutNode });
      return;
    }
    for (const value of Object.values(candidate.container ?? {})) {
      if (Array.isArray(value)) value.forEach(walk);
    }
  };
  walk(node);
  return out;
}

function widgetOrder(node: LayoutNode | undefined): string[] {
  return widgetNodes(node).map((w) => w.component);
}

/**
 * Rewrite a layout to hold exactly `widgets`, in order, flattened into the root container.
 *
 * Flattening is a real cost and it is named: a page whose widgets sat in three panels comes back with
 * them in one. It is the honest limit of adopting a reorder across two trees that may not have the same
 * shape — reconciling nested containers is a larger piece of work, and guessing at it would move
 * widgets into sections nobody asked about. Recorded in `STANDARD-LIFECYCLE.md`.
 */
function replaceWidgets(layout: LayoutNode, widgets: readonly LayoutNode[]): LayoutNode {
  const root = layout as unknown as { kind?: string; id?: string; container?: Record<string, unknown> };
  if (root.kind !== 'container' || !root.container) return layout;

  const listKey = Object.entries(root.container).find(([, value]) => Array.isArray(value))?.[0];
  if (!listKey) return layout;

  return {
    ...(layout as object),
    container: { ...root.container, [listKey]: widgets },
  } as unknown as LayoutNode;
}

function withoutWidget(layout: LayoutNode, componentId: string): LayoutNode {
  const remaining = widgetNodes(layout)
    .filter((w) => w.component !== componentId)
    .map((w) => w.node);
  return replaceWidgets(layout, remaining);
}

/**
 * Insert a widget where the standard puts it, relative to widgets the client also has.
 *
 * Appending would be simpler and would put every adopted KPI at the bottom of the page, under the grid
 * — technically present and visibly wrong. Anchoring on the nearest preceding shared widget lands it in
 * the section the product intended.
 */
function withWidget(
  clientLayout: LayoutNode,
  standardLayout: LayoutNode,
  componentId: string,
): LayoutNode {
  const existing = widgetNodes(clientLayout);
  if (existing.some((w) => w.component === componentId)) return clientLayout;

  const standardNodes = widgetNodes(standardLayout);
  const incoming = standardNodes.find((w) => w.component === componentId);
  if (!incoming) return clientLayout;

  const standardOrder = standardNodes.map((w) => w.component);
  const position = standardOrder.indexOf(componentId);
  // The nearest widget before it in the standard that the client also has — the anchor.
  let index = existing.length;
  for (let i = position - 1; i >= 0; i--) {
    const found = existing.findIndex((w) => w.component === standardOrder[i]);
    if (found >= 0) {
      index = found + 1;
      break;
    }
    if (i === 0) index = 0;
  }

  const nodes = existing.map((w) => w.node);
  nodes.splice(index, 0, incoming.node);
  return replaceWidgets(clientLayout, nodes);
}
