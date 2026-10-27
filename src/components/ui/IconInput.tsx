"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useT } from "@/i18n/client";
import { Icon } from "../Icon";

// Form fields with a leading icon (a Tabler name from icons.json). Passwords get
// a show/hide button. Logical properties (start/end) keep the layout right in
// right-to-left languages such as Arabic.

type Shared = {
  /** Icon shown inside the field, at its start. */
  icon?: string;
  /** Classes for the wrapper (widths such as `max-w-64` or `flex-1` go here). */
  wrapperClassName?: string;
};

const iconClass = "pointer-events-none absolute start-3 text-muted";

export function IconInput({ icon, type, className = "", wrapperClassName = "", ...rest }: Shared & InputHTMLAttributes<HTMLInputElement>) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <span className={`relative block ${wrapperClassName}`}>
      {icon && <Icon name={icon} size={18} className={`${iconClass} top-1/2 -translate-y-1/2`} />}
      <input
        {...rest}
        type={isPassword && shown ? "text" : type}
        className={`input ${icon ? "!ps-10" : ""} ${isPassword ? "!pe-11" : ""} ${className}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t("Hide password") : t("Show password")}
          aria-pressed={shown}
          title={shown ? t("Hide password") : t("Show password")}
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-brand focus-visible:text-brand"
        >
          <Icon name={shown ? "eye-off" : "eye"} size={18} />
        </button>
      )}
    </span>
  );
}

export function IconTextarea({ icon, className = "", wrapperClassName = "", ...rest }: Shared & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <span className={`relative block ${wrapperClassName}`}>
      {icon && <Icon name={icon} size={18} className={`${iconClass} top-3`} />}
      <textarea {...rest} className={`input ${icon ? "!ps-10" : ""} ${className}`} />
    </span>
  );
}

export function IconSelect({
  icon,
  className = "",
  wrapperClassName = "",
  children,
  ...rest
}: Shared & SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode }) {
  return (
    <span className={`relative block ${wrapperClassName}`}>
      {icon && <Icon name={icon} size={18} className={`${iconClass} top-1/2 -translate-y-1/2`} />}
      <select {...rest} className={`input ${icon ? "!ps-10" : ""} ${className}`}>
        {children}
      </select>
    </span>
  );
}
