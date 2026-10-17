import assert from 'node:assert/strict';

export function assertPlaywrightCollection(report, expectedFiles, expectedProjects) {
  assert.deepEqual(report.errors || [], [], 'Discovery must complete without errors');
  const cases = [];
  function visit(suites, parents = []) {
    for (const suite of suites) {
      const titles = [...parents, suite.title];
      for (const spec of suite.specs || []) for (const test of spec.tests || [])
        cases.push({ file: spec.file.replaceAll('\\', '/'), project: test.projectName, title: [...titles, spec.title].join(' > ') });
      visit(suite.suites || [], titles);
    }
  }
  visit(report.suites || []);
  assert.ok(cases.length > 0, 'No declared tests may disappear from discovery');
  assert.deepEqual([...new Set(cases.map(item => item.file))].sort(), [...expectedFiles].sort(), 'Every current general spec, and no dedicated fixture, must be collected');
  assert.deepEqual([...new Set(cases.map(item => item.project))].sort(), [...expectedProjects].sort());
  const identities = cases.map(item => JSON.stringify([item.file, item.project, item.title]));
  assert.equal(new Set(identities).size, identities.length, 'Duplicate case identities are not coverage');
  for (const file of expectedFiles) for (const project of expectedProjects)
    assert.ok(cases.some(item => item.file === file && item.project === project), `${file} missing in ${project}`);
  return cases;
}
