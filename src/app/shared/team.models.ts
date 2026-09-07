/** `Equipe`/`Usuario` — design doc de E4, §2.5 e §3. */

import { Papel } from './auth/auth.models';

export type Turno = 'MANHA' | 'TARDE' | 'NOITE';

export interface Equipe {
  id: string;
  nome: string;
  turno: Turno;
  /** Uma equipe cobre uma ou mais estações, dentro de um único turno (design doc §3). */
  estacaoIds: string[];
  ativa: boolean;
  metaConformidade: number | null;
  metaZeroSeveridade4Ativa: boolean | null;
  metaTempoReconhecimentoSegundos: number | null;
}

export interface EquipePayload {
  id: string;
  nome: string;
  turno: Turno;
  estacaoIds: string[];
  ativa?: boolean;
  metaConformidade?: number | null;
  metaZeroSeveridade4Ativa?: boolean | null;
  metaTempoReconhecimentoSegundos?: number | null;
}

export interface Usuario {
  username: string;
  papel: Papel;
  /** Só preenchido para `papel === 'OPERADOR'` (revisão pós-E4: login por usuário/senha vinculado a uma estação). */
  estacaoId?: string;
}

export interface UsuarioPayload {
  username: string;
  papel: Papel;
  /** Só em criação (obrigatório) ou redefinição (opcional); nunca volta do backend — design doc §4.2: sem "esqueci minha senha" nesta entrega, a única ação sensível é o gestor redefinir. */
  password?: string;
  /** Obrigatório quando `papel === 'OPERADOR'`; ausente para GESTOR. */
  estacaoId?: string;
}
