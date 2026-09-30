export interface AppConfig {
  ollama: { baseUrl: string; model: string };
  neo4j: { uri: string; user: string; password: string };
  embedding: { model: string; dimension: number; similarityThreshold: number };
  ppr: { topN: number };
}

export default (): AppConfig => ({
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct',
  },
  neo4j: {
    uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    user: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'graphrag-local',
  },
  embedding: {
    model: process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text',
    // Dimension is a property of the model above, not an independent choice —
    // the two must be changed together. Kept as its own env var (rather than a
    // lookup table keyed by model name) so GraphService.ensureVectorIndex can
    // read it without knowing anything about embedding models. See
    // graph.service.ts for what happens if this stops matching an
    // already-created index.
    dimension: Number(process.env.EMBEDDING_DIMENSION ?? 768),
    // Uncalibrated — chosen without a labelled query set (see Module 7 /
    // eval-harness discussion). Start here when answers look wrong: lower it
    // if a known fact returns "I don't know" (false negative), raise it if
    // irrelevant facts leak into the answer (false positive).
    similarityThreshold: Number(process.env.SIMILARITY_THRESHOLD ?? 0.6),
  },
  ppr: {
    // How many top-scoring nodes from Personalized PageRank make it into the
    // final subgraph. Same "uncalibrated" caveat as similarityThreshold above,
    // but the failure direction is subtler: on a small graph, the *correct*
    // multi-hop answer is often the lowest-scoring node (score decays with
    // distance from the seeds), so too small a topN cuts exactly the node
    // PPR was introduced to reach. Defaulted generously for now — tighten
    // once the graph is bigger than a handful of nodes and an eval set
    // exists to check against.
    topN: Number(process.env.PPR_TOP_N ?? 15),
  },
});
