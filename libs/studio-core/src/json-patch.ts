/**
 * JSON Patch (RFC 6902) over page definitions, with exact inversion.
 *
 * This is the mechanism the whole editor rests on
 * (architecture/frontend-architecture.md §4.3): dragging a widget, editing a property and
 * "make the chart a bar chart" are the same kind of operation, differing only in who produced
 * the patch. That equivalence is only real if patches are applied and inverted rigorously, so
 * this module is small, pure and heavily tested rather than convenient.
 *
 * THREE PROPERTIES, each load-bearing:
 *
 *  1. APPLICATION NEVER MUTATES ITS INPUT. Undo holds references to prior documents, and the
 *     renderer memoizes on identity. In-place mutation would corrupt history and hide changes
 *     from change detection at the same time.
 *
 *  2. INVERSION IS COMPUTED AGAINST THE PRE-STATE, OP BY OP. A patch's second operation must
 *     be inverted against the document as the first operation left it, not against the
 *     original. Inverting the whole list against the original document is the classic bug
 *     here, and it only shows up on multi-op patches — which is every structural edit, since
 *     removing a widget also removes its component and possibly its data source.
 *
 *  3. `add` IS NOT ALWAYS AN INSERT. On an object member that already exists it behaves as a
 *     replace, so its inverse is a `replace` with the old value rather than a `remove`.
 *     Getting this wrong deletes a property that undo was supposed to restore.
 */

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string };

export class PatchError extends Error {
  constructor(
    message: string,
    readonly op: PatchOp,
  ) {
    super(message);
    this.name = 'PatchError';
  }
}

// ── JSON Pointer (RFC 6901) ──────────────────────────────────────────────────────────

/** Decode a pointer into segments. `~1` is `/` and `~0` is `~`, in that order. */
export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new Error(`JSON Pointer must be empty or start with "/": "${pointer}"`);
  }
  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Encode a segment for use in a pointer. `~` before `/`, or the escapes corrupt each other. */
export function encodeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function pointer(...segments: readonly (string | number)[]): string {
  return segments.map((s) => `/${encodeSegment(String(s))}`).join('');
}

/** Read a pointer. Returns undefined for any unreachable path rather than throwing. */
export function getAtPointer(document: unknown, path: string): unknown {
  let current: unknown = document;
  for (const segment of parsePointer(path)) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

export function hasPointer(document: unknown, path: string): boolean {
  const segments = parsePointer(path);
  if (!segments.length) return true;
  const parent = getAtPointer(document, pointerOfSegments(segments.slice(0, -1)));
  const last = segments.at(-1)!;
  if (parent === null || typeof parent !== 'object') return false;
  if (Array.isArray(parent)) {
    const index = Number(last);
    return Number.isInteger(index) && index >= 0 && index < parent.length;
  }
  return Object.prototype.hasOwnProperty.call(parent, last);
}

function pointerOfSegments(segments: readonly string[]): string {
  return segments.map((s) => `/${encodeSegment(s)}`).join('');
}

// ── application ──────────────────────────────────────────────────────────────────────

/**
 * Shallow-clone along the path only.
 *
 * Untouched subtrees keep their identity, which is what lets the renderer's memoization and
 * `OnPush` inputs skip work on the parts of a page an edit did not affect — a definition is
 * large and an edit is small.
 */
function cloneAlong(
  document: unknown,
  segments: readonly string[],
): { root: unknown; parent: unknown } {
  const rootIsArray = Array.isArray(document);
  const root: unknown =
    document === null || typeof document !== 'object'
      ? document
      : rootIsArray
        ? [...(document as unknown[])]
        : { ...(document as Record<string, unknown>) };

  let parent = root;
  for (const segment of segments) {
    if (parent === null || typeof parent !== 'object') {
      throw new Error(`Path segment "${segment}" traverses a non-object`);
    }
    const container = parent as Record<string, unknown> | unknown[];
    const key = Array.isArray(container) ? Number(segment) : segment;
    const child = (container as Record<string | number, unknown>)[key];
    if (child === null || typeof child !== 'object') {
      throw new Error(`Path segment "${segment}" traverses a non-object`);
    }
    const copy: unknown = Array.isArray(child)
      ? [...(child as unknown[])]
      : { ...(child as Record<string, unknown>) };
    (container as Record<string | number, unknown>)[key] = copy;
    parent = copy;
  }

  return { root, parent };
}

function applyOne<T>(document: T, op: PatchOp): T {
  const path = op.op === 'move' ? op.path : op.path;
  const segments = parsePointer(path);

  if (!segments.length) {
    if (op.op === 'replace' || op.op === 'add') return op.value as T;
    throw new PatchError('Cannot remove or move the document root', op);
  }

  // `move` is a remove followed by an add of the removed value. Expressing it that way keeps
  // one implementation of each primitive, and index shifting correct by construction.
  if (op.op === 'move') {
    const value = getAtPointer(document, op.from);
    if (value === undefined && !hasPointer(document, op.from)) {
      throw new PatchError(`move source "${op.from}" does not exist`, op);
    }
    const removed = applyOne(document, { op: 'remove', path: op.from });
    return applyOne(removed, { op: 'add', path: op.path, value });
  }

  const parentSegments = segments.slice(0, -1);
  const last = segments.at(-1)!;
  const { root, parent } = cloneAlong(document, parentSegments);

  if (parent === null || typeof parent !== 'object') {
    throw new PatchError(`Parent of "${path}" is not a container`, op);
  }

  if (Array.isArray(parent)) {
    const array = parent as unknown[];
    if (op.op === 'add') {
      const index = last === '-' ? array.length : Number(last);
      if (!Number.isInteger(index) || index < 0 || index > array.length) {
        throw new PatchError(`Array index "${last}" out of range for add`, op);
      }
      array.splice(index, 0, op.value);
      return root as T;
    }
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0 || index >= array.length) {
      throw new PatchError(`Array index "${last}" out of range`, op);
    }
    if (op.op === 'remove') array.splice(index, 1);
    else array[index] = op.value;
    return root as T;
  }

  const object = parent as Record<string, unknown>;
  if (op.op === 'remove') {
    if (!Object.prototype.hasOwnProperty.call(object, last)) {
      throw new PatchError(`Cannot remove "${path}": it does not exist`, op);
    }
    delete object[last];
    return root as T;
  }
  if (op.op === 'replace' && !Object.prototype.hasOwnProperty.call(object, last)) {
    throw new PatchError(`Cannot replace "${path}": it does not exist`, op);
  }
  object[last] = op.value;
  return root as T;
}

/** Apply a patch, returning a new document. Throws on the first inapplicable operation. */
export function applyPatch<T>(document: T, ops: readonly PatchOp[]): T {
  let current = document;
  for (const op of ops) current = applyOne(current, op);
  return current;
}

// ── inversion ────────────────────────────────────────────────────────────────────────

function invertOne(document: unknown, op: PatchOp): PatchOp[] {
  switch (op.op) {
    case 'add': {
      const segments = parsePointer(op.path);
      const parent = getAtPointer(document, pointerOfSegments(segments.slice(0, -1)));
      const last = segments.at(-1);
      // Adding to an object member that already exists REPLACES it, so its inverse must
      // restore the old value rather than delete the member.
      if (
        last !== undefined &&
        last !== '-' &&
        parent !== null &&
        typeof parent === 'object' &&
        !Array.isArray(parent) &&
        Object.prototype.hasOwnProperty.call(parent, last)
      ) {
        return [{ op: 'replace', path: op.path, value: (parent as Record<string, unknown>)[last] }];
      }
      // An append lands at the end, so its inverse must name that index explicitly.
      if (last === '-' && Array.isArray(parent)) {
        return [{ op: 'remove', path: pointerOfSegments([...segments.slice(0, -1), String(parent.length)]) }];
      }
      return [{ op: 'remove', path: op.path }];
    }
    case 'remove':
      return [{ op: 'add', path: op.path, value: getAtPointer(document, op.path) }];
    case 'replace':
      return [{ op: 'replace', path: op.path, value: getAtPointer(document, op.path) }];
    case 'move':
      // Inverted as its primitives, for the same reason it is applied as its primitives.
      return [
        { op: 'remove', path: op.path },
        { op: 'add', path: op.from, value: getAtPointer(document, op.from) },
      ];
  }
}

/**
 * The inverse of `ops` against `document`.
 *
 * Each operation is inverted against the document *as the preceding operations left it*, and
 * the resulting list is reversed. Inverting every operation against the original document is
 * the standard mistake, and it is invisible on single-op patches.
 */
export function invertPatch<T>(document: T, ops: readonly PatchOp[]): PatchOp[] {
  const inverses: PatchOp[][] = [];
  let current: unknown = document;
  for (const op of ops) {
    inverses.push(invertOne(current, op));
    current = applyOne(current, op);
  }
  return inverses.reverse().flat();
}

/** One-line summary of a patch, for the history panel and the diff view. */
export function describeOp(op: PatchOp): string {
  switch (op.op) {
    case 'add':
      return `add ${op.path}`;
    case 'remove':
      return `remove ${op.path}`;
    case 'replace':
      return `set ${op.path}`;
    case 'move':
      return `move ${op.from} → ${op.path}`;
  }
}
