import { notFound } from 'next/navigation';
import LocaleElement from '@/components/locale/LocaleElement';
import { Story, Hero, Section, Source, Jump } from '@/components/public/story/Story';
import EditorialBlocks from '@/components/public/EditorialBlocks';
import { loadNewsArticle } from '@/lib/api/newsServer';
import '@/app/pages/editorial-pages.css';
export async function generateMetadata({ params }) {
  const { slug, locale = 'ru' } = await params;
  const item = await loadNewsArticle(locale, slug);
  return item ? { title: item.seoTitle || item.title, description: item.seoDescription || item.text } : { title: 'Публикация не найдена' };
}
export default async function Article({ params }) {
  const { slug, locale = 'ru' } = await params;
  const item = await loadNewsArticle(locale, slug);
  if (!item) notFound();
  return <Story name="news-article"><Hero label={item.topic || 'Новости'} parent={{href:'/news',label:'Новости'}} variant={item.photo?'dark':'wide'} photo={item.photo?{path:item.photo,unoptimized:Boolean(item.cover),width:item.cover?.width||1200,height:item.cover?.height||750,alt:item.cover?.alt||item.title,caption:item.cover?.caption||item.title}:null} title={item.title} lead={item.date.split('-').reverse().join('.')} /><Section>

    <LocaleElement as="p" className="eco-section-lead">{item.text}</LocaleElement>
    {item.body && <EditorialBlocks body={item.body} locale={locale} />}
    {item.source && <Source href={item.source} period="Краткое изложение официальной публикации. Данные о последующих событиях здесь не заявляются." />}
    <LocaleElement as="div" className="site-actions"><Jump href={item.project || '/news'}>{item.project ? 'Связанный проект' : 'Все новости'}</Jump></LocaleElement>
  </Section></Story>;
}
