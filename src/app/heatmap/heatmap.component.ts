import { Component, inject, signal } from '@angular/core';
import { ConfigService } from '../shared/config.service';
import { ChromeTopbarComponent } from '../shared/chrome-topbar/chrome-topbar.component';
import { DockComponent } from '../shared/dock/dock.component';

// ─── DATA ──────────────────────────────────────────────
export const ZONES = [
  {
    key: 'estamparia', label: 'Zona · Estamparia', cols: 3,
    cells: [
      { id: 'EST-01', n: 0,  type: 'Prensa hidráulica' },
      { id: 'EST-02', n: 2,  type: 'Estampagem A' },
      { id: 'EST-03', n: 11, type: 'Estampagem B' },
      { id: 'EST-04', n: 4,  type: 'Esteira de carga' },
      { id: 'EST-05', n: 1,  type: 'Inspeção visual' },
      null,
    ] as ({ id: string; n: number; type: string } | null)[],
  },
  {
    key: 'soldagem', label: 'Zona · Soldagem', cols: 3,
    cells: [
      { id: 'EST-06', n: 7,  type: 'Solda MIG' },
      { id: 'EST-07', n: 0,  type: 'Solda ponto' },
      { id: 'EST-08', n: 3,  type: 'Acabamento' },
      null,
      { id: 'EST-09', n: 14, type: 'Solda robotizada' },
      { id: 'EST-10', n: 1,  type: 'Verificação' },
    ] as ({ id: string; n: number; type: string } | null)[],
  },
  {
    key: 'montagem', label: 'Zona · Montagem', cols: 5,
    cells: [
      { id: 'EST-11', n: 2, type: 'Montagem A' },
      { id: 'EST-12', n: 0, type: 'Montagem B' },
      { id: 'EST-13', n: 6, type: 'Esteira principal' },
      { id: 'EST-14', n: 1, type: 'Inspeção' },
      { id: 'EST-15', n: 0, type: 'Embalagem' },
      { id: 'EST-16', n: 3, type: 'Expedição' },
      { id: 'EST-17', n: 2, type: 'Logística' },
      null, null, null,
    ] as ({ id: string; n: number; type: string } | null)[],
  },
];

export const TEMP_HOURS = ['12AM','2AM','4AM','6AM','8AM','10AM','12PM','2PM','4PM','6PM','8PM','10PM'];
export const TEMP_DAYS  = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
export const TEMP_MATRIX = [
  [2, 1,  8, 2, 3, 0, 0],
  [3, 2,  5, 1, 2, 0, 0],
  [1, 0,  3, 1, 1, 0, 0],
  [0, 1,  2, 0, 0, 0, 0],
  [4, 3,  9, 3, 5, 1, 0],
  [3, 2,  7, 2, 4, 1, 0],
  [2, 3,  5, 2, 3, 0, 0],
  [3, 2,  6, 3, 4, 1, 0],
  [2, 1,  4, 1, 3, 0, 0],
  [1, 1,  3, 1, 2, 0, 0],
  [2, 1,  5, 2, 3, 0, 0],
  [3, 2, 14, 2, 4, 0, 0],
];

export const MONTHS      = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const MONTH_STARTS = [0, 5, 9, 13, 17, 22, 26, 31, 35, 40, 44, 48];

function buildAnnual(): { w: number; d: number; v: number; peak: boolean }[] {
  const weekBase = (w: number): number => {
    if (w === 11) return 9;
    if (w >= 8  && w <= 13) return 5;
    if (w >= 0  && w <= 7)  return 4;
    if (w >= 14 && w <= 24) return 1.6;
    if (w >= 25 && w <= 34) return 5;
    if (w >= 35 && w <= 43) return 3;
    return 1;
  };
  const cells: { w: number; d: number; v: number; peak: boolean }[] = [];
  let seed = 7;
  const rng = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let w = 0; w < 52; w++) {
    for (let d = 0; d < 7; d++) {
      const dayMul  = (d === 5 || d === 6) ? 0.35 : 1;
      const wedBoost = d === 2 ? 1.4 : 1;
      const raw = weekBase(w) * dayMul * wedBoost * (0.5 + rng());
      const v = Math.round(Math.max(0, raw));
      cells.push({ w, d, v, peak: w === 11 && v > 6 });
    }
  }
  return cells;
}

@Component({
  selector: 'app-heatmap',
  imports: [ChromeTopbarComponent, DockComponent],
  templateUrl: './heatmap.component.html',
})
export class HeatmapComponent {
  private cfgService = inject(ConfigService);
  cfg = this.cfgService.config;

  zones      = ZONES;
  tempHours  = TEMP_HOURS;
  tempDays   = TEMP_DAYS;
  tempMatrix = TEMP_MATRIX;
  months     = MONTHS;
  monthStarts = MONTH_STARTS;
  annualCells = buildAnnual();

  annualTotal = this.annualCells.reduce((a, c) => a + c.v, 0);

  period = signal('7d');
  shift  = signal('all');

  top5 = ZONES.flatMap(z => z.cells.filter(Boolean) as { id: string; n: number; type: string }[])
               .sort((a, b) => b.n - a.n)
               .slice(0, 5);
  top5Max = this.top5[0]?.n || 1;

  spatialTier(n: number): string {
    if (n === 0) return 't0'; if (n <= 2)  return 't1';
    if (n <= 5)  return 't2'; if (n <= 9)  return 't3';
    return 't4';
  }
  tempTier(n: number): string {
    if (n === 0) return 'h0'; if (n <= 3)  return 'h1';
    if (n <= 7)  return 'h2'; if (n <= 12) return 'h3';
    return 'h4';
  }
  annualTier(n: number): string {
    if (n === 0) return 'a0'; if (n <= 2) return 'a1';
    if (n <= 5)  return 'a2'; if (n <= 9) return 'a3';
    return 'a4';
  }
  sev(n: number): string { return n >= 10 ? 'crit' : n >= 6 ? 'alto' : 'med'; }
  sevLabel(s: string): string { return ({ crit: 'CRÍTICO', alto: 'ALTO', med: 'MÉDIO' } as any)[s]; }

  setPeriod(p: string) { this.period.set(p); }
  setShift(s: string)  { this.shift.set(s); }

  monthLeft(i: number): string { return `calc(${this.monthStarts[i]} * (100% / 52))`; }
  zoneGridCols(cols: number): string { return `repeat(${cols}, 1fr)`; }
  annualCellTitle(c: { w: number; d: number; v: number }): string {
    return `Semana ${c.w + 1} · ${TEMP_DAYS[c.d] || ''} · ${c.v} incidente${c.v === 1 ? '' : 's'}`;
  }
}
