import Page, {generateMetadata as originalMetadata} from '@/app/(site)/catalog/directions/[slug]/page';
import {localizeMetadata} from '@/lib/i18n/server';
export default Page;
export async function generateMetadata(props) {
  return localizeMetadata(await originalMetadata(props),(await props.params).locale);
}
