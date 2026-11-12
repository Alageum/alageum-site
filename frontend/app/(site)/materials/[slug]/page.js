import { localResourceHref } from '@/lib/public/localResources';
import { notFound } from 'next/navigation';
import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import index from '@/lib/public/materials-index.json';
import { translateArchiveText as translateText } from '@/lib/i18n/archive';
import { localizeMaterial } from '@/lib/public/material-localization';
import './materials.css';
import { Story, Hero, Jump } from '@/components/public/story/Story';

export function generateStaticParams() {
  return index.items.map(item => ({ slug: item.id }));
}

export async function generateMetadata({ params }) {
  const { slug, locale = 'ru' } = await params;
  const item = index.items.find(item => item.id === slug);
  return { title: translateText(item?.title || 'Материалы компании', locale) };
}

export default async function Material({ params }) {
  const { slug, locale = 'ru' } = await params;
  if (!index.items.some(item => item.id === slug)) notFound();
  const source = (await import(`@/lib/public/materials/${slug}.json`)).default;
  // Apply source-dependent visibility before translating a document title.
  const blocks = source.blocks.filter(block => !source.attachments?.some(file =>
    block.type === 'paragraph' && block.text === file.title && localResourceHref(file.url) === null,
  ));
  const item = localizeMaterial({ ...source, blocks }, text => translateText(text, locale));

  return <Story name="archive-reader">
    <Hero label={item.title} kicker={null} parent={{ href: '/materials', label: 'Архив' }} variant="wide"
      title={item.title} lead={item.published ? item.published.split('-').reverse().join('.') : undefined} />
    <article className="story-reader">
      <E as="p" className="material-language">{locale === 'ru' ? 'Публикация на языке оригинала' : 'Перевод архивной публикации'}</E>
      <div className="material-copy" lang={locale}>
        {item.blocks.map((block, i) => block.type === 'image' ?
          <figure key={i}><Image src={block.src} alt={block.alt} width={1000} height={640} /></figure> :
          block.type === 'heading' ? <h2 key={i}>{block.text}</h2> :
          block.type === 'list' ? <ul key={i}>{block.items.map((text, j) => <li key={j}>{text}</li>)}</ul> :
          block.type === 'table' ? <div className="material-table-scroll" key={i}><table><tbody>
            {block.rows.map((row, j) => <tr key={j}>{row.map((text, k) => <td key={k}>{text}</td>)}</tr>)}
          </tbody></table></div> : <p key={i}>{block.text}</p>)}
      </div>
      <footer className="story-reader-footer"><div>
        <E as="p">Сведения приведены по состоянию на дату публикации.</E>
        <E as="p">{item.copyright}</E>
      </div><Jump href="/materials">Вернуться в архив</Jump></footer>
    </article>
  </Story>;
}
