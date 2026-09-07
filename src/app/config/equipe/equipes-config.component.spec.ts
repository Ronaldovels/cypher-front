import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { EquipesConfigComponent } from './equipes-config.component';

describe('EquipesConfigComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montar() {
    const fixture = TestBed.createComponent(EquipesConfigComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([
      { id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true },
    ]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
      { id: 'EST-02', nome: 'Prensa', setor: 'estamparia', ativa: true, cameras: [] },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('lista as equipes cadastradas', () => {
    const fixture = montar();

    expect(fixture.nativeElement.textContent).toContain('Equipe A');
  });

  it('codigo fora do padrao mostra erro e nao envia', () => {
    const fixture = montar();
    fixture.componentInstance.novaEquipe.set({
      id: 'invalido', nome: 'X', turno: 'MANHA', estacaoIds: [],
      metaConformidade: null, metaZeroSeveridade4Ativa: false, metaTempoReconhecimentoSegundos: null,
    });

    fixture.componentInstance.salvar();

    expect(fixture.componentInstance.erro()).toContain('inválido');
    http.expectNone(`${environment.apiUrl}/teams`);
  });

  it('alternarEstacao adiciona e remove do rascunho', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.alternarEstacao('EST-01');
    expect(componente.novaEquipe().estacaoIds).toEqual(['EST-01']);

    componente.alternarEstacao('EST-01');
    expect(componente.novaEquipe().estacaoIds).toEqual([]);
  });

  it('salvar com dados validos cadastra e limpa o rascunho', () => {
    const fixture = montar();
    fixture.componentInstance.novaEquipe.set({
      id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'],
      metaConformidade: null, metaZeroSeveridade4Ativa: false, metaTempoReconhecimentoSegundos: null,
    });

    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.body).toEqual({
      id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'],
      metaConformidade: null, metaZeroSeveridade4Ativa: false, metaTempoReconhecimentoSegundos: null,
    });
    req.flush({ id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', estacaoIds: ['EST-02'], ativa: true });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.componentInstance.novaEquipe().id).toBe('');
  });

  it('envia os campos de meta no cadastro de equipe', () => {
    const fixture = montar();
    fixture.componentInstance.novaEquipe.set({
      id: 'EQ-09', nome: 'Equipe Meta', turno: 'MANHA', estacaoIds: ['EST-01'],
      metaConformidade: 0.98, metaZeroSeveridade4Ativa: true, metaTempoReconhecimentoSegundos: 120,
    });

    fixture.componentInstance.salvar();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.body.metaConformidade).toBe(0.98);
    expect(req.request.body.metaZeroSeveridade4Ativa).toBe(true);
    expect(req.request.body.metaTempoReconhecimentoSegundos).toBe(120);
    req.flush({
      id: 'EQ-09', nome: 'Equipe Meta', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true,
      metaConformidade: 0.98, metaZeroSeveridade4Ativa: true, metaTempoReconhecimentoSegundos: 120,
    });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('desativar chama deleteEquipe', () => {
    const fixture = montar();

    fixture.componentInstance.desativar('EQ-01');

    http.expectOne(`${environment.apiUrl}/teams/EQ-01`).flush(null);
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
