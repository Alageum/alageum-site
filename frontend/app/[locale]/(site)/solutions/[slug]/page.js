import Page, { generateMetadata as originalMetadata } from '@/app/(site)/solutions/[slug]/page';
import { localizeMetadata } from '@/lib/i18n/server';
export default Page;
export async function generateMetadata(props) { const locale = (await props.params).locale; return localizeMetadata(await originalMetadata(props), locale); }
