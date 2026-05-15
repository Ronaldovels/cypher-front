import { Component, inject, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConfigService } from '../shared/config.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../shared/dock/dock.component';

export const KPI_DATA = [
  { label: 'Incidentes hoje', val: '6', sub: '↑ 2 vs ontem', sub_class: 'up', ico: '⚠', color: '#EE4242' },
  { label: 'Conformidade geral', val: '94.2', denom: '%', sub: 'Meta: ≥ 98%', pct: 94.2, color: 'var(--accent)' },
  { label: 'Estações ativas', val: '42', denom: '/ 48', sub: '6 em alerta agora', sub_class: 'warn', color: '#34D07E' },
  { label: 'Linha parada hoje', val: '18', denom: 'min', sub: '≈ R$ 4.200 em impacto', ico: '⚙', color: '#FFCE38' },
];

export const HEAT_DATA = [
  { id: 'EST-01', n: 0 }, { id: 'EST-02', n: 1 }, { id: 'EST-03', n: 3 }, null, { id: 'EST-04', n: 1 },
  { id: 'EST-05', n: 0 }, { id: 'EST-06', n: 2 }, { id: 'EST-07', n: 0 }, { id: 'EST-08', n: 1 }, { id: 'EST-09', n: 3 },
  null, null, { id: 'EST-10', n: 0 }, { id: 'EST-11', n: 1 }, { id: 'EST-12', n: 0 },
  { id: 'EST-13', n: 2 }, { id: 'EST-14', n: 0 }, { id: 'EST-15', n: 0 }, { id: 'EST-16', n: 0 }, { id: 'EST-17', n: 1 },
];

export const ALERTS = [
  { time: '14:31', est: 'EST-04', type: 'Capacete ausente', sev: 'crit' },
  { time: '13:45', est: 'EST-09', type: 'Zona de risco',    sev: 'crit' },
  { time: '12:10', est: 'EST-03', type: 'Óculos ausente',   sev: 'high' },
  { time: '11:58', est: 'EST-03', type: 'Capacete ausente', sev: 'high' },
  { time: '10:22', est: 'EST-09', type: 'Luvas ausentes',   sev: 'high' },
];

export const BAR_DATA = [
  { d: 'Seg', v: 8 }, { d: 'Ter', v: 5 }, { d: 'Qua', v: 12, peak: true },
  { d: 'Qui', v: 4 }, { d: 'Sex', v: 9 }, { d: 'Sáb', v: 3 }, { d: 'Dom', v: 2 },
];
const MAX_V = 14;

@Component({
  selector: 'app-dashboard',
  imports: [ChromeTopbarComponent, DockComponent, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  private cfgService = inject(ConfigService);
  cfg = this.cfgService.config;

  kpiData  = KPI_DATA;
  heatData = HEAT_DATA;
  alerts   = ALERTS;
  barData  = BAR_DATA;
  maxV     = MAX_V;

  today = computed(() => {
    const now = new Date();
    return now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  plantName = computed(() => this.cfg()?.company || 'sua planta');

  heatClass(n: number): string {
    return n === 0 ? 'ok' : n === 1 ? 'low' : n === 2 ? 'mid' : 'hi';
  }
  heatLabel(n: number): string {
    return n === 0 ? 'ok' : n === 1 ? '1 inf' : n === 2 ? '2 inf' : `${n} inf`;
  }

  barPct(v: number): number { return (v / this.maxV) * 100; }
  meanPct(): number {
    const sum = BAR_DATA.reduce((a, b) => a + b.v, 0);
    return (sum / BAR_DATA.length / MAX_V) * 100;
  }

  kpiRingDash(r: number, pct: number): number { return 2 * Math.PI * r; }
  kpiRingOffset(r: number, pct: number): number { return 2 * Math.PI * r * (1 - pct / 100); }
}
