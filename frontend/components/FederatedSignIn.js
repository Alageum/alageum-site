"use client";

import { useEffect, useRef, useState } from 'react';
import { authProviders, cancelGoogle, federatedError, prepareGoogle, startGoogle } from '@/lib/api/federated';
import { resumeFederatedLogin } from '@/lib/api/auth';

export default function FederatedSignIn({ disabled, onComplete, onBusy }) {
  const [available, setAvailable] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const flight = useRef(null), latestAttempt = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    authProviders(controller.signal).then(value => {
      if (!controller.signal.aborted) { setAvailable(value.google?.available === true); setChecked(true); }
    }).catch(() => { if (!controller.signal.aborted) setChecked(true); });
    const restored = event => { if (event.persisted) { const old = flight.current; old?.controller.abort(); if (old?.flowId) void cancelGoogle(old.flowId).catch(() => {}); flight.current = null; setPending(false); onBusy(false); } };
    window.addEventListener('pageshow', restored);
    return () => { controller.abort(); const old = flight.current; if (old && !old.navigating) { old.controller.abort(); if (old.flowId) void cancelGoogle(old.flowId).catch(() => {}); } window.removeEventListener('pageshow', restored); };
  }, [onBusy]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('federated');
    if (!result) return;
    const controller = new AbortController();
    if (result !== 'success') {
      // Defer only to keep effect-driven state in an async continuation.
      Promise.resolve().then(() => { if (!controller.signal.aborted) setError(federatedError(result)); });
    } else {
      onBusy(true);
      resumeFederatedLogin({ signal: controller.signal, sessionId: params.get("session") }).then(value => {
        if (controller.signal.aborted) return;
        // Remove the callback marker so Back/Refresh cannot re-install an old
        // login flow. The provider callback never includes bearer credentials.
        const url = new URL(window.location.href); url.searchParams.delete('federated'); url.searchParams.delete('session');
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
        onComplete(value);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason.message || federatedError(result)); }).finally(() => { if (!controller.signal.aborted) onBusy(false); });
    }
    return () => { controller.abort(); if (result === "success") onBusy(false); };
  }, [onComplete, onBusy]);
  async function begin() {
    if (flight.current || disabled || !available) return;
    const attempt = { controller: new AbortController(), flowId: null, cancelled: false, navigating: false };
    flight.current = attempt; latestAttempt.current = attempt;
    setPending(true); onBusy(true); setError('');
    try {
      // Let preparation return its cookie/ID even after Cancel, so the exact
      // server flow can be invalidated before any authorization request starts.
      const prepared = await prepareGoogle(); attempt.flowId = prepared.flow_id;
      if (attempt.cancelled || attempt.controller.signal.aborted || flight.current !== attempt) {
        try {
          await cancelGoogle(attempt.flowId);
          if (latestAttempt.current === attempt && attempt.cancelled) setError('Вход через Google отменён.');
        } catch {
          if (latestAttempt.current === attempt && attempt.cancelled) setError('Не удалось отменить попытку на сервере. Не завершайте её в другом окне; начните новый вход.');
        }
        return;
      }
      const target = await startGoogle(new URLSearchParams(window.location.search).get('next'), attempt.flowId, attempt.controller.signal);
      if (!attempt.controller.signal.aborted && flight.current === attempt) { attempt.navigating = true; window.location.assign(target); }
    } catch (reason) {
      if (!attempt.controller.signal.aborted && flight.current === attempt) setError(reason.message);
    } finally {
      if (flight.current === attempt && !attempt.navigating) { flight.current = null; setPending(false); onBusy(false); }
    }
  }
  async function cancel() {
    const attempt = flight.current;
    if (!attempt || attempt.cancelled) return;
    attempt.cancelled = true; attempt.controller.abort();
    if (!attempt.flowId) { setError('Отменяем вход…'); return; }
    try { await cancelGoogle(attempt.flowId); if (latestAttempt.current === attempt) setError('Вход через Google отменён.'); }
    catch { if (latestAttempt.current === attempt) setError('Не удалось отменить попытку на сервере. Не завершайте её в другом окне; начните новый вход.'); }
    finally { if (flight.current === attempt) { flight.current = null; setPending(false); onBusy(false); } }
  }
  return <section className="card form" aria-label="Регистрация и вход через внешние сервисы">
    <h2>Регистрация или вход</h2>
    <button className="buttonSecondary" type="button" disabled={disabled || !available || pending} onClick={begin}>
      {pending ? 'Переход в Google…' : 'Продолжить с Google'}
    </button>
    {pending && <button className="buttonSecondary" type="button" onClick={cancel}>Отменить вход через Google</button>}
    {checked && !available && <p className="muted">Вход через Google пока не подключён.</p>}
    <button className="buttonSecondary" type="button" disabled aria-describedby="egov-availability">Продолжить с eGov</button>
    <p className="muted" id="egov-availability">Вход через eGov будет доступен после подключения официального сервиса идентификации.</p>
    <p className="muted">При первом входе создаётся личный аккаунт. Доступ к компании и право подписи выдаются отдельно.</p>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
