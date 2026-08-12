import { InjectionToken } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Se o app está servindo dados de exemplo.
 *
 * Existe como token, e não como leitura direta de `environment`, por dois
 * motivos: nenhum componente precisa conhecer o módulo de ambiente, e os
 * testes conseguem forçar os dois modos.
 *
 * Atenção: o alvo de teste usa a configuração `development`, onde a flag é
 * true. Toda spec que renderize o badge de conexão declara
 * `{ provide: USE_MOCK_DATA, useValue: false }` — mock é opt-in no teste.
 */
export const USE_MOCK_DATA = new InjectionToken<boolean>('USE_MOCK_DATA', {
  providedIn: 'root',
  factory: () => environment.useMockData,
});
