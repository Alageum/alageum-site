import { unstable_rethrow } from 'next/navigation';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { Story, Hero, Section } from '@/components/public/story/Story';
import MaterialDirectory from '@/components/public/MaterialDirectory';
import NewsCards from '@/components/news/NewsCards';
import './news.css';
import { loadNews, newsSource } from '@/lib/api/newsServer';
export const metadata = { title: 'Новости и события Alageum' };
export default async function News({ params, searchParams }) {
  const locale = (await params)?.locale || 'ru';
  const query = newsSource() === 'api' ? await searchParams : undefined;
  const requested = query?.page;
  const page = typeof requested === 'string' && /^[1-9]\d*$/.test(requested) && Number(requested) <= 10000 ? Number(requested) : 1;
  let result, unavailable = false;
  try { result = await loadNews(locale, page, 12); } catch (error) { unstable_rethrow(error); unavailable = true; }
  return <Story name="news"><Hero label="Новости" variant="wide" title="Новости Alageum" lead="Новости предприятий, поставок и проектов Alageum Electric." />{(unavailable || Boolean(result?.data.length) || page > 1) && <Section label="НОВЫЕ ПУБЛИКАЦИИ">
    {unavailable ? <LocaleElement as="p" className="eco-notice" role="status">Новости временно недоступны. Попробуйте обновить страницу позже.</LocaleElement> : result.data.length ? <NewsCards items={result.data} /> : <LocaleElement as="p" className="eco-notice">Публикаций пока нет.</LocaleElement>}
    {result && (page > 1 || page < result.pagination.page_count) && <nav className="site-actions" aria-label="Страницы новостей">{page > 1 && <Link className="site-text-link" href={`/news?page=${page - 1}`}>Предыдущая страница</Link>}{page < result.pagination.page_count && <Link className="site-text-link" href={`/news?page=${page + 1}`}>Следующая страница</Link>}</nav>}
    </Section>}<Section id="news-feed" className="news-feed" tone="paper" label={result?.data.length ? "АРХИВ ПУБЛИКАЦИЙ" : undefined} title="Новости компании"><MaterialDirectory newsOnly />
  </Section></Story>;
}
