import { Component, computed, effect, input, signal } from '@angular/core';

import { Camera } from '../incident.models';

/**
 * Vídeo ao vivo por MJPEG.
 *
 * O stream vem direto do pipeline Python, sem passar pelo backend: o caminho
 * do vídeo é independente do caminho do incidente.
 */
@Component({
  selector: 'app-live-feed',
  template: `
    @if (mostrarImagem()) {
      <img [src]="camera()!.streamUrl" [alt]="'Câmera ' + camera()!.nome"
           (error)="onError()" />
    } @else {
      <div class="offline">
        <span class="ico">⛶</span>
        <span>câmera indisponível</span>
      </div>
    }
  `,
  styles: [`
    :host { display: block; position: relative; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .offline { display: flex; flex-direction: column; align-items: center;
               justify-content: center; gap: 8px; height: 100%; min-height: 180px;
               opacity: .55; font-size: 13px; }
    .ico { font-size: 26px; }
  `],
})
export class LiveFeedComponent {
  readonly camera = input<Camera | null>(null);

  private readonly falhou = signal(false);

  readonly mostrarImagem = computed(() =>
    !this.falhou() && !!this.camera()?.streamUrl);

  constructor() {
    // Trocar de câmera é uma tentativa nova: o erro da anterior não vale.
    effect(() => {
      this.camera();
      this.falhou.set(false);
    });
  }

  onError(): void {
    this.falhou.set(true);
  }
}
