"use client";
import L, { useCareerTranslate } from "@/components/careers/Text";
import CorporateArrow from "@/components/public/CorporateArrow";
import { useState, useSyncExternalStore } from "react";
import { jobs } from "@/lib/ecosystem/careers";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export default function VacancyDirectory() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [query, setQuery] = useState("");
  const [field, setField] = useState("all");
  const [status, setStatus] = useState("open");
  const tx = useCareerTranslate();
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
      <div className="career-directory-controls">
        <L as="label" className="career-search">
          Поиск вакансий
          <L
            as="input"
            type="search"
            disabled={!ready}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tx("Профессия или направление")}
          />
        </L>
        <div className="career-filter career-filter-status" role="group" aria-label={tx("Статус вакансии")}>
          {[
            ["open", "Открытые вакансии"],
            ["all", "Включая архив"],
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
        <div className="career-filter career-filter-fields" role="group" aria-label={tx("Направления работы")}>
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
      </div>
      <L as="p" className="career-result-count" role="status">
        Найдено вакансий: {visible.length}
      </L>
      {visible.map((j) => (
        <article className="career-job" key={j.id}>
          <div className="career-job-summary">
            <L className="career-status">
              {j.status === "closed"
                ? "Вакансия закрыта"
                : "Набор нужно уточнить"}
            </L>
            <L as="h3">
              <L as="a" href={`/careers/vacancies/${j.id}`}>
                {j.title}
              </L>
            </L>
            <L as="p">{j.text}</L>
          </div>
          <div className="career-job-meta">
            <div className="career-job-tags">
              <L>{j.field}</L>
              <L>{j.city}</L>
            </div>
            <L as="a" href={`/careers/vacancies/${j.id}`}>
              Задачи и требования <CorporateArrow />
            </L>
          </div>
        </article>
      ))}
      {!visible.length && (
        <div className="eco-empty career-directory-empty">
          <div>
            <L as="h2">
              {status === "open"
                ? "Вакансии уточняйте у HR"
                : "По вашему запросу вакансий нет"}
            </L>
            <L as="p">
              Можно посмотреть архив вакансий или отправить резюме на cv@alageum.com.
            </L>
          </div>
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
              {status === "open" ? "Посмотреть архив вакансий" : "Сбросить фильтры"}
            </L>
            <L
              as="a"
              href="/careers/apply"
              className="site-button site-button-primary"
            >
              Резюме без выбора вакансии <CorporateArrow />
            </L>
          </div>
        </div>
      )}
    </>
  );
}
