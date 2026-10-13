import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
import{createRequire}from'node:module';
import{pathToFileURL}from'node:url';
import{renderToStaticMarkup}from'react-dom/server';
const require=createRequire(import.meta.url);
async function harness(){
 const file=new URL('../components/catalog/EquipmentModel.js',import.meta.url);
 const source=(await readFile(file,'utf8'))
  .replace("import { useEffect, useId, useRef, useState } from 'react';", "export const harnessState={status:'idle'}; const useState=()=>[harnessState.status,value=>{harnessState.status=value;}]; const useEffect=()=>{}; const useId=()=> 'test-id'; const useRef=()=>({current:null});")
  .replace("import EquipmentIcon from './EquipmentIcon';", "const EquipmentIcon=({type})=><svg data-preview-icon={type}/>;")
  .replace("'@/lib/catalog/models/types'",JSON.stringify(new URL('../lib/catalog/models/types.js',import.meta.url).href))
  .replace("import styles from './models/EquipmentModel.module.css';", "const styles={};")
  .replace('function ModelViewer(', 'export function ModelViewer(');
 const{transform,loadBindings}=require('next/dist/build/swc');await loadBindings();
 const compiled=await transform(source,{filename:file.pathname,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}});
 const code=compiled.code.replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
function find(element,predicate){if(!element||typeof element!=='object')return null;if(predicate(element))return element;const children=element.props?.children;for(const child of(Array.isArray(children)?children.flat(Infinity):[children])){const match=find(child,predicate);if(match)return match;}return null;}
test('geometry eligibility never grants idle/error/closed preview icon eligibility',async()=>{
 const {ModelViewer,harnessState}=await harness();
 const props={type:'tr26-corrugated-small',previewIconType:null};
 let tree=ModelViewer(props);let html=renderToStaticMarkup(tree);
 assert.match(html,/data-model-preview="source-document"/);assert.doesNotMatch(html,/data-preview-icon=/);
 find(tree,e=>e.type==='button'&&String(e.props.children).includes('Открыть 3D-модель')).props.onClick();
 assert.equal(harnessState.status,'loading');
 html=renderToStaticMarkup(ModelViewer(props));assert.match(html,/<canvas/);assert.doesNotMatch(html,/data-preview-icon=/);
 harnessState.status='ready';tree=ModelViewer(props);assert.doesNotMatch(renderToStaticMarkup(tree),/data-preview-icon=/);
 find(tree,e=>e.props?.['aria-label']==='Закрыть 3D-модель').props.onClick();assert.equal(harnessState.status,'idle');
 html=renderToStaticMarkup(ModelViewer(props));assert.match(html,/data-model-preview="source-document"/);assert.doesNotMatch(html,/data-preview-icon=/);
 harnessState.status='error';html=renderToStaticMarkup(ModelViewer(props));assert.match(html,/data-model-preview="source-document"/);assert.doesNotMatch(html,/data-preview-icon=/);
 harnessState.status='idle';html=renderToStaticMarkup(ModelViewer({...props,previewIconType:'separate-reviewed-icon'}));assert.match(html,/data-preview-icon="separate-reviewed-icon"/);assert.doesNotMatch(html,/data-preview-icon="tr26-corrugated-small"/);
 const wrapper=(await readFile(new URL('../components/catalog/ProductVisual.js',import.meta.url),'utf8'));assert.match(wrapper,/previewIconType=\{previewIcon\.type\}/);
 assert.match(wrapper,/const previewIcon = choice \? \{ type: choice\.iconType, reason: choice\.reason \} : icon/);assert.match(wrapper,/const icon = getEquipmentIcon\(product\)/);
});
