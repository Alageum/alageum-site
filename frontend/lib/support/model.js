export function supportAccess(permissions = []) {
  const readable = permissions.includes('ticket.read');
  const creatable = permissions.includes('ticket.create');
  return { readable, creatable, visible: readable || creatable };
}

export function validateTicket(draft, categories) {
  const errors = {};
  if (!categories.some(item => item.id === draft.category_id)) errors.category_id = 'Выберите доступную категорию.';
  for (const [key, label, limit] of [['subject', 'Тема', 300], ['message', 'Сообщение', 10000]]) {
    if (typeof draft[key] !== 'string' || draft[key].length === 0) errors[key] = `${label}: заполните обязательное поле.`;
    else if (Array.from(draft[key]).length > limit) errors[key] = `${label}: не более ${limit} символов.`;
  }
  return errors;
}

export function supportReadError(error, resource) {
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.status === 403) return resource === 'categories' ? 'Нет доступа к категориям обращений.' : 'Нет доступа к списку обращений.';
  return resource === 'categories' ? 'Не удалось загрузить категории. Попробуйте ещё раз.' : 'Не удалось загрузить обращения. Попробуйте ещё раз.';
}

export const uncertainTicketMessage = 'Не удалось подтвердить отправку. Обращение могло быть создано. Повторная отправка может создать дубликат. Обновление списка не подтверждает, что обращения нет. Перед новым обращением уточните результат у сотрудника с доступом к обращениям.';
export const initialTicketSubmission = () => ({ pending: false, uncertain: false, error: '', message: '', errors: {} });

// One in-memory attempt owns its continuation. Aborting stops waiting only;
// without backend idempotency a failed/aborted write must never replay itself.
export function createTicketSubmission({ save, isCurrent, onChange, onConfirmed }) {
  let disposed = false, attempt = null, state = initialTicketSubmission();
  const publish = next => { state = next; if (!disposed && isCurrent()) onChange(state); };
  const current = owner => !disposed && attempt === owner && !owner.signal.aborted && isCurrent();
  return {
    async submit(draft, categories) {
      if (disposed || attempt || state.uncertain || !isCurrent()) return;
      const errors = validateTicket(draft, categories);
      if (Object.keys(errors).length) { publish({ ...initialTicketSubmission(), errors, error: 'Проверьте поля обращения.' }); return; }
      const owner = new AbortController();
      attempt = owner;
      publish({ ...initialTicketSubmission(), pending: true });
      try {
        const summary = await save({ category_id: draft.category_id, subject: draft.subject, message: draft.message }, { signal: owner.signal });
        if (!current(owner)) return;
        attempt = null;
        publish({ ...initialTicketSubmission(), message: 'Обращение создано' });
        onConfirmed(summary);
      } catch (error) {
        if (!current(owner)) return;
        attempt = null;
        const uncertain = ![400, 401, 403, 404, 409, 422].includes(error.status);
        publish({ ...initialTicketSubmission(), uncertain, error: uncertain ? uncertainTicketMessage :
          error.status === 403 ? 'Нет доступа к созданию обращений.' : error.status === 401 ? 'Сессия завершилась. Войдите снова.' : error.message || 'Не удалось создать обращение.' });
      }
    },
    cancel() {
      if (disposed || !isCurrent() || state.uncertain) return false;
      if (attempt) {
        attempt.abort(); attempt = null;
        publish({ ...initialTicketSubmission(), uncertain: true, error: uncertainTicketMessage });
        return false;
      }
      publish(initialTicketSubmission());
      return true;
    },
    startNew() {
      if (disposed || !isCurrent() || attempt) return false;
      publish(initialTicketSubmission());
      return true;
    },
    isPending: () => Boolean(attempt),
    dispose() { disposed = true; attempt?.abort(); attempt = null; },
  };
}
