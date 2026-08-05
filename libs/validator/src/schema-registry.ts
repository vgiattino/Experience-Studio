/**
 * Ajv instance with every metadata schema registered.
 *
 * Relative `$ref`s in the schema set resolve against each file's `$id`, so adding
 * all of them to one Ajv instance is enough — there is no resolver to configure.
 */

import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import common from '@opus/schemas/common.schema.json';
import attribute from '@opus/schemas/attribute.schema.json';
import entity from '@opus/schemas/entity.schema.json';
import relationship from '@opus/schemas/relationship.schema.json';
import catalog from '@opus/schemas/catalog.schema.json';
import dataSource from '@opus/schemas/data-source.schema.json';
import binding from '@opus/schemas/binding.schema.json';
import componentManifest from '@opus/schemas/component-manifest.schema.json';
import componentInstance from '@opus/schemas/component-instance.schema.json';
import layout from '@opus/schemas/layout.schema.json';
import action from '@opus/schemas/action.schema.json';
import navigation from '@opus/schemas/navigation.schema.json';
import security from '@opus/schemas/security.schema.json';
import versioning from '@opus/schemas/versioning.schema.json';
import pageDefinition from '@opus/schemas/page-definition.schema.json';
import experience from '@opus/schemas/experience.schema.json';

export const ALL_SCHEMAS: readonly object[] = [
  common,
  attribute,
  entity,
  relationship,
  catalog,
  dataSource,
  binding,
  componentManifest,
  componentInstance,
  layout,
  action,
  navigation,
  security,
  versioning,
  pageDefinition,
  experience,
];

let ajv: Ajv2020 | null = null;

function instance(): Ajv2020 {
  if (ajv) return ajv;
  const created = new Ajv2020({
    strict: false, // `discriminator` and `x-*` annotations are documentation, not constraints
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(created);
  for (const schema of ALL_SCHEMAS) created.addSchema(schema);
  ajv = created;
  return created;
}

const SCHEMA_BASE = 'https://schemas.opus.gresham.com/experience-studio/v1/';

export function validatorFor(fileName: string): ValidateFunction {
  const validate = instance().getSchema(`${SCHEMA_BASE}${fileName}`);
  if (!validate) throw new Error(`Schema not registered: ${fileName}`);
  return validate;
}

/** Compile an ad-hoc schema — used for a component manifest's `properties` block. */
export function compileSubSchema(schema: object): ValidateFunction {
  return instance().compile(schema);
}
