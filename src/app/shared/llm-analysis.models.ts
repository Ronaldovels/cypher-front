export type AnalysisStatus = 'OK' | 'ERRO_PARSE' | 'ERRO_API';

/** Espelho do contrato da API (spec §2.2). */
export interface RiskAnalysisResponse {
  situacao: string | null;
  episIdentificados: string[];
  episAusentes: string[];
  riscoIdentificado: boolean;
  tipoRisco: string | null;
  nivelRisco: string | null;
  justificativa: string | null;
  acaoRecomendada: string | null;
  provider: string;
  promptVersion: string;
  status: AnalysisStatus;
  geradoEm: string;
}
