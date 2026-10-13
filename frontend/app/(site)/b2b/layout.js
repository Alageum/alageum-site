"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useEffect, useState, useSyncExternalStore } from "react";import {
  usePathname, useRouter } from "@/components/locale/navigation";
import Link from "@/components/locale/LocaleLink";
import B2BNav from "@/components/B2BNav";
import { useAuth } from "@/components/AuthProvider";
import { organizationContentBoundary, organizationDestination } from "@/lib/organizations/navigation";
import { getSessionGeneration, subscribeSession } from "@/lib/api/sessionTransport";
import { getSession } from "@/lib/api/client";

export default function B2BLayout({ children }) {
  const { profile, loading } = useAuth();
  const sessionGeneration = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const router = useRouter(),pathname = usePathname();
  const tenantKey = profile ? JSON.stringify([sessionGeneration, profile.user?.id, profile.organization?.id]) : null;
  const [boundary, setBoundary] = useState(() => ({ key: null, blockedPath: null, sessionGeneration: getSessionGeneration() }));
  const nextBoundary = organizationContentBoundary(boundary, tenantKey, sessionGeneration, pathname);
  if (boundary !== nextBoundary) {
    // Gate the old detail synchronously; an effect-only redirect would allow it
    // to mount and request the old record under the newly committed tenant.
    setBoundary(nextBoundary);
  }
  const redirecting = Boolean(boundary.blockedPath && boundary.blockedPath === pathname);
  useEffect(() => {
    if (redirecting) router.replace(organizationDestination(pathname));
  }, [redirecting, pathname, router]);

  return <LocaleElement as="div" className="shell"><B2BNav /><LocaleElement as="section">
    {loading || redirecting ? <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement> : profile ? <LocaleElement as="div" key={tenantKey}>{children}</LocaleElement> : <LocaleElement as="section" className="card"><LocaleElement as="h1">{getSession().access_token ? "Выберите доступную организацию" : "Войдите в B2B кабинет"}</LocaleElement><LocaleElement as="p">Для доступа к данным компании необходимо подтверждённое членство. Статус заявки доступен в личном кабинете.</LocaleElement><Link className="button" href="/account">Открыть личный кабинет</Link></LocaleElement>}
  </LocaleElement></LocaleElement>;
}
