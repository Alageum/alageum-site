"use client";
import { Children, cloneElement, isValidElement, Fragment } from "react";
import Base from "@/components/locale/LocaleElement";
import { useLocale, useTranslate } from "@/components/locale/LocaleProvider";
import copy from "./translations.json";
export default function Text({ children, ...props }) {
  const locale = useLocale();
  function walk(value) {
    return Children.map(value, (v) =>
      typeof v === "string"
        ? copy[v.replace(/\s+/g, " ").trim()]?.[locale] || v
        : isValidElement(v) &&
            (typeof v.type === "string" || v.type === Fragment)
          ? cloneElement(v, {}, walk(v.props.children))
          : v,
    );
  }
  return <Base {...props}>{walk(children)}</Base>;
}

export function useCareerTranslate() {
  const locale = useLocale();
  const tx = useTranslate();
  return (value) =>
    copy[String(value).replace(/\s+/g, " ").trim()]?.[locale] || tx(value);
}
