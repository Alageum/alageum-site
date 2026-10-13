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
import Image from "@/components/locale/LocaleImage";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function LoginPage() {
  const router = useRouter();
  // Keep server-rendered controls disabled until the approved return URL can be preserved.
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const sessionGeneration = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const { profile, loading, setProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    setProfile(next.requiresOnboarding ? null : next);setChoice(null);setPassword("");setCompleted(true);
    router.replace(next.requiresOnboarding ? "/account" : loginDestination(new URLSearchParams(window.location.search).get("next")));
  }, [router, setProfile]);
  const cancelChoice = useCallback(async (generation) => {
    if (getSessionGeneration() === generation && getSession().browser_session) {
      try {await logout();} catch (reason) {setError(reason.message);return;}
    }
    if (getSessionGeneration() === generation) {clearSession();setProfile(null);}
    setChoice(null);setPassword("");setError("");setPending(false);submitting.current = false;
    requestAnimationFrame(() => emailInput.current?.focus());
  }, [setProfile]);

  async function submit(event) {
    event.preventDefault();
    const flow = activeFlow.current;
    const current = () => flow && activeFlow.current === flow && !flow.controller.signal.aborted;
    if (submitting.current || !current()) return;
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
  return <LocaleElement as="section" className="brand-login">
    <LocaleElement as="aside" className="brand-login-story">
      <Image src="/photography/manufacturers/asia-trafo.webp" alt="Производственная линия Asia Trafo" width={1000} height={600} sizes="(max-width: 760px) 100vw, 50vw" />
      <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC / B2B</LocaleElement>
      <LocaleElement as="h2">Ваш проект.<br />Единое пространство.</LocaleElement>
      <LocaleElement as="p">Запросы, документы и работа с вашей организацией — в одном кабинете.</LocaleElement>
    </LocaleElement>
    <LocaleElement as="div" className="brand-login-form">
    <LocaleElement as="p" className="site-eyebrow">ЛИЧНЫЙ КАБИНЕТ</LocaleElement>
    <LocaleElement as="h1">Вход в B2B кабинет</LocaleElement>
    {choiceGeneration === null && <FederatedSignIn disabled={!ready || pending} onComplete={completeFederated} onBusy={setPending} />}
    {choiceGeneration !== null ? <OrganizationChooser key={choiceGeneration} expectedGeneration={choiceGeneration} onCancel={cancelChoice} onSelected={complete} /> : <LocaleElement as="form" className="form card" onSubmit={submit}>
      <LocaleElement as="label">Email<LocaleElement as="input" ref={emailInput} disabled={!ready || pending} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required /></LocaleElement>
      <LocaleElement as="label">Пароль<LocaleElement as="input" disabled={!ready || pending} value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></LocaleElement>
      {error && <LocaleElement as="p" className="error" role="alert">{error}</LocaleElement>}
      <LocaleElement as="button" className="button" disabled={!ready || pending}>{pending ? "Вход…" : "Войти"}</LocaleElement>
    </LocaleElement>}
    <LocaleElement as="p"><LocaleElement as="a" href="/register">Регистрация</LocaleElement> · <LocaleElement as="a" href="/forgot-password">Забыли пароль?</LocaleElement></LocaleElement>
    <LocaleElement as="p"><LocaleElement as="a" href="/verify-email">Подтвердить email</LocaleElement></LocaleElement>
    </LocaleElement>
  </LocaleElement>;
}
