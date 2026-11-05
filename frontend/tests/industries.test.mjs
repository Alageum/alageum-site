import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {industries,industryById} from '../lib/public/industries.js';
import {projectById} from '../lib/public/content.js';
const material = source => new URL(`../lib/public/materials/${source.slice('/materials/'.length)}.json`,import.meta.url);
test('seven industry routes resolve to distinct entries with working project and archive destinations',()=>{
 assert.equal(industries.length,7);assert.equal(new Set(industries.map(x=>x.id)).size,7);
 for(const item of industries){assert.equal(industryById(item.id),item);assert.equal(item.href,`/industries/${item.id}`);assert.ok(item.projectIds.length||(item.evidence||[]).length);for(const id of item.projectIds)assert.ok(projectById(id),`Missing project ${id}`);for(const evidence of item.evidence||[])assert.ok(existsSync(material(evidence.source)),evidence.source)}
 assert.equal(industryById('unknown-industry'),undefined);
});
test('industry evidence preserves the actual archived supply and development status',()=>{
 const oil=industryById('oil-gas');assert.equal(oil.projectIds.length,0);const oilSource=JSON.parse(readFileSync(material(oil.evidence[0].source),'utf8'));assert.equal(oilSource.published,'2014-07-21');assert.ok(oilSource.blocks.some(x=>x.text?.includes('отправлен на экспертизу')));assert.match(oil.evidence[0].description,/не подтверждает/);
 const metal=industryById('industry-mining').evidence[0];const original=JSON.parse(readFileSync(material(metal.source),'utf8'));assert.equal(original.published,'2021-05-26');assert.ok(original.blocks.some(x=>x.text?.includes('80 МВА')&&x.text?.includes('110 кВ')));assert.match(metal.description,/80 МВА, 110 кВ/);
 const erg=industryById('industry-mining').evidence[1];assert.match(erg.label,/Договор/);assert.match(erg.description,/не завершённую поставку/);
});
test('renewables retain the published station capacity and limited supply role',()=>{
 const item=industryById('renewables');assert.deepEqual(item.projectIds,['burnoye-solar','ereymentau-wind']);assert.match(projectById('ereymentau-wind').note,/мощность станции/);assert.match(projectById('burnoye-solar').note,/Точный состав поставки/);
 assert.match(industryById('epc').note,/не означает выполнение полного EPC/);
});
