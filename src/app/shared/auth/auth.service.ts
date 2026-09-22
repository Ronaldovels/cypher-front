import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CatalogService } from '../catalog.service';
import { EpiChecklistService } from '../epi-checklist.service';
import { IncidentService } from '../incident.service';
import { TeamService } from '../team.service';
import { WebhookService } from '../webhook.service';
import { ZoneService } from '../zone.service';
import { LoginEstacaoResponse, LoginResponse, MeResponse, Papel } from './auth.models';

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

  /**
   * Stores de raiz com dados da empresa/usuário logado. Nenhum deles injeta
   * AuthService, então não há ciclo — e todos são limpos em toda troca de
   * sessão (ver `limparDadosDaSessao`).
   */
  private readonly storesDaSessao = [
    inject(IncidentService), inject(CatalogService), inject(EpiChecklistService),
    inject(TeamService), inject(WebhookService), inject(ZoneService),
  ];

  private readonly _role = signal<Papel | null>(null);
  private readonly _estacaoId = signal<string | null>(null);
  private readonly _empresaId = signal<string | null>(null);
  private readonly _empresaNome = signal<string | null>(null);

  readonly role = this._role.asReadonly();
  readonly estacaoId = this._estacaoId.asReadonly();
  readonly empresaId = this._empresaId.asReadonly();
  readonly empresaNome = this._empresaNome.asReadonly();

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
            this._empresaId.set(resp.empresaId);
            this._empresaNome.set(resp.empresaNome ?? null);
          }),
          map(() => undefined),
          catchError(() => {
            this._role.set(null);
            this._estacaoId.set(null);
            this._empresaId.set(null);
            this._empresaNome.set(null);
            return of(undefined);
          }),
          shareReplay(1),
        );
    }
    return this.sessaoVerificada$;
  }

  /** Autentica GESTOR ou OPERADOR (revisão pós-E4: OPERADOR ganhou login por usuário/senha). */
  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password },
        { withCredentials: true })
      .pipe(tap(resp => {
        this.limparDadosDaSessao();
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId ?? null);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }

  loginEstacao(token: string): Observable<LoginEstacaoResponse> {
    return this.http
      .post<LoginEstacaoResponse>(`${environment.apiUrl}/auth/login-estacao`, { token },
        { withCredentials: true })
      .pipe(tap(resp => {
        this.limparDadosDaSessao();
        this._role.set(resp.papel);
        this._estacaoId.set(resp.estacaoId);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }

  /** Limpa a sessão local de imediato — não trava a navegação numa rede lenta numa ação de saída. */
  logout(): void {
    this.limparDadosDaSessao();
    this._role.set(null);
    this._estacaoId.set(null);
    this._empresaId.set(null);
    this._empresaNome.set(null);
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .subscribe({ error: () => { /* sessão local já foi limpa */ } });
  }

  /**
   * `POST /setup` (design doc de multi-tenant, §3/§5) — cria a `Empresa` e o
   * gestor mestre dela, autenticando a sessão de resposta. `username` aqui é
   * só o "nome" (sem "@empresa") — o backend compõe o username completo.
   */
  bootstrap(username: string, password: string, empresaId: string, empresaNome: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/setup`, { username, password, empresaId, empresaNome },
        { withCredentials: true })
      .pipe(tap(resp => {
        this.limparDadosDaSessao();
        this._role.set(resp.papel);
        this._estacaoId.set(null);
        this._empresaId.set(resp.empresaId);
        this._empresaNome.set(resp.empresaNome ?? null);
      }));
  }

  /**
   * Chamado em toda troca de sessão (login, login do kiosk, setup, logout):
   * os stores são singletons de raiz e sobrevivem à navegação, então quem
   * entrasse depois na mesma aba via os incidentes, câmeras, equipes e
   * webhooks de quem saiu — inclusive um operador de kiosk vendo dados de
   * outras estações, ou um gestor vendo os de outra empresa.
   */
  private limparDadosDaSessao(): void {
    for (const store of this.storesDaSessao) {
      store.reset();
    }
  }
}
