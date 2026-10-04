"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { localeNames, type Locale } from "@/i18n/locales";
import { createDocUpload, removeDocUpload, submitApplication } from "@/lib/experts/actions";
import {
  ApplicationSchema,
  docProblem,
  EXPERT_BUCKET,
  EXPERT_ROLES,
  LANGUAGE_OPTIONS,
  MAX_DOCS,
  type ExpertRole,
  type Tazkiya,
} from "@/lib/experts/types";
import { createClient } from "@/lib/supabase/client";

type Doc = { path: string; name: string };

type Form = {
  displayName: string;
  role: ExpertRole;
  specialty: string;
  country: string;
  languages: string[];
  traditional: boolean;
  degree: string;
  institution: string;
  gradYear: string;
  docs: Doc[];
  tazkiyat: Tazkiya[];
  pledge: boolean;
};

const EMPTY: Form = {
  displayName: "",
  role: "mufti",
  specialty: "",
  country: "",
  languages: ["ar"],
  traditional: false,
  degree: "",
  institution: "",
  gradYear: "",
  docs: [],
  tazkiyat: [],
  pledge: false,
};

const input =
  "w-full rounded-xl border border-sand-200 bg-white px-4 py-3 text-green-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-green-900">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-600">{hint}</span>}
    </label>
  );
}

/**
 * معالج الانضمام كمختص: 4 خطوات بشريط تقدم، وحفظ تلقائي في المتصفح (localStorage، لكل حساب).
 * الوثائق تُرفع فور اختيارها برابط موقّع من الخادم، فيُحفظ مسارها مع المسودة.
 * التحقق هنا للراحة فقط؛ الخادم يعيده كاملاً (lib/experts/actions.ts).
 */
export function ExpertJoinWizard({ userId, initialName }: { userId: string; initialName: string }) {
  const t = useTranslations("experts.join");
  const router = useRouter();
  const storageKey = `mustafti:expert-join:${userId}`;
  const [form, setForm] = useState<Form>({ ...EMPTY, displayName: initialName });
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const loaded = useRef(false);

  // استعادة المسودة مرة واحدة بعد التحميل.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { form?: Partial<Form>; step?: number };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- استعادة من التخزين بعد التحميل فقط
        if (saved.form) setForm((f) => ({ ...f, ...saved.form, pledge: false }));
        if (typeof saved.step === "number") setStep(Math.min(Math.max(saved.step, 0), 3));
      }
    } catch {
      // مسودة تالفة أو تخزين محجوب: نبدأ من جديد.
    }
    loaded.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ form, step }));
    } catch {
      // التخزين غير متاح: يعمل المعالج بلا حفظ.
    }
  }, [form, step, storageKey]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  function stepValid(i: number): boolean {
    if (i === 0) {
      return form.displayName.trim().length >= 2 && form.specialty.trim().length >= 2 && form.country.trim().length >= 2 && form.languages.length > 0;
    }
    if (i === 1) {
      if (form.traditional) return true;
      const year = Number(form.gradYear);
      return form.degree.trim().length >= 2 && form.institution.trim().length >= 2 && (!form.gradYear || (year >= 1940 && year <= 2100));
    }
    if (i === 2) {
      const tz = form.tazkiyat.filter((x) => x.scholar.trim() && x.contact.trim());
      if (form.traditional && tz.length === 0) return false;
      return form.docs.length > 0 || tz.length > 0;
    }
    return form.pledge;
  }

  function go(next: number) {
    setError(null);
    if (next > step && !stepValid(step)) {
      setError(step === 2 ? (form.traditional ? t("needTazkiya") : t("needOne")) : t("required"));
      return;
    }
    setStep(next);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const problem = docProblem(file);
    if (problem) return setError(t(`errors.${problem}`));
    setUploading(true);
    try {
      const res = await createDocUpload({ type: file.type, size: file.size });
      if (!res.ok) return setError(t(`errors.${res.error}` as "errors.generic"));
      const { error: upError } = await createClient()
        .storage.from(EXPERT_BUCKET)
        .uploadToSignedUrl(res.path, res.token, file, { contentType: file.type });
      if (upError) return setError(t("errors.upload"));
      setForm((f) => ({ ...f, docs: [...f.docs, { path: res.path, name: file.name.slice(0, 120) }] }));
    } catch {
      setError(t("errors.upload"));
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(doc: Doc) {
    setForm((f) => ({ ...f, docs: f.docs.filter((d) => d.path !== doc.path) }));
    await removeDocUpload(doc.path).catch(() => null);
  }

  async function submit() {
    setError(null);
    const payload = {
      displayName: form.displayName,
      role: form.role,
      specialty: form.specialty,
      country: form.country,
      languages: form.languages,
      traditional: form.traditional,
      degree: form.degree,
      institution: form.institution,
      gradYear: form.gradYear ? Number(form.gradYear) : null,
      tazkiyat: form.tazkiyat.filter((x) => x.scholar.trim() && x.contact.trim()),
      docPaths: form.docs.map((d) => d.path),
      pledge: form.pledge,
    };
    if (!ApplicationSchema.safeParse(payload).success) return setError(t("errors.invalid"));
    setBusy(true);
    try {
      const res = await submitApplication(payload);
      if (!res.ok) return setError(t(`errors.${res.error}` as "errors.generic"));
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const steps = (["s1", "s2", "s3", "s4"] as const).map((k) => t(`steps.${k}`));
  const pledgeItems = (["p1", "p2", "p3", "p4"] as const).map((k) => t(`pledgeItems.${k}`));

  return (
    <div className="space-y-6">
      {/* شريط التقدم */}
      <div>
        <ol className="grid grid-cols-4 gap-2" aria-label={t("stepOf", { n: step + 1 })}>
          {steps.map((label, i) => (
            <li key={label} className="text-center">
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-gold-500" : "bg-sand-200"}`} />
              <span className={`mt-1.5 block text-[11px] ${i === step ? "font-semibold text-green-900" : "text-ink-600"}`}>{label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 flex justify-between text-xs text-ink-600">
          <span>{t("stepOf", { n: step + 1 })}</span>
          <span>{t("saved")}</span>
        </p>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <Field label={t("name")}>
            <input className={input} value={form.displayName} maxLength={80} onChange={(e) => set("displayName", e.target.value)} />
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold text-green-900">{t("role")}</legend>
            <div className="flex flex-wrap gap-2">
              {EXPERT_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("role", r)}
                  aria-pressed={form.role === r}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    form.role === r ? "border-green-900 bg-green-900 text-ivory-50" : "border-sand-200 bg-white text-green-900"
                  }`}
                >
                  {t(`roles.${r}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t("specialty")} hint={t("specialtyHint")}>
            <input className={input} value={form.specialty} maxLength={160} onChange={(e) => set("specialty", e.target.value)} />
          </Field>
          <Field label={t("country")}>
            <input className={input} value={form.country} maxLength={80} onChange={(e) => set("country", e.target.value)} />
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold text-green-900">{t("languages")}</legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((l) => {
                const on = form.languages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("languages", on ? form.languages.filter((x) => x !== l) : [...form.languages, l])}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      on ? "border-green-600 bg-green-600 text-ivory-50" : "border-sand-200 bg-white text-green-900"
                    }`}
                  >
                    {localeNames[l as Locale]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-sand-200 bg-white p-3">
            <input type="checkbox" className="mt-1 size-4 accent-green-600" checked={form.traditional} onChange={(e) => set("traditional", e.target.checked)} />
            <span className="text-sm text-green-900">{t("traditional")}</span>
          </label>
          <Field label={t("degree")} hint={t("degreeHint")}>
            <input className={input} value={form.degree} maxLength={160} onChange={(e) => set("degree", e.target.value)} />
          </Field>
          <Field label={t("institution")}>
            <input className={input} value={form.institution} maxLength={160} onChange={(e) => set("institution", e.target.value)} />
          </Field>
          <Field label={t("gradYear")}>
            <input
              className={input}
              value={form.gradYear}
              inputMode="numeric"
              dir="ltr"
              onChange={(e) => set("gradYear", e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="font-semibold text-green-900">{t("docsTitle")}</h2>
            <p className="text-xs text-ink-600">{t("docsHint")}</p>
            {form.docs.length > 0 && (
              <ul className="space-y-1.5">
                {form.docs.map((d) => (
                  <li key={d.path} className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm">
                    <span dir="auto" className="truncate text-green-900">{d.name}</span>
                    <button type="button" onClick={() => removeDoc(d)} className="shrink-0 text-alert-600 underline">
                      {t("remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {form.docs.length < MAX_DOCS && (
              <label className="inline-block cursor-pointer rounded-full border border-green-900/20 bg-white px-4 py-2 text-sm font-semibold text-green-900 hover:bg-green-900/5">
                {uploading ? t("uploading") : t("addDoc")}
                <input
                  type="file"
                  className="sr-only"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={onFile}
                />
              </label>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold text-green-900">{t("tazkiyatTitle")}</h2>
            <p className="text-xs text-ink-600">{t("tazkiyatHint")}</p>
            {form.tazkiyat.map((tz, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-sand-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className={input}
                  placeholder={t("scholar")}
                  aria-label={t("scholar")}
                  value={tz.scholar}
                  maxLength={120}
                  onChange={(e) => set("tazkiyat", form.tazkiyat.map((x, j) => (j === i ? { ...x, scholar: e.target.value } : x)))}
                />
                <input
                  className={input}
                  placeholder={t("contact")}
                  aria-label={t("contact")}
                  value={tz.contact}
                  maxLength={200}
                  dir="auto"
                  onChange={(e) => set("tazkiyat", form.tazkiyat.map((x, j) => (j === i ? { ...x, contact: e.target.value } : x)))}
                />
                <button
                  type="button"
                  onClick={() => set("tazkiyat", form.tazkiyat.filter((_, j) => j !== i))}
                  className="text-sm text-alert-600 underline"
                >
                  {t("remove")}
                </button>
              </div>
            ))}
            {form.tazkiyat.length < 6 && (
              <button
                type="button"
                onClick={() => set("tazkiyat", [...form.tazkiyat, { scholar: "", contact: "" }])}
                className="rounded-full border border-green-900/20 bg-white px-4 py-2 text-sm font-semibold text-green-900 hover:bg-green-900/5"
              >
                {t("addTazkiya")}
              </button>
            )}
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-green-900">{t("pledgeTitle")}</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-green-900">
            {pledgeItems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <label className="flex items-start gap-3 rounded-xl border border-sand-200 bg-white p-3">
            <input type="checkbox" className="mt-1 size-4 accent-green-600" checked={form.pledge} onChange={(e) => set("pledge", e.target.checked)} />
            <span className="text-sm font-semibold text-green-900">{t("pledge")}</span>
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-alert-600">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => go(step - 1)} className="rounded-full border border-green-900/20 px-5 py-2.5 font-semibold text-green-900">
            {t("back")}
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={() => go(step + 1)}
            disabled={uploading}
            className="rounded-full bg-green-900 px-6 py-2.5 font-semibold text-ivory-50 disabled:opacity-60"
          >
            {t("next")}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || !form.pledge}
            className="rounded-full bg-gold-500 px-6 py-2.5 font-semibold text-green-900 disabled:opacity-60"
          >
            {busy ? t("sending") : t("submit")}
          </button>
        )}
      </div>
    </div>
  );
}
