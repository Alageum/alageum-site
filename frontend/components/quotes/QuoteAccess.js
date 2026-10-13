'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useAuth } from '@/components/AuthProvider';
export default function QuoteAccess({ children, permission = 'quote.read', next = '/b2b/quotes' }) {
  const { profile, loading, hasPermission } = useAuth();
  if (loading) return <LocaleElement as="p" role="status">Проверка сессии…</LocaleElement>;
  if (!profile) return <LocaleElement as="div" className="card"><LocaleElement as="h2">Войдите в B2B кабинет</LocaleElement><LocaleElement as="p">Запросы доступны только после входа.</LocaleElement><Link className="button" href={`/login?next=${encodeURIComponent(next)}`}>Войти</Link></LocaleElement>;
  if (!hasPermission(permission)) return <LocaleElement as="div" className="card" role="alert"><LocaleElement as="h2">Нет доступа к запросам КП</LocaleElement><LocaleElement as="p">Для этого действия вашей учётной записи требуется разрешение.</LocaleElement></LocaleElement>;
  return children;
}
