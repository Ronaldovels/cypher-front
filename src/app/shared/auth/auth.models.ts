/** Espelho do contrato de `/api/v1/auth/*` (design doc de E4, §2.2). */

export type Papel = 'GESTOR' | 'OPERADOR';

export interface LoginResponse {
  papel: 'GESTOR';
  username: string;
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
