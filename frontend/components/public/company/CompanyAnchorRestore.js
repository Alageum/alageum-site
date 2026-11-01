'use client';
import {useEffect} from 'react';
// App Router loading boundaries may reveal a destination after the browser's
// initial fragment jump. Honour that bookmark once; never scroll without it.
export default function CompanyAnchorRestore({ids,waitFor}){
 const keys=ids.join(' ');
 useEffect(()=>{
  let id;try{id=decodeURIComponent(window.location.hash.slice(1));}catch{return;}
  if(!keys.split(' ').includes(id))return;
  let frame=0,done=false;
  const cleanup=()=>{done=true;cancelAnimationFrame(frame);observer.disconnect();for(const event of ['pointerdown','wheel','touchstart','keydown'])window.removeEventListener(event,cleanup);};
  const restore=()=>{
   if(done||(waitFor&&!document.querySelector(waitFor)))return;
   const target=document.getElementById(id);if(!target)return;
   const bounds=target.getBoundingClientRect();
   if(bounds.top<70||bounds.top>=window.innerHeight)target.scrollIntoView({block:'start',behavior:'instant'});
   cleanup();
  };
  const observer=new MutationObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);});
  observer.observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
  for(const event of ['pointerdown','wheel','touchstart','keydown'])window.addEventListener(event,cleanup,{passive:true,once:true});
  frame=requestAnimationFrame(restore);
  return cleanup;
 },[keys,waitFor]);
 return null;
}
