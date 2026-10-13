import Page, { metadata as originalMetadata } from '@/app/(site)/careers/vacancies/page';
import { localizeMetadata } from '@/lib/i18n/server';
export default Page;
export async function generateMetadata(props) { const locale = (await props.params).locale; return localizeMetadata(originalMetadata, locale); }
