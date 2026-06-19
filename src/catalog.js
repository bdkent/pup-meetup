// Loads and validates the organizer catalog (catalog/organizers/*.yml) against
// catalog/organizer.schema.json. Throws an aggregated error listing every problem.
//
// CLI:  node src/catalog.js   (also: npm run validate)

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv from 'ajv';

const ORGANIZERS_DIR = fileURLToPath(new URL('../catalog/organizers/', import.meta.url));
const SCHEMA_PATH = fileURLToPath(new URL('../catalog/organizer.schema.json', import.meta.url));

let _validate;
async function getValidator() {
  if (!_validate) {
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    _validate = ajv.compile(schema);
  }
  return _validate;
}

/**
 * @param {string} [dir] Directory of organizer YAML files.
 * @returns {Promise<import('./types.js').Organizer[]>}
 */
export async function loadCatalog(dir = ORGANIZERS_DIR) {
  const validate = await getValidator();
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort();

  /** @type {import('./types.js').Organizer[]} */
  const organizers = [];
  const errors = [];

  for (const file of files) {
    let doc;
    try {
      doc = YAML.parse(await readFile(join(dir, file), 'utf8'));
    } catch (err) {
      errors.push(`${file}: YAML parse error: ${err.message}`);
      continue;
    }
    if (!validate(doc)) {
      for (const e of validate.errors) {
        errors.push(`${file}: ${e.instancePath || '(root)'} ${e.message}`);
      }
      continue;
    }
    organizers.push(doc);
  }

  // Cross-file invariant: organizer ids must be unique.
  const seen = new Set();
  for (const o of organizers) {
    if (seen.has(o.id)) errors.push(`duplicate organizer id: ${o.id}`);
    seen.add(o.id);
  }

  if (errors.length) {
    throw new Error(`Catalog validation failed:\n - ${errors.join('\n - ')}`);
  }
  return organizers;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  loadCatalog()
    .then((orgs) => {
      console.error(`OK: ${orgs.length} organizer(s) valid`);
      for (const o of orgs) console.error(`  - ${o.id} (${o.metro}, ${o.sources.length} source(s))`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
