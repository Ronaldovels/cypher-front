import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { LoginEstacaoResponse, LoginResponse, MeResponse, Papel, SetupStatusResponse } from './auth.models';

/**
 * Sessão do usuário (cookie `JSESSIONID`, `HttpOnly` — este serviço nunca vê
 * nem guarda o cookie em si, só o que `/auth/me` responde a partir dele).
 *
 * Segue o padrão de `IncidentService`/`ConfigService`: store de signals,
 * `withCredentials: true` em toda chamada.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private readonly _role = signal<Papel | null>(null);
  private readonly _estacaoId = signal<string | null>(null);

  readonly role = this._role.asReadonly();
  readonly estacaoId = this._estacaoId.asReadonly();

  /**
   * Cacheia a checagem inicial: guards e componentes podem chamar
   * `checkSession()` quantas vezes quiserem — só o primeiro dispara o GET.
   * Chamadas depois de `login`/`loginEstacao`/`logout` continuam corretas
   * porque quem decide é sempre `role()`/`estacaoId()`, lidos no momento da
   * decisão — nunca o corpo desta resposta cacheada.
   */
  private sessaoVerificada$: Observable<void> | null = null;

  constructor() {
    this.checkSession().subscribe();
  }

  /** GET /auth/me no boot; 401 vira role null, silenciosamente — ainda não logado não é falha. */
  checkSession(): Observable<void> {
    if (!this.sessaoVerificada$) {
      this.sessaoVerificada$ = this.http
        .get<MeResponse>(`${environment.apiUrl}/auth/me`, { withCredentials: true })
        .pipe(
          tap(resp => {
            this._role.set(resp.papel);
            this._estacaoId.set(resp.estacaoId ?? null);
          }),
          map(() => undefined),
          catchError(() => {
            this._role.set(null);
            this._estacaoId.set(null);
            return of(undefined);
          }),
          shareReplay(1),
        );
    }
    return this.sessaoVerificada$;
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(null);
      }));
  }

  loginEstacao(token: string): Observable<LoginEstacaoResponse> {
    return this.http
      .post<LoginEstacaoResponse>(`${environment.apiUrl}/auth/login-estacao`, { token },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId);
      }));
  }

  /** Limpa a sessão local de imediato — não trava a navegação numa rede lenta numa ação de saída. */
  logout(): void {
    this._role.set(null);
    this._estacaoId.set(null);
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => { /* sessão local já foi limpa */ } });
  }

  /**
   * `GET /setup/status` (design doc §2.5) — não toca `role`/`estacaoId`, só
   * informa se o onboarding já rodou. Usado por `canActivateOnboarding`
   * (Task 2). Erro de rede/5xx vira `false` (mostra o wizard) em vez de
   * propagar: um blip transitório não pode blank-pagear `/` — se o setup já
   * tivesse rodado de verdade, `POST /setup` devolveria 409 e `launch()` já
   * trata isso como erro visível, sem navegar.
   */
  checkSetupStatus(): Observable<boolean> {
    return this.http
      .get<SetupStatusResponse>(`${environment.apiUrl}/setup/status`, { withCredentials: true })
      .pipe(
        map(resp => resp.configured),
        catchError(() => of(false)),
      );
  }

  /**
   * `POST /setup` (design doc §2.5) — cria o gestor mestre e autentica a
   * sessão de resposta, mesmo formato de `login()`. Mesmo `tap`, porque o
   * efeito colateral em `role`/`estacaoId` é idêntico: só a pré-condição do
   * lado do servidor muda (tabela vazia vs. credencial existente). Usado por
   * `OnboardingService.launch()` (Task 3).
   */
  bootstrap(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/setup`, { username, password },
        { withCredentials: true })
      .pipe(tap(resp => {
        this._role.set(resp.papel);
        this._estacaoId.set(null);
      }));
  }
}
