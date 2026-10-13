import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import MembersAccess from '@/components/members/MembersWorkspace';

export default function MembersPage() {
  return <><LocaleElement as="h1">Участники</LocaleElement><Suspense fallback={<LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>}><MembersAccess /></Suspense></>;
}
