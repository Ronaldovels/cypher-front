import { Component, effect, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { formatDateTime, Notificacao } from '../incident.models';
import { IncidentService } from '../incident.service';

@Component({
  selector: 'app-notification-center',
  template: `
    @if (open()) {
      <div class="notif-backdrop" (click)="fechar()"></div>
      <aside class="notif-offcanvas" role="dialog" aria-label="Notificações">
        <header class="notif-head">
          <h2>Notificações</h2>
          <button class="icon-btn" aria-label="Fechar notificações" (click)="fechar()">×</button>
        </header>
        <div class="notif-body">
          @if (notificacoes().length === 0) {
            <p class="notif-empty">Nenhuma notificação por aqui.</p>
          } @else {
            @for (n of notificacoes(); track n.id) {
              <button class="list-row notif-row" [class.unread]="!n.lida" (click)="abrir(n)">
                <span class="chip">{{ n.type }}</span>
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
export class NotificationCenterComponent {
  open = input<boolean>(false);
  closed = output<void>();

  private incidentService = inject(IncidentService);
  private router = inject(Router);

  readonly notificacoes = signal<Notificacao[]>([]);
  readonly formatDateTime = formatDateTime;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.carregar();
      }
    });
  }

  private carregar(): void {
    this.incidentService.loadNotificacoes().subscribe(lista => {
      this.notificacoes.set(lista);
      const naoLidas = lista.filter(n => !n.lida).map(n => n.id);
      if (naoLidas.length > 0) {
        this.incidentService.marcarLidas(naoLidas);
      }
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
