import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = [
  readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
  readFileSync(new URL('../styles.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../app.js', import.meta.url), 'utf8'),
].join('\n');

test('screener/database tabs use one roving tab stop and a hidden inactive panel', () => {
  assert.match(source, /id="nav_screener"[\s\S]*?tabindex="0"/);
  assert.match(source, /id="nav_database"[\s\S]*?tabindex="-1"/);
  assert.match(source, /id="database_tab"[\s\S]*?hidden/);
  assert.match(source, /ArrowLeft[\s\S]*?ArrowRight/);
});

test('copy gating and database empty state are present without the demo banner', () => {
  assert.match(source, /id="copy_briefing_btn"[\s\S]*?disabled/);
  assert.match(source, /function getBriefingPrerequisites\(\)/);
  assert.match(source, /id="database_result_count"[\s\S]*?aria-live="polite"/);
  assert.match(source, /id="database_empty"[\s\S]*?Clear search/);
  assert.doesNotMatch(source, /publicDemoNotice|public-demo-|acknowledgePublicDemo/);
});

test('desktop navigation is colocated with the header and install is secondary', () => {
  const header = source.match(/<header>([\s\S]*?)<\/header>/)?.[1] || '';
  assert.match(header, /class="bottom-nav"/);
  assert.match(header, /class="header-utilities"/);
  assert.match(header, /id="install_btn"/);
});
