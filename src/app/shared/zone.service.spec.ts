import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ZoneService } from './zone.service';

describe('ZoneService (design doc de zonas de risco, §4.4)', () => {
  let service: ZoneService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(ZoneService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load(cameraId) popula o signal zonas', () => {
    service.load('CAM-01');
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([
      { id: 1, cameraId: 'CAM-01', nome: 'Área da prensa', zoneType: 'RESTRICTED',
        polygon: [{ x: 0.2, y: 0.2 }], severity: 4, requiredPpe: [], delimitaAvaliacao: false, ativa: true },
    ]);

    expect(service.zonas()).toHaveLength(1);
  });

  it('create() faz POST e recarrega', () => {
    service.create('CAM-01', { nome: 'x', zoneType: 'RESTRICTED', polygon: [], severity: 2, requiredPpe: [], delimitaAvaliacao: false })
      .subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'x', zoneType: 'RESTRICTED', polygon: [], severity: 2, requiredPpe: [], delimitaAvaliacao: false, ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('update() faz PUT em /cameras/:id/zones/:zoneId', () => {
    service.update('CAM-01', 1, { nome: 'y', zoneType: 'ATTENTION', polygon: [], severity: 1, requiredPpe: [], delimitaAvaliacao: false })
      .subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 1, cameraId: 'CAM-01', nome: 'y', zoneType: 'ATTENTION', polygon: [], severity: 1, requiredPpe: [], delimitaAvaliacao: false, ativa: true });
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });

  it('deactivate() faz DELETE em /cameras/:id/zones/:zoneId', () => {
    service.deactivate('CAM-01', 1).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    http.expectOne(`${environment.apiUrl}/cameras/CAM-01/zones`).flush([]);
  });
});
