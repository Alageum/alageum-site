'use client';import LocaleElement from "@/components/locale/LocaleElement";

import Link from "@/components/locale/LocaleLink";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getOrganizationProfile, updateOrganizationProfile } from '@/lib/api/organizations';
import { COMPANY_PROFILE_FIELDS, createCompanyProfileEditor, initialCompanyProfileState } from '@/lib/organizations/profile';
import styles from './CompanyProfileEditor.module.css';

function CompanyEditor({ scope, organizationId, editable }) {
  const { isAuthScopeCurrent, updateOrganization, registerOrganizationChange } = useAuth();
  const [state, setState] = useState(initialCompanyProfileState);
  const editor = useRef(null),errorBox = useRef(null),latestState = useRef(initialCompanyProfileState());
  useLayoutEffect(() => registerOrganizationChange(() => {
    const current = latestState.current;
    return {
      dirty: Boolean(current.editing && current.draft && current.snapshot && COMPANY_PROFILE_FIELDS.some(({ key }) => current.draft[key] !== (current.snapshot[key] ?? ''))),
      pending: current.pending
    };
  }), [registerOrganizationChange]);
  useLayoutEffect(() => {
    const current = createCompanyProfileEditor({
      read: getOrganizationProfile, save: updateOrganizationProfile,
      isCurrent: () => isAuthScopeCurrent(scope), canEdit: () => editable,
      onChange: (next) => {latestState.current = next;setState(next);}, onConfirmed: (snapshot) => updateOrganization(snapshot, scope), organizationId
    });
    editor.current = current;
    // Resolve after layout setup so React Strict Mode can discard its first flow.
    Promise.resolve().then(() => current.load());
    return () => {current.dispose();if (editor.current === current) editor.current = null;};
  }, [scope, organizationId, editable, isAuthScopeCurrent, updateOrganization]);
  useEffect(() => {if (state.error) errorBox.current?.focus();}, [state.error]);

  return <LocaleElement as="section" className={`card ${styles.company}`} aria-labelledby="company-profile-heading" data-testid="company-profile" aria-busy={state.status === 'loading' || state.pending}>
    <LocaleElement as="h2" id="company-profile-heading">Профиль компании</LocaleElement>
    <LocaleElement as="p" className="muted" id="company-contact-help">Рабочие контакты указаны вашей организацией и не проверены. Их сохранение не подтверждает email, телефон или адрес.</LocaleElement>
    {state.status === 'loading' && <LocaleElement as="p" role="status">Загрузка профиля компании…</LocaleElement>}
    {state.error && <LocaleElement as="div" ref={errorBox} tabIndex={-1} className={`error ${styles.notice}`} role="alert" data-testid={state.conflict ? 'profile-conflict' : 'profile-error'}>{state.error}</LocaleElement>}
    {state.message && <LocaleElement as="p" role="status" className={styles.notice}>{state.message}</LocaleElement>}
    {state.status === 'error' && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => editor.current?.load()}>Повторить загрузку</LocaleElement>}
    {state.status === 'ready' && <>
      {state.editing ? <LocaleElement as="form" noValidate onSubmit={(event) => {event.preventDefault();editor.current?.submit();}} aria-label="Редактирование профиля компании">
        <LocaleElement as="div" className={styles.fields}>
          {COMPANY_PROFILE_FIELDS.map(({ key, label, required, maxLength, multiline, inputMode }) => {
            const input = {
              id: `company-${key}`, name: key, value: state.draft[key], required, maxLength, inputMode,
              disabled: state.pending, autoComplete: 'off', 'aria-invalid': Boolean(state.errors[key]),
              'aria-describedby': `${key === 'name' ? '' : 'company-contact-help '}${state.errors[key] ? `company-error-${key}` : ''}`.trim() || undefined,
              onChange: (event) => editor.current?.change(key, event.target.value)
            };
            return <LocaleElement as="div" className={multiline ? styles.wide : undefined} key={key}>
              <LocaleElement as="label" htmlFor={input.id}>{label}{required && <LocaleElement as="span" aria-hidden="true"> *</LocaleElement>}</LocaleElement>
              {multiline ? <LocaleElement as="textarea" {...input} rows={4} /> : <LocaleElement as="input" {...input} type="text" />}
              {state.errors[key] && <LocaleElement as="p" className="error" id={`company-error-${key}`}>{state.errors[key]}</LocaleElement>}
            </LocaleElement>;
          })}
        </LocaleElement>
        <LocaleElement as="p" className="muted">* Обязательное поле. Пустое необязательное поле удаляет сохранённое значение. Черновик хранится только на этой странице.</LocaleElement>
        <LocaleElement as="div" className={styles.actions}>
          <LocaleElement as="button" className="button" type="submit" disabled={state.pending || state.conflict || state.requiresReload}>{state.pending ? 'Сохранение…' : 'Сохранить изменения'}</LocaleElement>
          <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => editor.current?.cancel()}>Отмена</LocaleElement>
          {(state.conflict || state.requiresReload) && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => editor.current?.load()}>Загрузить актуальные данные</LocaleElement>}
        </LocaleElement>
        {state.pending && <LocaleElement as="p" role="status">Ожидаем подтверждение сервера…</LocaleElement>}
      </LocaleElement> : <>
        <LocaleElement as="dl" className={styles.values}>{COMPANY_PROFILE_FIELDS.map(({ key, label }) => <LocaleElement as="div" key={key}><LocaleElement as="dt">{label}</LocaleElement><LocaleElement as="dd" data-testid={`company-value-${key}`}>{state.snapshot[key] || 'Не указано'}</LocaleElement></LocaleElement>)}</LocaleElement>
        <LocaleElement as="div" className={styles.actions}>
          {editable && !state.requiresReload && <LocaleElement as="button" className="button" type="button" onClick={() => editor.current?.edit()}>Редактировать профиль компании</LocaleElement>}
          <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => editor.current?.load()}>{state.requiresReload ? 'Загрузить актуальные данные' : 'Обновить данные'}</LocaleElement>
        </LocaleElement>
        {!editable && <LocaleElement as="p" className="muted">У вас есть доступ только к просмотру профиля компании.</LocaleElement>}
      </>}
    </>}
  </LocaleElement>;
}

export default function CompanyProfileEditor() {
  const { profile, loading, hasPermission, authScope } = useAuth();
  if (loading) return <LocaleElement as="p" role="status">Проверка сессии…</LocaleElement>;
  if (!profile) return <LocaleElement as="section" className="card"><LocaleElement as="h2">Войдите в B2B кабинет</LocaleElement><LocaleElement as="p">Профиль доступен после входа.</LocaleElement><Link className="button" href="/login?next=%2Fb2b%2Fprofile">Войти</Link></LocaleElement>;
  const readable = hasPermission('organization.profile.read'),editable = readable && hasPermission('organization.profile.update');
  return <LocaleElement as="div" className={styles.layout}>
    <LocaleElement as="section" className="card" aria-labelledby="personal-profile-heading" data-testid="personal-profile">
      <LocaleElement as="h2" id="personal-profile-heading">Личный профиль</LocaleElement>
      <LocaleElement as="dl" className={styles.values}><LocaleElement as="div"><LocaleElement as="dt">Имя пользователя</LocaleElement><LocaleElement as="dd">{profile.user?.display_name || 'Не указано'}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Email для входа</LocaleElement><LocaleElement as="dd">{profile.user?.email || 'Не указан'}</LocaleElement></LocaleElement></LocaleElement>
      <LocaleElement as="p" className="muted">Организация: <LocaleElement as="span" data-testid="current-organization-name">{profile.organization?.name}</LocaleElement></LocaleElement>
      <LocaleElement as="p" className="muted">Данные учётной записи управляются отдельно от рабочих контактов компании.</LocaleElement>
    </LocaleElement>
    {readable ? <CompanyEditor key={`${authScope}:${editable}`} scope={authScope} organizationId={profile.organization.id} editable={editable} /> : <LocaleElement as="section" className="card" data-testid="company-profile"><LocaleElement as="h2">Профиль компании</LocaleElement><LocaleElement as="p" role="alert">У вашей учётной записи нет разрешения на просмотр профиля компании.</LocaleElement></LocaleElement>}
  </LocaleElement>;
}
