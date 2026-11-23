import E from '@/components/locale/LocaleElement';
import { Source } from './story/Story';
import { enterpriseResearch } from '@/lib/public/enterprise-research';

export default function EnterpriseResearch({ id }) {
  const entries = enterpriseResearch[id] || [];
  return entries.map(({ title, text, href, source, extra }) => (
    <article key={title} className="enterprise-research-entry">
      <E as="h3">{title}</E>
      <E as="p">{text}</E>
      <Source href={href}>{source}</Source>
      {extra && <Source href={extra[0]}>{extra[1]}</Source>}
    </article>
  ));
}
