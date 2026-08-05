/**
 * Turning a component's JSON Schema into inspector fields.
 *
 * THE INSPECTOR IS GENERATED, NOT HAND-BUILT PER COMPONENT
 * (architecture/frontend-architecture.md §3.3). Hand-built inspectors are the reason low-code
 * platforms stop adding components: every new component needs a form, the forms drift from the
 * schemas they claim to edit, and validation says one thing while the UI allows another.
 *
 * The manifest's `properties` is already a JSON Schema validated at level 2, so it is the only
 * description of a component's configuration that exists — and therefore the only one an
 * editor should read.
 *
 * WHAT IS DELIBERATELY NOT SUPPORTED. Nested objects and arrays of objects fall through to a
 * raw JSON field rather than a generated sub-form. A generated form for arbitrary nesting is a
 * large amount of UI that produces a worse editing experience than a text area for the handful
 * of properties that need it. The fallback is honest and never blocks the author.
 */

import type { ComponentManifest } from '@opus/contracts';

export type FieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'json';

export interface PropertyField {
  key: string;
  label: string;
  kind: FieldKind;
  description?: string;
  /** Options for a select, in schema order. */
  options?: readonly { value: string; label: string }[];
  default?: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Whether the schema requires it — surfaced so a missing required value is visible. */
  required: boolean;
}

interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  description?: string;
  title?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: unknown;
  [key: string]: unknown;
}

/** `camelCase` and `kebab-case` both become "Title Case" — ids are for machines, labels for people. */
export function humanize(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldFor(key: string, schema: JsonSchema, required: boolean): PropertyField {
  const label = schema.title ? String(schema.title) : humanize(key);
  const base = {
    key,
    label,
    description: schema.description,
    default: schema.default,
    required,
  };

  if (Array.isArray(schema.enum) && schema.enum.length) {
    return {
      ...base,
      kind: 'select',
      options: schema.enum.map((value) => ({ value: String(value), label: humanize(String(value)) })),
    };
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  switch (type) {
    case 'boolean':
      return { ...base, kind: 'boolean' };
    case 'integer':
    case 'number':
      return { ...base, kind: 'number', min: schema.minimum, max: schema.maximum };
    case 'string':
      // A long free-text property wants room; a short one wants a single line.
      return {
        ...base,
        kind: (schema.maxLength ?? 0) > 120 ? 'textarea' : 'text',
        maxLength: schema.maxLength,
      };
    default:
      return { ...base, kind: 'json' };
  }
}

/** Inspector fields for a component's `config`, in schema declaration order. */
export function fieldsForManifest(manifest: ComponentManifest): PropertyField[] {
  const schema = manifest.properties as JsonSchema;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return Object.entries(properties).map(([key, property]) =>
    fieldFor(key, property ?? {}, required.has(key)),
  );
}

/**
 * Order the fields so the ones that matter come first.
 *
 * `generation.keyProperties` already names the properties that most change what a component
 * does — it exists so the AI is told which options matter. The same judgement serves a human
 * author, so the manifest is read once and used twice rather than the ordering being restated.
 */
export function orderedFieldsForManifest(manifest: ComponentManifest): PropertyField[] {
  const fields = fieldsForManifest(manifest);
  const key = manifest.generation.keyProperties ?? [];
  if (!key.length) return fields;
  const rank = (field: PropertyField) => {
    const index = key.indexOf(field.key);
    return index === -1 ? key.length : index;
  };
  return [...fields].sort((a, b) => rank(a) - rank(b));
}

/** Coerce an input element's string value to the type the schema declares. */
export function coerceFieldValue(field: PropertyField, raw: string | boolean): unknown {
  if (field.kind === 'boolean') return Boolean(raw);
  if (raw === '') return undefined;
  if (field.kind === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  if (field.kind === 'json') {
    try {
      return JSON.parse(String(raw));
    } catch {
      // Undefined means "leave it alone" — a half-typed JSON value must not clear the property.
      return undefined;
    }
  }
  return String(raw);
}
