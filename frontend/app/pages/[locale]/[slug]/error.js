'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";

export default function EditorialError({ reset }) {
  return <LocaleElement as="section" className="site-container site-info-page editorial-message" role="alert">
    <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC</LocaleElement><LocaleElement as="h1">Не удалось загрузить страницу</LocaleElement>
    <LocaleElement as="p">Пожалуйста, попробуйте ещё раз.</LocaleElement>
    <LocaleElement as="div" className="editorial-message-actions"><LocaleElement as="button" type="button" className="site-button site-button-primary" onClick={reset}>Повторить</LocaleElement><Link href="/" className="site-text-link">На главную</Link></LocaleElement>
  </LocaleElement>;
}
