"use client";
import Image from "next/image";
import { useLocale } from "@/components/locale/LocaleProvider";
import copy from "./translations.json";
export default function CareerImage({ alt, ...props }) {
  const locale = useLocale();
  return <Image {...props} alt={copy[alt]?.[locale] || alt} />;
}
