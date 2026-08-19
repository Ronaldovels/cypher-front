import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Se o app está servindo dados de exemplo.
 *
 * Existe como token, e não como leitura direta de `environment`, por dois
 * motivos: nenhum componente precisa conhecer o módulo de ambiente, e os
 * testes conseguem forçar os dois modos.
 *
 * Atenção: toda spec que renderize o badge de conexão declara
 * `{ provide: USE_MOCK_DATA, useValue: false }` — mock é opt-in no teste, nunca
 * herdado do ambiente. Hoje a flag de `development` já é false, então esquecer o
 * provider passaria pelo motivo errado; a declaração explícita é o que mantém a
 * spec correta se alguém religar a flag para desenvolver local.
 */
export const USE_MOCK_DATA = new InjectionToken<boolean>('USE_MOCK_DATA', {
  providedIn: 'root',
  factory: () => environment.useMockData,
});
