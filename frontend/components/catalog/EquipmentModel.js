'use client';import LocaleElement from "@/components/locale/LocaleElement";

import { useEffect, useId, useRef, useState } from 'react';
import EquipmentIcon from './EquipmentIcon';
import { MODEL_DISCLOSURE, equipmentModelName, resolveModelType } from '@/lib/catalog/models/types';
import styles from './models/EquipmentModel.module.css';

function ModelViewer({ type, className, previewIconType, previewIconReason }) {
  const [status, setStatus] = useState('loading');
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const activateRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const focusOnReadyRef = useRef(false);
  const helpId = useId();
  const active = status === 'loading' || status === 'ready';
  const label = equipmentModelName(type);
  useEffect(() => {
    if (status === 'idle' && restoreFocusRef.current) {
      activateRef.current?.focus({ preventScroll: true });
      restoreFocusRef.current = false;
    }
  }, [status]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let session;
    // Load when the detail viewer mounts; icon-only catalog lists stay lightweight.
    import('./models/createEquipmentViewer').then(({ createEquipmentViewer }) => {
      if (cancelled || !canvasRef.current) return;
      session = createEquipmentViewer(canvasRef.current, type, () => {if (!cancelled) setStatus('error');});
      viewerRef.current = session;
      setStatus('ready');
      if (focusOnReadyRef.current) {
        canvasRef.current?.focus({ preventScroll: true });
        focusOnReadyRef.current = false;
      }
    }).catch(() => {if (!cancelled) setStatus('error');});
    return () => {
      cancelled = true;
      session?.dispose();
      viewerRef.current = null;
    };
  }, [active, type]);
  return <LocaleElement as="section" className={`${styles.viewer} ${className || ''}`} aria-label={`Модель типа: ${label}`} data-equipment-model={type} data-model-status={status}>
    <LocaleElement as="div" className={styles.topline}><LocaleElement as="span">БИБЛИОТЕКА ТИПОВ</LocaleElement><LocaleElement as="span" className={styles.badge}>3D</LocaleElement></LocaleElement>
    <LocaleElement as="div" className={styles.viewport}>
      {active && <canvas ref={canvasRef} className={styles.canvas} tabIndex={0} aria-label={`Интерактивная 3D-модель: ${label}`} aria-describedby={helpId} />}
      {!active && <LocaleElement as="div" className={styles.preview}>{previewIconType ? <EquipmentIcon type={previewIconType} size={148} title={previewIconReason} /> : <svg width="148" height="148" viewBox="0 0 64 64" role="img" aria-label="Изображение конструкции не подтверждено" data-model-preview="source-document" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 7h22l9 9v41H17zM39 7v11h9M23 27h18M23 35h18M23 43h12" /></svg>}<LocaleElement as="span" className={styles.previewLabel}>{label}</LocaleElement></LocaleElement>}
      {status === 'loading' && <LocaleElement as="div" className={styles.loading} role="status">Загружаем 3D-модель…</LocaleElement>}
      {status === 'idle' && <LocaleElement as="button" ref={activateRef} type="button" className={styles.activate} onClick={() => {focusOnReadyRef.current = true;setStatus('loading');}}><LocaleElement as="span" aria-hidden="true">↗</LocaleElement> Открыть 3D-модель</LocaleElement>}
      {status === 'error' && <LocaleElement as="div" className={styles.fallback} role="status"><LocaleElement as="p">3D недоступно в этом браузере. {previewIconType ? 'Выше показана отдельно проверенная иконка.' : 'Изображение конструкции этого исполнения не подтверждено.'}</LocaleElement><LocaleElement as="button" type="button" className={styles.retry} onClick={() => {focusOnReadyRef.current = true;setStatus('loading');}}>Попробовать снова</LocaleElement></LocaleElement>}
    </LocaleElement>
    {active && <LocaleElement as="div" className={styles.controls} role="group" aria-label="Управление 3D-моделью">
      <LocaleElement as="button" type="button" disabled={status !== 'ready'} aria-label="Повернуть модель влево" onClick={() => viewerRef.current?.rotate(.25)}>↶</LocaleElement>
      <LocaleElement as="button" type="button" disabled={status !== 'ready'} aria-label="Повернуть модель вправо" onClick={() => viewerRef.current?.rotate(-.25)}>↷</LocaleElement>
      <LocaleElement as="button" type="button" disabled={status !== 'ready'} aria-label="Приблизить модель" onClick={() => viewerRef.current?.zoom(1)}>+</LocaleElement>
      <LocaleElement as="button" type="button" disabled={status !== 'ready'} aria-label="Отдалить модель" onClick={() => viewerRef.current?.zoom(-1)}>−</LocaleElement>
      <LocaleElement as="button" type="button" className={styles.reset} disabled={status !== 'ready'} onClick={() => viewerRef.current?.reset()}>Сброс</LocaleElement>
      <LocaleElement as="button" type="button" className={styles.close} onClick={() => {restoreFocusRef.current = true;setStatus('idle');}} aria-label="Закрыть 3D-модель">Закрыть</LocaleElement>
    </LocaleElement>}
    <LocaleElement as="p" id={helpId} className={styles.help}>{active ? 'Вращайте мышью или пальцем. Масштаб: два пальца или + / −. С клавиатуры: стрелки, + / −, Home для сброса.' : 'Одна модель для всего типа оборудования. Доступна после открытия.'}</LocaleElement>
    <LocaleElement as="p" className={styles.disclosure}>{MODEL_DISCLOSURE}</LocaleElement>
  </LocaleElement>;
}

export default function EquipmentModel({ type, className = '', previewIconType = null, previewIconReason = '' }) {
  const resolved = resolveModelType(type);
  // Type changes fully release the previous viewer, including pending imports.
  return <ModelViewer key={resolved} type={resolved} className={className} previewIconType={previewIconType} previewIconReason={previewIconReason} />;
}
