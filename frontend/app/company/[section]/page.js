import {notFound,permanentRedirect} from 'next/navigation';
import CommunityPage from '@/components/public/company/CommunityPage';
import {companyDestination} from '@/lib/public/company-architecture';
import {companyPageMetadata} from '@/lib/public/company-metadata';
export async function generateMetadata({params}){const {section,locale='ru'}=await params;if(section!=='social')return {title:'Компания'};return companyPageMetadata({title:section==='social'?'Социальная ответственность':'Компания',description:'Подготовка специалистов, помощь городским электросетям, поддержка спорта и культуры.'},'/company/social',locale);}
export default async function CompanySection({params}){const {section,locale='ru'}=await params;const target=companyDestination(section,locale);if(target)permanentRedirect(target);if(section!=='social')notFound();return <CommunityPage/>;}
