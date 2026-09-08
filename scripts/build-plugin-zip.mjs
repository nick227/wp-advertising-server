import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths relative to this script
const pluginDir = path.resolve(__dirname, '../wp-advertising');
const outDir = path.resolve(__dirname, '../public-site/assets');
const outFileStable = path.resolve(outDir, 'wp-advertising.zip');
const outReleaseJson = path.resolve(outDir, 'plugin-release.json');

const EXCLUDED_NAMES = new Set([
  '.git',
  '.gitignore',
  '.github',
  'node_modules',
  'tests',
  'phpunit.xml',
  'phpunit.xml.dist',
  'composer.json',
  'composer.lock',
  'package.json',
  'package-lock.json',
  '.php-cs-fixer.php',
  '.DS_Store'
]);

function getPluginVersion() {
  const pluginMainFile = path.resolve(pluginDir, 'wp-advertising.php');
  if (!fs.existsSync(pluginMainFile)) {
    throw new Error(`Main plugin file not found: ${pluginMainFile}`);
  }
  const content = fs.readFileSync(pluginMainFile, 'utf8');
  const match = content.match(/define\('WPA_VERSION',\s*'([^']+)'\)/);
  if (!match || !match[1]) {
    throw new Error('Could not parse WPA_VERSION from wp-advertising.php');
  }
  return match[1];
}

function buildZip() {
  if (!fs.existsSync(pluginDir)) {
    console.error(`ERROR: Plugin directory not found: ${pluginDir}`);
    process.exit(1);
  }

  const version = getPluginVersion();
  console.log(`\n--- Building WP Advertising Plugin (v${version}) ---`);

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const zip = new AdmZip();

  // Add the wp-advertising directory to the zip
  zip.addLocalFolder(pluginDir, 'wp-advertising', (filename) => {
    const base = path.basename(filename);
    if (EXCLUDED_NAMES.has(base) || base.endsWith('.zip')) {
      return false;
    }
    return true;
  });

  const entries = zip.getEntries();
  if (entries.length === 0) {
    console.error('ERROR: Zip file is empty. No files were added.');
    process.exit(1);
  }

  // Write the stable version
  zip.writeZip(outFileStable);

  // Write the versioned archive
  const outFileVersioned = path.resolve(outDir, `wp-advertising-${version}.zip`);
  zip.writeZip(outFileVersioned);

  // Generate plugin-release.json
  const releaseData = {
    version: version,
    download: '/assets/wp-advertising.zip',
    versionedDownload: `/assets/wp-advertising-${version}.zip`,
    buildTimestamp: new Date().toISOString()
  };
  fs.writeFileSync(outReleaseJson, JSON.stringify(releaseData, null, 2));

  console.log(`Included files:     ${entries.length}`);
  console.log(`Stable output:      ${outFileStable}`);
  console.log(`Versioned output:   ${outFileVersioned}`);
  console.log(`Release manifest:   ${outReleaseJson}`);
  console.log('--------------------------------------------------\n');
}

try {
  buildZip();
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
