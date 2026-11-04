export interface ActivatedEntity {
  name: string;
  type: string | null;
  description: string | null;
  activation: number;
}

export interface PathEdge {
  relations: string[];
  chunkIds: string[];
  /** Whether the relation points from this path's earlier node to its later one. */
  forward: boolean;
}

export interface RetrievedPath {
  nodes: ActivatedEntity[];
  edges: PathEdge[];
  weight: number;
}

export interface RetrievalResult {
  seedNames: string[];
  /** Strongest first. */
  paths: RetrievedPath[];
  /** Strongest first. */
  entities: ActivatedEntity[];
}

export abstract class Retriever {
  abstract retrieve(question: string): Promise<RetrievalResult>;
}
