import { Intro } from "@/components/careers/Editorial";
import LocaleElement from "@/components/careers/Text";
import { Suspense } from "react";
import CareerApplication from "@/components/ecosystem/CareerApplication";
import { EcoSection } from "@/components/ecosystem/Parts";
export const metadata = { title: "Отклик и резюме" };
export default async function Apply({ searchParams }) {
  const internship = (await searchParams)?.type === "internship";
  return (
    <LocaleElement as="div" className="eco-page career-apply-page">
      <Intro
        label={internship ? "СТУДЕНТАМ И ВЫПУСКНИКАМ" : "ОТКЛИК"}
        title={internship ? "Отклик на стажировку" : "Подготовить отклик"}
        back={internship && (
          <LocaleElement
            as="a"
            className="site-text-link career-back-link"
            href="/careers/internships"
          >
            О программе стажировки
          </LocaleElement>
        )}
      >
        {internship
          ? "Укажите специальность, курс и период, когда сможете пройти практику."
          : "Укажите контакты, интересующую вакансию и подходящий опыт."}
      </Intro>
      <EcoSection>
        <Suspense
          fallback={<LocaleElement as="p">Загружаем форму…</LocaleElement>}
        >
          <CareerApplication />
        </Suspense>
      </EcoSection>
      <section className="career-preparation" id="preparation">
        <LocaleElement as="h2">Перед отправкой</LocaleElement>
        {[
          [
            "Какие условия уточнить?",
            "Уточните, на каком предприятии и в каком городе предстоит работать. Спросите о графике, зарплате, обучении и требованиях безопасности.",
          ],
          [
            "Как отправить резюме?",
            "Откройте подготовленное письмо в почтовой программе, прикрепите резюме и отправьте письмо. Черновик можно сохранить в браузере.",
          ],
          [
            "Когда ждать ответа?",
            "Срок ответа и порядок собеседований уточните у HR.",
          ],
          [
            "Как удалить данные?",
            "Нажмите «Удалить черновик» — контактные данные и сохранённое резюме будут удалены из этого браузера.",
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <LocaleElement as="summary">{q}</LocaleElement>
            <LocaleElement as="p">{a}</LocaleElement>
          </details>
        ))}
      </section>
    </LocaleElement>
  );
}
