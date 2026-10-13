'use client';
import Image from 'next/image';
import { useLocale } from './LocaleProvider';
import { translateText } from '@/lib/i18n/translate';
export default function LocaleImage({ alt, ...props }) { return <Image alt={translateText(alt, useLocale())} {...props} />; }
