export const COMPANY_PROFILE_FIELDS = [
  { key: 'name', label: 'Название компании', maxLength: 240, required: true },
  { key: 'business_contact_name', label: 'Контактное лицо', maxLength: 200 },
  { key: 'business_contact_email', label: 'Рабочий email', maxLength: 320, inputMode: 'email' },
  { key: 'business_contact_phone', label: 'Рабочий телефон', maxLength: 80, inputMode: 'tel' },
  { key: 'business_address', label: 'Рабочий адрес', maxLength: 2000, multiline: true },
];

export function organizationProfileScope(profile, authGeneration, sessionGeneration) {
  return profile?.user?.id && profile?.organization?.id
    ? JSON.stringify([profile.user.id, profile.organization.id, authGeneration, sessionGeneration]) : null;
}

export function companyProfileDraft(snapshot) {
  return Object.fromEntries(COMPANY_PROFILE_FIELDS.map(({ key }) => [key, snapshot[key] ?? '']));
}

export function companyProfilePatch(draft, snapshot) {
  const errors = {}, patch = { version: snapshot.version };
  for (const { key, label, maxLength, required } of COMPANY_PROFILE_FIELDS) {
    const value = draft[key].trim();
    if (required && !value) errors[key] = 'Введите название компании.';
    else if (value.length > maxLength) errors[key] = `${label}: не более ${maxLength} символов.`;
    else if (key === 'business_contact_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[key] = 'Введите email в формате name@example.com.';
    const normalized = value || null;
    if (normalized !== (snapshot[key] || null)) patch[key] = normalized;
  }
  return { errors, patch: Object.keys(patch).length > 1 ? patch : null };
}

export function companyProfileError(error, saving = false) {
  if (error.status === 401) return 'Сессия завершилась. Войдите снова; изменения автоматически не отправлялись повторно.';
  if (error.status === 403) return 'Недостаточно прав для этого действия. Обратитесь к администратору организации.';
  if (error.status === 409 && error.code === 'version_conflict') return 'Профиль изменён другим пользователем. Ваш черновик сохранён на этой странице. Загрузите актуальные данные, чтобы заменить черновик и продолжить.';
  if ([400, 422].includes(error.status)) return 'Проверьте поля профиля. Сервер отклонил изменения.';
  return saving ? 'Не удалось подтвердить сохранение. Запрос мог сохраниться. Загрузите актуальные данные перед повторной отправкой.' : 'Не удалось загрузить профиль компании. Попробуйте ещё раз.';
}

export const initialCompanyProfileState = () => ({
  status: 'loading', snapshot: null, draft: null, editing: false, pending: false,
  error: '', errors: {}, message: '', conflict: false, requiresReload: false,
});

// One controller lives only as long as its mounted account/tenant/login scope.
// Aborting a request cannot undo a server commit: invalidate the continuation as
// well, so ignored aborts cannot repopulate a draft or update the account header.
export function createCompanyProfileEditor({ read, save, isCurrent, canEdit, onChange, onConfirmed, organizationId }) {
  let state = initialCompanyProfileState(), active = true, sequence = 0, controller;
  const current = () => active && isCurrent();
  const publish = changes => {
    if (!current()) return;
    state = { ...state, ...changes };
    onChange(state);
  };
  const invalidate = () => { sequence += 1; controller?.abort(); controller = null; };
  const begin = () => { invalidate(); controller = new AbortController(); return { id: sequence, signal: controller.signal }; };
  const owns = operation => current() && sequence === operation.id;
  const validSnapshot = snapshot => snapshot?.organization_id === organizationId &&
    Number.isInteger(snapshot.version) && snapshot.version >= 0 && typeof snapshot.name === 'string';

  return {
    async load() {
      if (!current()) return;
      const operation = begin();
      publish({ ...initialCompanyProfileState() });
      try {
        const snapshot = await read(operation.signal);
        if (!owns(operation)) return;
        if (!validSnapshot(snapshot)) throw new Error('Invalid organization profile response');
        publish({ status: 'ready', snapshot });
        if (owns(operation)) onConfirmed(snapshot);
      } catch (error) {
        if (owns(operation)) publish({ status: 'error', error: companyProfileError(error) });
      }
    },
    edit() {
      if (!current() || !canEdit() || state.status !== 'ready' || state.pending || state.requiresReload) return;
      publish({ editing: true, draft: companyProfileDraft(state.snapshot), error: '', errors: {}, message: '', conflict: false });
    },
    change(key, value) {
      if (!current() || !state.editing || state.pending || !COMPANY_PROFILE_FIELDS.some(field => field.key === key)) return;
      publish({ draft: { ...state.draft, [key]: value }, errors: { ...state.errors, [key]: '' }, message: '' });
    },
    cancel() {
      if (!current()) return;
      const uncertain = state.pending || state.requiresReload || state.conflict;
      invalidate();
      publish({ editing: false, draft: null, pending: false, error: '', errors: {}, conflict: false, requiresReload: uncertain,
        message: uncertain ? 'Редактирование закрыто. Загрузите актуальные данные перед новым изменением: запрос мог уже сохраниться.' : 'Изменения отменены.' });
    },
    async submit() {
      if (!current() || !canEdit() || !state.editing || state.pending || state.conflict || state.requiresReload) return;
      const { patch, errors } = companyProfilePatch(state.draft, state.snapshot);
      if (Object.keys(errors).length) { publish({ errors, error: 'Проверьте отмеченные поля.' }); return; }
      if (!patch) { publish({ editing: false, draft: null, error: '', errors: {}, message: 'Нет изменений для сохранения.' }); return; }
      const operation = begin();
      publish({ pending: true, error: '', errors: {}, message: '' });
      try {
        const snapshot = await save(patch, operation.signal);
        if (!owns(operation)) return;
        if (!validSnapshot(snapshot)) throw new Error('Invalid organization profile response');
        publish({ snapshot, pending: false, editing: false, draft: null, conflict: false, message: 'Профиль компании сохранён' });
        if (owns(operation)) onConfirmed(snapshot);
      } catch (error) {
        if (!owns(operation)) return;
        const conflict = error.status === 409 && error.code === 'version_conflict';
        publish({ pending: false, conflict, requiresReload: ![400, 401, 403, 409, 422].includes(error.status), error: companyProfileError(error, true) });
      }
    },
    dispose() { active = false; invalidate(); },
  };
}
