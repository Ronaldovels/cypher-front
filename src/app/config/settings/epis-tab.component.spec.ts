import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigService } from '../../shared/config.service';
import { EpisTabComponent } from './epis-tab.component';

describe('EpisTabComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('marcar um EPI marca sujo; salvar grava e limpa', () => {
    const fixture = TestBed.createComponent(EpisTabComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;

    expect(componente.sujo()).toBe(false);

    componente.toggle('capacete');
    expect(componente.isOn('capacete')).toBe(true);
    expect(componente.sujo()).toBe(true);

    componente.salvar();
    expect(componente.sujo()).toBe(false);
    expect(TestBed.inject(ConfigService).config()?.epis).toEqual(['capacete']);
  });

  it('desmarcar e remarcar o mesmo EPI (ordem diferente) nao fica sujo', () => {
    TestBed.inject(ConfigService).update({ epis: ['capacete', 'luvas'] });

    const fixture = TestBed.createComponent(EpisTabComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;

    componente.toggle('capacete');
    componente.toggle('capacete');
    expect(componente.sujo()).toBe(false);
  });
});
