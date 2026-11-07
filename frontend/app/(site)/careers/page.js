import { careerEvidence } from "@/components/careers/sources";
import L from "@/components/careers/Text";
import { Photo, Action, Source } from "@/components/careers/Editorial";
import CorporateArrow from "@/components/public/CorporateArrow";
import { SectionHeading } from "@/components/public/CorporateParts";
import { careerFields, internshipSource } from "@/lib/ecosystem/careers";
export const metadata = {
  title: "Карьера в Alageum Electric",
  description:
    "Предприятия и профессии Alageum Electric. Вакансии, стажировки и подготовка отклика.",
};
export default function CareersHome() {
  return (
    <div className="corp-home career-home">
      <div className="corp-hero-band">
        <section className="corp-home-hero site-container career-home-hero">
          <div className="corp-hero-copy">
            <L as="p" className="site-eyebrow">
              ALAGEUM ELECTRIC / КАРЬЕРА
            </L>
            <L as="h1">
              Работа в
              <br />
              Alageum Electric.
            </L>
            <L as="p" className="corp-lead">
              Работа для инженеров, конструкторов, производственных рабочих и специалистов по строительству.
            </L>
            <div className="site-actions">
              <Action href="/careers/vacancies">Смотреть вакансии</Action>
              <L as="a" className="site-text-link" href="/careers/internships">
                Студентам и выпускникам
                <CorporateArrow direction="right" />
              </L>
            </div>
          </div>
          <Photo
            id="aemz"
            caption="АЭМЗ · сборка электротехнического оборудования"
            priority
            className="corp-hero-image"
          />
        </section>
      </div>
      <div className="site-container career-evidence">
        <L as="p">
          В публикации от 19 марта 2026 года компания указывает 14 действующих заводов и более 4500 сотрудников в группе.
        </L>
        <Source
          href={careerEvidence.group.url}
          publishedAt={careerEvidence.group.publishedAt}
        >
          Заводы и сотрудники
        </Source>
      </div>
      <section className="corp-cycle" id="directions">
        <div className="site-container">
          <SectionHeading
            number="01"
            label={<L>НАПРАВЛЕНИЯ РАБОТЫ</L>}
            title={<L>Профессии в группе</L>}
            href="#learning"
            link={<L>Обучение на УТЗ</L>}
          />
          <ol className="corp-stages career-directions">
            {careerFields.map((field, i) => (
              <li key={field.title}>
                <span className="corp-stage-number">0{i + 1}</span>
                <L as="h3">{field.title}</L>
                <L as="p">{field.text}</L>
              </li>
            ))}
          </ol>
          <div className="career-section-action">
            <L as="a" className="site-text-link" href="/careers/vacancies">
              Посмотреть вакансии
              <CorporateArrow />
            </L>
          </div>
        </div>
      </section>
      <section className="corp-white-band" id="workplaces">
        <div className="site-container corp-section career-environment">
          <Photo
            id="asia-trafo"
            caption="Asia Trafo · оператор производственной линии"
          />
          <div>
            <L as="p" className="site-eyebrow">
              02 / РАБОЧАЯ СРЕДА
            </L>
            <L as="h2">
              Где вы будете
              <br />работать
            </L>
            <L as="p">
              Заводы выпускают трансформаторы и распределительное оборудование. Проектные и строительные предприятия работают на энергетических объектах.
            </L>
            <L as="p">
              У Asia Trafo есть столовая, спортивный зал и общежитие. При трудоустройстве уточните условия проживания в общежитии и правила посещения столовой и спортзала.
            </L>
            <L as="a" className="site-text-link" href="/manufacturers">
              Заводы и предприятия
              <CorporateArrow />
            </L>
            <Source href="https://alageum.com/ru/predpriyatiya/too-asia-trafo">
              Профиль Asia Trafo
            </Source>
          </div>
        </div>
      </section>
      <section className="site-container career-plant-learning" id="learning">
        <div>
          <L as="p" className="site-eyebrow">
            ОБУЧЕНИЕ НА ПРЕДПРИЯТИИ
          </L>
          <L as="h2">
            Обучение
            <br />на УТЗ
          </L>
          <Photo id="utz" caption="Уральский трансформаторный завод · производственный цех" className="corp-about-image" />
        </div>
        <div>
          <L as="p">
            Коллективный договор УТЗ, принятый в 2022 году, предусматривает обучение работников и выплаты к юбилейным датам. 21 декабря 2023 года компания сообщила, что завод получил премию «Парыз» за лучший коллективный договор.
          </L>
          <L as="p">
            Перед выходом на работу спросите, кто поможет освоиться и какое обучение нужно пройти.
          </L>
          <Source
            href={careerEvidence.utz.url}
            publishedAt={careerEvidence.utz.publishedAt}
          >
            Обучение на УТЗ
          </Source>
        </div>
      </section>
      <section className="site-container career-students" id="development">
        <div>
          <L as="p" className="site-eyebrow">
            СТУДЕНТАМ И ВЫПУСКНИКАМ
          </L>
          <L as="h2">Стажировки для студентов</L>
          <L as="p">
            Студенты и выпускники технических вузов могут пройти летнюю практику на заводах и в офисах группы. Сроки набора нужно уточнить у HR.
          </L>
          <Source href={internshipSource}>Описание программы</Source>
        </div>
        <L as="a" className="site-text-link" href="/careers/internships">
          О стажировках
          <CorporateArrow />
        </L>
      </section>
    </div>
  );
}
