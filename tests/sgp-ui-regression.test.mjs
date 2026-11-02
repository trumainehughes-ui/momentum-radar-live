import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const between = (start, end) => {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Expected source boundaries are present');
  return html.slice(a, b);
};

test('NFL SGP panel is positioned below the selected matchup heading', () => {
  assert.match(html, /gameHead\.insertAdjacentElement\('afterend',sgpPanel\)/);
});

test('SGP quick navigation exposes all four tiers', () => {
  const fn = between('function nflSgpQuickNav()', 'function nflBindMatchTabs()');
  assert.match(fn, /\['Small','Medium','Large','Nuke'\]/);
  assert.match(fn, /btn\.disabled=!card/);
  assert.match(fn, /card\.scrollIntoView/);
});

test('tier selection never hides other book or model cards', () => {
  const fn = between('function nflSgpQuickNav()', 'function nflBindMatchTabs()');
  assert.doesNotMatch(fn, /x\.hidden=x!==card/);
  assert.match(fn, /x\.hidden=false/);
});

test('rendering SGP tiers does not auto-click and jump the viewport', () => {
  const fn = between('function nflSgpQuickNav()', 'function nflBindMatchTabs()');
  assert.doesNotMatch(fn, /available\.click\(\)/);
});

test('SGP refresh observer and expandable matchup analysis remain wired', () => {
  assert.match(html, /typeof MutationObserver!=='undefined'/);
  assert.match(html, /nflSgpObserver\.observe\(nflSgpHost,\{childList:true\}\)/);
  assert.match(html, /function bindAnalysis\(\)/);
  assert.match(html, /aria-expanded/);
});
