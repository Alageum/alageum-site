import QuoteDetail from '@/components/quotes/QuoteDetail';
import '../quotes.css';
export const metadata = { title: 'Сохранённый запрос КП' };
export default async function QuoteDetailPage({ params }) {
  const { id } = await params;
  return <QuoteDetail id={id} />;
}
