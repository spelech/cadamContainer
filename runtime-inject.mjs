import fs from 'node:fs';
import path from 'node:path';

const outputDir = '/app/.output';
const serverIndexPath = path.join(outputDir, 'server/index.mjs');
const publicDir = path.join(outputDir, 'public');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const urlPlaceholder = 'https://placeholder-supabase-url.co';
const keyPlaceholder = 'placeholder-anon-key';

const hasUrl = supabaseUrl && supabaseUrl !== urlPlaceholder;
const hasKey = supabaseAnonKey && supabaseAnonKey !== keyPlaceholder;

if (hasUrl || hasKey) {
  console.log('Injecting runtime environment variables...');

  function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    if (hasUrl && content.includes(urlPlaceholder)) {
      content = content.replaceAll(urlPlaceholder, supabaseUrl);
      modified = true;
    }
    if (hasKey && content.includes(keyPlaceholder)) {
      content = content.replaceAll(keyPlaceholder, supabaseAnonKey);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated placeholders in ${filePath}`);
    }
  }

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.js') ||
          entry.name.endsWith('.mjs') ||
          entry.name.endsWith('.html') ||
          entry.name.endsWith('.json'))
      ) {
        replaceInFile(fullPath);
      }
    }
  }

  walkDir(publicDir);
  walkDir(path.join(outputDir, 'server'));
}

if (fs.existsSync(serverIndexPath)) {
  let serverCode = fs.readFileSync(serverIndexPath, 'utf8');

  // Disable static Content-Length override so Nitro/Node streams the full buffer dynamically
  const contentLengthPattern =
    'if (asset.size > 0 && !event.res.headers.has("Content-Length")) event.res.headers.set("Content-Length", asset.size.toString());';
  if (serverCode.includes(contentLengthPattern)) {
    serverCode = serverCode.replace(
      contentLengthPattern,
      '/* dynamic Content-Length */',
    );
    console.log(
      'Patched Nitro server to use dynamic Content-Length for static assets.',
    );
  }

  const serverDir = path.dirname(serverIndexPath);
  let updatedAssetCount = 0;

  serverCode = serverCode.replace(
    /"(\/[^"]+)":\s*\{([^{}]+)\}/g,
    (fullMatch, route, body) => {
      const pathMatch = body.match(/"path":\s*"([^"]+)"/);
      if (!pathMatch) return fullMatch;
      const diskPath = path.resolve(serverDir, pathMatch[1]);
      if (!fs.existsSync(diskPath)) return fullMatch;
      const stats = fs.statSync(diskPath);
      let newBody = body;
      const sizeMatch = body.match(/"size":\s*([0-9.eE+-]+)/);
      if (sizeMatch && Number(sizeMatch[1]) !== stats.size) {
        console.log(
          `Updated asset manifest size for ${route}: ${sizeMatch[1]} -> ${stats.size}`,
        );
        newBody = newBody.replace(
          /"size":\s*([0-9.eE+-]+)/,
          `"size": ${stats.size}`,
        );
        const newEtag = `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
        newBody = newBody.replace(
          /"etag":\s*"[^"]+"/,
          `"etag": ${JSON.stringify(newEtag)}`,
        );
        updatedAssetCount++;
      }
      return `"${route}": {${newBody}}`;
    },
  );

  if (updatedAssetCount > 0) {
    console.log(
      `Synchronized ${updatedAssetCount} asset size(s) in server manifest.`,
    );
  }

  fs.writeFileSync(serverIndexPath, serverCode, 'utf8');
}
