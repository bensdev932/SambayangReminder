import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

test('CSS Assets Integrity: animated-icon.module.css exists and defines .expoLogoBackground', () => {
  const cssPath = path.join(projectRoot, 'src', 'components', 'animated-icon.module.css');
  assert.equal(fs.existsSync(cssPath), true, 'animated-icon.module.css must exist');

  const content = fs.readFileSync(cssPath, 'utf8');
  assert.match(content, /\.expoLogoBackground/, 'animated-icon.module.css must define .expoLogoBackground');
});

test('CSS Assets Integrity: global.css exists and defines :root custom properties', () => {
  const globalCssPath = path.join(projectRoot, 'src', 'global.css');
  assert.equal(fs.existsSync(globalCssPath), true, 'src/global.css must exist');

  const content = fs.readFileSync(globalCssPath, 'utf8');
  assert.match(content, /:root/, 'src/global.css must define :root');
});

test('CSS Assets Integrity: All CSS import statements in src/ resolve to existing files', () => {
  const srcDir = path.join(projectRoot, 'src');

  function scanDir(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        results.push(...scanDir(fullPath));
      } else if (file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const sourceFiles = scanDir(srcDir);
  const importRegex = /import\s+[^;]*?['"]([^'"]+\.css)['"]/g;

  let verifiedImports = 0;

  for (const filePath of sourceFiles) {
    const code = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const importPath = match[1];
      let resolvedPath;

      if (importPath.startsWith('@/')) {
        resolvedPath = path.join(srcDir, importPath.slice(2));
      } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
        resolvedPath = path.resolve(path.dirname(filePath), importPath);
      } else {
        resolvedPath = path.resolve(projectRoot, importPath);
      }

      assert.equal(
        fs.existsSync(resolvedPath),
        true,
        `Import '${importPath}' in ${path.relative(projectRoot, filePath)} must resolve to an existing file on disk at: ${resolvedPath}`
      );
      verifiedImports++;
    }
  }

  assert.ok(verifiedImports >= 2, `Expected at least 2 verified CSS imports in codebase, found: ${verifiedImports}`);
});
