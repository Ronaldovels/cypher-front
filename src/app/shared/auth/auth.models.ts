/** Espelho do contrato de `/api/v1/auth/*` (design doc de E4, §2.2). */

export type Papel = 'GESTOR' | 'OPERADOR';

/**
 * `POST /auth/login` agora autentica os dois papéis (revisão pós-E4: OPERADOR
 * ganhou login por usuário/senha, além do token de estação) — por isso o
 * mesmo formato de `MeResponse`: `estacaoId` vem preenchido quando o papel
 * devolvido é `OPERADOR`.
 */
export interface LoginResponse {
  papel: Papel;
  username?: string;
  estacaoId?: string;
}

export interface LoginEstacaoResponse {
  papel: 'OPERADOR';
  estacaoId: string;
}

export interface MeResponse {
  papel: Papel;
  username?: string;
  estacaoId?: string;
}

/** `GET /api/v1/setup/status` (design doc de E4, §2.5) — público, sem sessão. */
export interface SetupStatusResponse {
  configured: boolean;
}
