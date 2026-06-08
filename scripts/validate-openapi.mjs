import fs from 'node:fs';
import YAML from 'yaml';

const raw = fs.readFileSync('openapi/community-api.yaml', 'utf8');
const doc = YAML.parse(raw);

if (!doc.openapi || !doc.info?.title || !doc.paths) {
  throw new Error('OpenAPI document is missing required top-level fields.');
}

console.log('OpenAPI document parsed successfully.');
