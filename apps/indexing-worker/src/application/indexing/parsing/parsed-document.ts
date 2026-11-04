export interface HeadingBlock {
  kind: 'heading';
  level: number;
  text: string;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  text: string;
}

export type DocumentBlock = HeadingBlock | ParagraphBlock;

/** Every parser reduces its format to this, so chunking knows nothing about file formats. */
export interface ParsedDocument {
  blocks: DocumentBlock[];
}
