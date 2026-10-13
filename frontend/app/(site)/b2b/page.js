"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useAuth } from "@/components/AuthProvider";
export default function Dashboard() {
  const { profile } = useAuth();
  return <><LocaleElement as="h1">B2B кабинет</LocaleElement><LocaleElement as="div" className="card"><LocaleElement as="p">Организация: {profile?.organization?.name || "—"}</LocaleElement><LocaleElement as="p" className="muted">Доступные разделы зависят от вашей роли в организации.</LocaleElement></LocaleElement></>;
}
