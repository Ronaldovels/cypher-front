import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { PlacarEquipe } from '../shared/placar.models';
import { PlacarService } from '../shared/placar.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../shared/dock/dock.component';

/**
 * Ranking de equipes por melhora de conformidade (design doc de
 * gamificação E5, §3.2/§5) — nunca por conformidade absoluta, e nunca
 * reordenado no front: a ordem já vem certa do backend.
 */
@Component({
  selector: 'app-placar',
  imports: [ChromeTopbarComponent, DockComponent, DecimalPipe],
  templateUrl: './placar.component.html',
})
export class PlacarComponent implements OnInit {
  private placarService = inject(PlacarService);

  readonly equipes = signal<PlacarEquipe[]>([]);
  readonly carregando = signal(true);

  readonly SEM_HISTORICO = 'sem histórico suficiente para ranquear';

  ngOnInit(): void {
    this.placarService.buscar().subscribe({
      next: e => { this.equipes.set(e); this.carregando.set(false); },
      error: () => this.carregando.set(false),
    });
  }

  progressoConformidade(equipe: PlacarEquipe): number {
    return Math.round((equipe.conformidade ?? 0) * 100);
  }

  progressoCobertura(equipe: PlacarEquipe): number {
    return Math.round(equipe.cobertura * 100);
  }

  /**
   * Delta semanal de conformidade. `null` com dados suficientes é o estado
   * normal das duas primeiras semanas de operação — texto explícito, nunca
   * um `0%` ou uma seta neutra (spec §5 / cerimônias §3.8).
   */
  temHistoricoSemana(equipe: PlacarEquipe): boolean {
    return equipe.deltaConformidadeSemana != null;
  }

  deltaSemanaTexto(equipe: PlacarEquipe): string {
    const d = equipe.deltaConformidadeSemana;
    if (d == null) {
      return this.SEM_HISTORICO;
    }
    const pontos = Math.round(d * 100);
    return `${pontos > 0 ? '+' : ''}${pontos}%`;
  }

  readonly ranqueadas = computed(() => this.equipes().filter(e => e.dadosSuficientes));
  readonly semDados = computed(() => this.equipes().filter(e => !e.dadosSuficientes));
}
