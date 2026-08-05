/**
 * Value formatting. Locale, currency and timezone come from runtime context;
 * only overrides live in a FormatSpec, so a definition never hardcodes a locale.
 */

import type { DataRow, FormatSpec } from '@opus/contracts';

export interface FormatContext {
  locale: string;
  timezone: string;
  /** Fallback currency when a spec provides neither currencyCode nor currencyFrom. */
  baseCurrency: string;
}

const DEFAULT_NULL_DISPLAY = '—';

function abbreviateNumber(value: number, locale: string, decimals: number): string {
  const abs = Math.abs(value);
  const units: readonly [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [factor, suffix] of units) {
    if (abs >= factor) {
      const scaled = value / factor;
      return (
        scaled.toLocaleString(locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: Math.max(decimals, 1),
        }) + suffix
      );
    }
  }
  return value.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    // A date-only string is a calendar date, not an instant. Parsing it as UTC and
    // then rendering in a western timezone would show the previous day.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}

function formatDuration(hours: number, locale: string): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes.toLocaleString(locale)}m`;
  }
  if (hours < 48) {
    return `${(Math.round(hours * 10) / 10).toLocaleString(locale)}h`;
  }
  return `${Math.round(hours / 24).toLocaleString(locale)}d`;
}

/**
 * Format one value. Returns the null display for absent values, so a component
 * never has to decide what "no value" looks like.
 */
export function formatValue(
  value: unknown,
  spec: FormatSpec | undefined,
  ctx: FormatContext,
  row?: DataRow,
): string {
  const nullDisplay = spec?.nullDisplay ?? DEFAULT_NULL_DISPLAY;
  if (value === null || value === undefined || value === '') return nullDisplay;

  const style = spec?.style ?? inferStyle(value);
  const decimals = spec?.decimals;
  const prefix = spec?.prefix ?? '';
  const suffix = spec?.suffix ?? '';

  const wrap = (s: string) => `${prefix}${s}${suffix}`;

  switch (style) {
    case 'integer': {
      const n = toNumber(value);
      if (n === null) return nullDisplay;
      if (spec?.abbreviate) return wrap(abbreviateNumber(n, ctx.locale, decimals ?? 1));
      return wrap(
        n.toLocaleString(ctx.locale, {
          maximumFractionDigits: 0,
          useGrouping: spec?.thousandsSeparator ?? true,
        }),
      );
    }

    case 'number':
    case 'decimal': {
      const n = toNumber(value);
      if (n === null) return nullDisplay;
      if (spec?.abbreviate) return wrap(abbreviateNumber(n, ctx.locale, decimals ?? 1));
      return wrap(
        n.toLocaleString(ctx.locale, {
          minimumFractionDigits: decimals ?? 0,
          maximumFractionDigits: decimals ?? 2,
          useGrouping: spec?.thousandsSeparator ?? true,
        }),
      );
    }

    case 'currency': {
      const n = toNumber(value);
      if (n === null) return nullDisplay;
      const fromField = spec?.currencyFrom;
      const rowCurrency =
        fromField && row ? (row[fromField] as string | undefined) : undefined;
      const currency = spec?.currencyCode ?? rowCurrency ?? ctx.baseCurrency;
      if (spec?.abbreviate) {
        return wrap(`${currencySymbol(currency, ctx.locale)}${abbreviateNumber(n, ctx.locale, decimals ?? 1)}`);
      }
      try {
        return wrap(
          n.toLocaleString(ctx.locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: decimals ?? 2,
            maximumFractionDigits: decimals ?? 2,
          }),
        );
      } catch {
        return wrap(`${currency} ${n.toLocaleString(ctx.locale)}`);
      }
    }

    case 'percent': {
      const n = toNumber(value);
      if (n === null) return nullDisplay;
      // Percentage values in EDM are stored as percentages, not fractions.
      return wrap(
        `${n.toLocaleString(ctx.locale, {
          minimumFractionDigits: decimals ?? 0,
          maximumFractionDigits: decimals ?? 2,
        })}%`,
      );
    }

    case 'date': {
      const d = asDate(value);
      if (!d) return nullDisplay;
      const isCalendarDate = typeof value === 'string' && ISO_DATE.test(value);
      return wrap(
        d.toLocaleDateString(ctx.locale, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          // A calendar date has no timezone; applying one would shift the day.
          ...(isCalendarDate ? {} : { timeZone: spec?.timezone ?? ctx.timezone }),
        }),
      );
    }

    case 'datetime': {
      const d = asDate(value);
      if (!d) return nullDisplay;
      return wrap(
        d.toLocaleString(ctx.locale, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: spec?.timezone ?? ctx.timezone,
        }),
      );
    }

    case 'time': {
      const d = asDate(value);
      if (!d) return nullDisplay;
      return wrap(
        d.toLocaleTimeString(ctx.locale, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: spec?.timezone ?? ctx.timezone,
        }),
      );
    }

    case 'duration': {
      const n = toNumber(value);
      return n === null ? nullDisplay : wrap(formatDuration(n, ctx.locale));
    }

    case 'boolean':
      return wrap(value ? 'Yes' : 'No');

    case 'code':
    case 'text':
    default:
      return wrap(String(value));
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * Style for a value with no declared format.
 *
 * ISO date and datetime strings format as dates rather than as raw text: EDM date
 * columns arrive as strings, and showing "2026-08-04" where a reader expects a date
 * is a defect the author has to notice and correct on every binding. Defaulting
 * correctly here means a generated page is readable without the generator having to
 * emit a format spec for every field.
 */
function inferStyle(value: unknown): FormatSpec['style'] {
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'datetime';
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) return 'date';
    if (ISO_DATETIME.test(value)) return 'datetime';
  }
  return 'text';
}

function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = (0)
      .toLocaleString(locale, { style: 'currency', currency, minimumFractionDigits: 0 })
      .replace(/[\d\s.,]/g, '');
    return parts || `${currency} `;
  } catch {
    return `${currency} `;
  }
}

/** Resolve which threshold band a numeric value falls into. */
export function resolveThreshold<T extends { from?: number | null; to?: number | null }>(
  value: unknown,
  thresholds: readonly T[] | undefined,
): T | undefined {
  const n = toNumber(value);
  if (n === null || !thresholds?.length) return undefined;
  return thresholds.find((t) => {
    const aboveFrom = t.from === null || t.from === undefined || n >= t.from;
    const belowTo = t.to === null || t.to === undefined || n <= t.to;
    return aboveFrom && belowTo;
  });
}
