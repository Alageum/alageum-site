import MaterialDirectory from '@/components/public/MaterialDirectory';
import '@/app/(site)/materials/[slug]/materials.css';
import LocaleElement from "@/components/locale/LocaleElement";import { EcoHero, EcoSection, EcoCard } from '@/components/ecosystem/Parts';
import { news } from '@/lib/ecosystem/news';
export const metadata = { title: 'Новости и события Alageum' };
export default function News() {return <LocaleElement as="div" className="eco-page"><EcoHero label="НОВОСТИ" title="Производство. Проекты. Развитие." text="Подборка официальных публикаций компании. Сведения отражают дату публикации; статус проектов может измениться." /><EcoSection><LocaleElement as="div" className="eco-grid home-news-grid">{news.map((item) => <EcoCard key={item.id} title={item.title} text={item.text} photo={item.photo} href={`/news/${item.id}`} link="Читать публикацию"><LocaleElement as="time" dateTime={item.date}>{item.date.split('-').reverse().join('.')}</LocaleElement></EcoCard>)}</LocaleElement><LocaleElement as="h2" className="news-archive-heading">Архив публикаций</LocaleElement><MaterialDirectory newsOnly/></EcoSection></LocaleElement>;}
