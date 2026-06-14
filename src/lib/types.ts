// Shared TypeScript interfaces for SWU Deck Viewer

export interface DeckCard {
  id: string;
  count?: number;
}

export interface DeckMetadata {
  name?: string;
  description?: string;
  author?: string;
  format?: string;
}

export interface DeckData {
  deck: DeckCard[];
  sideboard?: DeckCard[];
  metadata?: DeckMetadata;
  leader?: DeckCard;
  base?: DeckCard;
}

/** Map value: how many copies appear in main deck vs sideboard */
export interface CardCount {
  main: number;
  sideboard: number;
}

/** id → CardCount */
export type CardCountMap = Map<string, CardCount>;

