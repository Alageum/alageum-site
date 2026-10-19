'use client';
import { createElement, useCallback, useRef, useState } from 'react';

// A failed source request keeps its caption and full-page link visible. Never
// select a fallback cabinet image or change the current catalog product.
export default function SourceContextImage({ figure, className }) {
  const [failedPath, setFailedPath] = useState(null);
  const imageRef = useRef(null);
  const cropPath = figure.cropPath;
  const reconcileImage = useCallback(image => {
    imageRef.current = image;
    // A server-rendered image can fail before React attaches onError. Reconcile
    // its completed request at attachment, while leaving lazy loads pending.
    if (image) setFailedPath(image.complete && image.naturalWidth === 0 ? cropPath : null);
  }, [cropPath]);
  const handleError = useCallback(event => {
    // A replaced source has its own node; late errors from the old one must
    // not overwrite the newer source's state.
    if (event.currentTarget === imageRef.current) setFailedPath(cropPath);
  }, [cropPath]);
  if (failedPath === cropPath) return createElement('span', { role: 'status' }, 'Исходное изображение недоступно. Откройте полную страницу каталога.');
  // eslint-disable-next-line react-hooks/refs -- createElement stores these callbacks; React invokes them only during commit/events.
  return createElement('img', {
    key: cropPath, ref: reconcileImage,
    className, src: cropPath, width: figure.width, height: figure.height,
    alt: figure.imageAlt || `${figure.title}. Фрагмент исходного чертежа на странице ${figure.sourcePage}`,
    loading: 'lazy', decoding: 'async', onError: handleError,
  });
}
