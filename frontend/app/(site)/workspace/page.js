import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {localizedHref} from '@/lib/i18n/routing';
export const metadata={title:'Кабинет клиента',description:'Проекты, подборки, документы и обращения.'};
export default async function Workspace(){const locale=(await headers()).get('x-alageum-locale')||'ru';redirect(localizedHref('/client',locale));}
