import { build } from 'esbuild';
import { mkdir, cp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const manifest = JSON.parse(await readFile('addon/manifest.json'));
const pkg = JSON.parse(await readFile('package.json'));
if (manifest.version !== pkg.version) throw new Error('Package and manifest versions differ');
await rm('dist/addon', { recursive: true, force: true });
await mkdir('dist/addon', { recursive: true });
await cp('addon', 'dist/addon', { recursive: true });
await cp('LICENSE', 'dist/addon/LICENSE');
await cp('COPYING', 'dist/addon/COPYING');
await cp('NOTICE.md', 'dist/addon/NOTICE.md');
await mkdir('dist/addon/licenses', { recursive: true });
await cp('src/vendor/crop-to-margin/LICENSE', 'dist/addon/licenses/crop-to-margin-MIT.txt');
// Include preferred source form and build/test instructions with the AGPL binary.
for (const dir of ['src', 'addon', 'scripts', 'test', 'docs']) {
  await cp(dir, `dist/addon/source/${dir}`, { recursive: true, filter: path => !path.includes('__pycache__') });
}
for (const file of ['package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'COPYING', 'LICENSE', 'NOTICE.md']) {
  await cp(file, `dist/addon/source/${file}`);
}
await build({ entryPoints: ['src/plugin.mjs'], outfile: 'dist/addon/motero.js',
  bundle: true, format: 'iife', globalName: 'Motero', target: 'firefox115',
  legalComments: 'inline', sourcemap: false });
await build({ entryPoints: ['src/content-analysis.mjs'], outfile: 'dist/addon/analysis.js',
  bundle: true, format: 'iife', globalName: 'MoteroPageAnalysis', target: 'firefox115',
  legalComments: 'inline' });
const out = `dist/motero-compliments-${manifest.version}.xpi`;
// Recreate the archive: deleted source files must not survive a rebuild.
execFileSync('python3', ['-c', `import pathlib,zipfile
root=pathlib.Path('dist/addon')
with zipfile.ZipFile('${out}', 'w', zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   entry=zipfile.ZipInfo(p.relative_to(root).as_posix(), date_time=(2020,1,1,0,0,0))
   entry.external_attr=0o100644 << 16
   z.writestr(entry,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)`], { stdio: 'inherit' });
console.log(out);
