import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { SettingsPageComponent } from './settings-page.component';

describe('SettingsPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function montarGestor() {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`).flush({ papel: 'GESTOR', username: 'g1' });
    fixture.detectChanges();
    return fixture;
  }

  it('renderiza a topbar e o dock para GESTOR', () => {
    const fixture = montarGestor();

    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).not.toBeNull();
    const dock: HTMLElement = fixture.nativeElement.querySelector('app-dock');
    expect(dock).not.toBeNull();
  });

  it('sem sessao GESTOR, nao mostra o dock', () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();
    http.expectOne(`${environment.apiUrl}/auth/me`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-dock')).toBeNull();
  });

  it('tem uma aba para cada secao do onboarding editavel', () => {
    const fixture = montarGestor();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cat-item'));

    expect(links.length).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Identidade da empresa');
    expect(fixture.nativeElement.textContent).toContain('Estações e câmeras');
    expect(fixture.nativeElement.textContent).toContain('EPIs monitorados');
    expect(fixture.nativeElement.textContent).toContain('CAs e validades');
  });

  it('a rota /config/estacoes ainda resolve (link do dock nao muda)', () => {
    const configRoute = routes.find(r => r.path === 'config');
    expect(configRoute).toBeDefined();
    expect(configRoute!.children!.some(c => c.path === 'estacoes')).toBe(true);
  });
});
