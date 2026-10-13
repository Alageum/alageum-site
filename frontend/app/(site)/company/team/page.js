import LocaleElement from "@/components/locale/LocaleElement";import { EcoHero, EcoSection } from '@/components/ecosystem/Parts';
import Leadership from '@/components/ecosystem/Leadership';
export const metadata = { title: 'Команда и руководство Alageum Electric' };
export default function Team() {return <LocaleElement as="div" className="eco-page"><EcoHero label="КОМАНДА" title="Люди, которые развивают группу." text="Основатель, руководство группы и предприятий. Имена и должности — по официальным материалам компании." /><EcoSection title="Руководство"><Leadership /></EcoSection></LocaleElement>;}
