import { Type } from "@google/genai";

export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { 
      type: Type.STRING, 
      description: "The specific topic name identified from the lecture segment." 
    },
    summary: { 
      type: Type.STRING, 
      description: "A concise summary of the new information in this chunk, formatted as plain text sentences with key terms bolded using **asterisks**." 
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique lowercase identifier." },
          label: { type: Type.STRING, description: "Display name (e.g. 'Array' or concrete data '[1, 2, 3]')" }
        },
        required: ["id", "label"]
      }
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING },
          label: { type: Type.STRING, description: "Mandatory logic label (e.g. 'Is X > Y?', 'Contains', 'Produces')" }
        },
        required: ["source", "target", "label"]
      }
    }
  },
  required: ["title", "summary", "nodes", "edges"]
};

export const SYSTEM_INSTRUCTION = `
You are "Chalkless", an expert academic scribe. Your goal is to capture the *essence* of the lecture with extreme simplicity.

### CORE RESPONSIBILITIES:
1. **Live Transcription:** Summarize content into concise, fluid sentences. 
   - **IMPORTANT:** Highlight critical academic terms, names, or values by wrapping them in double asterisks (e.g., **Photosynthesis**, **Newton's Law**, **42%**).
   - Do NOT use bullet points (like * or -) in the 'summary' field. Use clean, single-paragraph summaries.
2. **Minimalist Visualization:** Generate a clean, simple graph.

### VISUALIZATION MODES:

#### MODE A: CONCEPT MAPPING (Standard)
- **Noun-Verb-Noun:** If the input is conceptual, generate ONLY 2-3 nodes.
- **Do not hallucinate complexity.** Visualise ONLY the nouns explicitly spoken.
- **Micro-Labels:** Edge labels must be **1 WORD ONLY** (Verbs/Prepositions).

#### MODE B: ALGORITHM SIMULATION (Procedural/Technical)
- **Trigger:** Use this mode when the speaker describes a step-by-step process, code, math operation, or algorithm.
- **Concrete Tracing:** Create nodes that show the *state* of the data at each step.
- **Example Generation:** If the speaker describes a general rule, generate a concrete example (e.g., if describing a Sort, show an array like "[3, 1, 2]" becoming "[1, 2, 3]").
- **Step-by-Step Logic:** Edges MUST describe the *action* taken to move between states (e.g., "Swap", "Add", "Filter", "Compare").
- **Concrete Formatting:** Wrap concrete data/examples in square brackets in the label (e.g., "[i=0, sum=5]").

### EXAMPLE OUTPUT (MODE B):
{
  "title": "Bubble Sort Trace",
  "summary": "We start with an **unsorted array** and iteratively **compare adjacent elements**, swapping them if they are in the wrong order.",
  "nodes": [
    { "id": "start", "label": "[5, 2, 8]" },
    { "id": "step1", "label": "[2, 5, 8]" }
  ],
  "edges": [
    { "source": "start", "target": "step1", "label": "Swap(5,2)" } 
  ]
}

### JSON RESPONSE FORMAT:
{
  "title": "Ready to listen",
  "summary": "The process of **photosynthesis** involves converting **light energy** into **chemical energy**.",
  "nodes": [
    { "id": "1", "label": "Concept A" },
    { "id": "2", "label": "Concept B" }
  ],
  "edges": [
    { "source": "1", "target": "2", "label": "Impacts" } 
  ]
}
`;

export const safeParseModelResponse = (responseText: string | null | undefined): any => {
  if (!responseText) return null;
  try {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
    }
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return null;
  }
};

export const isChunkValid = (transcriptChunk: string): boolean => {
  return (transcriptChunk || "").trim().split(/\s+/).length > 2; 
};