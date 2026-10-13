"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "@/components/locale/LocaleLink";
import { useAuth } from "./AuthProvider";
import { getOrganizationMemberships } from "@/lib/api/organizations";
import { selectOrganization } from "@/lib/api/auth";
import { getSession } from "@/lib/api/client";
import { getSessionGeneration, subscribeSession } from "@/lib/api/sessionTransport";
import styles from "./OrganizationChooser.module.css";
export { organizationDestination } from '@/lib/organizations/navigation';

const emptyMessage = "Нет доступных организаций. Обратитесь к администратору, чтобы получить активное членство.";
const pendingMessage = "Сохранение ещё выполняется. Запрос мог уже сохраниться на сервере. Смена организации не отменяет сохранение.";

function selectionError(error) {
  if (error?.status === 401 && error?.code !== "session_changed") return "Сессия завершилась. Войдите снова.";
  if (error?.code === "session_changed") return "Сессия изменилась. Закройте выбор и откройте его снова.";
  if (error?.status === 403) return "Доступ к организации изменился. Обновите список и выберите доступную организацию.";
  return "Не удалось подтвердить организацию. Текущая организация и черновик не изменены. Попробуйте ещё раз.";
}

export default function OrganizationChooser({ modal = false, expectedGeneration, currentOrganizationId, onCancel, onSelected, returnFocusRef }) {
  const { getOrganizationChangeState } = useAuth();
  const headingId = useId();
  const liveGeneration = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const sessionChanged = liveGeneration !== expectedGeneration;
  const sessionMessage = sessionChanged ? selectionError(getSession().access_token ? { code: "session_changed" } : { status: 401 }) : "";
  const dialog = useRef(null),heading = useRef(null),errorBox = useRef(null),confirmationBox = useRef(null),submitButton = useRef(null);
  const flow = useRef(null),activeAttempt = useRef(null);
  const [memberships, setMemberships] = useState([]);
  const [status, setStatus] = useState("loading");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [reload, setReload] = useState(0);

  const cancel = useCallback(() => {
    flow.current?.abort();
    activeAttempt.current?.abort();
    onCancel(expectedGeneration);
  }, [expectedGeneration, onCancel]);

  useLayoutEffect(() => {
    const controller = new AbortController();
    flow.current = controller;
    return () => {
      controller.abort();
      activeAttempt.current?.abort();
      if (flow.current === controller) flow.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const element = dialog.current;
    const trigger = returnFocusRef?.current;
    if (modal) element.showModal();
    heading.current?.focus();
    const historyChange = () => cancel();
    window.addEventListener("popstate", historyChange);
    window.addEventListener("pagehide", historyChange);
    return () => {
      window.removeEventListener("popstate", historyChange);
      window.removeEventListener("pagehide", historyChange);
      if (element?.open) element.close();
      if (modal && trigger?.isConnected) trigger.focus();
    };
  }, [modal, cancel, returnFocusRef]);

  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && flow.current && !flow.current.signal.aborted;
    getOrganizationMemberships(controller.signal).then((items) => {
      if (!current()) return;
      if (getSessionGeneration() !== expectedGeneration) {
        setError(selectionError({ code: "session_changed" }));
        setStatus("error");
        return;
      }
      setMemberships(items);
      setStatus("ready");
    }).catch((reason) => {
      if (!current()) return;
      setExpired(reason.status === 401 && reason.code !== "session_changed");
      setError(selectionError(reason));
      setStatus("error");
    });
    return () => controller.abort();
  }, [expectedGeneration, reload]);

  useEffect(() => {
    if (!sessionChanged) return;
    // Hide previous-account choices immediately. Give the successful selection's
    // same-microtask continuation time to install its already validated profile.
    const timer = window.setTimeout(() => {
      if (getSessionGeneration() !== expectedGeneration) {
        flow.current?.abort();activeAttempt.current?.abort();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sessionChanged, expectedGeneration]);
  useEffect(() => {if (error || sessionMessage) errorBox.current?.focus();}, [error, sessionMessage]);
  useEffect(() => {if (confirmation) confirmationBox.current?.focus();}, [confirmation]);

  function refresh() {
    if (pending) return;
    setStatus("loading");setError("");setExpired(false);setSelectedId("");setConfirmation(null);
    setReload((value) => value + 1);
  }

  async function applySelection() {
    if (activeAttempt.current || !flow.current || flow.current.signal.aborted) return;
    if (getSessionGeneration() !== expectedGeneration) {setError(selectionError({ code: "session_changed" }));return;}
    const controller = new AbortController();
    activeAttempt.current = controller;
    setPending(true);setError("");setConfirmation(null);
    const current = () => activeAttempt.current === controller && !controller.signal.aborted && flow.current && !flow.current.signal.aborted;
    try {
      const profile = await selectOrganization(selectedId, { signal: controller.signal, expectedGeneration });
      if (current()) onSelected(profile);
    } catch (reason) {
      if (current()) {
        setExpired(reason.status === 401 && reason.code !== "session_changed");
        setError(selectionError(reason));
      }
    } finally {
      if (current()) {activeAttempt.current = null;setPending(false);}
    }
  }

  function submit(event) {
    event.preventDefault();
    if (pending || !selectedId || !memberships.some((item) => item.organization_id === selectedId)) return;
    const changes = getOrganizationChangeState();
    if (changes.dirty || changes.pending) setConfirmation(changes);else
    applySelection();
  }

  function confirmSelection() {
    // A save may have started since the first warning was displayed.
    const changes = getOrganizationChangeState();
    if (changes.pending && !confirmation.pending) {setConfirmation(changes);return;}
    applySelection();
  }

  const content = <LocaleElement as="section" className={styles.content} aria-labelledby={headingId} data-testid="organization-chooser" aria-busy={!sessionChanged && (status === "loading" || pending)} onKeyDown={(event) => {if (!modal && event.key === "Escape") {event.preventDefault();cancel();}}}>
    <LocaleElement as="h2" id={headingId} ref={heading} tabIndex={-1}>{modal ? "Выбор организации" : "Выберите организацию"}</LocaleElement>
    <LocaleElement as="p" className="muted">Доступны только ваши активные членства. Сверьте роль и UUID: названия организаций могут совпадать.</LocaleElement>
    {!sessionChanged && status === "loading" && <LocaleElement as="p" role="status">Загрузка организаций…</LocaleElement>}
    {(error || sessionMessage) && <LocaleElement as="p" className="error" role="alert" ref={errorBox} tabIndex={-1} data-testid="organization-error">{sessionMessage || error}</LocaleElement>}
    {!sessionChanged && status === "ready" && memberships.length === 0 && <LocaleElement as="p" role="status" data-testid="organization-empty">{emptyMessage}</LocaleElement>}
    {!sessionChanged && status === "ready" && memberships.length > 0 && <LocaleElement as="form" onSubmit={submit}>
      <LocaleElement as="fieldset" className={styles.options} disabled={pending || Boolean(confirmation)}>
        <LocaleElement as="legend" className="sr-only">Доступные организации</LocaleElement>
        {memberships.map((item) => <LocaleElement as="label" className={styles.option} key={item.id || item.organization_id}>
          <LocaleElement as="input" type="radio" name="organization_id" value={item.organization_id} checked={selectedId === item.organization_id}
          disabled={item.organization_id === currentOrganizationId} onChange={() => {setSelectedId(item.organization_id);setError("");}} data-testid={`organization-option-${item.organization_id}`} />
          <LocaleElement as="span" className={styles.optionText}>
            <LocaleElement as="strong">{item.organization_name}</LocaleElement>
            <LocaleElement as="span">Роль: {item.role_name || "Не указана"}</LocaleElement>
            <LocaleElement as="span" className={styles.uuid}>UUID: {item.organization_id}</LocaleElement>
            {item.organization_id === currentOrganizationId && <LocaleElement as="span" className={styles.current}>Текущая организация</LocaleElement>}
          </LocaleElement>
        </LocaleElement>)}
      </LocaleElement>
      {!confirmation && <LocaleElement as="div" className={styles.actions}>
        <LocaleElement as="button" ref={submitButton} className="button" type="submit" disabled={!selectedId || pending || expired}>{pending ? "Проверка доступа…" : modal ? "Переключить организацию" : "Продолжить"}</LocaleElement>
      </LocaleElement>}
    </LocaleElement>}
    {!sessionChanged && confirmation && <LocaleElement as="div" className={styles.confirmation} data-testid="organization-discard-confirmation" ref={confirmationBox} tabIndex={-1} role="alert">
      <LocaleElement as="h3">Сменить организацию?</LocaleElement>
      {confirmation.pending && <LocaleElement as="p">{pendingMessage}</LocaleElement>}
      {confirmation.dirty && <LocaleElement as="p">На странице есть несохранённые изменения. После успешной смены организации черновик будет удалён.</LocaleElement>}
      <LocaleElement as="p">Если проверка доступа завершится ошибкой, вы останетесь в текущей организации.</LocaleElement>
      <LocaleElement as="div" className={styles.actions}>
        <LocaleElement as="button" className="button" type="button" onClick={confirmSelection}>Продолжить без сохранения</LocaleElement>
        <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => {
          setConfirmation(null);
          requestAnimationFrame(() => submitButton.current?.focus());
        }}>Вернуться к выбору</LocaleElement>
      </LocaleElement>
    </LocaleElement>}
    <LocaleElement as="div" className={styles.actions}>
      {!sessionChanged && !expired && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={refresh} disabled={status === "loading" || pending}>Обновить список</LocaleElement>}
      <LocaleElement as="button" className="buttonSecondary" type="button" onClick={cancel}>Отмена выбора</LocaleElement>
      {(expired || sessionChanged && !getSession().access_token) && modal && <Link className="button" href="/login" onClick={cancel}>Войти снова</Link>}
    </LocaleElement>
    {!sessionChanged && pending && <LocaleElement as="p" role="status">Проверяем доступ перед сменой организации…</LocaleElement>}
  </LocaleElement>;

  if (!modal) return <LocaleElement as="div" className={`card ${styles.inline}`}>{content}</LocaleElement>;
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={headingId} data-testid="organization-dialog"
  onCancel={(event) => {event.preventDefault();cancel();}}
  onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel();
  }}>{content}</dialog>;
}
