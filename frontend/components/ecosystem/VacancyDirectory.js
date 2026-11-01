"use client";
import L from "@/components/careers/Text";
import CorporateArrow from "@/components/public/CorporateArrow";
import { useState, useSyncExternalStore } from "react";
import { jobs } from "@/lib/ecosystem/careers";
import { useTranslate } from "@/components/locale/LocaleProvider";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export default function VacancyDirectory() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [status, setStatus] = useState("open");
  const tx = useTranslate();
  const visible = jobs.filter(
    (j) =>
      (status === "all" || j.status === status) &&
      (field === "all" || j.field === field) &&
      `${j.title} ${j.text} ${tx(j.title)} ${tx(j.text)} ${j.city}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <L as="label" className="career-search">
        Найти позицию
        <L
          as="input"
          type="search"
          disabled={!ready}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tx("Профессия или направление")}
        />
      </L>
      <div className="career-filter">
        {[
          ["open", "Актуальные"],
          ["all", "Все публикации"],
        ].map(([v, t]) => (
          <L
            as="button"
            disabled={!ready}
            key={v}
            onClick={() => setStatus(v)}
            aria-pressed={status === v}
          >
            {t}
          </L>
        ))}
      </div>
      <div className="career-filter">
        {["all", ...new Set(jobs.map((j) => j.field))].map((v) => (
          <L
            as="button"
            disabled={!ready}
            key={v}
            onClick={() => setField(v)}
            aria-pressed={field === v}
          >
            {v === "all" ? "Все направления" : v}
          </L>
        ))}
      </div>
      <L as="p" role="status">
        Найдено позиций: {visible.length}
      </L>
      {visible.map((j) => (
        <article className="career-job" key={j.id}>
          <div>
            <L className="career-status">
              {j.status === "closed"
                ? "Вакансия закрыта"
                : "Актуальность не подтверждена"}
            </L>
            <L as="h3">
              <L as="a" href={`/careers/vacancies/${j.id}`}>
                {j.title}
              </L>
            </L>
            <L as="p">{j.text}</L>
          </div>
          <div>
            <L as="p">{j.field}</L>
            <L as="p">{j.city}</L>
            <L as="a" href={`/careers/vacancies/${j.id}`}>
              Задачи и требования <CorporateArrow />
            </L>
          </div>
        </article>
      ))}
      {!visible.length && (
        <div className="eco-empty">
          <L as="h2">
            {status === "open"
              ? "Открытые вакансии пока не подтверждены"
              : "Позиции не найдены"}
          </L>
          <L as="p">
            Можно посмотреть опубликованные ранее позиции или подготовить
            инициативное письмо.
          </L>
          <div className="site-actions">
            <L
              as="button"
              disabled={!ready}
              onClick={() => {
                setQuery("");
                setField("all");
                setStatus("all");
              }}
            >
              Показать все публикации
            </L>
            <L
              as="a"
              href="/careers/apply"
              className="site-button site-button-primary"
            >
              Инициативный отклик <CorporateArrow />
            </L>
          </div>
        </div>
      )}
    </>
  );
}
