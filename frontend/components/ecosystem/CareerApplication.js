"use client";
import LocaleElement, { useCareerTranslate } from "@/components/careers/Text";
import { useState, useSyncExternalStore, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  saveLocalResume,
  downloadLocalDocument,
  deleteLocalDocument,
  deleteLocalFiles,
} from "@/lib/ecosystem/local-files";
import { jobs } from "@/lib/ecosystem/careers";
const key = "alageum.careers.application.v1";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
const empty = JSON.stringify({
  name: "",
  email: "",
  phone: "",
  city: "",
  position: "",
  experience: "",
  education: "",
  interest: "",
  availability: "",
  consent: false,
});
function snapshot() {
  try {
    return localStorage.getItem(key) || empty;
  } catch {
    return empty;
  }
}
function subscribe(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("alageum:career-draft", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("alageum:career-draft", callback);
  };
}
export default function CareerApplication() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const formRef = useRef(null);
  const fileRef = useRef(null);
  const params = useSearchParams();
  const tx = useCareerTranslate();
  const raw = useSyncExternalStore(subscribe, snapshot, () => empty);
  let stored;
  try {
    stored = JSON.parse(raw);
  } catch {
    stored = JSON.parse(empty);
  }
  const [editing, setEditing] = useState(null);
  const [resume, setResume] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const form = editing || {
    ...stored,
    position:
      params.get("position") ||
      (params.get("type") === "internship"
        ? "internship"
        : stored.position || ""),
  };
  const internship = form.position === "internship";
  function change(event) {
    setEditing({
      ...form,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value,
    });
    setNotice("");
  }
  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    let saved;
    try {
      if (resume) saved = await saveLocalResume(resume);
      localStorage.setItem(
        key,
        JSON.stringify({
          ...form,
          resumeName: saved?.name || stored.resumeName || null,
          resumeId: saved?.id || stored.resumeId || null,
        }),
      );
      if (saved && stored.resumeId)
        deleteLocalDocument(stored.resumeId).catch(() => {});
      window.dispatchEvent(new Event("alageum:career-draft"));
      setResume(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice(
        "Черновик и резюме сохранены в этом браузере. Отклик не отправлен работодателю.",
      );
    } catch {
      if (saved) deleteLocalDocument(saved.id).catch(() => {});
      setError(
        "Не удалось сохранить черновик или резюме. Можно открыть письмо HR без сохранения.",
      );
    }
  }
  function file(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (
      !/\.(pdf|doc|docx)$/i.test(selected.name) ||
      selected.size === 0 ||
      selected.size > 5 * 1024 * 1024
    ) {
      setError("Выберите PDF, DOC или DOCX размером до 5 МБ.");
      event.target.value = "";
      setResume(null);
      return;
    }
    setResume(selected);
    setError("");
  }
  async function remove() {
    try {
      if (stored.resumeId) await deleteLocalFiles("__career_draft__");
      localStorage.removeItem(key);
      window.dispatchEvent(new Event("alageum:career-draft"));
      setEditing({
        ...JSON.parse(empty),
        position: params.get("type") === "internship" ? "internship" : "",
      });
      setResume(null);
      if (fileRef.current) fileRef.current.value = "";
      setNotice("Черновик и сохранённое резюме удалены.");
    } catch {
      setError("Не удалось удалить резюме из браузера. Попробуйте ещё раз.");
    }
  }
  function openMail() {
    setError("");
    if (!formRef.current.reportValidity()) return;
    if (!form.name.trim() || !form.email || !form.consent) {
      setError(
        "Укажите имя, email и отметьте согласие на сохранение данных.",
      );
      return;
    }
    const position =
      jobs.find((item) => item.id === form.position)?.title ||
      (form.position === "internship" ? "Стажировка" : "Резюме без выбора вакансии");
    const body = [
      `${tx("Имя")}: ${form.name}`,
      `${tx("Вакансия или стажировка")}: ${tx(position)}`,
      `${tx("Email")}: ${form.email}`,
      `${tx("Телефон")}: ${form.phone}`,
      `${tx("Город")}: ${form.city}`,
      `${tx("Опыт и навыки")}: ${form.experience}`,
      ...(internship
        ? [
            `${tx("Образование")}: ${form.education || ""}`,
            `${tx("Интересующее направление")}: ${form.interest || ""}`,
            `${tx("Доступные даты")}: ${form.availability || ""}`,
          ]
        : []),
      tx("Резюме необходимо прикрепить к этому письму самостоятельно."),
    ].join("\n");
    setNotice(
      "Письмо подготовлено для почтовой программы. Отклик ещё не отправлен. Прикрепите резюме и отправьте письмо самостоятельно.",
    );
    window.location.href = `mailto:cv@alageum.com?subject=${encodeURIComponent(`${tx("Отклик")}: ${tx(position)}`)}&body=${encodeURIComponent(body)}`;
  }
  return (
    <LocaleElement as="div" className="eco-split">
      <LocaleElement
        as="form"
        className="eco-form"
        ref={formRef}
        onSubmit={save}
        aria-busy={!ready}
      >
        <LocaleElement as="h2" className="career-form-title">Данные кандидата</LocaleElement>
        <LocaleElement as="label">
          Имя и фамилия *
          <LocaleElement
            as="input"
            disabled={!ready}
            name="name"
            autoComplete="name"
            required
            pattern={"[\\s\\S]*[\\S][\\s\\S]*"}
            maxLength={160}
            value={form.name}
            onChange={change}
          />
        </LocaleElement>
        <LocaleElement as="label">
          Email *
          <LocaleElement
            as="input"
            disabled={!ready}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={change}
          />
        </LocaleElement>
        <LocaleElement as="label">
          Телефон
          <LocaleElement
            as="input"
            disabled={!ready}
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={change}
          />
        </LocaleElement>
        <LocaleElement as="label">
          Город
          <LocaleElement
            as="input"
            disabled={!ready}
            name="city"
            autoComplete="address-level2"
            value={form.city}
            onChange={change}
          />
        </LocaleElement>
        <LocaleElement as="label">
          Вакансия или стажировка
          <LocaleElement
            as="select"
            name="position"
            disabled={!ready || params.get("type") === "internship"}
            value={form.position}
            onChange={change}
          >
            <LocaleElement as="option" value="">
              Резюме без выбора вакансии
            </LocaleElement>
            {jobs.map((job) => (
              <LocaleElement as="option" value={job.id} key={job.id}>
                {job.title}
              </LocaleElement>
            ))}
            <LocaleElement as="option" value="internship">
              Стажировка
            </LocaleElement>
          </LocaleElement>
        </LocaleElement>
        {internship && (
          <>
            <LocaleElement as="label">
              Учебное заведение, специальность и курс *
              <LocaleElement
                as="input"
                disabled={!ready}
                name="education"
                required
                maxLength={300}
                value={form.education || ""}
                onChange={change}
              />
            </LocaleElement>
            <LocaleElement as="label">
              Интересующее направление
              <LocaleElement
                as="input"
                disabled={!ready}
                name="interest"
                maxLength={200}
                value={form.interest || ""}
                onChange={change}
              />
            </LocaleElement>
            <LocaleElement as="label">
              Когда готовы проходить стажировку
              <LocaleElement
                as="input"
                disabled={!ready}
                name="availability"
                maxLength={200}
                value={form.availability || ""}
                onChange={change}
              />
            </LocaleElement>
          </>
        )}
        <LocaleElement as="label">
          Опыт и навыки
          <LocaleElement
            as="textarea"
            disabled={!ready}
            name="experience"
            maxLength={5000}
            value={form.experience}
            onChange={change}
            placeholder={tx(
              "Где вы работали или учились? Что умеете и какую работу ищете?",
            )}
          />
        </LocaleElement>
        <LocaleElement as="label">
          Резюме · PDF, DOC, DOCX до 5 МБ
          <LocaleElement
            as="input"
            disabled={!ready}
            type="file"
            ref={fileRef}
            accept=".pdf,.doc,.docx"
            onChange={file}
          />
        </LocaleElement>
        {(resume || stored.resumeName) && (
          <LocaleElement as="p" className="eco-source">
            Выбран файл: {resume?.name || stored.resumeName}. После сохранения
            черновика файл останется в этом браузере. К письму его нужно
            прикрепить самостоятельно.
          </LocaleElement>
        )}
        {stored.resumeId && (
          <LocaleElement
            as="button"
            disabled={!ready}
            className="site-text-link"
            type="button"
            onClick={() =>
              downloadLocalDocument(stored.resumeId).catch(() =>
                setError(
                  "Сохранённое резюме не найдено в этом браузере. Прикрепите файл повторно.",
                ),
              )
            }
          >
            Скачать сохранённое резюме ↓
          </LocaleElement>
        )}
        <LocaleElement as="label" className="eco-consent">
          <LocaleElement
            as="input"
            disabled={!ready}
            name="consent"
            type="checkbox"
            required
            checked={form.consent}
            onChange={change}
          />
          <LocaleElement as="span">
            Разрешаю сохранить мои данные и резюме в этом браузере. Письмо работодателю отправлю самостоятельно.
          </LocaleElement>
        </LocaleElement>
        <LocaleElement as="div" className="site-actions">
          <LocaleElement
            as="button"
            disabled={!ready}
            className="site-button career-draft-button"
            type="submit"
          >
            Сохранить черновик
          </LocaleElement>
          <LocaleElement
            as="button"
            disabled={!ready}
            type="button"
            className="site-button site-button-primary"
            onClick={openMail}
          >
            Подготовить письмо HR ↗
          </LocaleElement>
          <LocaleElement
            as="button"
            disabled={!ready}
            type="button"
            className="site-text-link"
            onClick={remove}
          >
            Удалить черновик
          </LocaleElement>
        </LocaleElement>
        {error && (
          <LocaleElement as="p" className="error" role="alert">
            {error}
          </LocaleElement>
        )}
        {notice && (
          <LocaleElement as="p" className="eco-result" role="status">
            {notice}
          </LocaleElement>
        )}
      </LocaleElement>
      <LocaleElement as="aside" className="career-application-guide">
        <LocaleElement as="p" className="site-eyebrow">
          ОТПРАВКА РЕЗЮМЕ
        </LocaleElement>
        <LocaleElement as="h2">Отправьте письмо в HR</LocaleElement>
        <LocaleElement as="p" className="eco-notice">
          Нажмите «Подготовить письмо HR»: откроется ваша почтовая программа с заполненным текстом. Добавьте файл резюме и отправьте письмо.
        </LocaleElement>
        <LocaleElement as="p" className="eco-section-lead">
          Если почтовая программа не открылась, напишите на cv@alageum.com и приложите резюме.
        </LocaleElement>
      </LocaleElement>
    </LocaleElement>
  );
}
