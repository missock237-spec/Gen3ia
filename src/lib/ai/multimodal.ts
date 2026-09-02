import { chat } from "@/lib/ai"

export interface MultimodalOptions {
  prompt: string
  type: "image" | "diagram" | "chart"
  style?: string
  width?: number
  height?: number
}

export interface MultimodalResult {
  url: string
  type: "image" | "diagram" | "chart"
  prompt: string
  caption: string
  width: number
  height: number
  provider: string
}

/**
 * Service de génération multimodale (Images DALL-E/Stable Diffusion, Diagrammes SVG, Graphiques SVG).
 */
export async function generateMultimodalContent(options: MultimodalOptions): Promise<MultimodalResult> {
  const { prompt, type = "image", style = "modern", width = 800, height = 600 } = options

  if (type === "diagram") {
    return generateDiagramSVG(prompt, width, height)
  }

  if (type === "chart") {
    return generateChartSVG(prompt, width, height)
  }

  // Type === "image"
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: `${prompt} (${style} style)`,
          n: 1,
          size: "1024x1024",
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const imageUrl = data.data?.[0]?.url
        if (imageUrl) {
          return {
            url: imageUrl,
            type: "image",
            prompt,
            caption: `Image générée par DALL-E 3 : ${prompt}`,
            width: 1024,
            height: 1024,
            provider: "dall-e-3",
          }
        }
      }
    } catch {
      // Fallback si DALL-E échoue
    }
  }

  // Fallback vers génération d'image / illustration SVG vectorielle riche
  return generateImageSVG(prompt, style, width, height)
}

/** Génère un diagramme vectoriel SVG personnalisé via IA ou template d'architecture. */
async function generateDiagramSVG(prompt: string, width: number, height: number): Promise<MultimodalResult> {
  let diagramSpec = {
    title: "Diagramme d'Architecture & Flux",
    nodes: [
      { id: "1", label: "Entrée Utilisateur / Client", x: 100, y: 150, color: "#10b981" },
      { id: "2", label: "GEN3IA Engine (Orchestrateur)", x: 350, y: 150, color: "#3b82f6" },
      { id: "3", label: "Base de données & Mémoire", x: 600, y: 80, color: "#8b5cf6" },
      { id: "4", label: "Outils Externe & Web", x: 600, y: 220, color: "#f59e0b" },
    ],
    edges: [
      { from: "1", to: "2", label: "Prompt / Requête" },
      { from: "2", to: "3", label: "RAG / Cache" },
      { from: "2", to: "4", label: "Appels d'API" },
    ],
  }

  try {
    const aiRes = await chat({
      messages: [
        {
          role: "system",
          content: `Tu es un expert en conception de diagrammes système. Génère un JSON valide représentant un diagramme pour le sujet donné.
Format JSON requis :
{
  "title": "Titre explicite",
  "nodes": [{"id": "1", "label": "Nom du composant", "x": 80, "y": 140, "color": "#10b981"}, ...],
  "edges": [{"from": "1", "to": "2", "label": "Description"}, ...]
}
Utilise 3 à 5 nœuds bien espacés (x de 50 à 700, y de 50 à 350). Réponds UNIQUEMENT avec le JSON.`,
        },
        { role: "user", content: `Diagramme pour : ${prompt}` },
      ],
      temperature: 0.2,
      maxTokens: 1000,
    })

    const cleaned = aiRes.content.replace(/```json\n?|\n?```/g, "").trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.nodes && parsed.edges) {
      diagramSpec = parsed
    }
  } catch {
    // Utilise la spec par défaut en cas d'erreur
  }

  const nodesSvg = diagramSpec.nodes
    .map(
      (n: any) => `
    <g transform="translate(${n.x}, ${n.y})">
      <rect width="180" height="70" rx="10" fill="${n.color || "#10b981"}" fill-opacity="0.15" stroke="${n.color || "#10b981"}" stroke-width="2"/>
      <text x="90" y="40" text-anchor="middle" fill="#f4f4f5" font-size="13" font-weight="600" font-family="sans-serif">${escapeXml(n.label)}</text>
    </g>`
    )
    .join("\n")

  const edgesSvg = diagramSpec.edges
    .map((e: any) => {
      const fromNode = diagramSpec.nodes.find((n: any) => n.id === e.from)
      const toNode = diagramSpec.nodes.find((n: any) => n.id === e.to)
      if (!fromNode || !toNode) return ""
      const x1 = fromNode.x + 90
      const y1 = fromNode.y + 35
      const x2 = toNode.x + 90
      const y2 = toNode.y + 35
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      return `
    <g>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#52525b" stroke-width="2" stroke-dasharray="4,4" marker-end="url(#arrow)"/>
      ${e.label ? `<rect x="${midX - 45}" y="${midY - 12}" width="90" height="20" rx="4" fill="#18181b" stroke="#3f3f46" stroke-width="1"/>
      <text x="${midX}" y="${midY + 2}" text-anchor="middle" fill="#a1a1aa" font-size="10" font-family="sans-serif">${escapeXml(e.label)}</text>` : ""}
    </g>`
    })
    .join("\n")

  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background-color: #09090b; border-radius: 12px; border: 1px solid #27272a;">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a1a1aa" />
    </marker>
  </defs>
  <text x="30" y="35" fill="#10b981" font-size="16" font-weight="bold" font-family="sans-serif">${escapeXml(diagramSpec.title)}</text>
  ${edgesSvg}
  ${nodesSvg}
</svg>`.trim()

  const encodedSvg = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`

  return {
    url: encodedSvg,
    type: "diagram",
    prompt,
    caption: `Diagramme généré : ${diagramSpec.title}`,
    width,
    height,
    provider: "gen3ia-diagram-engine",
  }
}

/** Génère un graphique SVG (Bâtons / Courbes) personnalisé. */
async function generateChartSVG(prompt: string, width: number, height: number): Promise<MultimodalResult> {
  let chartData = {
    title: "Graphique de Performance",
    series: [
      { label: "Jan", value: 45 },
      { label: "Fév", value: 62 },
      { label: "Mar", value: 80 },
      { label: "Avr", value: 75 },
      { label: "Mai", value: 95 },
      { label: "Juin", value: 110 },
    ],
  }

  try {
    const aiRes = await chat({
      messages: [
        {
          role: "system",
          content: `Tu es un générateur de données statistiques. Génère un JSON valide pour un graphique basé sur la demande.
Format JSON requis :
{
  "title": "Titre du graphique",
  "series": [{"label": "Catégorie / Mois", "value": 45}, ...]
}
Inclus entre 4 et 7 points de données avec des valeurs entières entre 10 et 100. Réponds UNIQUEMENT avec le JSON.`,
        },
        { role: "user", content: `Graphique pour : ${prompt}` },
      ],
      temperature: 0.2,
      maxTokens: 800,
    })

    const cleaned = aiRes.content.replace(/```json\n?|\n?```/g, "").trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.series && Array.isArray(parsed.series)) {
      chartData = parsed
    }
  } catch {
    // Fallback
  }

  const maxValue = Math.max(...chartData.series.map((s) => s.value), 1)
  const barWidth = 50
  const gap = 30
  const startX = 80
  const chartHeight = 250
  const startY = height - 80

  const barsSvg = chartData.series
    .map((s, i) => {
      const x = startX + i * (barWidth + gap)
      const h = (s.value / maxValue) * chartHeight
      const y = startY - h
      return `
      <g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="6" fill="url(#barGradient)" stroke="#10b981" stroke-width="1"/>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#10b981" font-size="12" font-weight="bold" font-family="sans-serif">${s.value}</text>
        <text x="${x + barWidth / 2}" y="${startY + 25}" text-anchor="middle" fill="#a1a1aa" font-size="12" font-family="sans-serif">${escapeXml(s.label)}</text>
      </g>`
    })
    .join("\n")

  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background-color: #09090b; border-radius: 12px; border: 1px solid #27272a;">
  <defs>
    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#059669" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <text x="30" y="35" fill="#f4f4f5" font-size="16" font-weight="bold" font-family="sans-serif">${escapeXml(chartData.title)}</text>
  <line x1="50" y1="${startY}" x2="${width - 50}" y2="${startY}" stroke="#3f3f46" stroke-width="1.5"/>
  ${barsSvg}
</svg>`.trim()

  const encodedSvg = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`

  return {
    url: encodedSvg,
    type: "chart",
    prompt,
    caption: `Graphique généré : ${chartData.title}`,
    width,
    height,
    provider: "gen3ia-chart-engine",
  }
}

/** Génération d'illustration SVG élégante. */
function generateImageSVG(prompt: string, style: string, width: number, height: number): MultimodalResult {
  const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" style="background-color: #09090b; border-radius: 12px; border: 1px solid #27272a;">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#09090b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bgGlow)"/>
  <circle cx="${width / 2}" cy="${height / 2 - 20}" r="120" fill="none" stroke="#10b981" stroke-width="2" stroke-dasharray="6,6"/>
  <circle cx="${width / 2}" cy="${height / 2 - 20}" r="80" fill="#10b981" fill-opacity="0.1"/>
  <text x="${width / 2}" y="${height / 2 - 15}" text-anchor="middle" fill="#f4f4f5" font-size="20" font-weight="bold" font-family="sans-serif">GEN3IA Multimodal</text>
  <text x="${width / 2}" y="${height / 2 + 20}" text-anchor="middle" fill="#10b981" font-size="14" font-family="sans-serif">Style: ${escapeXml(style)}</text>
  <rect x="60" y="${height - 70}" width="${width - 120}" height="40" rx="8" fill="#18181b" stroke="#27272a"/>
  <text x="${width / 2}" y="${height - 45}" text-anchor="middle" fill="#a1a1aa" font-size="12" font-family="sans-serif">"${escapeXml(prompt)}"</text>
</svg>`.trim()

  const encodedSvg = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`

  return {
    url: encodedSvg,
    type: "image",
    prompt,
    caption: `Illustration visuelle générée : ${prompt}`,
    width,
    height,
    provider: "gen3ia-svg-renderer",
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
