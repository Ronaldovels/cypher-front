import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { StationsGridComponent } from './stations-grid.component';

describe('StationsGridComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montarCom(stations: unknown[]) {
    const fixture = TestBed.createComponent(StationsGridComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush(stations);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza um card por estação, com a primeira câmera', () => {
    const fixture = montarCom([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true,
        cameras: [{ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' }] },
    ]);

    expect(fixture.nativeElement.textContent).toContain('Esteira');
    expect(fixture.componentInstance.primeiraCamera(fixture.componentInstance.stations()[0])?.id)
      .toBe('CAM-01');
  });

  it('estação sem câmera mostra o feed indisponível, não quebra', () => {
    const fixture = montarCom([
      { id: 'EST-02', nome: 'Doca', setor: null, ativa: true, cameras: [] },
    ]);

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('câmera indisponível');
  });

  it('link do card leva ao kiosk da estação', () => {
    const fixture = montarCom([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]);

    const link = fixture.nativeElement.querySelector('a.station-card');
    expect(link.getAttribute('href')).toBe('/estacao/EST-01');
  });

  it('sem estação cadastrada, diz isso em vez de mostrar grade vazia', () => {
    const fixture = montarCom([]);

    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('nenhuma esta');
  });

  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(StationsGridComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/cameras`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/stations`).flush([]);
    http.expectOne(r => r.url === `${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });
});
