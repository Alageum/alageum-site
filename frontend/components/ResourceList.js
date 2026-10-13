"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useEffect, useState } from "react";

export default function ResourceList({ load, empty = "Данных пока нет", render }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    load().then((value) => active && setItems(value)).catch((reason) => active && setError(reason));
    return () => {active = false;};
  }, [load, attempt]);
  if (error) {
    const label = error.status === 403 ? "Нет доступа" : error.status === 404 ? "Не найдено" :
    error.status ? error.message : "Backend временно недоступен";
    const retry = () => {setError(null);setItems(null);setAttempt((x) => x + 1);};
    return <LocaleElement as="div" className="card"><LocaleElement as="p" className="error">{label}</LocaleElement><LocaleElement as="button" className="buttonSecondary" onClick={retry}>Повторить</LocaleElement></LocaleElement>;
  }
  if (!items) return <LocaleElement as="p" className="muted">Загрузка…</LocaleElement>;
  if (!items.length) return <LocaleElement as="div" className="card muted">{empty}</LocaleElement>;
  return <LocaleElement as="div" className="grid">{items.map(render)}</LocaleElement>;
}
