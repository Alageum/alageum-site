import { Intro, Source } from "@/components/careers/Editorial";
import VacancyDirectory from "@/components/ecosystem/VacancyDirectory";
import { careerSource } from "@/lib/ecosystem/careers";
export const metadata = { title: "Вакансии и направления работы" };
export default function Vacancies() {
  return (
    <>
      <Intro label="КАРЬЕРА" title="Вакансии">
        Выберите профессию и посмотрите требования. Если подходящей вакансии нет, отправьте резюме в HR.
      </Intro>
      <section className="career-section career-vacancies">
        <VacancyDirectory />
        <Source href={careerSource}>Публикация о вакансиях</Source>
      </section>
    </>
  );
}
