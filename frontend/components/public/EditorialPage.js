import LocaleElement from "@/components/locale/LocaleElement";import {Story} from './story/Story';
import PageIntro from './PageIntro';
import EditorialBlocks from './EditorialBlocks';

export default function EditorialPage({ page }) {
  return <Story name="cms"><LocaleElement as="article" className="editorial-page" lang={page.locale_code}>
    <PageIntro label={page.title} title={page.title} />
    <EditorialBlocks body={page.body} locale={page.locale_code} />
  </LocaleElement></Story>;
}
