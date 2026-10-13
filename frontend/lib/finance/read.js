export const initialInvoiceRead = () => ({ status: 'loading', value: null, error: null });

export function invoiceReadError(error) {
  if (error?.status === 403) return 'Нет доступа к счетам.';
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.code === 'invalid_invoice_response') return 'Не удалось подтвердить данные счетов. Повторите загрузку.';
  return 'Не удалось загрузить счета. Повторите попытку.';
}

// Each mounted route owns its read. Abort also invalidates completions from
// transports that already received a response when navigation or retry began.
export function createInvoiceRead({ load, isCurrent, onChange }) {
  let controller = null, disposed = false;
  return {
    async reload() {
      if (disposed) return;
      // Even an obsolete scope must lose old data and request ownership.
      controller?.abort();
      controller = null;
      onChange(initialInvoiceRead());
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
