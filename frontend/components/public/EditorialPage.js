import LocaleElement from "@/components/locale/LocaleElement";import CorporatePage from './CorporatePage';
import PageIntro from './PageIntro';
import EditorialBlocks from './EditorialBlocks';

export default function EditorialPage({ page }) {
  return <CorporatePage className="corp-editorial-page"><LocaleElement as="article" className="editorial-page" lang={page.locale_code}>
    <PageIntro label={page.title} title={page.title} />
    <EditorialBlocks body={page.body} />
  </LocaleElement></CorporatePage>;
}
