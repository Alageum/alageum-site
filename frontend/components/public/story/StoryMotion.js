'use client';
import {useEffect,useRef} from 'react';
// Content is readable before hydration and when motion is disabled.
export default function StoryMotion({children,className}) {
 const root=useRef(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  if(media.matches||!('IntersectionObserver' in window))return;
  const running=new Set();
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(!entry.isIntersecting)return;observer.unobserve(entry.target);
   const animation=entry.target.animate([{transform:'translateY(20px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:620,easing:'cubic-bezier(.2,.7,.2,1)'});
   running.add(animation);animation.finished.then(()=>running.delete(animation)).catch(()=>{});
  }),{threshold:.08});
  root.current.querySelectorAll('.story-section-heading,.story-ledger>article,.story-facts>div,.visual-photo-essay>figure,.story-leaders>article,.story-document-grid>article,.story-production-lanes>article,.story-hero-photo').forEach(el=>observer.observe(el));
  const stop=()=>{if(media.matches){observer.disconnect();running.forEach(a=>a.cancel());}};
  media.addEventListener('change',stop);
  return()=>{observer.disconnect();running.forEach(a=>a.cancel());media.removeEventListener('change',stop);};
 },[]);
 return <div ref={root} className={className}>{children}</div>;
}
