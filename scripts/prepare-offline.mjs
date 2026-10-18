// Include the complete production chunk graph, including dynamically imported
// chunks, in the shell's required assets. The worker commits HTML only afterwards.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = 'dist/client';
async function walk(directory) {
  const files = await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}
const path = join(root, 'index.html');
let html = await readFile(path, 'utf8');
const assets = (await walk(root)).map(file => relative(root, file).replaceAll('\\', '/'))
  .filter(file => file.includes('_next/static/') && /\.(js|css|woff2?)$/.test(file));
if (!assets.some(file => file.endsWith('.js'))) throw new Error('No production chunks found for offline caching');
const preloads = assets.filter(file => !html.includes(`href="/${file}"`) && !html.includes(`src="/${file}"`))
  .map(file => `<link rel="preload" as="fetch" href="/${file}" crossorigin="anonymous"/>`).join('');
html = html.replace('</head>', preloads + '</head>');
await writeFile(path, html);
console.log(`Offline shell includes all ${assets.length} production assets.`);
