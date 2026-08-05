/**
 * @opus/validator — the shared metadata validator.
 *
 * Loaded lazily by the runtime page loader so ajv and the schema set land in a
 * separate chunk. In production, level-1 validation of a *published* definition is
 * a server-side concern and the Viewer trusts what the Definition Service returns;
 * M1 has no server, so validating client-side is what makes the loader honest.
 */

export { validatePage, type PageValidationOptions } from './validate-page';
export {
  LEVELS_REQUIRING_SERVER,
  summarize,
  type Severity,
  type ValidationFinding,
  type ValidationLevel,
  type ValidationReport,
} from './types';
export { ALL_SCHEMAS, compileSubSchema, validatorFor } from './schema-registry';
