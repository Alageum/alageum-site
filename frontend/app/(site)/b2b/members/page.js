import WorkspaceHeading from "@/components/b2b/WorkspaceHeading";
import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import MembersAccess from '@/components/members/MembersWorkspace';

export default function MembersPage() {
  return <><WorkspaceHeading title="Участники" /><Suspense fallback={<LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>}><MembersAccess /></Suspense></>;
}
