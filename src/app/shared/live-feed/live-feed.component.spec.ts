import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Camera } from '../incident.models';
import { LiveFeedComponent } from './live-feed.component';

const CAMERA: Camera = {
  id: 'CAM-01', nome: 'Frontal', estacaoId: 'EST-01',
  streamUrl: 'http://127.0.0.1:8090/stream',
};

describe('LiveFeedComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  function montar(camera: Camera | null) {
    const fixture = TestBed.createComponent(LiveFeedComponent);
    fixture.componentRef.setInput('camera', camera);
    fixture.detectChanges();
    return fixture;
  }

  it('aponta a imagem para o stream da câmera', () => {
    const fixture = montar(CAMERA);

    const img: HTMLImageElement = fixture.nativeElement.querySelector('img');
    expect(img.getAttribute('src')).toBe('http://127.0.0.1:8090/stream');
  });

  it('sem câmera, mostra o estado indisponível em vez de imagem quebrada', () => {
    const fixture = montar(null);

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('câmera sem streamUrl também cai no estado indisponível', () => {
    const fixture = montar({ ...CAMERA, streamUrl: null });

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('erro de carregamento troca para o estado indisponível', () => {
    const fixture = montar(CAMERA);
    const componente = fixture.componentInstance;

    componente.onError();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('indisponível');
  });

  it('trocar de câmera limpa o erro anterior', () => {
    const fixture = montar(CAMERA);
    fixture.componentInstance.onError();
    fixture.detectChanges();

    fixture.componentRef.setInput('camera', { ...CAMERA, id: 'CAM-02' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
  });
});
