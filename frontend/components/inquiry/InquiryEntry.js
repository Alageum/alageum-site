'use client';
import { useSearchParams } from 'next/navigation';
import LiveInquiry from '@/components/quotes/LiveInquiry';
import { isApiCatalog } from '@/lib/catalog/apiData';
import InquiryForm from './InquiryForm';
import { initialInquiry } from '@/lib/inquiry/model';
import { solutionById } from '@/lib/public/solutions';
export default function InquiryEntry() {
  const params = useSearchParams();
  if (isApiCatalog(params)) return <LiveInquiry />;
  const initial = initialInquiry(Object.fromEntries(params));
  initial.solution = solutionById(initial.solution)?.title || initial.solution;
  return <InquiryForm key={`${initial.intent}-${initial.solution}`} initial={initial} />;
}
