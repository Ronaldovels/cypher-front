/** McpCredential — espelha o model McpCredential do backend (spec MCB). */

export interface McpCredential {
  id: number;
  nome: string;
  criadaEm: string;
  ultimoUsoEm: string | null;
  ativa: boolean;
}

export interface McpCredentialPayload {
  nome: string;
}

/** Resposta do POST de criação — único momento em que `apiKey` (texto puro) existe. */
export interface McpCredentialCriada extends McpCredential {
  apiKey: string;
}
