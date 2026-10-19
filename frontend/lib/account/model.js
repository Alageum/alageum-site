export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const companyRequestLabels = Object.freeze({ pending: 'На проверке', approved: 'Одобрено', rejected: 'Отклонено' });

export function passwordError(password, confirmation) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return 'Пароль должен содержать от 12 до 128 символов.';
  if (password !== confirmation) return 'Пароли не совпадают.';
  return '';
}

export function accountError(error) {
  if (error?.name === 'AbortError') return '';
  if (error?.code === 'session_changed') return 'Сессия изменилась. Обновите страницу и повторите действие.';
  if (error?.code === 'invalid_token') return 'Ссылка недействительна или срок её действия истёк. Запросите новое письмо.';
  if (error?.code === 'email_not_verified' || error?.code === 'email_verification_required') return 'Подтвердите email по ссылке из письма.';
  if (error?.status === 429) return 'Слишком много попыток. Подождите несколько минут и повторите.';
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.status === 403) return 'Доступ не подтверждён. Обновите страницу или обратитесь к администратору.';
  if (error?.status === 409) return 'Данные уже изменились. Обновите список перед повторным действием.';
  if (error?.code === 'mail_unavailable') return 'Отправка писем ещё не настроена. Обратитесь к администратору сайта.';
  if (error?.status === 503) return 'Сервис временно недоступен. Повторите попытку позже.';
  if (error?.status === 400 || error?.status === 422 || error?.code === 'validation_error') return 'Проверьте заполненные поля и повторите попытку.';
  return 'Не удалось выполнить запрос. Проверьте подключение и повторите попытку.';
}

// One mounted flow owns its requests. Aborting is not enough: some transports
// can still resolve. Ownership prevents their result from repainting a new page.
export function createAccountOperation() {
  let active = null;
  let disposed = false;
  return {
    async run(work, accept, reject) {
      if (disposed || active) return false;
      const controller = new AbortController();
      active = controller;
      const current = () => !disposed && active === controller && !controller.signal.aborted;
      try {
        const result = await work(controller.signal);
        if (current()) accept(result);
      } catch (error) {
        if (current()) reject(error);
      } finally {
        if (active === controller) active = null;
      }
      return true;
    },
    dispose() { disposed = true; active?.abort(); active = null; },
  };
}

export function readAccountToken(location) {
  const search = new URLSearchParams(location.search || '');
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const values = [...search.getAll('token'), ...hash.getAll('token')];
  const token = values.length === 1 && /^[A-Za-z0-9_-]{64}$/.test(values[0]) ? values[0] : '';
  search.delete('token');
  hash.delete('token');
  return { token, cleanHref: `${location.pathname}${search.size ? `?${search}` : ''}${hash.size ? `#${hash}` : ''}` };
}
