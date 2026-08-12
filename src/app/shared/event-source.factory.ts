import { InjectionToken } from '@angular/core';

/** Subconjunto de EventSource que o serviço realmente usa. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
}

/**
 * Fábrica do EventSource.
 *
 * Injetável para que o serviço seja testável sem depender de o ambiente de
 * teste implementar a API — e para que a reconexão possa ser exercitada.
 */
export const EVENT_SOURCE_FACTORY = new InjectionToken<(url: string) => EventSourceLike>(
  'EVENT_SOURCE_FACTORY',
  {
    providedIn: 'root',
    // withCredentials: a autenticação de E4 será por cookie de sessão, porque
    // EventSource não aceita cabeçalho Authorization (spec §15).
    factory: () => (url: string) =>
      new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike,
  },
);
