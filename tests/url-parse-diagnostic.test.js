// Diagnostic-only test: keep this off production until reviewed.
// Run: node --test --trace-deprecation tests/url-parse-diagnostic.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const modules = ['@vercel/blob', '../lib/blob-storage-config.js'];
for (const moduleName of modules) {
  test('deprecation trace on import: '+moduleName, () => {
    const script = `import(${JSON.stringify(moduleName.startsWith('../') ? './lib/blob-storage-config.js' : moduleName)}).then(()=>console.log('IMPORT_OK')).catch(e=>{console.error(e);process.exitCode=2})`;
    const result = spawnSync(process.execPath, ['--trace-deprecation', '--input-type=module', '-e', script], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 20000,
      env: {...process.env, NODE_NO_WARNINGS: '0'}
    });
    assert.equal(result.status, 0, 'Import failed: '+result.stderr);
    const traces = result.stderr.match(/DEP0169[\\s\\S]*?(?=\\n\\(node:|$)/g) || [];
    if (traces.length) console.log(moduleName+' deprecation stack:', traces.join('\\n'));
    assert.equal(traces.length, 0, moduleName+' triggers url.parse() deprecation; inspect stack above');
  });
}
