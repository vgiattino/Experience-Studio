#!/usr/bin/env node
/**
 * Metadata validation gate.
 *
 * Runs level-1 (structural) validation over every schema and artifact in the repo:
 *   - all schemas are valid JSON and conform to the 2020-12 metaschema
 *   - every $ref resolves
 *   - every example and every runtime definition validates against its schema
 *   - every component manifest validates, and its own `properties` block compiles
 *
 * Levels 2, 4 and 7 (component config, bindings, layout refs) run in the browser
 * and in the unit tests through @opus/validator, because they need the component
 * manifests and the page's own declarations. Levels 3, 5, 6 and 8 need the catalog
 * service and the Data Gateway and are reported as not run rather than assumed.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ROOT = process.cwd();
const SCHEMA_DIR = join(ROOT, 'schemas');
const EXAMPLE_DIR = join(SCHEMA_DIR, 'examples');
const DEFINITION_DIR = join(ROOT, 'apps/viewer/public/definitions');
const CATALOG_DIR = join(ROOT, 'apps/viewer/public/catalog');
const COMPONENT_DIR = join(ROOT, 'libs/components');

const BASE = 'https://schemas.opus.gresham.com/experience-studio/v1/';

let failures = 0;
const fail = (message) => {
  failures++;
  console.error(`  ✗ ${message}`);
};
const pass = (message) => console.log(`  ✓ ${message}`);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// ── 1. schemas ──────────────────────────────────────────────────────────────
console.log('\nSchemas');
const schemaFiles = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json')).sort();
const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);

const schemas = [];
for (const file of schemaFiles) {
  try {
    const schema = readJson(join(SCHEMA_DIR, file));
    schemas.push({ file, schema });
    ajv.addSchema(schema);
  } catch (error) {
    fail(`${file}: ${error.message}`);
  }
}
if (schemas.length === schemaFiles.length) pass(`${schemas.length} schema files parsed and registered`);

for (const { file, schema } of schemas) {
  try {
    ajv.compile(schema);
  } catch (error) {
    fail(`${file} does not compile: ${error.message}`);
  }
}
if (!failures) pass('all schemas compile — every $ref resolves');

// ── 2. artifacts ────────────────────────────────────────────────────────────
const SUFFIX_TO_SCHEMA = [
  ['.page.json', 'page-definition.schema.json'],
  ['.experience.json', 'experience.schema.json'],
  ['.catalog.json', 'catalog.schema.json'],
  ['.manifest.json', 'component-manifest.schema.json'],
  // Runtime-core artifact types (schemas/README.md §10). Gated structurally here; not yet
  // wired into @opus/validator, because the runtime does not execute them pending approval.
  ['.operations.json', 'operation.schema.json'],
  ['.agent.json', 'agent.schema.json'],
  ['.pagestate.json', 'page-state.schema.json'],
];

function validateArtifacts(label, dir) {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) return;
  console.log(`\n${label}`);
  for (const file of files) {
    const match = SUFFIX_TO_SCHEMA.find(([suffix]) => file.endsWith(suffix));
    if (!match) {
      console.log(`  – ${file} (no schema mapping, skipped)`);
      continue;
    }
    const [, schemaFile] = match;
    const validate = ajv.getSchema(`${BASE}${schemaFile}`);
    if (!validate) {
      fail(`${file}: schema ${schemaFile} not registered`);
      continue;
    }
    let instance;
    try {
      instance = readJson(join(dir, file));
    } catch (error) {
      fail(`${file}: ${error.message}`);
      continue;
    }
    if (validate(instance)) {
      pass(`${file} → ${schemaFile}`);
    } else {
      fail(`${file} → ${schemaFile}`);
      for (const error of validate.errors.slice(0, 8)) {
        const extra =
          error.keyword === 'additionalProperties' ? ` ("${error.params.additionalProperty}")` : '';
        console.error(`      ${error.instancePath || '/'} ${error.message}${extra}`);
      }
      if (validate.errors.length > 8) {
        console.error(`      …and ${validate.errors.length - 8} more`);
      }
    }
  }
}

validateArtifacts('Schema examples', EXAMPLE_DIR);
validateArtifacts('Runtime definitions', DEFINITION_DIR);
validateArtifacts('Runtime catalog', CATALOG_DIR);

// ── 3. component manifests ──────────────────────────────────────────────────
console.log('\nComponent manifests');
const manifestValidate = ajv.getSchema(`${BASE}component-manifest.schema.json`);
const componentDirs = existsSync(COMPONENT_DIR)
  ? readdirSync(COMPONENT_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
  : [];

let manifestCount = 0;
for (const dir of componentDirs) {
  const dirPath = join(COMPONENT_DIR, dir.name);
  const manifests = readdirSync(dirPath).filter((f) => f.endsWith('.manifest.json'));
  for (const file of manifests) {
    manifestCount++;
    const manifest = readJson(join(dirPath, file));
    if (!manifestValidate(manifest)) {
      fail(`${dir.name}/${file}`);
      for (const error of manifestValidate.errors.slice(0, 6)) {
        const extra =
          error.keyword === 'additionalProperties' ? ` ("${error.params.additionalProperty}")` : '';
        console.error(`      ${error.instancePath || '/'} ${error.message}${extra}`);
      }
      continue;
    }
    // The manifest's own `properties` block must be a compilable schema, since the
    // validator uses it for level-2 component config checks.
    try {
      new Ajv2020({ strict: false }).compile(manifest.properties);
      pass(`${dir.name}/${file} (${manifest.type}@${manifest.version})`);
    } catch (error) {
      fail(`${dir.name}/${file}: properties schema does not compile — ${error.message}`);
    }
  }
}
if (!manifestCount) fail('no component manifests found');

// ── 4. registry / manifest agreement ────────────────────────────────────────
console.log('\nRegistry');
const registryPath = join(ROOT, 'libs/component-registry/src/index.ts');
if (existsSync(registryPath)) {
  const source = readFileSync(registryPath, 'utf8');
  const registered = [...source.matchAll(/^\s*'([a-z0-9-]+\.[a-z0-9-]+)':\s*\{/gm)].map((m) => m[1]);
  const manifestTypes = [];
  for (const dir of componentDirs) {
    const dirPath = join(COMPONENT_DIR, dir.name);
    for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.manifest.json'))) {
      manifestTypes.push(readJson(join(dirPath, file)).type);
    }
  }
  const missing = manifestTypes.filter((t) => !registered.includes(t));
  const extra = registered.filter((t) => !manifestTypes.includes(t));
  if (missing.length) fail(`manifests without a registry entry: ${missing.join(', ')}`);
  if (extra.length) fail(`registry entries without a manifest: ${extra.join(', ')}`);
  if (!missing.length && !extra.length) {
    pass(`${registered.length} registry entries match ${manifestTypes.length} manifests`);
  }
} else {
  fail('component registry not found');
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.error(`FAILED — ${failures} problem(s)\n`);
  process.exit(1);
}
console.log('Structural validation passed.');
console.log('Levels 2/3/4/7 run via @opus/validator in the browser and unit tests.');
console.log('Level 3 needs a catalog, which the generator supplies and the loader does not.');
console.log('Levels 5/6/8 require the Data Gateway and an a11y pass — not run.\n');
