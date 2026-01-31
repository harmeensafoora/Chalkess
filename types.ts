
export type BoardMode = 'concept_map' | 'timeline' | 'blank';

export interface BoardNode {
  id: string;
  label: string;
  timestamp: number;
  x?: number;
  y?: number;
}

export interface BoardEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface NoteSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface BoardState {
  id: string;
  mode: BoardMode;
  title: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  notes: NoteSegment[];
  imageUrl?: string;
}

export interface TranscriptItem {
  id: string;
  text: string;
  isModel: boolean;
  timestamp: number;
}

export interface EngineLog {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}
