'use client';
import { createContext, useContext } from 'react';
import { translateText } from '@/lib/i18n/translate';
const LocaleContext = createContext('ru');
export function LocaleProvider({ locale = 'ru', children }) { return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>; }
export function useLocale() { return useContext(LocaleContext); }
export function useTranslate() { const locale = useLocale(); return value => translateText(value, locale); }
