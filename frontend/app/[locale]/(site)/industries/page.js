import Page,{metadata as originalMetadata} from '@/app/(site)/industries/page';
import {localizeMetadata} from '@/lib/i18n/server';
export default Page;
export async function generateMetadata(props){return localizeMetadata(originalMetadata,(await props.params).locale);}
