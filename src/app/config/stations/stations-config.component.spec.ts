import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { StationsConfigComponent } from './stations-config.component';

describe('StationsConfigComponent', () => {
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
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('carrega o catalogo incluindo inativas, para poder reativar', () => {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();

    const req = http.expectOne(
      r => r.url === `${environment.apiUrl}/stations`
        && r.params.get('incluirInativas') === 'true');
    req.flush([]);
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
  });

  it('recusa codigo mal formado antes de chamar a API', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'est_01', nome: 'Esteira', setor: '' });
    componente.salvarEstacao();
    fixture.detectChanges();

    // Nenhuma requisição: a validação de forma acontece na tela.
    http.expectNone(`${environment.apiUrl}/stations`);
    expect(componente.erro()).toContain('EST-01');
  });

  it('exige nome', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: '  ', setor: '' });
    componente.salvarEstacao();

    http.expectNone(`${environment.apiUrl}/stations`);
    expect(componente.erro().length).toBeGreaterThan(0);
  });

  it('cadastra estacao e limpa o formulario', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    componente.salvarEstacao();

    const req = http.expectOne(
      r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations`);
    expect(req.request.body).toEqual({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    req.flush({ id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] });
    http.match(() => true).forEach(r => r.flush([]));
    fixture.detectChanges();

    expect(componente.novaEstacao().id).toBe('');
    expect(componente.erro()).toBe('');
  });

  it('cadastrar estacao mostra o token devolvido pelo backend', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: 'Esteira', setor: 'montagem' });
    componente.salvarEstacao();

    http.expectOne(r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations`)
      .flush({ id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, token: 'est-tok-abc123' });
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([
      { id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, cameras: [] },
    ]));
    fixture.detectChanges();

    expect(componente.tokenVisto()).toEqual({ estacaoId: 'EST-01', token: 'est-tok-abc123' });
    expect(fixture.nativeElement.textContent).toContain('est-tok-abc123');
  });

  it('gerarToken chama o endpoint de regenerate e mostra o token novo', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.gerarToken('EST-01');

    const req = http.expectOne(
      r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations/EST-01/token/regenerate`);
    req.flush({ id: 'EST-01', nome: 'Esteira', setor: 'montagem', ativa: true, token: 'est-tok-novo' });

    expect(componente.tokenVisto()).toEqual({ estacaoId: 'EST-01', token: 'est-tok-novo' });
  });

  it('mostra a mensagem do servidor quando o codigo ja existe', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaEstacao.set({ id: 'EST-01', nome: 'Esteira', setor: '' });
    componente.salvarEstacao();

    http.expectOne(r => r.method === 'POST' && r.url === `${environment.apiUrl}/stations`)
        .flush({ erro: 'Estacao ja cadastrada: EST-01' },
                { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(componente.erro()).toBe('Estacao ja cadastrada: EST-01');
    // O que foi digitado não é perdido: o gestor corrige em vez de redigitar.
    expect(componente.novaEstacao().id).toBe('EST-01');
    expect(fixture.nativeElement.textContent).toContain('Estacao ja cadastrada');
  });

  it('exige porta explicita na url de stream antes de chamar a API', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaCamera.set({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1/stream', fonte: '',
    });
    componente.salvarCamera();

    http.expectNone(`${environment.apiUrl}/cameras`);
    expect(componente.erro()).toContain('porta');
  });

  it('cadastra camera enviando fonte nula quando o campo esta vazio', () => {
    const fixture = montar();
    const componente = fixture.componentInstance;

    componente.novaCamera.set({
      id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
      streamUrl: 'http://127.0.0.1:8090/stream', fonte: '',
    });
    componente.salvarCamera();

    const req = http.expectOne(
      r => r.method === 'POST' && r.url === `${environment.apiUrl}/cameras`);
    expect((req.request.body as { fonte: string | null }).fonte).toBeNull();
    req.flush({});
    http.match(() => true).forEach(r => r.flush([]));
  });

  it('desativa camera pelo endpoint de delete', () => {
    const fixture = montar();

    fixture.componentInstance.desativarCamera('CAM-01');

    const req = http.expectOne(
      r => r.method === 'DELETE' && r.url === `${environment.apiUrl}/cameras/CAM-01`);
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.match(() => true).forEach(r => r.flush([]));
  });

  it('cadastroCompleto so e verdadeiro com estacao e camera ativa', () => {
    const fixture = TestBed.createComponent(StationsConfigComponent);
    fixture.detectChanges();
    http.match(r => r.url === `${environment.apiUrl}/cameras`).forEach(r => r.flush([
      { id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x:1/s' },
    ]));
    http.match(r => r.url === `${environment.apiUrl}/stations`).forEach(r => r.flush([
      {
        id: 'EST-01', nome: 'Esteira', setor: null, ativa: true,
        cameras: [{ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x:1/s' }],
      },
    ]));
    fixture.detectChanges();

    expect(fixture.componentInstance.cadastroCompleto()).toBe(true);
  });

  it('sem nada cadastrado, cadastroCompleto e falso e a tela diz isso', () => {
    const fixture = montar();

    expect(fixture.componentInstance.cadastroCompleto()).toBe(false);
    expect(fixture.nativeElement.textContent.toLowerCase())
      .toContain('nenhuma estação');
  });

  it('abre e fecha o editor de zonas de uma câmera', () => {
    const fixture = montar();
    const comp = fixture.componentInstance;

    comp.editarZonasDe({ id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01', streamUrl: 'http://x/stream' });
    expect(comp.cameraEmEdicaoDeZonas()?.id).toBe('CAM-01');

    comp.fecharEditorDeZonas();
    expect(comp.cameraEmEdicaoDeZonas()).toBeNull();
  });
});
