'use client';
import { useEffect, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api/client';
import { dashboardSections, summaryTotal } from '@/lib/dashboard/summary';
function Summary({section,scope}) {
 const {isAuthScopeCurrent}=useAuth();const [attempt,setAttempt]=useState(0);const [result,setResult]=useState(null);
 useEffect(()=>{const controller=new AbortController();let active=true;
  apiFetch(`${section.path}${section.path.includes('?')?'&':'?'}page=1&page_size=1`,{signal:controller.signal})
   .then(page=>{const total=summaryTotal(page);if(active&&isAuthScopeCurrent(scope))setResult({total});})
   .catch(error=>{if(active&&isAuthScopeCurrent(scope))setResult({error:error.status===403?'Нет доступа':'Не удалось загрузить'});});
  return()=>{active=false;controller.abort();};
 },[section,scope,isAuthScopeCurrent,attempt]);
 return <E as="article" className="card"><E as="h2">{section.label}</E>{!result?<E as="p" role="status">Загрузка…</E>:result.error?<><E as="p" role="alert">{result.error}</E><button type="button" onClick={()=>{setResult(null);setAttempt(value=>value+1);}}>Повторить</button></>:<E as="p">Записей: {result.total}</E>}<Link href={section.href}>Открыть раздел →</Link></E>;
}
export default function Dashboard(){
 const {profile,authScope,loading,hasPermission}=useAuth();
 return <><E as="h1">B2B кабинет</E><E as="div" className="card"><E as="p">Организация: {profile?.organization?.name||'—'}</E><E as="p" className="muted">Данные доступных разделов текущей организации. Отсутствие доступа или ошибка не означают отсутствие записей.</E></E>{!loading&&profile&&<div className="grid">{dashboardSections.filter(section=>hasPermission(section.permission)).map(section=><Summary key={`${authScope}:${section.path}`} section={section} scope={authScope}/>)}</div>}<Link href="/client/projects">Локальные черновики проектов в этом браузере →</Link></>;
}
