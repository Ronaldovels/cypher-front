import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { DockComponent } from './dock.component';

describe('DockComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
  });

  it('liga "Ao Vivo" à grade de estações', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'live')?.route).toBe('/estacoes');
  });

  it('liga "Alertas" à timeline de incidentes, sem duplicar como "Histórico"', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'alerts')?.route).toBe('/incidentes');
    expect(fixture.componentInstance.items.find(i => i?.key === 'history')).toBeUndefined();
  });

  it('liga "Colaboradores" a /config/equipe', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.items.find(i => i?.key === 'team')?.route).toBe('/config/equipe');
  });

  it('itens com rota renderizam como link, não botão', () => {
    const fixture = TestBed.createComponent(DockComponent);
    fixture.detectChanges();

    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('a.dock-item'))
      .map((a: any) => a.getAttribute('href'));
    expect(hrefs).toContain('/estacoes');
    expect(hrefs).toContain('/incidentes');
  });
});
