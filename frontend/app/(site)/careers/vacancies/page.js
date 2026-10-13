import LocaleElement from "@/components/locale/LocaleElement";import { EcoHero, EcoSection, EcoSource } from '@/components/ecosystem/Parts';
import VacancyDirectory from '@/components/ecosystem/VacancyDirectory';
import { careerSource } from '@/lib/ecosystem/careers';
export const metadata = { title: 'Вакансии и направления работы' };
export default function Vacancies() {return <LocaleElement as="div" className="eco-page"><EcoHero label="ВАКАНСИИ" title="Найдите своё направление." text="Позиции из официальной публикации компании. Дата закрытия, город и текущая доступность уточняются у HR." /><EcoSection><VacancyDirectory /><EcoSource href={careerSource} /></EcoSection></LocaleElement>;}
