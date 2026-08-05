/**
 * Example prompts offered in the Create screen.
 *
 * They are chosen to show the range of outcomes rather than only the happy path, because a demo that
 * only ever succeeds hides the behaviour that makes the system trustworthy: it declines what it
 * cannot do, asks when a request is empty, and repairs its own mistakes.
 */

export interface ExamplePrompt {
  label: string;
  prompt: string;
  /** What this one demonstrates, shown as a hint. */
  demonstrates: string;
  icon: string;
}

export const EXAMPLE_PROMPTS: readonly ExamplePrompt[] = [
  {
    label: 'Operations dashboard',
    icon: 'dashboard',
    prompt:
      'Create a Security Master Operations Dashboard showing today’s files processed, late files, exceptions, new securities, and processing KPIs.',
    demonstrates: 'The full path: four KPIs, a trend, a queue table, bound to three entities.',
  },
  {
    label: 'Exception queue',
    icon: 'rule',
    prompt: 'Show me open data quality exceptions by severity and rule, with the oldest breaks first.',
    demonstrates: 'A breakdown plus a sorted list — a different template from the same catalog.',
  },
  {
    label: 'Securities overview',
    icon: 'account_balance',
    prompt: 'Build a page listing securities with their asset class, currency and review status.',
    demonstrates: 'A list-first page: no measures requested, so no KPI row is invented.',
  },
  {
    label: 'Vague request',
    icon: 'help_outline',
    prompt: 'Make me something nice',
    demonstrates: 'Asks one clarifying question instead of guessing confidently.',
  },
  {
    label: 'Out of scope',
    icon: 'block',
    prompt: 'Delete last month’s pricing data',
    demonstrates: 'Declines plainly. Generation authors experiences; it does not act on data.',
  },
  {
    label: 'Unavailable data',
    icon: 'lock',
    prompt: 'Show me client profit and loss by desk',
    demonstrates:
      'Honest refusal: nothing in the catalog matches, or nothing you may see. It never says which.',
  },
];
