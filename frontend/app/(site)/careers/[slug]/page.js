import { careerEvidence } from "@/components/careers/sources";
import { notFound, permanentRedirect } from "next/navigation";
import { localizedHref } from "@/lib/i18n/routing";
import L from "@/components/careers/Text";
import { Intro, Photo, Action, Source } from "@/components/careers/Editorial";
import { careerLegacyDestinations } from "@/components/careers/navigation";
import { internshipSource } from "@/lib/ecosystem/careers";
import { storyPhotos } from "@/lib/public/story-photography";
export async function generateMetadata() {
  return { title: "Студентам и выпускникам · Alageum Electric" };
}
export default async function CareerPage({ params }) {
  const { slug, locale = "ru" } = await params;
  const redirects = careerLegacyDestinations;
  if (redirects[slug])
    permanentRedirect(localizedHref(redirects[slug], locale));
  if (slug !== "internships") notFound();
  return (
    <>
      <Intro label="СТУДЕНТАМ И ВЫПУСКНИКАМ" title="Стажировки для студентов">
        Летняя практика на заводах и в офисах группы для студентов и выпускников технических вузов.
      </Intro>
      <div className="site-container site-actions career-program-actions">
        <Action href="/careers/apply?type=internship">Заполнить отклик</Action>
        <L as="a" className="site-text-link" href="#directions">
          Выбрать направление
        </L>
      </div>
      <section className="career-section career-program-overview">
        <div>
          <L as="p" className="site-eyebrow">
            О ПРОГРАММЕ
          </L>
          <L as="h2">
            Летняя практика
            <br />на предприятии
          </L>
          <L as="p">
            По архивному описанию стажировка занимала от 6 до 10 недель с полным рабочим днём. Студенты работали над текущими задачами и проектами в отделе или производственном цехе.
          </L>
          <L as="p">
            В архивном описании перечислены продажи, закупки, производство, учёт и аудит, проектные работы и подготовка конструкторской документации.
          </L>
          <L as="p" className="eco-notice">
            Даты набора не опубликованы. Уточните у HR, когда можно подать заявку и есть ли свободные места.
          </L>
          <Source href={internshipSource}>Описание программы</Source>
        </div>
        <Photo
          photo={storyPhotos.asiaEngineering}
          priority
        />
      </section>
      <section className="career-section" id="directions">
        <L as="p" className="site-eyebrow">
          НАПРАВЛЕНИЯ СТАЖИРОВКИ
        </L>
        <L as="h2">Где можно пройти практику</L>
        <L as="p" className="career-program-lead">
          Ориентируйтесь на свою специальность. Отдел, город и задачи определяются при согласовании практики.
        </L>
        <dl className="career-program-directions">
          {[
            [
              "Производство",
              "Практика в производственных цехах заводов группы.",
            ],
            [
              "Проектирование и конструкторская документация",
              "Инженерные изыскания, проектирование и подготовка чертежей и технологической документации.",
            ],
            [
              "Продажи и закупки",
              "Практика в отделах продаж и снабжения.",
            ],
            [
              "Учёт и аудит",
              "Практика в подразделениях бухгалтерского учёта и аудита.",
            ],
          ].map(([title, text]) => (
            <div key={title}>
              <L as="dt">{title}</L>
              <L as="dd">{text}</L>
            </div>
          ))}
        </dl>
      </section>
      <section className="career-section career-facts" id="development">
        <div>
          <L as="p" className="site-eyebrow">
            ПОДГОТОВКА К СТАЖИРОВКЕ
          </L>
          <L as="h2">Что указать в резюме</L>
          <L as="p">
            В описании программы среди требований указаны знание английского языка, готовность учиться, ответственность и умение работать в команде. Уточните в отделе кадров, какой уровень английского нужен для выбранного направления.
          </L>
          <L as="p">
            Добавьте учебные проекты, лабораторные работы или практику: какую задачу вы решали, какие инструменты использовали и что получилось.
          </L>
        </div>
        <aside>
          <L as="h3">Если опыта ещё нет</L>
          <L as="p">
            Укажите специальность и добавьте одну-две учебные работы. Опишите свою роль и результат.
          </L>
          <L as="p">
            Окончательные требования и порядок отбора определяет предприятие.
          </L>
        </aside>
      </section>
      <section className="career-section career-program-overview">
        <Photo
          id="ktz"
          caption="Кентауский трансформаторный завод · производственный цех"
        />
        <div>
          <L as="p" className="site-eyebrow">
            МЕСТО И ЗАДАЧИ
          </L>
          <L as="h2">
            Город
            <br />
            и предприятие
          </L>
          <L as="p">
            Уточните в отделе кадров, в каких городах и на каких предприятиях можно пройти практику.
          </L>
          <L as="p">
            До начала стажировки уточните адрес, задачи, имя наставника и порядок инструктажа по безопасности.
          </L>
          <L as="p">
            Также уточните график, продолжительность, оплату и необходимые документы.
          </L>
          <L as="a" className="site-text-link" href="/manufacturers">
            Посмотреть предприятия
          </L>
        </div>
      </section>
      <section className="career-section career-college" id="college">
        <div>
          <L as="p" className="site-eyebrow">
            ПОЛИТЕХНИЧЕСКИЙ КОЛЛЕДЖ
          </L>
          <L as="h2">
            Дуальное образование
            <br />в Кентау
          </L>
          <L as="p">
            В политехническом колледже Кентау обучаются более 800 студентов по направлениям электроснабжения, автоматизации и управления. Данные опубликованы компанией 19 марта 2026 года.
          </L>
          <L as="p">
            Колледж совмещает обучение с производственной практикой по дуальной системе. Приём в колледж проходит отдельно от летней стажировки для студентов вузов.
          </L>
          <Source
            href={careerEvidence.group.url}
            publishedAt={careerEvidence.group.publishedAt}
          >
            Образование в Кентау
          </Source>
        </div>
      </section>
      <section className="career-section career-program-prepare">
        <div>
          <L as="p" className="site-eyebrow">
            СЛЕДУЮЩИЙ ШАГ
          </L>
          <L as="h2">Как подать заявку на стажировку</L>
          <ol>
            {[
              [
                "Укажите образование",
                "Учебное заведение, специальность, курс или год выпуска.",
              ],
              [
                "Выберите интересующее направление",
                "Укажите предпочтительный город и даты, когда сможете пройти стажировку.",
              ],
              [
                "Приложите резюме",
                "Укажите навыки и проекты. Подойдёт файл PDF, DOC или DOCX до 5 МБ.",
              ],
            ].map(([title, text]) => (
              <li key={title}>
                <L as="h3">{title}</L>
                <L as="p">{text}</L>
              </li>
            ))}
          </ol>
        </div>
        <aside>
          <L as="h3">Заполнить отклик на стажировку</L>
          <L as="p">
            Укажите образование, направление и удобные даты. Если резюме уже готово, добавьте его к черновику.
          </L>
          <Action href="/careers/apply?type=internship">
            Перейти к заполнению
          </Action>
          <L as="p" className="corp-small-note">
            Черновик останется в вашем браузере. Для отправки откройте подготовленное письмо на cv@alageum.com и прикрепите резюме.
          </L>
        </aside>
      </section>
    </>
  );
}
