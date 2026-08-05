/**
 * Draft persistence, and the page list the editor selects from.
 *
 * STANDING IN FOR THE DEFINITION SERVICE (backend-architecture.md §4.2), which does not exist
 * yet. Two properties of the real design are reproduced because they are the ones that shape
 * the editor's behaviour:
 *
 *  1. A DRAFT IS MUTABLE; A PUBLISHED VERSION IS NOT. Saving edits a draft in place. Nothing
 *     here can alter a published artifact, because publication in the real design appends an
 *     immutable version rather than overwriting one (`versioning.schema.json`).
 *
 *  2. THE STORED ARTIFACT IS THE DEFINITION, UNCHANGED. What is written is exactly what the
 *     runtime loads — no editor envelope, no sidecar of positions or selections. Anything the
 *     editor needed that the definition could not express would be a second model, so the fact
 *     that this serializer is `JSON.stringify` is a design assertion, not a shortcut.
 *
 * What it cannot reproduce: version history, concurrent editors, and server-side validation
 * before write. Those need the service.
 */

import { Injectable, signal } from '@angular/core';
import type { ExperienceDefinition, NavItem, PageDefinition } from '@opus/contracts';

const STORAGE_PREFIX = 'opus.studio.draft.';

export interface PageListing {
  id: string;
  name: string;
  /** Where the definition comes from when nothing has been saved for it. */
  sourceUrl?: string;
  origin: 'experience' | 'draft' | 'generated';
  lifecycleState?: string;
  hasDraft: boolean;
  savedAt?: string;
  widgetCount?: number;
}

@Injectable({ providedIn: 'root' })
export class DraftStore {
  readonly listings = signal<readonly PageListing[]>([]);

  /**
   * Build the page list from an experience, marking which pages have local drafts.
   *
   * Pages are discovered from the experience definition rather than from a hardcoded list, so
   * adding a page to the experience makes it appear in the editor with no editor change — the
   * same metadata-driven property the runtime has.
   */
  async loadListings(experience: ExperienceDefinition, definitionsBase: string): Promise<void> {
    const listings: PageListing[] = [];

    for (const [id, entry] of Object.entries(experience.pages)) {
      const draft = this.readDraft(id);
      const ref = (entry as { $pageRef?: string }).$pageRef;
      listings.push({
        id,
        name: draft ? nameOf(draft) : (labelFromExperience(experience, id) ?? id),
        sourceUrl: ref ? `${definitionsBase}/${ref}` : undefined,
        origin: 'experience',
        lifecycleState: draft?.version?.lifecycleState,
        hasDraft: draft !== null,
        savedAt: this.readSavedAt(id),
        widgetCount: draft ? Object.keys(draft.components).length : undefined,
      });
    }

    // Drafts with no experience entry — a generated page, or one created in the editor. They
    // are editable and savable; they are simply not part of the published experience yet.
    for (const id of this.draftIds()) {
      if (listings.some((listing) => listing.id === id)) continue;
      const draft = this.readDraft(id);
      if (!draft) continue;
      listings.push({
        id,
        name: nameOf(draft),
        origin: draft.version?.provenance?.origin?.startsWith('ai') ? 'generated' : 'draft',
        lifecycleState: draft.version?.lifecycleState,
        hasDraft: true,
        savedAt: this.readSavedAt(id),
        widgetCount: Object.keys(draft.components).length,
      });
    }

    this.listings.set(listings.sort((a, b) => a.name.localeCompare(b.name)));
  }

  /** The draft if one exists, otherwise the published definition fetched from its source. */
  async resolve(listing: PageListing): Promise<PageDefinition | null> {
    const draft = this.readDraft(listing.id);
    if (draft) return draft;
    if (!listing.sourceUrl) return null;
    const response = await fetch(listing.sourceUrl);
    if (!response.ok) return null;
    return (await response.json()) as PageDefinition;
  }

  /**
   * Save a draft.
   *
   * The saved artifact is marked `draft` and mutable. An editor that wrote `published` would be
   * claiming a governance state it has no authority to grant: publication is a reviewed act
   * with separation of duties (security-architecture.md §5), not a consequence of pressing save.
   */
  save(pageId: string, definition: PageDefinition): { ok: boolean; problem?: string } {
    const stamped: PageDefinition = {
      ...definition,
      version: {
        ...definition.version,
        lifecycleState: 'draft',
        immutable: false,
        audit: {
          ...(definition.version.audit ?? {}),
          modifiedAt: new Date().toISOString(),
        },
      },
    };
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${pageId}`, JSON.stringify(stamped));
      localStorage.setItem(`${STORAGE_PREFIX}${pageId}.savedAt`, new Date().toISOString());
      return { ok: true };
    } catch (error) {
      // A quota failure must surface: silently losing a save is the worst outcome an editor has.
      return {
        ok: false,
        problem: `Could not save the draft: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  discard(pageId: string): void {
    localStorage.removeItem(`${STORAGE_PREFIX}${pageId}`);
    localStorage.removeItem(`${STORAGE_PREFIX}${pageId}.savedAt`);
  }

  readDraft(pageId: string): PageDefinition | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${pageId}`);
      return raw ? (JSON.parse(raw) as PageDefinition) : null;
    } catch {
      // A corrupt draft must not make the editor unopenable.
      return null;
    }
  }

  readSavedAt(pageId: string): string | undefined {
    return localStorage.getItem(`${STORAGE_PREFIX}${pageId}.savedAt`) ?? undefined;
  }

  private draftIds(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX) || key.endsWith('.savedAt')) continue;
      ids.push(key.slice(STORAGE_PREFIX.length));
    }
    return ids;
  }
}

function nameOf(definition: PageDefinition): string {
  const name = definition.name;
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object' && 'default' in name) {
    return String((name as { default?: unknown }).default ?? definition.id);
  }
  return definition.id;
}

/**
 * The navigation label for a page, if the experience gives it one.
 *
 * Navigation is a tree of groups, and only a `page` item names a page, so this walks rather
 * than scanning the top level — a page nested inside a group would otherwise fall back to its
 * raw id in the page picker.
 */
function labelFromExperience(experience: ExperienceDefinition, pageId: string): string | undefined {
  const find = (items: readonly NavItem[]): NavItem | undefined => {
    for (const item of items) {
      if (item.kind === 'page' && item.page === pageId) return item;
      if (item.kind === 'group') {
        const nested = find(item.children);
        if (nested) return nested;
      }
    }
    return undefined;
  };

  const item = find(experience.navigation?.items ?? []);
  if (!item) return undefined;
  const label = item.label;
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object' && 'default' in label) {
    return String((label as { default?: unknown }).default ?? '');
  }
  return undefined;
}
