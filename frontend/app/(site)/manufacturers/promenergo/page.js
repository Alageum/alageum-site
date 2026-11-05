import Page from '@/components/public/EngineeringOrganizationPage';
import {engineeringOrganizationById} from '@/lib/public/engineering-organizations';
import {companyPageMetadata} from '@/lib/public/company-metadata';
export async function generateMetadata({params}){const item=engineeringOrganizationById('promenergo');return companyPageMetadata({title:item.title,description:item.description},item.href,(await params)?.locale||'ru');}
export default function EngineeringProfile(){return <Page id="promenergo"/>;}
