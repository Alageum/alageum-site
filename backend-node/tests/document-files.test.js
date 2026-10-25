"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), os = require("node:os"), path = require("node:path"), net = require("node:net");
const { createHash } = require("node:crypto");
const { MAX_BYTES, BACKEND, readDocumentConfig, documentType, validateInput, createDocumentStorage } = require("../src/domain/document-files");
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"private-documents-test-"));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return { root, storage:createDocumentStorage({root,maxBytes:MAX_BYTES,maxPixels:1024,scanner:{}}) };
}
test("private document configuration is explicit and canonical",()=>{
 assert.equal(readDocumentConfig((_k,d)=>d).root,"");
 for(const root of ["relative","/","/tmp/../tmp/docs","/tmp/docs\0"]) assert.throws(()=>readDocumentConfig((k,d)=>k==="ALAGEUM_DOCUMENT_ROOT"?root:d),/document_storage_root_invalid/);
});
test("document admission accepts only matching PDF/JPEG/PNG and safe filenames",()=>{
 assert.equal(documentType("report.pdf","application/pdf",pdf),"application/pdf");
 for(const [name,mime,bytes] of [["../x.pdf","application/pdf",pdf],["x.html","text/html",pdf],["x.pdf","image/png",pdf],["x.pdf","application/pdf",Buffer.from("not pdf")],["x.svg","image/svg+xml",Buffer.from("<svg/>")]]) assert.throws(()=>documentType(name,mime,bytes));
});
test("multipart validates exact fields and one file",()=>{
 const ctx={get:()=>"multipart/form-data; boundary=x",request:{body:{title:"Report",type_code:"manual_attachment"},files:{file:{filepath:"/tmp/test"}}}};
 assert.equal(validateInput(ctx).number,null);
 assert.equal(validateInput({...ctx,request:{...ctx.request,files:{file:[ctx.request.files.file]}}}).file,ctx.request.files.file);
 for(const mutate of [c=>c.request.files.file=[],c=>c.request.body.organization_id="forged",c=>c.request.body.title=" ",c=>c.request.body.number=["x"],c=>c.get=()=>"application/json"]){const copy={...ctx,request:{body:{...ctx.request.body},files:{...ctx.request.files}}};mutate(copy);assert.throws(()=>validateInput(copy));}
});
test("private storage survives new instance and verifies hash/size before delivery",async t=>{
 const {root,storage}=await fixture(t),key=await storage.store({bytes:pdf});
 const row={storage_backend:BACKEND,storage_key:key,original_name:"report.pdf",content_type:"application/pdf",size_bytes:pdf.length,checksum_sha256:digest(pdf)};
 assert.deepEqual(await createDocumentStorage({root}).read(row),pdf);
 assert.equal((await fs.stat(path.join(root,key))).mode & 0o777,0o600);
 await assert.rejects(storage.read({...row,checksum_sha256:"0".repeat(64)}),e=>e.code==="document_file_unavailable");
 await assert.rejects(storage.read({...row,size_bytes:pdf.length+1}));
 await assert.rejects(storage.read({...row,storage_key:"../../public/x"}));
 await assert.rejects(storage.read({...row,storage_backend:"public"}));
 await storage.remove(key);assert.deepEqual(await fs.readdir(root),[]);
});
test("private storage rejects symlink, hardlink and non-private files",async t=>{
 const {root,storage}=await fixture(t),key=await storage.store({bytes:pdf}),file=path.join(root,key);
 const row={storage_backend:BACKEND,storage_key:key,original_name:"a.pdf",content_type:"application/pdf",size_bytes:pdf.length,checksum_sha256:digest(pdf)};
 await fs.link(file,path.join(root,"link"));await assert.rejects(storage.read(row));await fs.unlink(path.join(root,"link"));
 await fs.chmod(file,0o644);await assert.rejects(storage.read(row));await fs.chmod(file,0o600);
 const content=path.join(root,"original");await fs.rename(file,content);await fs.symlink(content,file);await assert.rejects(storage.read(row));
});
test("storage disabled, unsafe permissions and public/quarantine overlap fail closed",async t=>{
 await assert.rejects(createDocumentStorage({root:""}).ready(),e=>e.status===503);
 const {root}=await fixture(t);
 for(const config of [{root,publicRoot:root},{root,quarantineRoot:path.dirname(root)}]) await assert.rejects(createDocumentStorage(config).ready());
 await fs.chmod(root,0o755);await assert.rejects(createDocumentStorage({root}).ready());
});
test("real INSTREAM protocol accepted only on clean result; malware and missing scanner refuse",async t=>{
 const {root}=await fixture(t),input=path.join(root,"input.pdf");await fs.writeFile(input,pdf,{mode:0o600});
 const file={filepath:input,originalFilename:"input.pdf",mimetype:"application/pdf"};
 await assert.rejects(createDocumentStorage({root,maxBytes:MAX_BYTES,scanner:{}}).admit(file),e=>e.status===503);
 for(const reply of ["stream: OK","stream: Eicar-Test-Signature FOUND","stream: ERROR"]){
  let received=Buffer.alloc(0);
  const server=net.createServer(socket=>socket.on("data",bytes=>{received=Buffer.concat([received,bytes]);if(received.length>=10+4+pdf.length+4)socket.end(Buffer.from(reply+"\0"));}));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {const store=createDocumentStorage({root,maxBytes:MAX_BYTES,scanner:{host:"127.0.0.1",port:server.address().port,timeoutMs:300}});
   if(reply.endsWith("OK"))assert.deepEqual((await store.admit(file)).bytes,pdf);else await assert.rejects(store.admit(file));
   assert.equal(received.subarray(0,10).toString(),"zINSTREAM\0");
  } finally {await new Promise(resolve=>server.close(resolve));}
 }
});

test("in-memory document admission uses identical bounds/type/scanner policy and snapshots bytes",async t=>{
 const {scannerFixture}=require("./helpers/media-scanner-fixture");
 const scanner=await scannerFixture(t),storage=createDocumentStorage({...scanner.config,root:scanner.root});
 for(const bytes of ["pdf",Buffer.alloc(0),Buffer.alloc(MAX_BYTES+1)]) await assert.rejects(storage.admitBytes({bytes,name:"quote.pdf",mime:"application/pdf"}));
 await assert.rejects(storage.admitBytes({bytes:pdf,name:"../quote.pdf",mime:"application/pdf"}));
 await assert.rejects(storage.admitBytes({bytes:pdf,name:"quote.pdf",mime:"image/png"}));
 assert.equal(scanner.scanned.length,0);
 const bytes=Buffer.from(pdf),pending=storage.admitBytes({bytes,name:"quote.pdf",mime:"application/pdf"});bytes.fill(0);
 const admitted=await pending;assert.deepEqual(admitted.bytes,pdf);assert.equal(admitted.checksum,digest(pdf));assert.equal(admitted.name,"quote.pdf");
 scanner.setResponder(()=>"stream: Eicar-Test-Signature FOUND\0");
 await assert.rejects(storage.admitBytes({bytes:pdf,name:"quote.pdf",mime:"application/pdf"}));
 await assert.rejects(createDocumentStorage({scanner:{}}).admitBytes({bytes:pdf,name:"quote.pdf",mime:"application/pdf"}),e=>e.status===503);
});
