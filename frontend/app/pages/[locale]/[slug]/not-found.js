import LocaleElement from "@/components/locale/LocaleElement";import Link from "@/components/locale/LocaleLink";

export default function EditorialNotFound() {
  return <LocaleElement as="section" className="site-container site-info-page editorial-message">
    <LocaleElement as="p" className="site-eyebrow">404</LocaleElement><LocaleElement as="h1">Страница не найдена</LocaleElement>
    <LocaleElement as="p">Эта страница недоступна на выбранном языке.</LocaleElement>
    <Link href="/" className="site-text-link">На главную</Link>
  </LocaleElement>;
}
