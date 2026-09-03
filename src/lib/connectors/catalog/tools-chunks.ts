// @generated — ne pas éditer (scripts/build-connectors-catalog.mjs)
// Imports statiques des lots d'outils du catalogue (chargés côté serveur).
import chunk00 from "./tools/chunk-00.json"
import chunk01 from "./tools/chunk-01.json"
import chunk02 from "./tools/chunk-02.json"
import chunk03 from "./tools/chunk-03.json"
import chunk04 from "./tools/chunk-04.json"
import chunk05 from "./tools/chunk-05.json"
import chunk06 from "./tools/chunk-06.json"
import chunk07 from "./tools/chunk-07.json"
import chunk08 from "./tools/chunk-08.json"
import chunk09 from "./tools/chunk-09.json"
import chunk10 from "./tools/chunk-10.json"
import chunk11 from "./tools/chunk-11.json"
import chunk12 from "./tools/chunk-12.json"

export type ChunkEntry = {
  slug: string
  tools: Array<{ slug: string; name: string; description: string | null }>
  triggers: Array<{ slug: string; name: string; description: string | null }>
}

export const TOOL_CHUNKS: ChunkEntry[][] = [
  chunk00,
  chunk01,
  chunk02,
  chunk03,
  chunk04,
  chunk05,
  chunk06,
  chunk07,
  chunk08,
  chunk09,
  chunk10,
  chunk11,
  chunk12,
]
