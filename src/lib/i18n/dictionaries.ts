import { common } from "./dict/common";
import { nav } from "./dict/nav";
import { auth } from "./dict/auth";
import { landing } from "./dict/landing";
import { dashboard } from "./dict/dashboard";
import { live } from "./dict/live";
import { ads } from "./dict/ads";
import { agents } from "./dict/agents";
import { tasks } from "./dict/tasks";
import { settings } from "./dict/settings";
import { billing } from "./dict/billing";
import { connectors } from "./dict/connectors";
import { knowledge } from "./dict/knowledge";
import { memory } from "./dict/memory";
import { marketplace } from "./dict/marketplace";
import { skills } from "./dict/skills";
import { tools } from "./dict/tools";
import { apikeys } from "./dict/apikeys";
import { sdk } from "./dict/sdk";
import { swarm } from "./dict/swarm";
import { webhooks } from "./dict/webhooks";
import { watchdog } from "./dict/watchdog";
import { traces } from "./dict/traces";
import { finetune } from "./dict/finetune";
import { admin } from "./dict/admin";
import { docs } from "./dict/docs";

/**
 * Dictionnaires bilingues GEN3IA — le français est la source de vérité
 * du type : toute clé absente de l'anglais est détectée à la compilation.
 */

export type Lang = "fr" | "en";

const DOMAINS = [common, nav, auth, landing, dashboard, live, agents, tasks, settings, billing, connectors, knowledge, memory, marketplace, skills, tools, apikeys, sdk, swarm, webhooks, watchdog, traces, finetune, admin, ads, docs] as const;

function merge(lang: "fr" | "en"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const domain of DOMAINS) {
    Object.assign(out, domain[lang]);
  }
  return out;
}

const fr = merge("fr");
const en = merge("en");

export type TranslationKey = keyof typeof fr & string;

export const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = {
  fr,
  en: en as Record<TranslationKey, string>,
};
