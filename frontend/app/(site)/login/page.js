"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";import {
  useRouter } from "@/components/locale/navigation";
import { loginDestination } from "@/lib/api/loginRedirect";
import { login, logout } from "@/lib/api/auth";
import { clearSession, getSession } from "@/lib/api/client";
import { getSessionGeneration, subscribeSession } from "@/lib/api/sessionTransport";
import { useAuth } from "@/components/AuthProvider";
import FederatedSignIn from "@/components/FederatedSignIn";
import OrganizationChooser from "@/components/OrganizationChooser";
import Link from "@/components/locale/LocaleLink";
import AccountFrame from "@/components/account/AccountFrame";
import styles from "@/components/account/Account.module.css";

const accountLinks = [['Создать аккаунт', '/register'], ['Подтвердить email', '/verify-email']];

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function LoginPage() {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const sessionGeneration = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const { profile, loading, setProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState(null);
  const [completed, setCompleted] = useState(false);
  const emailInput = useRef(null),submitting = useRef(false),activeFlow = useRef(null);
  useLayoutEffect(() => {
    const flow = { controller: new AbortController() };
    activeFlow.current = flow;
    return () => {flow.controller.abort();if (activeFlow.current === flow) activeFlow.current = null;};
  }, []);

  const complete = useCallback((next) => {
    setProfile(next.requiresOnboarding ? null : next);setChoice(null);setPassword("");setShowPassword(false);setCompleted(true);
    router.replace(next.requiresOnboarding ? "/account" : loginDestination(new URLSearchParams(window.location.search).get("next")));
  }, [router, setProfile]);
  const cancelChoice = useCallback(async (generation) => {
    if (getSessionGeneration() === generation && getSession().browser_session) {
      try {await logout();} catch (reason) {setError(reason.message);return;}
    }
    if (getSessionGeneration() === generation) {clearSession();setProfile(null);}
    setChoice(null);setPassword("");setShowPassword(false);setError("");setPending(false);submitting.current = false;
    requestAnimationFrame(() => emailInput.current?.focus());
  }, [setProfile]);

  async function submit(event) {
    event.preventDefault();
    const flow = activeFlow.current;
    const current = () => flow && activeFlow.current === flow && !flow.controller.signal.aborted;
    if (!ready || pending || completed || submitting.current || !current()) return;
    submitting.current = true;setPending(true);setError("");setCompleted(false);
    try {
      const next = await login(email, password, { signal: flow.controller.signal });
      if (!current()) return;
      setPassword("");
      if (next.requiresOrganization) setChoice({ generation: next.sessionGeneration });else
      complete(next);
    } catch (reason) {if (current()) setError(reason.message);} finally
    {if (current()) {submitting.current = false;setPending(false);}}
  }

  const completeFederated = useCallback((next) => {
    setPassword("");
    if (next.requiresOrganization) setChoice({ generation: next.sessionGeneration });else
    complete(next);
  }, [complete]);

  // A page reopened after an interrupted login can resume the authenticated
  // membership choice without retaining credentials or choosing the first name.
  const resumeChoice = ready && !completed && !pending && !loading && !profile && !getSession().federated_pending && Boolean(getSession().access_token);
  if (resumeChoice && !choice) setChoice({ generation: sessionGeneration });
  const choiceGeneration = choice?.generation ?? (resumeChoice ? sessionGeneration : null);
  return <AccountFrame
    title="Вход в личный кабинет"
    description="Войдите, чтобы видеть заказы и документы вашей компании."
    links={accountLinks}
    secondary={choiceGeneration === null && <FederatedSignIn disabled={!ready || pending} onComplete={completeFederated} onBusy={setPending} />}
  >
    {choiceGeneration !== null ? (
      <OrganizationChooser key={choiceGeneration} expectedGeneration={choiceGeneration} onCancel={cancelChoice} onSelected={complete} />
    ) : (
      <form onSubmit={submit} aria-busy={pending}>
        {/* Firefox restores disabled attributes on individual form controls after reload. */}
        <fieldset className={`form ${styles.loginForm}`} disabled={!ready || pending || completed}>
          <LocaleElement as="label" htmlFor="login-email">Email</LocaleElement>
          <input id="login-email" ref={emailInput} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
          <div className={styles.passwordHeading}>
            <LocaleElement as="label" htmlFor="login-password">Пароль</LocaleElement>
            <Link href="/forgot-password">Забыли пароль?</Link>
          </div>
          <div className={styles.passwordField}>
            <input id="login-password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required />
            <LocaleElement as="button" type="button" aria-controls="login-password" onClick={() => setShowPassword(visible => !visible)}>
              {showPassword ? 'Скрыть пароль' : 'Показать пароль'}
            </LocaleElement>
          </div>
          {error && <LocaleElement as="p" className={styles.loginError} role="alert">{error}</LocaleElement>}
          <LocaleElement as="button" type="submit" className="site-button site-button-primary">{pending || completed ? "Вход…" : "Войти"}</LocaleElement>
        </fieldset>
      </form>
    )}
  </AccountFrame>;
}
