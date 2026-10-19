import LocaleElement from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
export default function NewsCards({ items }) {
  return <div className="eco-grid home-news-grid">{items.map(item => <article className={`eco-card${item.photo ? ' eco-card-photo' : ''}`} key={item.id}>
    {item.photo && <Image src={item.photo} alt={item.cover?.alt || item.title} width={760} height={480} unoptimized={Boolean(item.cover)} />}
    <div><LocaleElement as="h3">{item.title}</LocaleElement><LocaleElement as="p">{item.text}</LocaleElement><time dateTime={item.date}>{item.date.split('-').reverse().join('.')}</time><Link className="site-text-link" href={`/news/${item.id}`}>Читать публикацию<CorporateArrow /></Link></div>
  </article>)}</div>;
}
