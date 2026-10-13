import LocaleElement from "@/components/locale/LocaleElement";import { quoteStatus } from '@/lib/quotes/model';
import { QUOTE_PRINT_NOTICE, QUOTE_PRINT_TITLE, quotePrintDate, quotePrintItem } from '@/lib/quotes/print';

export default function QuotePrintDocument({ quote, paper = false }) {
  return <LocaleElement as="article" className="quote-print-document" data-quote-print-document={paper ? 'paper' : 'preview'}>
    <LocaleElement as="header" className="quote-print-heading"><LocaleElement as="p" className="quote-print-eyebrow">Сохранённый запрос покупателя</LocaleElement><LocaleElement as="h1">{QUOTE_PRINT_TITLE}</LocaleElement><LocaleElement as="p" className="quote-print-id">ID: {quote.id}</LocaleElement><LocaleElement as="p">Дата сохранения: <LocaleElement as="time" dateTime={quote.created_at}>{quotePrintDate(quote.created_at)}</LocaleElement></LocaleElement><LocaleElement as="p">Статус: {quoteStatus(quote.status)} · Позиций: {quote.items.length}</LocaleElement></LocaleElement>
    <LocaleElement as="p" className="quote-print-notice">{QUOTE_PRINT_NOTICE}</LocaleElement>
    {quote.comment && <LocaleElement as="section" className="quote-print-comment"><LocaleElement as="h2">Сообщение покупателя</LocaleElement><LocaleElement as="p">{quote.comment}</LocaleElement></LocaleElement>}
    <LocaleElement as="section" className="quote-print-items"><LocaleElement as="h2">Состав сохранённого запроса</LocaleElement><LocaleElement as="p" className="quote-print-explanation">Данные приведены только из сохранённого запроса. Отсутствующие исторические сведения не заменяются актуальными данными каталога или профиля компании.</LocaleElement>
      <LocaleElement as="ol">{quote.items.map((item, index) => {
          const line = quotePrintItem(item);
          return <LocaleElement as="li" key={line.id} className="quote-print-item"><LocaleElement as="h3"><LocaleElement as="span">{index + 1}. </LocaleElement>{line.title}</LocaleElement>
          {line.missingSnapshot ? <LocaleElement as="p" className="quote-print-missing">Историческая копия товара не сохранена. Название, артикул, цена и версия на дату запроса недоступны.</LocaleElement> : line.missingName && <LocaleElement as="p" className="quote-print-missing">Историческое название товара не сохранено.</LocaleElement>}
          <LocaleElement as="dl"><LocaleElement as="div"><LocaleElement as="dt">Артикул</LocaleElement><LocaleElement as="dd">{line.sku}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Количество</LocaleElement><LocaleElement as="dd">{line.quantity}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Справочная цена за единицу</LocaleElement><LocaleElement as="dd">{line.price}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Версия товара</LocaleElement><LocaleElement as="dd">{line.version}</LocaleElement></LocaleElement></LocaleElement>
          <LocaleElement as="p" className="quote-print-product-id">ID товара: {line.productId}</LocaleElement>
        </LocaleElement>;
        })}</LocaleElement>
    </LocaleElement>
    <LocaleElement as="footer" className="quote-print-end">Конец запроса · ID: {quote.id}</LocaleElement>
  </LocaleElement>;
}
