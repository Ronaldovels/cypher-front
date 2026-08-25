import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, delay, of, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CameraAdmin, Station } from '../incident.models';
import { Equipe, Usuario } from '../team.models';
import {
  CAMERAS_MUTAVEL, EMITIDOS, EQUIPES_MUTAVEL, INCIDENTS, SESSAO_MOCK, SETUP_MOCK,
  STATIONS_MUTAVEL, TOKENS_ESTACAO, USUARIOS_MUTAVEL, resumo,
} from './fixtures';

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

/** Espelha `UsuarioService.validarPapelEEstacao` do backend real. */
function validarPapelEEstacaoDoUsuario(papel: string, estacaoId?: string): HttpErrorResponse | null {
  if (papel !== 'GESTOR' && papel !== 'OPERADOR') {
    return naoProcessavel(`papel deve ser GESTOR ou OPERADOR: ${papel}`);
  }
  if (papel === 'OPERADOR') {
    if (!estacaoId) {
      return naoProcessavel('estacaoId e obrigatorio para OPERADOR');
    }
    if (!STATIONS_MUTAVEL.some(s => s.id === estacaoId)) {
      return naoProcessavel(`estacao inexistente: ${estacaoId}`);
    }
  }
  return null;
}

/** Espelha `TokenGenerator.novo` do backend real — só para o mock parecer real. */
function gerarTokenMock(prefixo: string): string {
  return `${prefixo}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
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

  // ---------------- setup (execução única, design doc de E4 §2.5) ----------------

  if (req.method === 'GET' && req.url === `${base}/setup/status`) {
    return { configured: SETUP_MOCK.concluido };
  }

  if (req.method === 'POST' && req.url === `${base}/setup`) {
    if (SETUP_MOCK.concluido) {
      return conflito('Setup já concluído — o gestor mestre já existe.');
    }
    const { username, password } = req.body as { username: string; password: string };
    SETUP_MOCK.concluido = true;
    USUARIOS_MUTAVEL.push({ username, papel: 'GESTOR', password });
    SESSAO_MOCK.atual = { papel: 'GESTOR', username };
    return { papel: 'GESTOR', username };
  }

  // ---------------- autenticação ----------------

  if (req.method === 'POST' && req.url === `${base}/auth/login`) {
    const { username, password } = req.body as { username: string; password: string };
    const usuario = USUARIOS_MUTAVEL.find(u => u.username === username && u.password === password);
    if (!usuario) {
      return new HttpErrorResponse({ status: 401, error: { erro: 'Usuário ou senha inválidos' } });
    }
    // OPERADOR por credencial (revisão pós-E4) usa a MESMA OperadorAuthentication
    // do login por token do lado do backend — aqui, mesma forma de resposta,
    // só que com `username` também preenchido.
    if (usuario.papel === 'OPERADOR') {
      SESSAO_MOCK.atual = { papel: 'OPERADOR', estacaoId: usuario.estacaoId!, username };
      return { papel: 'OPERADOR', estacaoId: usuario.estacaoId, username };
    }
    SESSAO_MOCK.atual = { papel: 'GESTOR', username };
    return { papel: 'GESTOR', username };
  }

  if (req.method === 'POST' && req.url === `${base}/auth/login-estacao`) {
    const { token } = req.body as { token: string };
    const estacaoId = Object.entries(TOKENS_ESTACAO).find(([, t]) => t === token)?.[0];
    if (!estacaoId) {
      return new HttpErrorResponse({ status: 401, error: { erro: 'Token inválido' } });
    }
    SESSAO_MOCK.atual = { papel: 'OPERADOR', estacaoId };
    return { papel: 'OPERADOR', estacaoId };
  }

  if (req.method === 'POST' && req.url === `${base}/auth/logout`) {
    SESSAO_MOCK.atual = null;
    return null;
  }

  if (req.method === 'GET' && req.url === `${base}/auth/me`) {
    return SESSAO_MOCK.atual
      ?? new HttpErrorResponse({ status: 401, error: { erro: 'Não autenticado' } });
  }

  // ---------------- equipes ----------------

  if (req.method === 'GET' && req.url === `${base}/teams`) {
    // Clona (raso, mais o array aninhado estacaoIds), como todo outro handler
    // de leitura deste arquivo — devolver EQUIPES_MUTAVEL por referência faz
    // o signal `_equipes` do TeamService acabar guardando essa mesma
    // referência; uma mutação in-place posterior (ex.: desativar()) não
    // muda a referência, e Object.is() no set() do signal não notifica.
    return EQUIPES_MUTAVEL.map(e => ({ ...e, estacaoIds: [...e.estacaoIds] }));
  }

  if (req.method === 'POST' && req.url === `${base}/teams`) {
    const corpo = req.body as Equipe;
    if (EQUIPES_MUTAVEL.some(e => e.id === corpo.id)) {
      return conflito(`Equipe ja cadastrada: ${corpo.id}`);
    }
    const nova: Equipe = { ...corpo, ativa: corpo.ativa ?? true };
    EQUIPES_MUTAVEL.push(nova);
    return nova;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/teams/`)) {
    const id = req.url.slice(`${base}/teams/`.length);
    const corpo = req.body as Equipe;
    const atual = EQUIPES_MUTAVEL.find(e => e.id === id);
    if (!atual) {
      return naoEncontrado(`Equipe inexistente: ${id}`);
    }
    Object.assign(atual, corpo, { id, ativa: corpo.ativa ?? atual.ativa });
    return atual;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/teams/`)) {
    const id = req.url.slice(`${base}/teams/`.length);
    const atual = EQUIPES_MUTAVEL.find(e => e.id === id);
    if (!atual) {
      return naoEncontrado(`Equipe inexistente: ${id}`);
    }
    atual.ativa = false;
    return null;
  }

  // ---------------- usuários ----------------

  if (req.method === 'GET' && req.url === `${base}/users`) {
    return USUARIOS_MUTAVEL.map(({ password, ...resto }) => resto);
  }

  if (req.method === 'POST' && req.url === `${base}/users`) {
    const corpo = req.body as Usuario & { password?: string };
    const erroPapel = validarPapelEEstacaoDoUsuario(corpo.papel, corpo.estacaoId);
    if (erroPapel) {
      return erroPapel;
    }
    if (USUARIOS_MUTAVEL.some(u => u.username === corpo.username)) {
      return conflito(`Usuario ja cadastrado: ${corpo.username}`);
    }
    if (!corpo.password) {
      return naoProcessavel('Senha obrigatória no cadastro');
    }
    const estacaoId = corpo.papel === 'OPERADOR' ? corpo.estacaoId : undefined;
    const novo = { username: corpo.username, papel: corpo.papel, password: corpo.password, estacaoId };
    USUARIOS_MUTAVEL.push(novo);
    const { password, ...resto } = novo;
    return resto;
  }

  if (req.method === 'PUT' && req.url.startsWith(`${base}/users/`)) {
    const username = req.url.slice(`${base}/users/`.length);
    const corpo = req.body as Usuario & { password?: string };
    const erroPapel = validarPapelEEstacaoDoUsuario(corpo.papel, corpo.estacaoId);
    if (erroPapel) {
      return erroPapel;
    }
    const atual = USUARIOS_MUTAVEL.find(u => u.username === username);
    if (!atual) {
      return naoEncontrado(`Usuario inexistente: ${username}`);
    }
    atual.papel = corpo.papel;
    atual.estacaoId = corpo.papel === 'OPERADOR' ? corpo.estacaoId : undefined;
    if (corpo.password) {
      atual.password = corpo.password;
    }
    const { password, ...resto } = atual;
    return resto;
  }

  if (req.method === 'DELETE' && req.url.startsWith(`${base}/users/`)) {
    const username = req.url.slice(`${base}/users/`.length);
    const idx = USUARIOS_MUTAVEL.findIndex(u => u.username === username);
    if (idx === -1) {
      return naoEncontrado(`Usuario inexistente: ${username}`);
    }
    USUARIOS_MUTAVEL.splice(idx, 1);
    return null;
  }

  // ---------------- escrita de estação ----------------

  if (req.method === 'POST' && req.url === `${base}/stations`) {
    const corpo = req.body as Station;
    if (STATIONS_MUTAVEL.some(s => s.id === corpo.id)) {
      return conflito(`Estacao ja cadastrada: ${corpo.id}`);
    }
    const nova: Station = { ...corpo, ativa: corpo.ativa ?? true, cameras: [] };
    STATIONS_MUTAVEL.push(nova);
    TOKENS_ESTACAO[nova.id] = gerarTokenMock('est-tok');
    return { ...nova, token: TOKENS_ESTACAO[nova.id] };
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
    return { ...comCameras(atual), token: TOKENS_ESTACAO[id] ?? (TOKENS_ESTACAO[id] = gerarTokenMock('est-tok')) };
  }

  if (req.method === 'POST' && req.url.endsWith('/token/regenerate') && req.url.startsWith(`${base}/stations/`)) {
    const id = req.url.slice(`${base}/stations/`.length, -'/token/regenerate'.length);
    const atual = STATIONS_MUTAVEL.find(s => s.id === id);
    if (!atual) {
      return naoEncontrado(`Estacao inexistente: ${id}`);
    }
    TOKENS_ESTACAO[id] = gerarTokenMock('est-tok');
    return { ...comCameras(atual), token: TOKENS_ESTACAO[id] };
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
    // Comparação por instante (Date.parse), não string: a timeline manda
    // `since` em UTC (`Z`, de um <input type="datetime-local">) enquanto o
    // reconnect do SSE manda no offset original da fixture (-03:00) — os dois
    // precisam comparar igual ao mesmo instante, não por ordem lexicográfica.
    const since = req.params.get('since');
    const desde = since ? Date.parse(since) : null;
    const camera = req.params.get('camera');
    const severityMinStr = req.params.get('severityMin');
    const status = req.params.get('status');
    const page = Number(req.params.get('page') ?? '0');
    // Sem size explícito (ex.: loadHistory antigo em outro teste), devolve tudo
    // que sobrar do filtro — mesmo comportamento de antes desta mudança.
    const size = Number(req.params.get('size') ?? String(INCIDENTS.length || 1));

    let lista = INCIDENTS;
    if (desde !== null) lista = lista.filter(i => Date.parse(i.detectedAt) > desde);
    if (camera) lista = lista.filter(i => i.cameraId === camera);
    if (severityMinStr) lista = lista.filter(i => i.severity >= Number(severityMinStr));
    if (status) lista = lista.filter(i => i.status === status);

    const inicio = page * size;
    const paginaDeItens = lista.slice(inicio, inicio + size);
    return {
      content: paginaDeItens,
      totalElements: lista.length,
      totalPages: Math.max(1, Math.ceil(lista.length / size)),
      number: page,
      size,
    };
  }

  if (req.method === 'GET' && req.url.startsWith(`${base}/incidents/`)) {
    const id = Number(req.url.slice(`${base}/incidents/`.length));
    const alvo = [...INCIDENTS, ...EMITIDOS].find(i => i.id === id);
    return alvo ?? naoEncontrado(`Incidente inexistente: ${id}`);
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
