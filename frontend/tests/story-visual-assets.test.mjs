import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const photos=JSON.parse(readFileSync('../docs/public-visual-pass-2026-11-01/photos.json'));
const thumbs=JSON.parse(readFileSync('lib/public/material-thumbnails.json'));
test('new editorial photographs retain original corporate provenance and unchanged local hashes',()=>{
 for(const photo of photos){
  assert.equal(new URL(photo.sourcePage).hostname,'alageum.com');
  assert.equal(new URL(photo.sourceImage).hostname,'alageum.com');
  assert.ok(photo.width>=900&&photo.height>=350);
  const bytes=readFileSync('public'+photo.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),photo.sha256);
  assert.match(photo.rights,/No explicit reuse licence/);
 }
});
test('archive previews use an actual image from their own original document',()=>{
 for(const [id,photo] of Object.entries(thumbs)){
  const doc=JSON.parse(readFileSync(`lib/public/materials/${id}.json`));
  assert.ok(doc.blocks.some(block=>block.type==='image'&&block.src===photo.src));
  assert.ok(existsSync('public'+photo.src));
 }
});
test('document previews retain the identity of their original PDF page',()=>{
 const previews=JSON.parse(readFileSync('../docs/public-visual-pass-2026-11-01/document-previews.json'));
 for(const preview of previews){
  assert.equal(preview.page,1);
  assert.equal(createHash('sha256').update(readFileSync('public'+preview.sourcePdf)).digest('hex'),preview.sourceSha256);
  assert.equal(createHash('sha256').update(readFileSync('public'+preview.path)).digest('hex'),preview.sha256);
 }
});
