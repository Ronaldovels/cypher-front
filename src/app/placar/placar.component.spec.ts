import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { PlacarComponent } from './placar.component';

const EQUIPE_A = {
  equipeId: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', dadosSuficientes: true,
  conformidade: 0.97, cobertura: 0.9,
  sequenciaAtual: 0, melhorSequencia: 14, metaConformidade: 0.98, metaConformidadeAtingida: false,
  metaZeroSeveridade4Ativa: true, metaZeroSeveridade4Atingida: true,
  metaTempoReconhecimentoSegundos: null, deltaConformidadeSemana: 0.03,
};

const EQUIPE_SEM_DADOS = {
  equipeId: 'EQ-02', nome: 'Equipe B', turno: 'TARDE', dadosSuficientes: false,
  conformidade: null, cobertura: 0.2, sequenciaAtual: 3, melhorSequencia: 3,
  metaConformidade: null, metaConformidadeAtingida: false, metaZeroSeveridade4Ativa: null,
  metaZeroSeveridade4Atingida: false, metaTempoReconhecimentoSegundos: null,
  deltaConformidadeSemana: null,
};

const EQUIPE_SEM_HISTORICO = {
  equipeId: 'EQ-03', nome: 'Equipe C', turno: 'NOITE', dadosSuficientes: true,
  conformidade: 0.9, cobertura: 0.8, sequenciaAtual: 2, melhorSequencia: 2,
  metaConformidade: null, metaConformidadeAtingida: false, metaZeroSeveridade4Ativa: null,
  metaZeroSeveridade4Atingida: false, metaTempoReconhecimentoSegundos: null,
  deltaConformidadeSemana: null,
};

describe('PlacarComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<PlacarComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PlacarComponent);
    http = TestBed.inject(HttpTestingController);
  });

  it('renderiza o ranking na ordem devolvida pelo backend', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A]);
    fixture.detectChanges();

    expect(fixture.componentInstance.equipes()).toEqual([EQUIPE_A]);
  });

  it('sequência interrompida (atual=0) não usa classe de alerta', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A]);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-test="sequencia"]');
    expect(badge?.className).not.toContain('crit');
    expect(badge?.textContent).toContain('melhor sequência: 14');
    expect(badge?.textContent).toContain('atual: 0');

    const delta = fixture.nativeElement.querySelector('[data-test="delta-semana"]');
    expect(delta?.textContent).toContain('+3%');
    expect(delta?.classList.contains('on')).toBe(true);
  });

  it('equipe com dadosSuficientes=false fica fora do ranking, em seção própria', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_A, EQUIPE_SEM_DADOS]);
    fixture.detectChanges();

    expect(fixture.componentInstance.ranqueadas()).toEqual([EQUIPE_A]);
    expect(fixture.componentInstance.semDados()).toEqual([EQUIPE_SEM_DADOS]);
    expect(fixture.nativeElement.textContent).toContain('Dados insuficientes');
  });

  it('deltaConformidadeSemana=null com dadosSuficientes=true mostra "sem histórico suficiente para ranquear"', () => {
    fixture.detectChanges();
    http.expectOne(r => r.url === `${environment.apiUrl}/placar`).flush([EQUIPE_SEM_HISTORICO]);
    fixture.detectChanges();

    expect(fixture.componentInstance.ranqueadas()).toEqual([EQUIPE_SEM_HISTORICO]);

    // Supplemento §5: o slot de delta semanal renderiza o texto literal —
    // nunca "0%", nunca seta neutra, nunca badge de delta (.status).
    // Assert escopada ao elemento do delta: `not.toContain('0%')` sobre o
    // nativeElement inteiro é insatisfazível com qualquer % múltiplo de 10
    // (a própria fixture do supplemento tem conformidade 0.9 → "90%").
    const delta = fixture.nativeElement.querySelector('[data-test="delta-semana"]');
    expect(delta?.textContent).toContain('sem histórico suficiente para ranquear');
    expect(delta?.textContent).not.toContain('%');
    expect(delta?.classList.contains('status')).toBe(false);
  });

  it('urlPlacarCsv aponta para o endpoint de exportacao, sem parametro de periodo', () => {
    const fixture = TestBed.createComponent(PlacarComponent);
    const comp = fixture.componentInstance;

    expect(comp.urlPlacarCsv).toBe(`${environment.apiUrl}/reports/placar.csv`);
  });
});
