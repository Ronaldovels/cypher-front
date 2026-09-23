import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { ConfigService } from '../../shared/config.service';
import { EpisTabComponent } from './epis-tab.component';

describe('EpisTabComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('marcar um EPI marca sujo; salvar grava no backend e limpa', () => {
    const fixture = TestBed.createComponent(EpisTabComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/config/epis`).flush({ epis: [] });

    const componente = fixture.componentInstance;
    expect(componente.sujo()).toBe(false);

    componente.toggle('capacete');
    expect(componente.isOn('capacete')).toBe(true);
    expect(componente.sujo()).toBe(true);

    componente.salvar();
    const req = http.expectOne(`${environment.apiUrl}/config/epis`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ epis: ['HELMET'] });
    req.flush({ epis: ['HELMET'] });

    expect(componente.sujo()).toBe(false);
    expect(TestBed.inject(ConfigService).config()?.epis).toEqual(['capacete']);
  });

  it('desmarcar e remarcar o mesmo EPI (ordem diferente) nao fica sujo', () => {
    const fixture = TestBed.createComponent(EpisTabComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/config/epis`).flush({ epis: ['HELMET', 'GLOVE'] });

    const componente = fixture.componentInstance;
    componente.toggle('capacete');
    componente.toggle('capacete');
    expect(componente.sujo()).toBe(false);
  });

  it('a baseline vem só do checklist do backend, ignorando EPI local que não existe mais', () => {
    localStorage.setItem('cypher.config', JSON.stringify({ accent: '#F4622A', epis: ['auricular', 'cinto'], cas: {} }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(EpisTabComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/config/epis`).flush({ epis: ['HELMET'] });
    TestBed.tick();

    const componente = fixture.componentInstance;
    expect(componente.draft()).toEqual(['capacete']);
    expect(componente.sujo()).toBe(false);
    expect(componente.epiList.map(e => e.key)).not.toContain('auricular');
  });
});
