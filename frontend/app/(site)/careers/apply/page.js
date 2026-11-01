import { Intro } from "@/components/careers/Editorial";
import LocaleElement from "@/components/careers/Text";
import { Suspense } from "react";
import CareerApplication from "@/components/ecosystem/CareerApplication";
import { EcoSection } from "@/components/ecosystem/Parts";
export const metadata = { title: "Отклик и резюме" };
export default async function Apply({ searchParams }) {
  const internship = (await searchParams)?.type === "internship";
  return (
    <LocaleElement as="div" className="eco-page">
      {internship && (
        <div className="site-container career-back">
          <LocaleElement
            as="a"
            className="site-text-link"
            href="/careers/internships"
          >
            О программе стажировки
          </LocaleElement>
        </div>
      )}
      <Intro
        label={internship ? "СТУДЕНТАМ И ВЫПУСКНИКАМ" : "ОТКЛИК"}
        title={internship ? "Отклик на стажировку" : "Подготовить отклик"}
      >
        Заполните черновик и подготовьте письмо HR. Форма не отправляет данные
        работодателю.
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
            "Спросите о предприятии, городе, графике, зарплате, требованиях безопасности и обучении. Условия одного завода не распространяются на всю группу.",
          ],
          [
            "Как отправить резюме?",
            "Сохраните черновик или подготовьте письмо HR. Файл из браузера не прикрепляется к письму автоматически — добавьте его самостоятельно.",
          ],
          [
            "Когда ждать ответа?",
            "Подтверждённый срок ответа не опубликован. Порядок интервью и следующий шаг уточните у HR.",
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
