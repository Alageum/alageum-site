import Page, {
  generateMetadata as originalMetadata,
} from "@/app/careers/vacancies/[id]/page";
import { localizeMetadata } from "@/lib/i18n/server";
export default Page;
export async function generateMetadata(props) {
  return localizeMetadata(
    await originalMetadata(props),
    (await props.params).locale,
  );
}

export const dynamicParams = false;
export async function generateStaticParams() {
  const { jobs } = await import("@/lib/ecosystem/careers");
  return ["ru", "kk", "en", "zh", "uz"].flatMap((locale) =>
    jobs.map(({ id }) => ({ locale, id })),
  );
}
