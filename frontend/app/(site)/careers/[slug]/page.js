import { careerEvidence } from "@/components/careers/sources";
import { notFound, permanentRedirect } from "next/navigation";
import { localizedHref } from "@/lib/i18n/routing";
import L from "@/components/careers/Text";
import { Intro, Photo, Action, Source } from "@/components/careers/Editorial";
import { careerLegacyDestinations } from "@/components/careers/navigation";
import { internshipSource } from "@/lib/ecosystem/careers";
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
        Познакомьтесь с направлениями летней программы и подготовьтесь к первому
        обращению в Alageum Electric.
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
            От университета
            <br />к рабочим задачам.
          </L>
          <L as="p">
            Официальная программа адресована студентам и выпускникам технических
            университетов. В её описании — летняя работа на полный день на
            заводах и в офисах группы.
          </L>
          <L as="p">
            Стажировка предполагает участие в повседневной работе подразделения
            и проектах. Это возможность познакомиться с будущей профессией на
            практике.
          </L>
          <L as="p" className="eco-notice">
            Описание программы опубликовано без даты набора. Наличие мест, сроки
            и условия нужно подтвердить у HR до отправки резюме.
          </L>
          <Source href={internshipSource}>Описание программы</Source>
        </div>
        <Photo
          id="utz"
          caption="Уральский трансформаторный завод · производственный цех"
          priority
        />
      </section>
      <section className="career-section" id="directions">
        <L as="p" className="site-eyebrow">
          НАПРАВЛЕНИЯ СТАЖИРОВКИ
        </L>
        <L as="h2">С чего хотите начать?</L>
        <L as="p" className="career-program-lead">
          В программе перечислены производственные и офисные направления.
          Выберите близкое вашей специальности; доступность конкретного места
          уточняется отдельно.
        </L>
        <dl className="career-program-directions">
          {[
            [
              "Производство",
              "Работа производственных подразделений на заводах группы.",
            ],
            [
              "Проектирование и конструкторская документация",
              "Проектно-изыскательные работы и разработка конструкторско-технологической документации.",
            ],
            [
              "Продажи и закупки",
              "Коммерческие и снабженческие подразделения.",
            ],
            [
              "Учёт и аудит",
              "Работа с учётом и аудитом в офисных подразделениях.",
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
          <L as="h2">Что важно для первого шага</L>
          <L as="p">
            В официальном описании отмечены знание английского языка, желание
            учиться, ответственность и умение работать в команде. Требуемый
            уровень языка и навыков для выбранного направления уточните при
            обращении.
          </L>
          <L as="p">
            В резюме можно показать учебные проекты, лабораторные работы,
            практику и самостоятельные разработки. Опишите свою задачу,
            использованные инструменты и полученный результат.
          </L>
        </div>
        <aside>
          <L as="h3">Если опыта ещё нет</L>
          <L as="p">
            Сделайте акцент на специальности и том, что уже умеете. Для первого
            обращения полезнее конкретный пример учебной работы, чем общий
            список личных качеств.
          </L>
          <L as="p">
            Это рекомендации по подготовке резюме. Решение об участии и
            требования к конкретному месту определяет предприятие.
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
            Заранее обсудите
            <br />
            свою площадку.
          </L>
          <L as="p">
            На фотографиях — цеха Уральского и Кентауского трансформаторных заводов. Это
            производственная среда предприятий, а не фотографии участников
            программы стажировки.
          </L>
          <L as="p">
            Перед договорённостью спросите, где будет проходить стажировка,
            какие задачи доступны, кто поможет освоиться и как организован
            инструктаж по безопасности.
          </L>
          <L as="p">
            Отдельно уточните график, продолжительность, оплату и необходимые
            документы. Условия одного предприятия не распространяются на всю
            группу.
          </L>
          <L as="a" className="site-text-link" href="/manufacturers">
            Посмотреть предприятия
          </L>
        </div>
      </section>
      <section className="career-section career-college" id="college">
        <div>
          <L as="p" className="site-eyebrow">
            ДРУГОЙ ПУТЬ В ПРОФЕССИЮ
          </L>
          <L as="h2">
            Дуальное образование
            <br />в Кентау
          </L>
          <L as="p">
            В публикации Alageum Electric от 19 марта 2026 года говорится о
            политехническом колледже в Кентау: более 800 студентов обучаются по
            направлениям электроснабжения, автоматизации и управления.
          </L>
          <L as="p">
            Колледж работает по дуальной системе, совмещающей обучение с
            производственной практикой. Это самостоятельный образовательный
            проект, а не летняя стажировка для студентов вузов. Условия приёма и
            практики нужно уточнять отдельно.
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
          <L as="h2">Подготовьте обращение</L>
          <ol>
            {[
              [
                "Укажите образование",
                "Учебное заведение, специальность, курс или год выпуска.",
              ],
              [
                "Выберите интересующее направление",
                "Добавьте удобный город и даты, когда вы готовы проходить стажировку.",
              ],
              [
                "Приложите резюме",
                "Кратко опишите навыки и проекты. Сохраните резюме в PDF, DOC или DOCX размером до 5 МБ для локального черновика.",
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
            На следующей странице можно указать образование, направление
            интереса, доступные даты и выбрать файл резюме.
          </L>
          <Action href="/careers/apply?type=internship">
            Перейти к заполнению
          </Action>
          <L as="p" className="corp-small-note">
            Форма сохраняет черновик в браузере и готовит письмо на
            cv@alageum.com. Отправить письмо и прикрепить резюме нужно
            самостоятельно.
          </L>
        </aside>
      </section>
    </>
  );
}
