'use client';
import {useEffect,useRef,useState} from 'react';
export default function AnimatedNumber({value,decimals=0,suffix='',prefix=''}){
 const ref=useRef(null);const [shown,setShown]=useState(value);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');if(media.matches||!('IntersectionObserver'in window))return;
  let frame;const stop=()=>{cancelAnimationFrame(frame);setShown(value);};
  const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting&&e.intersectionRatio>=.5))return;observer.disconnect();const start=performance.now();const tick=now=>{const p=Math.min(1,(now-start)/900);setShown(value*(1-Math.pow(1-p,3)));if(p<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);},{threshold:.5});
  observer.observe(ref.current);media.addEventListener('change',stop);return()=>{observer.disconnect();cancelAnimationFrame(frame);media.removeEventListener('change',stop);};
 },[value]);
 const format=n=>n.toLocaleString('ru-RU',{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
 return <span ref={ref} className="visual-number"><span className="sr-only">{prefix}{format(value)}{suffix}</span><span aria-hidden="true">{prefix}{format(shown)}{suffix}</span></span>;
}
