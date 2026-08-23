import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../../shared/config.service';
import { IdentityTabComponent } from './identity-tab.component';

describe('IdentityTabComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('comeca limpo (sem alteracoes) quando o rascunho bate com o config salvo', () => {
    const fixture = TestBed.createComponent(IdentityTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.sujo()).toBe(false);
  });

  it('editar um campo marca sujo, e salvar grava no ConfigService e limpa', () => {
    const fixture = TestBed.createComponent(IdentityTabComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;

    componente.patch({ company: 'Acme Industrias' });
    expect(componente.sujo()).toBe(true);

    componente.salvar();
    expect(componente.sujo()).toBe(false);

    const cfg = TestBed.inject(ConfigService);
    expect(cfg.config()?.company).toBe('Acme Industrias');
  });

  it('carrega o rascunho a partir do config ja salvo', () => {
    TestBed.inject(ConfigService).update({ company: 'Existente Ltda', sector: 'Metalurgia' });

    const fixture = TestBed.createComponent(IdentityTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.draft().company).toBe('Existente Ltda');
    expect(fixture.componentInstance.draft().sector).toBe('Metalurgia');
    expect(fixture.componentInstance.sujo()).toBe(false);
  });
});
