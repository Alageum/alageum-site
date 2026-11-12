"use client";
import Image from "next/image";
import { useLocale, useTranslate } from "@/components/locale/LocaleProvider";
import copy from "./translations.json";
export default function CareerImage({ alt, ...props }) {
  const locale = useLocale();
  const tx = useTranslate();
  return <Image {...props} alt={copy[alt]?.[locale] || tx(alt)} />;
}
