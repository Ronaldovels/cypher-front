import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { EquipeUsuariosTabComponent } from './equipe-usuarios-tab.component';

describe('EquipeUsuariosTabComponent', () => {
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
    const fixture = TestBed.createComponent(EquipeUsuariosTabComponent);
    fixture.detectChanges();
    // 2 GETs de app-equipes-config (teams, users) + 1 de CatalogService.load (stations)
    // + 2 GETs de app-usuarios-config nunca chegam a existir juntos: só o painel
    // ativo (subaba 'equipes' por padrão) está montado.
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);
    http.expectOne(`${environment.apiUrl}/stations`).flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('comeca na sub-aba Equipes', () => {
    const fixture = montar();

    expect(fixture.nativeElement.querySelector('app-equipes-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-usuarios-config')).toBeNull();
  });

  it('irPara troca para Usuarios', () => {
    const fixture = montar();

    fixture.componentInstance.irPara('usuarios');
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/teams`).flush([]);
    http.expectOne(`${environment.apiUrl}/users`).flush([]);

    expect(fixture.nativeElement.querySelector('app-usuarios-config')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-equipes-config')).toBeNull();
  });
});
