/** `GET /api/v1/placar` — design doc de gamificação E5, §3.2. */

import { Turno } from './team.models';

export interface PlacarEquipe {
  equipeId: string;
  nome: string;
  turno: Turno;
  dadosSuficientes: boolean;              // false quando cobertura < 0,5 (spec §3.2)
  conformidade: number | null;            // null quando !dadosSuficientes
  cobertura: number;
  sequenciaAtual: number;
  melhorSequencia: number;
  metaConformidade: number | null;
  metaConformidadeAtingida: boolean;
  metaZeroSeveridade4Ativa: boolean | null;
  metaZeroSeveridade4Atingida: boolean;
  metaTempoReconhecimentoSegundos: number | null;
  deltaConformidadeSemana: number | null; // null quando !dadosSuficientes
}
