import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANY_PROFILE_FIELDS, companyProfileDraft, companyProfilePatch, createCompanyProfileEditor, initialCompanyProfileState, organizationProfileScope } from '../lib/organizations/profile.js';
import { loginDestination } from '../lib/api/loginRedirect.js';

const snapshot = { organization_id: 'org-a', name: 'Company A', business_contact_name: null, business_contact_email: 'Team@Example.com', business_contact_phone: null, business_address: 'City\nBuilding 1', version: 0, updated_at: null };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function rig(overrides = {}) {
  let state = initialCompanyProfileState(), current = true, editable = true;
  const calls = [], confirmed = [], emissions = [];
  const editor = createCompanyProfileEditor({
    read: async () => ({ ...snapshot }), save: async patch => { calls.push(patch); return { ...snapshot, ...patch, version: 1 }; },
    isCurrent: () => current, canEdit: () => editable, organizationId: 'org-a',
    onConfirmed: value => confirmed.push(value), onChange: value => { state = value; emissions.push(value); }, ...overrides,
  });
  return { editor, calls, confirmed, emissions, get state() { return state; }, switchScope() { current = false; }, readonly() { editable = false; } };
}

test('company patches use only changed editable fields and preserve contact case and address line breaks', () => {
  const draft = companyProfileDraft(snapshot);
  draft.name = '  New Company  ';
  draft.business_contact_name = ' Contact ';
  draft.business_contact_email = '  Sales@Example.COM  ';
  draft.business_contact_phone = '  +7 (700) 123 45 67 ext. A  ';
  draft.business_address = '  City\n  Office 4\nBuilding 2  ';
  assert.deepEqual(companyProfilePatch(draft, snapshot), { errors: {}, patch: {
    version: 0, name: 'New Company', business_contact_name: 'Contact', business_contact_email: 'Sales@Example.COM',
    business_contact_phone: '+7 (700) 123 45 67 ext. A', business_address: 'City\n  Office 4\nBuilding 2',
  } });
  assert.equal(companyProfilePatch({ ...companyProfileDraft(snapshot), name: '  Company A ' }, snapshot).patch, null);
  assert.deepEqual(companyProfilePatch({ ...companyProfileDraft(snapshot), business_contact_email: '  ' }, snapshot).patch, { version: 0, business_contact_email: null });
});

test('bounded fields and basic email validation reject invalid drafts locally', () => {
  for (const { key, maxLength } of COMPANY_PROFILE_FIELDS) {
    const draft = { ...companyProfileDraft(snapshot), [key]: 'x'.repeat(maxLength + 1) };
    assert.ok(companyProfilePatch(draft, snapshot).errors[key]);
  }
  for (const email of ['x', 'a@b', 'a b@example.com', 'a@@example.com']) assert.ok(companyProfilePatch({ ...companyProfileDraft(snapshot), business_contact_email: email }, snapshot).errors.business_contact_email);
  assert.ok(companyProfilePatch({ ...companyProfileDraft(snapshot), name: ' ' }, snapshot).errors.name);
  assert.deepEqual(companyProfilePatch({ ...companyProfileDraft(snapshot), business_contact_email: '' }, snapshot).errors, {});
});

test('scope distinguishes user, tenant and same-user login generation; login returns to profile', () => {
  const profile = { user: { id: 'u' }, organization: { id: 'a' } };
  const scope = organizationProfileScope(profile, 1, 1);
  assert.notEqual(scope, organizationProfileScope(profile, 2, 1));
  assert.notEqual(scope, organizationProfileScope(profile, 1, 2));
  assert.notEqual(scope, organizationProfileScope({ ...profile, user: { id: 'v' } }, 1, 1));
  assert.notEqual(scope, organizationProfileScope({ ...profile, organization: { id: 'b' } }, 1, 1));
  assert.equal(organizationProfileScope(null, 1, 1), null);
  assert.equal(loginDestination('/b2b/profile'), '/b2b/profile');
});

test('save stays pending until confirmation and repeated submit sends one mutation', async () => {
  const pending = deferred(), writes = [];
  const r = rig({ save: (patch, signal) => { writes.push({ patch, signal }); return pending.promise; } });
  await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Updated');
  const saving = r.editor.submit(); await r.editor.submit();
  assert.equal(writes.length, 1); assert.equal(r.state.pending, true); assert.equal(r.state.message, '');
  assert.equal(r.confirmed.length, 1); assert.equal(r.state.snapshot.name, 'Company A');
  pending.resolve({ ...snapshot, name: 'Updated', version: 1 }); await saving;
  assert.equal(r.state.pending, false); assert.equal(r.state.editing, false); assert.equal(r.state.draft, null);
  assert.equal(r.state.message, 'Профиль компании сохранён'); assert.equal(r.confirmed[1].name, 'Updated');
});

test('cancel clears the in-memory draft without sending and no-op save does not write', async () => {
  const r = rig(); await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Discard'); r.editor.cancel();
  assert.equal(r.state.draft, null); assert.equal(r.state.snapshot.name, 'Company A'); assert.equal(r.calls.length, 0);
  r.editor.edit(); assert.equal(r.state.draft.name, 'Company A'); await r.editor.submit();
  assert.equal(r.calls.length, 0); assert.equal(r.state.message, 'Нет изменений для сохранения.');
});

test('read-only permissions prevent edit and permission loss prevents mutation', async () => {
  const r = rig(); await r.editor.load(); r.readonly(); r.editor.edit(); assert.equal(r.state.editing, false);
  const writable = rig(); await writable.editor.load(); writable.editor.edit(); writable.editor.change('name', 'Draft'); writable.readonly();
  await writable.editor.submit(); assert.equal(writable.calls.length, 0);
});

test('conflict retains draft, blocks retries and only explicit reload replaces it', async () => {
  let reads = 0, writes = 0;
  const r = rig({ read: async () => ({ ...snapshot, name: reads++ ? 'Latest server name' : 'Company A', version: reads }), save: async () => { writes++; throw { status: 409, code: 'version_conflict' }; } });
  await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Private draft'); await r.editor.submit();
  assert.equal(r.state.conflict, true); assert.equal(r.state.draft.name, 'Private draft');
  assert.equal(r.state.snapshot.name, 'Company A'); assert.equal(r.confirmed.length, 1);
  await r.editor.submit(); assert.equal(writes, 1); assert.equal(reads, 1);
  await r.editor.load(); assert.equal(r.state.snapshot.name, 'Latest server name'); assert.equal(r.state.draft, null); assert.equal(r.state.conflict, false);
});

test('cancel during save invalidates late confirmation and requires a new read', async () => {
  const pending = deferred(); let signal;
  const r = rig({ save: (_, currentSignal) => { signal = currentSignal; return pending.promise; } });
  await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Draft'); const saving = r.editor.submit(); r.editor.cancel();
  assert.equal(signal.aborted, true); assert.equal(r.state.requiresReload, true); const emissions = r.emissions.length;
  pending.resolve({ ...snapshot, name: 'Late saved', version: 1 }); await saving;
  assert.equal(r.emissions.length, emissions); assert.equal(r.confirmed.length, 1); assert.equal(r.state.draft, null);
  r.editor.edit(); assert.equal(r.state.editing, false);
});

for (const boundary of ['unmount', 'new user', 'new tenant', 'same-user new login']) {
  test(`${boundary} prevents a pending save from changing UI or organization display`, async () => {
    const pending = deferred(), r = rig({ save: () => pending.promise });
    await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Old draft'); const saving = r.editor.submit();
    if (boundary === 'unmount') r.editor.dispose(); else r.switchScope();
    const count = r.emissions.length; pending.resolve({ ...snapshot, name: 'Late old name', version: 1 }); await saving;
    assert.equal(r.emissions.length, count); assert.equal(r.confirmed.length, 1);
  });
}

test('older read cannot overwrite a newer read, draft or organization display', async () => {
  const old = deferred(), newest = deferred(); let count = 0;
  const r = rig({ read: () => count++ ? newest.promise : old.promise });
  const first = r.editor.load(), second = r.editor.load(); newest.resolve({ ...snapshot, name: 'New read', version: 2 }); await second;
  r.editor.edit(); r.editor.change('name', 'Newer draft');
  old.resolve({ ...snapshot, name: 'Old read' }); await first;
  assert.equal(r.state.draft.name, 'Newer draft'); assert.equal(r.state.snapshot.name, 'New read'); assert.equal(r.confirmed.length, 1);
});

test('pending read after unmount or session replacement has no effects, even if abort is ignored', async () => {
  for (const dispose of [true, false]) {
    const pending = deferred(), r = rig({ read: () => pending.promise });
    const reading = r.editor.load(); if (dispose) r.editor.dispose(); else r.switchScope();
    const count = r.emissions.length; pending.resolve(snapshot); await reading;
    assert.equal(r.emissions.length, count); assert.equal(r.confirmed.length, 0);
  }
});

test('foreign-tenant snapshots fail closed for both read and confirmed save', async () => {
  const r = rig({ read: async () => ({ ...snapshot, organization_id: 'org-b' }) }); await r.editor.load();
  assert.equal(r.state.status, 'error'); assert.equal(r.state.snapshot, null); assert.equal(r.confirmed.length, 0);
  const s = rig({ save: async () => ({ ...snapshot, organization_id: 'org-b', version: 1 }) });
  await s.editor.load(); s.editor.edit(); s.editor.change('name', 'New name'); await s.editor.submit();
  assert.equal(s.state.snapshot.name, 'Company A'); assert.equal(s.state.draft.name, 'New name'); assert.equal(s.confirmed.length, 1); assert.equal(s.state.requiresReload, true);
});

test('uncertain save retains draft and requires reload; validation errors retain correctable draft', async () => {
  for (const error of [new Error('Network unavailable'), { status: 422 }]) {
    const r = rig({ save: async () => { throw error; } }); await r.editor.load(); r.editor.edit(); r.editor.change('name', 'Draft'); await r.editor.submit();
    assert.equal(r.state.draft.name, 'Draft'); assert.equal(r.state.pending, false); assert.equal(r.state.message, '');
    assert.equal(r.state.requiresReload, !error.status); assert.equal(r.confirmed.length, 1);
  }
});
