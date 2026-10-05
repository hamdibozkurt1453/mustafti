import type { ChatMode } from "../modes";
import { DISCOVER_PERSONA } from "./discover";
import { GENERAL_PERSONA } from "./general";
import { NEW_MUSLIM_PERSONA } from "./new-muslim";
import type { Persona } from "./shared";

/**
 * الشخصيات الثلاث (R5)، لكل وضع محادثة موجّه نظام مستقل:
 *   general ← «مساعد علمي مسلم» (personas/general.ts)
 *   new_muslim ← «مرشد المسلم الجديد» (personas/new-muslim.ts)
 *   discover ← «داعية مسلم» (personas/discover.ts)
 */
export const PERSONAS: Record<ChatMode, Persona> = {
  general: GENERAL_PERSONA,
  new_muslim: NEW_MUSLIM_PERSONA,
  discover: DISCOVER_PERSONA,
};

export function personaFor(mode: ChatMode = "general"): Persona {
  return PERSONAS[mode] ?? GENERAL_PERSONA;
}

export { FORBIDDEN_PHRASES, personaIssues, stripPersonaPhrases, SHARED_VOICE, type Persona, type PersonaId } from "./shared";
