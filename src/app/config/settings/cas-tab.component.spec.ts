import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../../shared/config.service';
import { CasTabComponent } from './cas-tab.component';

describe('CasTabComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('sem EPI salvo, a lista de CAs fica vazia', () => {
    const fixture = TestBed.createComponent(CasTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.selected()).toEqual([]);
  });

  it('mostra os EPIs ja salvos, nao um rascunho de outra aba', () => {
    TestBed.inject(ConfigService).update({ epis: ['capacete', 'luvas'] });

    const fixture = TestBed.createComponent(CasTabComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.selected().map(e => e.key)).toEqual(['capacete', 'luvas']);
  });

  it('editar um CA marca sujo; salvar grava e limpa', () => {
    TestBed.inject(ConfigService).update({ epis: ['capacete'] });

    const fixture = TestBed.createComponent(CasTabComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;

    expect(componente.sujo()).toBe(false);

    componente.update('capacete', 'ca', '31469');
    expect(componente.sujo()).toBe(true);

    componente.salvar();
    expect(componente.sujo()).toBe(false);
    expect(TestBed.inject(ConfigService).config()?.cas['capacete'].ca).toBe('31469');
  });
});
