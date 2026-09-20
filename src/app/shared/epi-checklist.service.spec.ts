import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { EpiChecklistService } from './epi-checklist.service';

describe('EpiChecklistService', () => {
  let service: EpiChecklistService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(EpiChecklistService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load() popula o signal epis a partir do GET', () => {
    service.load();
    const req = http.expectOne(`${environment.apiUrl}/config/epis`);
    expect(req.request.method).toBe('GET');
    req.flush({ epis: ['HELMET', 'VEST'] });

    expect(service.epis()).toEqual(['HELMET', 'VEST']);
  });

  it('load() com falha de rede esvazia o signal em vez de propagar o erro', () => {
    service.load();
    http.expectOne(`${environment.apiUrl}/config/epis`).error(new ProgressEvent('erro'));

    expect(service.epis()).toEqual([]);
  });

  it('update() faz PUT com o checklist e atualiza o signal com a resposta', () => {
    service.update(['HELMET', 'GLOVE']).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/config/epis`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ epis: ['HELMET', 'GLOVE'] });
    req.flush({ epis: ['HELMET', 'GLOVE'] });

    expect(service.epis()).toEqual(['HELMET', 'GLOVE']);
  });
});
