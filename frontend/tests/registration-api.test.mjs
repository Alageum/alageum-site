import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAccount, verifyAccountEmail, resetAccountPassword, getPersonalAccount, requestCompanyAccess, approveCompanyAccess, getCompanyAccessReview } from '../lib/api/registration.js';

const mock = (fn, payload, status = 200) => async (...args) => { fn(...args); return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }); };

test('registration sends trimmed identity, untouched password, and never requested role', async () => {
  const previous = globalThis.fetch; let captured;
  globalThis.fetch = mock((url, options) => { captured = { url, options }; }, { status: 'accepted' }, 202);
  try {
    await registerAccount({ email: ' buyer@example.test ', password: ' password123 ', display_name: ' Test Buyer ', role_id: 'admin', permissions: ['catalog.manage'] });
    assert.equal(captured.url, '/api/v1/auth/register'); assert.equal(captured.options.method, 'POST');
    assert.deepEqual(JSON.parse(captured.options.body), { email: 'buyer@example.test', password: ' password123 ', display_name: 'Test Buyer' });
  } finally { globalThis.fetch = previous; }
});
test('verification and reset post exact tokens and require explicit successful receipts', async () => {
  const previous = globalThis.fetch; const calls=[];
  try {
    globalThis.fetch=mock((url,options)=>calls.push([url,JSON.parse(options.body)]),{status:'verified'});
    await verifyAccountEmail('verification-token');
    globalThis.fetch=mock((url,options)=>calls.push([url,JSON.parse(options.body)]),{status:'password_reset'});
    await resetAccountPassword('reset-token','password12345');
    assert.deepEqual(calls,[['/api/v1/auth/verify-email',{token:'verification-token'}],['/api/v1/auth/reset-password',{token:'reset-token',password:'password12345'}]]);
    globalThis.fetch=mock(()=>{},{status:'unexpected'});
    await assert.rejects(verifyAccountEmail('token'),error=>error.code==='invalid_account_response');
  } finally { globalThis.fetch=previous; }
});
test('personal account accepts no-company response and rejects unverified malformed data', async () => {
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=mock(()=>{},{user:{id:'id',email:'buyer@example.test'},company_requests:[],permissions:[]});
    assert.equal((await getPersonalAccount()).company_requests.length,0);
    globalThis.fetch=mock(()=>{},{organization:{id:'fake'}});
    await assert.rejects(getPersonalAccount(),error=>error.code==='invalid_account_response');
  } finally {globalThis.fetch=previous;}
});
test('request submission cannot self-grant and approval sends only selected role',async()=>{
  const previous=globalThis.fetch, calls=[];
  globalThis.fetch=mock((url,options)=>calls.push([url,JSON.parse(options.body)]),{request:{id:'request-id'}},201);
  try {
    await requestCompanyAccess({company_name:' Company ',company_identifier:' 123 ',message:' Employee ',role_id:'admin',permissions:['catalog.manage']});
    await approveCompanyAccess('request-id','role-id');
    assert.deepEqual(calls,[['/api/v1/auth/company-access-requests',{company_name:'Company',company_identifier:'123',message:'Employee'}],['/api/v1/organization/access-requests/request-id/approve',{role_id:'role-id'}]]);
  } finally {globalThis.fetch=previous;}
});
test('review refuses malformed roles or requests and never invents an assignable role',async()=>{
  const previous=globalThis.fetch;
  try {
    globalThis.fetch=mock(()=>{},{items:[]});assert.deepEqual(await getCompanyAccessReview(),{requests:[],roles:[]});
    globalThis.fetch=mock(()=>{},{items:null});await assert.rejects(getCompanyAccessReview(),error=>error.code==='invalid_access_requests_response');
  } finally {globalThis.fetch=previous;}
});
