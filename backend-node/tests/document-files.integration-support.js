"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path");
const { table } = require("../src/domain/auth");
const { audit } = require("../src/domain/audit");
const { createDocuments } = require("../src/domain/documents");
const { createDocumentStorage } = require("../src/domain/document-files");
const { scannerFixture, EICAR } = require("./helpers/media-scanner-fixture");
// Disposable HTTP and PostgreSQL coverage. Scanner is a protocol test double,
// never a claim of a live ClamAV engine; the production Compose proof is separate.
module.exports = async function verifyDocumentFiles({ app, origin, check, actors, manifest }) {
 const cleanups=[], scanner=await scannerFixture({after:fn=>cleanups.push(fn)});
 const root=path.join(scanner.root,"documents");await fs.mkdir(root,{mode:0o700});
 const config={...scanner.config,root}, storage=createDocumentStorage(config), db=app.db.connection;
 const saved=app.alageum.documents, org=manifest.organizations.a.id, roleId=manifest.roles.a.reader;
 const originalRole=await table(db,"roles").where({id:roleId}).first();
 const documents=[], files=[];
 const originalAttachmentType=await table(db,"document_types").where({code:"manual_attachment"}).first();
 const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
 const actor=actors.reader;
 async function request(url,{who=actor,organization=org,method="GET",body,status=200}={}) {
  const response=await fetch(`${origin}/api/v1${url}`,{method,body,headers:{...(who?{Authorization:`Bearer ${who.access_token}`}:{ }),...(organization?{"X-Organization-ID":organization}:{})},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,status,`${method} ${url}: ${response.status}`);return response;
 }
 function form(bytes=pdf,name="sample.pdf",type="application/pdf") {const data=new FormData();data.set("title","Disposable private file");data.set("type_code","manual_attachment");data.set("file",new Blob([bytes],{type}),name);return data;}
 async function upload(options={}) {return request("/documents",{method:"POST",body:form(),status:201,...options});}
 async function cleanupRows() {
  for(const id of documents){const versions=await table(db,"document_versions").where({document_id:id});files.push(...versions.map(v=>v.file_id));await table(db,"document_versions").where({document_id:id}).del();await table(db,"documents").where({id}).del();await table(db,"audit_events").where({entity_id:id,entity_type:"document"}).del();}
  for(const id of files)await table(db,"file_objects").where({id}).del();
  if(!originalAttachmentType)await table(db,"document_types").where({code:"manual_attachment"}).del();
 }
 try {
  app.alageum.documents=createDocuments({db,auth:app.alageum.auth,audit,storage});
  await check("private upload requires explicit create permission before scanning",async()=>{
   await upload({status:403});await upload({who:null,status:401});assert.equal(scanner.scanned.length,0);
   await table(db,"roles").where({id:roleId}).update({permissions:JSON.stringify(["document.read","document.create"])});
  });
  let created;
  await check("PDF multipart upload commits tenant-scoped metadata and exact private bytes",async()=>{
   assert.ok((await (await request("/document-types")).json()).items.some(x=>x.code==="manual_attachment"));
   created=await (await upload()).json();documents.push(created.id);
   assert.deepEqual(Object.keys(created).sort(),["external_id","id","latest_file_id","number","source","title","type_code"]);
   assert.equal((await table(db,"file_objects").where({id:created.latest_file_id}).first()).organization_id,org);
   const response=await request(`/documents/${created.id}/download`);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);assert.match(response.headers.get("content-disposition"),/^attachment;/);assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.match(response.headers.get("cache-control"),/private.*no-store/);
  });
  await check("private download rejects missing auth, foreign tenant and forged ID",async()=>{
   await request(`/documents/${created.id}/download`,{who:null,status:401});
   await request(`/documents/${created.id}/download`,{who:actors.other,organization:manifest.organizations.b.id,status:404});
   await request(`/documents/${created.id}/download`,{organization:manifest.organizations.b.id,status:403});
  });
  await check("malware, mismatched types and extra client organization fields leave no file",async()=>{
   const count=(await fs.readdir(root)).length;
   await upload({body:form(Buffer.concat([pdf.subarray(0,pdf.length-6),EICAR,Buffer.from("\n%%EOF\n")])),status:400});
   await upload({body:form(pdf,"sample.png","image/png"),status:422});
   const forged=form();forged.set("organization_id",manifest.organizations.b.id);await upload({body:forged,status:422});
   assert.equal((await fs.readdir(root)).length,count);
  });
  await check("permission revoked during scanner wait rejects commit and removes admitted file",async()=>{
   const count=(await fs.readdir(root)).length;
   app.alageum.documents=createDocuments({db,auth:app.alageum.auth,audit,storage:{...storage,admit:async file=>{const value=await storage.admit(file);await table(db,"roles").where({id:roleId}).update({permissions:JSON.stringify(["document.read"])});return value;}}});
   await upload({status:403});assert.equal((await fs.readdir(root)).length,count);
   await table(db,"roles").where({id:roleId}).update({permissions:JSON.stringify(["document.read","document.create"])});
  });
  await check("transactional audit failure rolls back all upload rows and removes bytes",async()=>{
   const count=(await fs.readdir(root)).length, rows=await table(db,"documents").count("* AS count").first();
   app.alageum.documents=createDocuments({db,auth:app.alageum.auth,audit:async(tx,ctx,event)=>{await audit(tx,ctx,event);throw new Error("Disposable audit failure");},storage});
   await upload({status:500});assert.deepEqual(await table(db,"documents").count("* AS count").first(),rows);assert.equal((await fs.readdir(root)).length,count);
  });
 } finally {
  app.alageum.documents=saved;
  await table(db,"roles").where({id:roleId}).update({permissions:typeof originalRole.permissions === "string" ? originalRole.permissions : JSON.stringify(originalRole.permissions)});
  await cleanupRows();
  for(const fn of cleanups.reverse())await fn();
 }
};
