import {
  Component, DOCUMENT, ElementRef, HostListener, OnDestroy, OnInit,
  effect, inject, input, output, signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { formatDateTime, incidentLabel, mensagemDeErro, Notificacao } from '../incident.models';
import { IncidentService } from '../incident.service';

@Component({
  selector: 'app-notification-center',
  template: `
    @if (open()) {
      <div class="notif-backdrop" (click)="fechar()"></div>
      <aside class="notif-offcanvas" role="dialog" aria-modal="true" aria-label="Notificações">
        <header class="notif-head">
          <h2>Notificações</h2>
          <button class="icon-btn" aria-label="Fechar notificações" (click)="fechar()">×</button>
        </header>
        <div class="notif-body">
          @if (carregando()) {
            <p class="vazio">carregando…</p>
          } @else if (erro()) {
            <p class="vazio">{{ erro() }}</p>
          } @else if (notificacoes().length === 0) {
            <p class="vazio">Nenhuma notificação por aqui.</p>
          } @else {
            @for (n of notificacoes(); track n.id) {
              <button class="list-row notif-row" [class.unread]="!n.lida" (click)="abrir(n)">
                <span class="chip">{{ rotulo(n.type) }}</span>
                <span class="notif-desc">{{ n.descricao }}</span>
                <span class="notif-meta">{{ n.cameraId }} · {{ formatDateTime(n.detectedAt) }}</span>
              </button>
            }
          }
        </div>
      </aside>
    }
  `,
})
export class NotificationCenterComponent implements OnInit, OnDestroy {
  open = input<boolean>(false);
  closed = output<void>();

  private incidentService = inject(IncidentService);
  private router = inject(Router);
  private elementRef = inject(ElementRef<HTMLElement>);
  private document = inject(DOCUMENT);

  readonly notificacoes = signal<Notificacao[]>([]);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly formatDateTime = formatDateTime;
  readonly rotulo = incidentLabel;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.carregar();
      }
    });
  }

  /**
   * O offcanvas fica dentro de `<app-chrome-topbar>`, que tem `position: sticky`
   * (cria contexto de empilhamento próprio) — qualquer z-index aqui dentro fica
   * preso abaixo do dock flutuante (`.dock-wrap`, z-index 1000, irmão do topbar,
   * fora desse contexto). Por isso o próprio elemento hospedeiro é movido para
   * `document.body` assim que existe, virando irmão do dock de verdade em vez
   * de descendente do topbar — só assim o z-index do offcanvas passa a competir
   * no mesmo nível do dock.
   */
  ngOnInit(): void {
    this.document.body.appendChild(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.remove();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.fechar();
    }
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.incidentService.loadNotificacoes().subscribe({
      next: lista => {
        this.notificacoes.set(lista);
        this.carregando.set(false);
        const naoLidas = lista.filter(n => !n.lida).map(n => n.id);
        if (naoLidas.length > 0) {
          this.incidentService.marcarLidas(naoLidas);
        }
      },
      error: erro => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
  }

  abrir(n: Notificacao): void {
    this.router.navigate(['/incidentes', n.id]);
    this.fechar();
  }

  fechar(): void {
    this.closed.emit();
  }
}
