'use client';
import {useEffect,useRef,useState} from 'react';
import E from '@/components/locale/LocaleElement';

export default function DistributionCircuitMotion({children,className=''}){
 const root=useRef(null);
 const [paused,setPaused]=useState(false);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  if(!('IntersectionObserver' in window))return;
  let inView=false;
  const update=()=>{if(root.current)root.current.dataset.active=String(inView&&!media.matches&&!document.hidden);};
  const observer=new IntersectionObserver(entries=>{
   inView=entries.some(entry=>entry.isIntersecting);
   if(inView&&!media.matches)root.current.dataset.entered='true';
   update();
  },{threshold:0});
  observer.observe(root.current);
  media.addEventListener('change',update);
  document.addEventListener('visibilitychange',update);
  return()=>{observer.disconnect();media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
 },[]);
 return <figure ref={root} className={`distribution-circuit ${className}`} data-paused={paused}><div className="dc-motion-tools"><button type="button" className="dc-motion-toggle" aria-pressed={paused} onClick={()=>setPaused(value=>!value)}><span aria-hidden="true">{paused?'▶':'Ⅱ'}</span><E>{paused?'Продолжить анимацию':'Приостановить анимацию'}</E></button></div>{children}</figure>;
}
