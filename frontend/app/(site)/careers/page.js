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
              Работа, которая
              <br />
              даёт энергию.
            </L>
            <L as="p" className="corp-lead">
              Проектирование, производство и строительство. Найдите свою задачу
              на предприятиях Alageum Electric.
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
          По публикации Alageum Electric от 19 марта 2026 года: 14 действующих
          заводов и более 4500 специалистов в группе.
        </L>
        <Source
          href={careerEvidence.group.url}
          publishedAt={careerEvidence.group.publishedAt}
        >
          Масштаб группы
        </Source>
      </div>
      <section className="corp-cycle" id="directions">
        <div className="site-container">
          <SectionHeading
            number="01"
            label={<L>НАПРАВЛЕНИЯ РАБОТЫ</L>}
            title={<L>Найдите свою задачу.</L>}
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
              Профессия начинается
              <br />с конкретной площадки.
            </L>
            <L as="p">
              Предприятия группы различаются специализацией и условиями работы.
              Посмотрите производство и расположение площадки, прежде чем
              выбирать позицию.
            </L>
            <L as="p">
              В профиле Asia Trafo указаны столовая, спортивный зал и общежитие.
              Их доступность и условия для вашей позиции уточните у предприятия.
            </L>
            <L as="a" className="site-text-link" href="/manufacturers">
              Предприятия и рабочие площадки
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
            Развитие связано
            <br />с вашей площадкой.
          </L>
        </div>
        <div>
          <L as="p">
            В публикации об Уральском трансформаторном заводе от 21 декабря 2023
            года обучение работников названо частью коллективного договора,
            принятого в 2022 году. Это информация об УТЗ, а не единые условия
            всех предприятий группы.
          </L>
          <L as="p">
            Перед откликом уточните у выбранного предприятия актуальную
            программу обучения, требования к квалификации и порядок адаптации.
            Единая подтверждённая программа развития для всех сотрудников здесь
            не заявляется.
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
          <L as="h2">Первый опыт в профессии.</L>
          <L as="p">
            На официальном сайте описана летняя стажировка на заводах и в офисах
            группы. Направления программы и подготовка к обращению — на странице
            для студентов.
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
