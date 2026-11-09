import { Source } from "@/components/careers/Editorial";
import L from "@/components/careers/Text";
import VacancyDirectory from "@/components/ecosystem/VacancyDirectory";
import { careerSource } from "@/lib/ecosystem/careers";
export const metadata = { title: "Вакансии и направления работы" };
export default function Vacancies() {
  return (
    <>
      <section className="career-section career-vacancies">
        <header className="career-vacancy-header">
          <div>
            <L as="p" className="site-eyebrow">КАРЬЕРА</L>
            <L as="h1">Вакансии</L>
          </div>
          <L as="a" className="site-text-link" href="/careers/apply">
            Подготовить отклик
          </L>
        </header>
        <VacancyDirectory />
        <Source href={careerSource}>Публикация о вакансиях</Source>
      </section>
    </>
  );
}
