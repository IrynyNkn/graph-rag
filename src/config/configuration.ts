export interface AppConfig {
  ollama: { baseUrl: string; model: string };
  neo4j: { uri: string; user: string; password: string };
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
});
