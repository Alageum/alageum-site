"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useAuth } from "@/components/AuthProvider";
import SupportWorkspace from "@/components/support/SupportWorkspace";
import { supportAccess } from "@/lib/support/model";

export default function SupportPage() {
  const { profile, loading, authScope } = useAuth();
  const { readable, creatable } = supportAccess(profile?.permissions);
  return <>
    <LocaleElement as="h1">Поддержка</LocaleElement>
    {loading ? <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement> : !readable && !creatable ?
    <LocaleElement as="section" className="card"><LocaleElement as="p" role="alert">У вашей учётной записи нет доступа к обращениям поддержки.</LocaleElement></LocaleElement> :
    <SupportWorkspace key={`${authScope}:${readable}:${creatable}`} scope={authScope} readable={readable} creatable={creatable} />}
  </>;
}
