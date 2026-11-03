import CorporateArrow from "@/components/public/CorporateArrow";
import L from "@/components/careers/Text";
import { notFound } from "next/navigation";
import { Intro, Action, Source } from "@/components/careers/Editorial";
import { jobs } from "@/lib/ecosystem/careers";
export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: jobs.find((j) => j.id === id)?.title || "Вакансия" };
}
export default async function Vacancy({ params }) {
  const { id } = await params;
  const job = jobs.find((j) => j.id === id);
  if (!job) notFound();
  return (
    <>
      <div className="site-container career-back">
        <L as="a" className="site-text-link" href="/careers/vacancies">
          <CorporateArrow direction="right" />
          Все вакансии
        </L>
      </div>
      <Intro label={job.field} title={job.title} />
      <section className="career-section">
        <L as="p" className="eco-notice">
          {job.status === "closed"
            ? "Вакансия закрыта. Можно подготовить инициативный отклик."
            : "Архивная публикация. Уточните у HR, открыт ли сейчас набор на эту должность."}
        </L>
        <div className="career-facts">
          <div>
            <L as="h2">Задачи и требования</L>
            <L as="p">{job.text}</L>
            <ul>
              {job.requirements.map((r) => (
                <L as="li" key={r}>
                  {r}
                </L>
              ))}
            </ul>
            <Source href={job.source}>Публикация о вакансиях</Source>
          </div>
          <aside>
            <L as="h3">Город, график и зарплата</L>
            <L as="p">
              В архивной публикации указан Алматы. Предприятие, действующий график и зарплату уточните у HR перед отправкой резюме.
            </L>
            <Action
              href={
                job.status === "closed"
                  ? "/careers/apply"
                  : `/careers/apply?position=${job.id}`
              }
            >
              {job.status === "closed"
                ? "Резюме без выбора вакансии"
                : "Спросить о вакансии"}
            </Action>
          </aside>
        </div>
      </section>
    </>
  );
}

export const dynamicParams = false;
export function generateStaticParams() {
  return jobs.map(({ id }) => ({ id }));
}
