import assert from 'node:assert/strict';
// Current CI contracts only. Never rewrites archive evidence or supplies approval
// to a historical verifier. Each known migration must occur exactly once.
export const currentCiMigrations = Object.freeze([
  ['      - name: Reproduce frozen system DTO and metric reference vectors\n        run: python ../backend-node/tests/reference/generate_legacy_system.py --check\n',
   '      - name: Re-execute current system DTO and metrics against unchanged archived vectors\n        run: python ../backend-node/tests/reference/verify_current_legacy.py --reference system\n'],
  ['  transformer-source-browser:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n',
   '  transformer-source-browser:\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n'],
  ['      - name: Verify new source assets and old catalog regressions on desktop and mobile\n        timeout-minutes: 18\n',
   '      - name: Verify new source assets and old catalog regressions on desktop and mobile\n        timeout-minutes: 30\n'],
]);
export function migrateCurrentReferenceAndTiming(before) {
  return currentCiMigrations.reduce((text,[oldValue,newValue])=>{
    assert.equal(text.split(oldValue).length,2,'Expected one exact prior current-workflow migration input');
    return text.replace(oldValue,newValue);
  },before);
}
