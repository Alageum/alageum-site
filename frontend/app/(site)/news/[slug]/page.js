import { notFound } from 'next/navigation';
import LocaleElement from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import { EcoHero, EcoSection, EcoSource, EcoActions } from '@/components/ecosystem/Parts';
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
  return <LocaleElement as="div" className="eco-page"><EcoHero label={item.topic || 'НОВОСТИ'} title={item.title} text={item.date.split('-').reverse().join('.')} /><EcoSection>
    {item.photo && <Image className="news-article-cover" src={item.photo} alt={item.cover?.alt || item.title} width={item.cover?.width || 1200} height={item.cover?.height || 750} unoptimized={Boolean(item.cover)} />}
    <LocaleElement as="p" className="eco-section-lead">{item.text}</LocaleElement>
    {item.body && <EditorialBlocks body={item.body} />}
    {item.source && <EcoSource href={item.source} note="Краткое изложение официальной публикации. Данные о последующих событиях здесь не заявляются." />}
    <LocaleElement as="div" className="site-actions"><EcoActions primary={item.project || '/news'} primaryLabel={item.project ? 'Связанный проект' : 'Все новости'} secondary="/" secondaryLabel="На главную" /></LocaleElement>
  </EcoSection></LocaleElement>;
}
