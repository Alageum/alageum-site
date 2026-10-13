'use client';
import { createElement, useState } from 'react';

// A failed source request keeps its caption and full-page link visible. Never
// select a fallback cabinet image or change the current catalog product.
export default function SourceContextImage({ figure, className }) {
  const [failedPath, setFailedPath] = useState(null);
  if (failedPath === figure.cropPath) return createElement('span', { role: 'status' }, 'Исходное изображение недоступно. Откройте полную страницу каталога.');
  return createElement('img', {
    className, src: figure.cropPath, width: figure.width, height: figure.height,
    alt: figure.imageAlt || `${figure.title}. Фрагмент исходного чертежа на странице ${figure.sourcePage}`,
    loading: 'lazy', decoding: 'async', onError: () => setFailedPath(figure.cropPath),
  });
}
