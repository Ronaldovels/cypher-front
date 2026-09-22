import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Avisa que a sessão trocou: login, login do kiosk, setup e logout.
 *
 * Os stores de raiz são singletons e sobrevivem à navegação. Sem este aviso,
 * quem entrasse depois na mesma aba (um operador no kiosk depois de um gestor,
 * ou um gestor de outra empresa) via os dados de quem saiu. Cada store se
 * inscreve em `troca$` e se limpa sozinho, e passa `takeUntil(troca$)` nas
 * leituras: uma resposta da sessão anterior que ainda estava em voo é
 * cancelada em vez de repovoar o store depois da troca.
 *
 * Não injeta nada — por isso stores que dependem do `AuthService` (como o
 * `OnboardingService`) também se inscrevem sem criar ciclo. Quem cria um
 * store novo com dado da empresa ou do usuário precisa inscrevê-lo aqui e
 * acrescentá-lo ao teste de troca de sessão em `auth.service.spec.ts`.
 */
@Injectable({ providedIn: 'root' })
export class TrocaDeSessao {
  private readonly _troca = new Subject<void>();
  readonly troca$: Observable<void> = this._troca.asObservable();

  anunciar(): void {
    this._troca.next();
  }
}
