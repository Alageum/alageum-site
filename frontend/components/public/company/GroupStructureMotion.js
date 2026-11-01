'use client';
import {useEffect,useRef} from 'react';
export default function GroupStructureMotion({children}){
 const root=useRef(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  if(media.matches||!('IntersectionObserver'in window))return;
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting||entry.intersectionRatio<.12)continue;
    entry.target.dataset[entry.target===root.current?'entered':'revealed']='true';observer.unobserve(entry.target);
   }
  },{threshold:.12});
  observer.observe(root.current);
  root.current.querySelectorAll('.grp-card').forEach(card=>observer.observe(card));
  const stop=()=>{if(media.matches){observer.disconnect();root.current?.removeAttribute('data-entered');root.current?.querySelectorAll('[data-revealed]').forEach(card=>card.removeAttribute('data-revealed'));}};
  media.addEventListener('change',stop);
  return()=>{observer.disconnect();media.removeEventListener('change',stop);};
 },[]);
 return <section id="structure" className="group-structure" ref={root} aria-labelledby="group-structure-title">{children}</section>;
}
