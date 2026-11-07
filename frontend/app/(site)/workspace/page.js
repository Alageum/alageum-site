import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {localizedHref} from '@/lib/i18n/routing';
import LocalDrafts from '@/components/workspace/Workspace';
import './workspace.css';

export const metadata={title:'Кабинет клиента',description:'Проекты, подборки, документы и обращения.'};

export default async function Workspace({searchParams}) {
  const {request, drafts} = await searchParams;
  if (typeof request === 'string' || drafts === '1') return <LocalDrafts />;

  const locale = (await headers()).get('x-alageum-locale') || 'ru';
  redirect(localizedHref('/client', locale));
}
