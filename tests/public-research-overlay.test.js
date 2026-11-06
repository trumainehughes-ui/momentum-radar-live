import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const page of ['index.html', 'picks.html']) {
  test(`${page} does not expose internal SGP research overlay`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /JAX\s*@\s*BAL\s*[·-]\s*Nov\s*5\s*SGP\s*research/i);
    assert.doesNotMatch(html, /4 saved tiers\s*[·-]\s*Unpriced/i);
    assert.doesNotMatch(html, /<aside[^>]*position:\s*fixed[^>]*>[\s\S]*?SGP research[\s\S]*?<\/aside>/i);
  });
}
