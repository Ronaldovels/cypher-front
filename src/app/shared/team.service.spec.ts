import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { Equipe, Usuario } from './team.models';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let service: TeamService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TeamService);
    http = TestBed.inject(HttpTestingController);
  });

  it('load busca equipes e usuarios, com credenciais', () => {
    service.load();

    const reqEquipes = http.expectOne(`${environment.apiUrl}/teams`);
    expect(reqEquipes.request.withCredentials).toBe(true);
    reqEquipes.flush([{ id: 'EQ-01', nome: 'Equipe A', turno: 'MANHA', estacaoIds: ['EST-01'], ativa: true }] as Equipe[]);

    const reqUsuarios = http.expectOne(`${environment.apiUrl}/users`);
    reqUsuarios.flush([{ username: 'gestor.demo', papel: 'GESTOR' }] as Usuario[]);

    expect(service.equipes().length).toBe(1);
    expect(service.usuarios().length).toBe(1);
  });

  it('createEquipe posta o payload e recarrega', () => {
    const payload = { id: 'EQ-02', nome: 'Equipe B', turno: 'TARDE' as const, estacaoIds: ['EST-02'] };
    service.createEquipe(payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/teams`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ ...payload, ativa: true });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('updateEquipe da PUT no payload e recarrega', () => {
    const payload = { id: 'EQ-01', nome: 'Equipe A Editada', turno: 'MANHA' as const, estacaoIds: ['EST-01'] };
    service.updateEquipe('EQ-01', payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/teams/EQ-01`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ ...payload, ativa: true });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('deleteEquipe manda DELETE e recarrega', () => {
    service.deleteEquipe('EQ-01').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/teams/EQ-01`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('createUsuario posta o payload com senha', () => {
    const payload = { username: 'novo', papel: 'OPERADOR' as const, password: 'senha123' };
    service.createUsuario(payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ username: 'novo', papel: 'OPERADOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('updateUsuario sem senha nao a inclui no payload', () => {
    const payload = { username: 'gestor.demo', papel: 'GESTOR' as const };
    service.updateUsuario('gestor.demo', payload).subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users/gestor.demo`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ username: 'gestor.demo', papel: 'GESTOR' });

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });

  it('deleteUsuario manda DELETE pelo username', () => {
    service.deleteUsuario('gestor.demo').subscribe();

    const req = http.expectOne(`${environment.apiUrl}/users/gestor.demo`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
  });
});
