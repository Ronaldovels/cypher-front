import { EventSourceLike } from '../event-source.factory';
import { Incident } from '../incident.models';
import { INCIDENTS, agoraNaPlanta } from './fixtures';

const INTERVALO_MS = 8000;

/**
 * EventSource falso.
 *
 * Emite um incidente novo de tempos em tempos para que o push por SSE seja
 * visível sem backend. Implementa o mesmo `EventSourceLike` que a Task 6
 * definiu, então nada muda no `IncidentService`.
 */
export class MockEventSource implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private listeners = new Map<string, (event: MessageEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private contador = 0;

  constructor() {
    // No próximo tick: quem nos criou ainda está registrando os listeners.
    setTimeout(() => {
      this.onopen?.(new Event('open'));
      this.timer = setInterval(() => this.emitir(), INTERVALO_MS);
    });
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emitir(): void {
    this.contador++;
    const molde = INCIDENTS[this.contador % INCIDENTS.length];
    const incidente: Incident = {
      ...molde,
      id: 1000 + this.contador,
      incidentKey: `exemplo-vivo-${this.contador}`,
      detectedAt: agoraNaPlanta(),
      status: 'PENDENTE',
    };
    this.listeners.get('incident')?.({ data: JSON.stringify(incidente) } as MessageEvent);
  }
}

export const mockEventSourceFactory = (): EventSourceLike => new MockEventSource();
