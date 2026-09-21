import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUDIO_CONTEXT_FACTORY, AudioContextLike, SoundAlertService } from './sound-alert.service';

class OsciladorFake {
  frequency = { value: 0 };
  started: number[] = [];
  stopped: number[] = [];
  connect = vi.fn();
  start(quando: number): void { this.started.push(quando); }
  stop(quando: number): void { this.stopped.push(quando); }
}

class GainFake {
  gain = { value: 0 };
  connect = vi.fn();
}

class AudioContextFake implements AudioContextLike {
  currentTime = 10;
  state = 'running';
  destination = {} as AudioDestinationNode;
  osciladores: OsciladorFake[] = [];
  ganhos: GainFake[] = [];
  fechado = false;

  createOscillator(): OscillatorNode {
    const osc = new OsciladorFake();
    this.osciladores.push(osc);
    return osc as unknown as OscillatorNode;
  }

  createGain(): GainNode {
    const gain = new GainFake();
    this.ganhos.push(gain);
    return gain as unknown as GainNode;
  }

  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { this.fechado = true; return Promise.resolve(); }
}

describe('SoundAlertService', () => {
  let ultimaFake: AudioContextFake;

  beforeEach(() => {
    ultimaFake = new AudioContextFake();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AUDIO_CONTEXT_FACTORY, useValue: () => ultimaFake },
      ],
    });
  });

  it('severidade baixa toca 3 repeticoes do par de tons alternados', () => {
    const service = TestBed.inject(SoundAlertService);

    service.tocar(2);

    // 3 repeticoes x 2 tons cada = 6 osciladores, alternando 880/1108 Hz.
    expect(ultimaFake.osciladores).toHaveLength(6);
    const frequencias = ultimaFake.osciladores.map(o => o.frequency.value);
    expect(frequencias).toEqual([880, 1108, 880, 1108, 880, 1108]);
    // Cada par comeca 0.56s depois do anterior (2 tons x 0.28s de intervalo).
    expect(ultimaFake.osciladores[0].started[0]).toBeCloseTo(10);
    expect(ultimaFake.osciladores[2].started[0]).toBeCloseTo(10.56);
    expect(ultimaFake.osciladores[4].started[0]).toBeCloseTo(11.12);
  });

  it('severidade alta (>=3) repete mais vezes que severidade baixa (mais prolongado)', () => {
    const service = TestBed.inject(SoundAlertService);

    service.tocar(4);

    // 4 repeticoes x 2 tons = 8 osciladores, contra 6 de uma severidade baixa.
    expect(ultimaFake.osciladores).toHaveLength(8);
  });

  it('severidade alta (>=3) usa volume maior que severidade baixa', () => {
    const service = TestBed.inject(SoundAlertService);
    service.tocar(4);
    const volumeAlto = ultimaFake.ganhos[0].gain.value;

    TestBed.resetTestingModule();
    const outraFake = new AudioContextFake();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AUDIO_CONTEXT_FACTORY, useValue: () => outraFake },
      ],
    });
    TestBed.inject(SoundAlertService).tocar(2);
    const volumeBaixo = outraFake.ganhos[0].gain.value;

    expect(volumeAlto).toBeGreaterThan(volumeBaixo);
  });

  it('fabrica que lanca (sem suporte a audio) nao propaga erro', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AUDIO_CONTEXT_FACTORY, useValue: () => { throw new Error('sem suporte'); } },
      ],
    });
    const service = TestBed.inject(SoundAlertService);

    expect(() => service.tocar(3)).not.toThrow();
  });
});
