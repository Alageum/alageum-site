import { unstable_rethrow } from 'next/navigation';
import LocaleElement from '@/components/locale/LocaleElement';
import { loadNews } from '@/lib/api/newsServer';
import NewsCards from './NewsCards';
import {homeArchiveNews} from '@/lib/public/home-news';
export default async function NewsFeed({ locale = 'ru', limit = 3 }) {
  let result;
  try { result = await loadNews(locale, 1, limit); }
  catch (error) { unstable_rethrow(error); return <LocaleElement as="p" className="eco-notice" role="status">Новости временно недоступны. Попробуйте обновить страницу позже.</LocaleElement>; }
  return result.data.length ? <NewsCards items={result.data} /> : <><LocaleElement as="p" className="site-metadata" style={{marginBottom:20}}>Из архива компании</LocaleElement><NewsCards items={homeArchiveNews(limit)} /></>;
}
