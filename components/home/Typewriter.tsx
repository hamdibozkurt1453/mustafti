"use client";

import { useEffect, useState } from "react";

/** أمثلة تُكتب وتُمحى بالتناوب داخل خانة السؤال، كلٌّ بلغته واتجاهه. */
const SAMPLES = [
  { text: "ما معنى التوحيد؟", lang: "ar", dir: "rtl" },
  { text: "What is Tawhid?", lang: "en", dir: "ltr" },
  { text: "Tevhid nedir?", lang: "tr", dir: "ltr" },
  { text: "Qu’est-ce que le Tawhid ?", lang: "fr", dir: "ltr" },
  { text: "توحید کیا ہے؟", lang: "ur", dir: "rtl" },
  { text: "Apa itu Tauhid?", lang: "id", dir: "ltr" },
] as const;

const TYPE_MS = 70;
const DELETE_MS = 32;
const HOLD_MS = 1700;
const GAP_MS = 350;

export function Typewriter({ reduced }: { reduced: boolean }) {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(reduced ? SAMPLES[0].text.length : 0);
  const [deleting, setDeleting] = useState(false);

  const sample = SAMPLES[index];
  const chars = Array.from(sample.text);

  useEffect(() => {
    // مع تقليل الحركة: تبديل الجملة كاملة كل ثلاث ثوانٍ، بلا كتابة.
    if (reduced) {
      const id = setTimeout(() => {
        const next = (index + 1) % SAMPLES.length;
        setIndex(next);
        setCount(Array.from(SAMPLES[next].text).length);
      }, 3000);
      return () => clearTimeout(id);
    }

    let delay: number;
    let step: () => void;
    if (!deleting && count < chars.length) {
      delay = TYPE_MS;
      step = () => setCount((c) => c + 1);
    } else if (!deleting) {
      delay = HOLD_MS;
      step = () => setDeleting(true);
    } else if (count > 0) {
      delay = DELETE_MS;
      step = () => setCount((c) => c - 1);
    } else {
      delay = GAP_MS;
      step = () => {
        setDeleting(false);
        setIndex((i) => (i + 1) % SAMPLES.length);
      };
    }
    const id = setTimeout(step, delay);
    return () => clearTimeout(id);
  }, [count, deleting, index, chars.length, reduced]);

  return (
    <span
      lang={sample.lang}
      dir={sample.dir}
      aria-hidden
      className="pointer-events-none flex w-full items-center whitespace-nowrap"
      style={{ justifyContent: "flex-start" }}
    >
      <span>{chars.slice(0, count).join("")}</span>
      <span className="mf-caret ms-0.5 inline-block h-[1.15em] w-[2px] translate-y-[1px] rounded bg-gold-500" />
    </span>
  );
}
