export const initialOrderRead = () => ({ status: 'loading', value: null, error: null });

export function orderReadError(error) {
  if (error?.status === 403) return 'Нет доступа к заказам.';
  if (error?.status === 404) return 'Заказ не найден.';
  if (error?.status === 422) return 'Некорректный номер заказа.';
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.code === 'invalid_order_response') return 'Не удалось подтвердить данные заказа. Повторите загрузку.';
  return 'Не удалось загрузить заказы. Повторите попытку.';
}

// Each mounted route owns its read. Abort also invalidates completions from
// transports that already received a response when navigation or retry began.
export function createOrderRead({ load, isCurrent, onChange }) {
  let controller = null, disposed = false;
  return {
    async reload() {
      if (disposed) return;
      // Even an obsolete scope must lose old data and request ownership.
      controller?.abort();
      controller = null;
      onChange(initialOrderRead());
      if (!isCurrent()) return;
      const request = new AbortController();
      controller = request;
      const current = () => !disposed && !request.signal.aborted && controller === request && isCurrent();
      try {
        const value = await load({ signal: request.signal });
        if (current()) onChange({ status: 'ready', value, error: null });
      } catch (error) {
        if (current()) onChange({ status: 'error', value: null, error });
      }
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
