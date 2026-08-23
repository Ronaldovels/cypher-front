import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CameraAdmin, Station } from '../incident.models';
import { CAMERAS_MUTAVEL, EMITIDOS, INCIDENTS, STATIONS_MUTAVEL, resumo } from './fixtures';

const ATRASO_MS = 150;

/**
 * Responde os endpoints do painel a partir de fixtures, sem rede.
 *
 * Trocar o transporte em vez do serviço é o que mantém serviços, componentes
 * e templates idênticos nos dois modos: o modo de exemplo exercita o código
 * de verdade, inclusive as validações de cadastro.
 */
export const mockApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const resultado = responder(req);
  if (resultado === undefined) {
    return next(req);
  }
  if (resultado instanceof HttpErrorResponse) {
    return throwError(() => resultado).pipe(delay(ATRASO_MS));
  }
  return of(new HttpResponse({ status: 200, body: resultado })).pipe(delay(ATRASO_MS));
};

function conflito(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { erro: mensagem } });
}

function naoProcessavel(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 422, error: { erro: mensagem } });
}

function naoEncontrado(mensagem: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 404, error: { erro: mensagem } });
}

function comCameras(estacao: Station): Station {
  return {
    ...estacao,
    cameras: CAMERAS_MUTAVEL.filter(c => c.estacaoId === estacao.id && c.ativa)
      .map(({ id, nome, estacaoId, streamUrl }) => ({ id, nome, estacaoId, streamUrl })),
  };
}

function responder(req: HttpRequest<unknown>): unknown | HttpErrorResponse | undefined {
  const base = environment.apiUrl;

  // ---------------- escrita de estação ----------------

  if (req.method === 'POST' && req.url === `${base}/stations`) {
    const corpo = req.body as Station;
    if (STATIONS_MUTAVEL.some(s => s.id === corpo.id)) {
      return conflito(`Estacao ja cadastrada: ${corpo.id}`);
    }
    const nova: Station = { ...corpo, ativa: corpo.ativa ?? true, cameras: [] };
    STATIONS_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/stations/`)) {
    const id = req.url.slice(`${base}/stations/`.length);
    const corpo = req.body as Station;
    if (corpo.id && corpo.id !== id) {
      return conflito(`O codigo de estacao e imutavel: ${id} nao pode virar ${corpo.id}`);
    }
    const atual = STATIONS_MUTAVEL.find(s => s.id === id);
    if (!atual) {
      return naoEncontrado(`Estacao inexistente: ${id}`);
    }
    atual.nome = corpo.nome;
    atual.setor = corpo.setor;
    if (corpo.ativa !== undefined) {
      atual.ativa = corpo.ativa;
    }
    return comCameras(atual);
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/stations/`)) {
    const id = req.url.slice(`${base}/stations/`.length);
    const atual = STATIONS_MUTAVEL.find(s => s.id === id);
    if (!atual) {
      return naoEncontrado(`Estacao inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- escrita de câmera ----------------

  if (req.method === 'POST' && req.url === `${base}/cameras`) {
    const corpo = req.body as CameraAdmin;
    if (CAMERAS_MUTAVEL.some(c => c.id === corpo.id)) {
      return conflito(`Camera ja cadastrada: ${corpo.id}`);
    }
    if (!STATIONS_MUTAVEL.some(s => s.id === corpo.estacaoId)) {
      return naoProcessavel(`Estacao inexistente: ${corpo.estacaoId}`);
    }
    if (CAMERAS_MUTAVEL.some(c => c.streamUrl === corpo.streamUrl)) {
      return conflito(`streamUrl ja usada`);
    }
    const nova: CameraAdmin = { ...corpo, ativa: corpo.ativa ?? true };
    CAMERAS_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const corpo = req.body as CameraAdmin;
    if (corpo.id && corpo.id !== id) {
      return conflito(`O codigo de camera e imutavel: ${id} nao pode virar ${corpo.id}`);
    }
    const atual = CAMERAS_MUTAVEL.find(c => c.id === id);
    if (!atual) {
      return naoEncontrado(`Camera inexistente: ${id}`);
    }
    if (!STATIONS_MUTAVEL.some(s => s.id === corpo.estacaoId)) {
      return naoProcessavel(`Estacao inexistente: ${corpo.estacaoId}`);
    }
    Object.assign(atual, corpo, { ativa: corpo.ativa ?? atual.ativa });
    return atual;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const atual = CAMERAS_MUTAVEL.find(c => c.id === id);
    if (!atual) {
      return naoEncontrado(`Camera inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- leitura ----------------

  if (req.method === 'GET' && req.url === `${base}/cameras`) {
    return CAMERAS_MUTAVEL.filter(c => c.ativa)
      .map(({ id, nome, estacaoId, streamUrl }) => ({ id, nome, estacaoId, streamUrl }));
  }

  if (req.method === 'GET' && req.url.startsWith(`${base}/cameras/`)) {
    const id = req.url.slice(`${base}/cameras/`.length);
    const camera = CAMERAS_MUTAVEL.find(c => c.id === id);
    return camera ?? naoEncontrado(`Camera inexistente: ${id}`);
  }

  if (req.method === 'GET' && req.url === `${base}/stations`) {
    const todas = req.params.get('incluirInativas') === 'true';
    return STATIONS_MUTAVEL.filter(s => todas || s.ativa).map(comCameras);
  }

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

  if (req.method === 'GET' && req.url === `${base}/summary`) {
    return resumo();
  }

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
