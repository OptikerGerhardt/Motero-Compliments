import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
export function releaseUpdate(manifest, bytes) {
  const { version } = manifest, config = manifest.applications.zotero;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Use a stable semantic release version');
  return { version,
    update_link: `https://github.com/OptikerGerhardt/Motero-Compliments/releases/download/v${version}/motero-compliments-${version}.xpi`,
    update_hash: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
    applications: { zotero: { strict_min_version: config.strict_min_version, strict_max_version: config.strict_max_version } } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(await readFile('addon/manifest.json'));
  const name = `motero-compliments-${manifest.version}.xpi`;
  const bytes = await readFile('dist/' + name);
  const entry = releaseUpdate(manifest, bytes);
  const id = manifest.applications.zotero.id;
  const feed = JSON.parse(await readFile('update.json'));
  const updates = feed.addons?.[id]?.updates || [];
  if (updates.some(u => u.version === entry.version && u.update_hash !== entry.update_hash)) {
    throw Error('This version already has another checksum. Bump the version; never replace a published asset.');
  }
  feed.addons ??= {}; feed.addons[id] = { updates: [...updates.filter(u => u.version !== entry.version), entry] };
  await writeFile('update.json', JSON.stringify(feed, null, 2) + '\n');
  await writeFile('dist/SHA256SUMS', entry.update_hash.slice(7) + '  ' + name + '\n');
  console.log(`Prepared v${entry.version}: ${entry.update_hash}`);
}
