import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CAMERAS, EMITIDOS, INCIDENTS, STATIONS, resumo } from './fixtures';

/** Atraso curto, para que os estados de carregamento sejam exercitados. */
const ATRASO_MS = 150;

/**
 * Responde os endpoints do painel a partir de fixtures, sem rede.
 *
 * Trocar o transporte em vez do serviço é o que mantém `IncidentService`,
 * componentes e templates idênticos nos dois modos: o modo de exemplo
 * exercita o código de verdade, inclusive deduplicação e limite em memória.
 */
export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const corpo = responder(req);
  if (corpo === undefined) {
    return next(req);
  }
  return of(new HttpResponse({ status: 200, body: corpo })).pipe(delay(ATRASO_MS));
};

function responder(req: HttpRequest<unknown>): unknown | undefined {
  const base = environment.apiUrl;

  if (req.method === 'GET' && req.url === `${base}/incidents`) {
    // Comparação de string funciona porque todas as fixtures trazem o mesmo
    // offset -03:00; com offsets misturados isto precisaria de Date.
    const since = req.params.get('since');
    const lista = since ? INCIDENTS.filter(i => i.detectedAt > since) : INCIDENTS;
    return {
      content: lista, totalElements: lista.length,
      totalPages: 1, number: 0, size: lista.length,
    };
  }

  if (req.method === 'GET' && req.url === `${base}/summary`) return resumo();
  if (req.method === 'GET' && req.url === `${base}/cameras`) return CAMERAS;
  if (req.method === 'GET' && req.url === `${base}/stations`) return STATIONS;

  const prefixo = `${base}/incidents/`;
  const sufixo = '/status';
  if (req.method === 'PUT' && req.url.startsWith(prefixo) && req.url.endsWith(sufixo)) {
    const id = Number(req.url.slice(prefixo.length, -sufixo.length));
    // Também busca em EMITIDOS: um incidente que chegou ao vivo por SSE não
    // está em INCIDENTS, e um PUT de status nele não pode cair na rede.
    const alvo = [...INCIDENTS, ...EMITIDOS].find(i => i.id === id);
    // `{ ...alvo, ... }` já preserva o incidentKey do alvo — não sobrescrever
    // é o que impede o store duplicar a linha (ele deduplica por essa chave).
    return alvo ? { ...alvo, status: (req.body as { status: string }).status } : undefined;
  }

  return undefined;
}
