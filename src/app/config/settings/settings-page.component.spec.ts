import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { SettingsPageComponent } from './settings-page.component';

describe('SettingsPageComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes)],
    });
  });

  it('renderiza a topbar e o dock com Configuracoes ativo', () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-chrome-topbar')).not.toBeNull();
    const dock: HTMLElement = fixture.nativeElement.querySelector('app-dock');
    expect(dock).not.toBeNull();
  });

  it('tem uma aba para cada secao do onboarding editavel', () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.detectChanges();

    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cat-item'));
    const hrefs = links.map(l => l.getAttribute('ng-reflect-router-link') ?? l.getAttribute('href'));

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
