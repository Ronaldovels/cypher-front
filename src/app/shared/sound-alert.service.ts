import { Injectable, InjectionToken, inject } from '@angular/core';

/** Subconjunto de AudioContext que o serviço realmente usa. */
export interface AudioContextLike {
  currentTime: number;
  state: string;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  destination: AudioDestinationNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Fábrica do AudioContext.
 *
 * Injetável pelo mesmo motivo de `EVENT_SOURCE_FACTORY`: jsdom não
 * implementa a Web Audio API, e testar o serviço não pode depender do
 * ambiente ter um dispositivo de áudio de verdade.
 */
export const AUDIO_CONTEXT_FACTORY = new InjectionToken<() => AudioContextLike>(
  'AUDIO_CONTEXT_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => new AudioContext() as unknown as AudioContextLike,
  },
);

const DURACAO_TOM_S = 0.22;
const INTERVALO_ENTRE_TONS_S = 0.28;

/**
 * Alerta sonoro de incidente (spec: operador/gestor olhando a tela de uma
 * estação precisa notar uma infração sem depender de estar olhando pro
 * texto). Gera o tom via Web Audio API — sem depender de um arquivo de
 * áudio no bundle, que ficaria mais um asset pra manter em sincronia com o
 * design.
 */
@Injectable({ providedIn: 'root' })
export class SoundAlertService {
  private audioContextFactory = inject(AUDIO_CONTEXT_FACTORY);

  /**
   * Toca uma sirene curta (dois tons alternados, repetidos) — achado de
   * campo 2026-09-20: o bipe único original passava despercebido no chão de
   * fábrica. `severidade` alta soa mais alto e repete mais vezes, mas o tom
   * em si não muda (nao existe pedido por uma escala sonora inteira).
   */
  tocar(severidade: number): void {
    let ctx: AudioContextLike;
    try {
      ctx = this.audioContextFactory();
    } catch {
      // Navegador sem suporte, ou politica de autoplay bloqueando sem
      // interacao previa do usuario — silencioso, nunca quebra a tela.
      return;
    }

    const volume = severidade >= 3 ? 0.55 : 0.4;
    const repeticoes = severidade >= 3 ? 4 : 3;

    for (let i = 0; i < repeticoes; i++) {
      const inicioDoPar = i * INTERVALO_ENTRE_TONS_S * 2;
      this.bipe(ctx, 880, inicioDoPar, DURACAO_TOM_S, volume);
      this.bipe(ctx, 1108, inicioDoPar + INTERVALO_ENTRE_TONS_S, DURACAO_TOM_S, volume);
    }

    const duracaoTotalS = repeticoes * INTERVALO_ENTRE_TONS_S * 2;
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, duracaoTotalS * 1000 + 300);
  }

  private bipe(ctx: AudioContextLike, frequenciaHz: number, atrasoS: number,
               duracaoS: number, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequenciaHz;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const inicio = ctx.currentTime + atrasoS;
    osc.start(inicio);
    osc.stop(inicio + duracaoS);
  }
}
