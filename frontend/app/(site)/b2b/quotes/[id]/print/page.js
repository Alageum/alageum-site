import QuotePrint from '@/components/quotes/QuotePrint';
import '../../quotes.css';
export const metadata = { title: 'Запрос коммерческого предложения · Печать' };
export default async function QuotePrintPage({ params }) {
  const { id } = await params;
  return <QuotePrint id={id} />;
}
