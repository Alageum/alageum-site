import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from './CorporateArrow';
export default function SourceNote({ href = 'https://alageum.com/ru', children = 'Официальный сайт ALAGEUM Electric', checkedAt = '30.09.2026' }) {
  return <LocaleElement as="p" className="public-source"><LocaleElement as="span">Источник</LocaleElement><LocaleElement as="a" href={href} target="_blank" rel="noopener noreferrer">{children} <CorporateArrow /></LocaleElement><LocaleElement as="span">Проверено {checkedAt}</LocaleElement></LocaleElement>;
}
