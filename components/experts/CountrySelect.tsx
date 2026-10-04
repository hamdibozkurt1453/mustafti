"use client";

import type { CountryOption } from "@/lib/experts/countries";

/** قائمة البلدان بأسمائها (تُبنى في الخادم). القيمة رمز ISO. */
export function CountrySelect({
  value,
  options,
  onChange,
  placeholder,
  invalid,
}: {
  value: string;
  options: CountryOption[];
  onChange: (code: string) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl border bg-white px-4 py-3 text-green-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 ${
        invalid ? "border-alert-600" : "border-sand-200"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
