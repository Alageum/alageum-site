import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from './CorporateArrow';
import {localSourceHref} from '@/lib/public/localResources';
export default function SourceNote({ href = 'https://alageum.com/ru', children = 'Официальный сайт ALAGEUM Electric', checkedAt = '30.09.2026' }) {
  href=localSourceHref(href);
  return <LocaleElement as="p" className="public-source"><LocaleElement as="span">Источник</LocaleElement>{href&&<LocaleElement as="a" href={href}>{children} <CorporateArrow /></LocaleElement>}<LocaleElement as="span">Проверено {checkedAt}</LocaleElement></LocaleElement>;
}
