// Regression safety net for the single-file Stroke Trials Screener PWA.
//
// The whole app lives in index.html. This suite loads the *pure* logic
// (the `trials` data array and the eligibility engine) out of the inline
// <script> with all browser/DOM side effects stubbed, then:
//   1. asserts the data contract every renderer depends on (missing fields
//      here crash the Database tab / detail modal at runtime),
//   2. simulates the renderers' unguarded property access (no DOM needed),
//   3. fuzzes the eligibility engine over a large, *deterministic* grid of
//      patient inputs and asserts it never throws and always returns the
//      documented shapes.
//
// Run with:  npm test   (alias for: node --test tests/screener.test.mjs)
// No third-party dependencies — uses only the Node.js standard library.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Load the app's pure logic with the DOM stubbed out --------------------
function loadEngine() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html: no <script> block found');
  const body = m[1];

  // The only top-level side effects in the script are addEventListener calls,
  // the `'serviceWorker' in navigator` guard, and reading location.hostname.
  // Stub just enough that evaluating the body defines `trials` + the engine
  // without touching a real browser.
  const windowStub = { addEventListener() {}, location: { hostname: '' } };
  const navigatorStub = {}; // 'serviceWorker' in {} === false → SW reg skipped
  const factory = new Function(
    'window', 'navigator', 'document', 'console',
    `${body}\n;return { trials, evaluateTrialEligibility, isTrialPotentiallyActive };`
  );
  return factory(windowStub, navigatorStub, {}, { log() {}, warn() {}, error() {} });
}

const { trials, evaluateTrialEligibility } = loadEngine();

const KNOWN_STATUS = new Set(['enrolling', 'soon', 'closed', 'placeholder']);
const isStringArray = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');

// --- (1) Data-integrity contract -------------------------------------------
test('trials is a non-empty array', () => {
  assert.ok(Array.isArray(trials), 'trials must be an array');
  assert.ok(trials.length > 0, 'trials must not be empty');
});

test('every trial satisfies the field contract the renderers require', () => {
  for (let i = 0; i < trials.length; i++) {
    const t = trials[i];
    const id = `trial[${i}] (${t && t.acronym})`;
    assert.equal(typeof t.acronym, 'string', `${id}: acronym must be a string`);
    assert.ok(t.acronym.length > 0, `${id}: acronym must be non-empty`);
    assert.equal(typeof t.exactFullStudyName, 'string', `${id}: exactFullStudyName must be a string`);
    assert.ok(KNOWN_STATUS.has(t.status), `${id}: status '${t.status}' not in ${[...KNOWN_STATUS]}`);
    // openTrialDetails/initDatabase dereference these WITHOUT guards:
    assert.equal(typeof t.externalMetadata, 'object', `${id}: externalMetadata must be an object`);
    assert.ok(t.externalMetadata !== null, `${id}: externalMetadata must not be null`);
    if (t.externalMetadata.nct) {
      assert.equal(typeof t.externalMetadata.registryUrl, 'string',
        `${id}: has nct but registryUrl is not a string`);
    }
    assert.ok(Array.isArray(t.exactInclusionCriteria), `${id}: exactInclusionCriteria must be an array`);
    assert.ok(Array.isArray(t.exactExclusionCriteria), `${id}: exactExclusionCriteria must be an array`);
    assert.notEqual(t.pathway, undefined, `${id}: pathway is rendered into innerHTML and must be defined`);
    for (const fn of ['check', 'matchedCriteriaText', 'pendingCriteriaText']) {
      assert.equal(typeof t[fn], 'function', `${id}: ${fn} must be a function`);
    }
  }
});

test('trial acronyms are unique (openTrialDetails resolves by acronym)', () => {
  const seen = new Set();
  for (const t of trials) {
    assert.ok(!seen.has(t.acronym), `duplicate acronym: ${t.acronym}`);
    seen.add(t.acronym);
  }
});

// --- (2) Renderer contract: mimic the unguarded property access -------------
// Mirrors initDatabase / openTrialDetails / filterDatabase string-building so a
// future data edit that breaks a renderer fails here instead of in the browser.
test('every trial renders without throwing (renderer simulation)', () => {
  for (const t of trials) {
    assert.doesNotThrow(() => {
      const inc = t.exactInclusionCriteria.map((c) => `<li>${c}</li>`).join('');
      const exc = t.exactExclusionCriteria.length > 0
        ? t.exactExclusionCriteria.map((c) => `<li>${c}</li>`).join('')
        : '<li>None specified in source</li>';
      const registry = t.externalMetadata.nct
        ? `${t.externalMetadata.registryUrl} ${t.externalMetadata.nct}`
        : 'N/A';
      const hypothesis = t.sourceHypothesisText || 'Not specified in source';
      // filterDatabase search index (post-tidyup: sourceHypothesisText guarded):
      const searchText = (t.acronym + ' ' + t.exactFullStudyName + ' ' +
        (t.sourceHypothesisText || '') + ' ' + t.exactInclusionCriteria.join(' ')).toLowerCase();
      assert.equal(typeof (inc + exc + registry + hypothesis + searchText), 'string');
      assert.ok(!searchText.includes('undefined'),
        `${t.acronym}: search index contains literal "undefined"`);
    }, `${t.acronym}: renderer simulation threw`);
  }
});

// --- (3) Engine fuzz: deterministic grid, must never throw ------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = {
  classification: ['ischemic', 'hemorrhagic', 'ich', 'tia', 'unselected', ''],
  onsetHours: [0, 1, 4.4, 4.5, 12, 24, 25, 72, 336, 2160, 4320],
  age: ['unselected', -1, 17, 18, 45, 65, 80, 120],
  nihss: ['unselected', -1, 0, 3, 4, 5, 8, 20, 42],
  aspects: ['unselected', -1, 0, 5, 6, 7, 8, 10],
  gcs: ['unselected', -1, 3, 8, 15],
  preMrs: ['unselected', 0, 1, 2, 3, 4, 5, 6],
  vessel: ['unselected', 'none', 'ica_m1', 'm1', 'm2_m3_nd', 'm2', 'm3'],
  etiology: ['unselected', 'none', 'esus', 'cardioembolic', 'laa', 'other'],
  ichLocation: ['unselected', 'none', 'bg', 'thalamic', 'infratentorial', 'lobar'],
  volume: ['unselected', 'none', 'small', 'bg_large', 'large'],
  language: ['unselected', 'english', 'other'],
  rehab: ['unselected', 'yes', 'none'],
  tri: [true, false, 'unselected'],
};
const BOOL_FIELDS = ['statin', 'afibHistory', 'takingOac', 'self_consent', 'availability_54w',
  'exUeWeakness', 'unilateralSymptomatic', 'anteriorCirculation', 'presentedWithin24h', 'singleAntiplateletSoc'];
// All exclusion flags consumed by trial.check(); kept in sync with calculateEligibility().
const EX_FLAGS = ['exThrombolysis', 'exEvt', 'exStroke90d', 'exMultipleTerritories', 'exTandem',
  'exTerminalIllness', 'exSecondaryIch', 'exMidbrain', 'exMassiveIvh', 'exAbsentBrainstem', 'exEvdEvacuation',
  'exPriorIch12m', 'exClearAnticoagulationIndication', 'exClearAntiplateletIndication', 'exIchScore3',
  'exRecentMi3m', 'exLifeExpectancy2y', 'exLifeExpectancy9m', 'exEgfr35', 'exMriContraindication',
  'exRecentSurgery30d', 'exBilateralCarotidRevasc', 'exPriorIchHistory', 'exBrainBleed2y', 'exSaptContraindication',
  'exCarotidStenosis50', 'exPregnancy', 'exIncarcerated', 'exTrach', 'exCpapUse14d', 'exSecondaryIchOrSah',
  'exPriorDementia', 'exWorseningNeurologic', 'exDisorderInterfering', 'exPriorUeCondition', 'exLegallyBlind',
  'exDenseSensoryLoss', 'exRecentStroke30d', 'exSeizures', 'exSevereSpasticity', 'exArmInjury',
  'exSevereAphasiaCognitive', 'exSevereClaustrophobia', 'exBotoxVns3m', 'exAnticoagulation', 'exHistoryDvtPe',
  'exRecurrentStroke', 'exPlannedCarotidIntervention', 'exDrugAlcoholAbuse', 'exMsParkinsonAlsDementia',
  'exMajorPsychiatric', 'exOtherUpperLimbTrial', 'exCongestiveHeartFailure', 'exEgfr30'];

function makeParams(rnd, exMode) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const oh = pick(POOLS.onsetHours);
  const p = {
    classification: pick(POOLS.classification),
    onsetHours: oh, onsetDays: oh / 24, onsetMonths: oh / 720,
    age: pick(POOLS.age), nihss: pick(POOLS.nihss), aspects: pick(POOLS.aspects),
    gcs: pick(POOLS.gcs), preMrs: pick(POOLS.preMrs), vessel: pick(POOLS.vessel),
    etiology: pick(POOLS.etiology), ichLocation: pick(POOLS.ichLocation), volume: pick(POOLS.volume),
    language: pick(POOLS.language), rehab: pick(POOLS.rehab),
  };
  for (const f of BOOL_FIELDS) p[f] = pick(POOLS.tri);
  for (const f of EX_FLAGS) p[f] = exMode === 'all' ? true : exMode === 'none' ? false : rnd() < 0.15;
  return p;
}

function allUnselected(classification) {
  const p = {
    classification, onsetHours: 2, onsetDays: 2 / 24, onsetMonths: 2 / 720,
    age: 'unselected', nihss: 'unselected', aspects: 'unselected', gcs: 'unselected', preMrs: 'unselected',
    vessel: 'unselected', etiology: 'unselected', ichLocation: 'unselected', volume: 'unselected',
    language: 'unselected', rehab: 'unselected',
  };
  for (const f of BOOL_FIELDS) p[f] = 'unselected';
  for (const f of EX_FLAGS) p[f] = false;
  return p;
}

function assertEngineOk(t, p) {
  const errors = t.check(p);
  assert.ok(Array.isArray(errors), `${t.acronym}: check() must return an array`);
  assert.ok(errors.every((e) => typeof e === 'string'), `${t.acronym}: check() must return string[]`);
  const r = evaluateTrialEligibility(t, p);
  assert.ok(r && typeof r.status === 'string', `${t.acronym}: evaluate must return {status}`);
  assert.ok(isStringArray(t.matchedCriteriaText(p)), `${t.acronym}: matchedCriteriaText must return string[]`);
  assert.ok(isStringArray(t.pendingCriteriaText(p)), `${t.acronym}: pendingCriteriaText must return string[]`);
}

test('engine never throws across the deterministic fuzz grid', () => {
  const rnd = mulberry32(0x5713A12C);
  let cases = 0;
  for (const t of trials) {
    // edge cases: all-unselected per classification, all-exclusions, no-exclusions
    for (const cls of POOLS.classification) { assertEngineOk(t, allUnselected(cls)); cases++; }
    assertEngineOk(t, makeParams(rnd, 'all')); cases++;
    assertEngineOk(t, makeParams(rnd, 'none')); cases++;
    // randomized sweep
    for (let i = 0; i < 4000; i++) { assertEngineOk(t, makeParams(rnd)); cases++; }
  }
  assert.ok(cases > 50000, `expected a large fuzz grid, only ran ${cases} cases`);
});
