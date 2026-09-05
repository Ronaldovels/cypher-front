import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { ZoneEditorComponent } from './zone-editor.component';

describe('ZoneEditorComponent — captura de frame e desenho', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ZoneEditorComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ZoneEditorComponent);
    fixture.componentRef.setInput('codigo', 'CAM-01');
    fixture.componentRef.setInput('streamUrl', 'http://127.0.0.1:8090/stream');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('capturarFrame sem a imagem carregada mostra erro, sem travar', () => {
    fixture.componentInstance.capturarFrame();

    expect(fixture.componentInstance.frameCapturado()).toBe(false);
    expect(fixture.componentInstance.erro()).toBeTruthy();
  });

  it('adiciona um vertice por clique no canvas, convertendo via getBoundingClientRect', () => {
    const comp = fixture.componentInstance;
    comp.frameCapturado.set(true);

    const canvasEl: HTMLCanvasElement = fixture.nativeElement.querySelector('canvas');
    canvasEl.width = 1280;
    canvasEl.height = 720;
    vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
      left: 10, top: 20, width: 640, height: 360, right: 650, bottom: 380, x: 10, y: 20, toJSON: () => ({}),
    } as DOMRect);

    // escalaX = 1280/640 = 2, escalaY = 720/360 = 2
    const event = new MouseEvent('click', { clientX: 110, clientY: 200 });
    comp.onCanvasClick(event);

    expect(comp.vertices()).toEqual([{ x: 200, y: 360 }]);
  });

  it('onCanvasClick nao adiciona vertice sem o frame capturado', () => {
    const comp = fixture.componentInstance;
    const event = new MouseEvent('click', { clientX: 10, clientY: 10 });

    comp.onCanvasClick(event);

    expect(comp.vertices()).toEqual([]);
  });

  it('onCanvasClick nao adiciona vertice com o poligono ja fechado', () => {
    const comp = fixture.componentInstance;
    comp.frameCapturado.set(true);
    comp.poligonoFechado.set(true);
    const event = new MouseEvent('click', { clientX: 10, clientY: 10 });

    comp.onCanvasClick(event);

    expect(comp.vertices()).toEqual([]);
  });

  it('fecharPoligono com menos de 3 vertices mostra erro', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 2 }]);

    comp.fecharPoligono();

    expect(comp.poligonoFechado()).toBe(false);
    expect(comp.erro()).toBeTruthy();
  });

  it('fecharPoligono com 3+ vertices fecha sem erro', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);

    comp.fecharPoligono();

    expect(comp.poligonoFechado()).toBe(true);
    expect(comp.erro()).toBe('');
  });

  it('removerUltimoVertice tira o ultimo ponto adicionado', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);

    comp.removerUltimoVertice();

    expect(comp.vertices()).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });
});

describe('ZoneEditorComponent — formulário e persistência', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ZoneEditorComponent>>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ZoneEditorComponent);
    fixture.componentRef.setInput('codigo', 'CAM-01');
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('salvar sem frame capturado mostra erro, sem chamar o backend', () => {
    const comp = fixture.componentInstance;
    comp.vertices.set([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);
    comp.form.set({ nome: 'Área da prensa', zoneType: 'RESTRICTED', severity: 3, requiredPpe: [] });

    comp.salvar();

    http.expectNone(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(comp.erro()).toBeTruthy();
  });

  it('editar sem frame capturado mostra erro, sem alterar o estado do editor', () => {
    const comp = fixture.componentInstance;

    comp.editar({
      id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }],
      severity: 2, requiredPpe: [], ativa: true,
    });

    expect(comp.editandoId()).toBeNull();
    expect(comp.vertices()).toEqual([]);
    expect(comp.poligonoFechado()).toBe(false);
    expect(comp.erro()).toBeTruthy();
  });

  it('salvar sem nome mostra erro, sem chamar o backend', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.vertices.set([{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]);
    comp.form.set({ nome: '', zoneType: 'RESTRICTED', severity: 3, requiredPpe: [] });

    comp.salvar();

    http.expectNone(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(comp.erro()).toBeTruthy();
  });

  it('salvar converte os vertices para normalizado antes de enviar', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.vertices.set([{ x: 320, y: 180 }, { x: 960, y: 180 }, { x: 960, y: 540 }]);
    comp.form.set({ nome: 'Área da prensa', zoneType: 'RESTRICTED', severity: 4, requiredPpe: ['capacete'] });

    comp.salvar();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.polygon).toEqual([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }]);
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'Área da prensa', zoneType: 'RESTRICTED',
      polygon: req.request.body.polygon, severity: 4, requiredPpe: ['capacete'], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('editar carrega uma zona existente convertida para pixel', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);

    comp.editar({
      id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }],
      severity: 2, requiredPpe: [], ativa: true,
    });

    expect(comp.editandoId()).toBe(7);
    expect(comp.vertices()).toEqual([{ x: 320, y: 180 }, { x: 960, y: 180 }, { x: 960, y: 540 }]);
    expect(comp.poligonoFechado()).toBe(true);
    expect(comp.form()).toEqual({ nome: 'Existente', zoneType: 'ATTENTION', severity: 2, requiredPpe: [] });
  });

  it('editar seguido de salvar faz PUT, nao POST', () => {
    const comp = fixture.componentInstance;
    comp.canvasWidth.set(1280);
    comp.canvasHeight.set(720);
    comp.editar({
      id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }],
      severity: 2, requiredPpe: [], ativa: true,
    });

    comp.salvar();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/7`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 7, cameraId: 'CAM-01', nome: 'Existente', zoneType: 'ATTENTION',
      polygon: req.request.body.polygon, severity: 2, requiredPpe: [], ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('desativar chama DELETE', () => {
    fixture.componentInstance.desativar(7);

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/7`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });
});
