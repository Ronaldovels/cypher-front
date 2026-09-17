/**
 * Espelho do contrato da API (spec §3.1).
 *
 * Onde o backend devolve null, o tipo carrega `| null`: o painel precisa
 * distinguir "sem zona" de "zona desconhecida".
 */

export type IncidentType =
  | 'FALL_RISK'
  | 'ERGONOMIC_RISK'
  | 'ZONE_VIOLATION'
  | 'EPI_VIOLATION';

export type AlertaNivel = 'BAIXO' | 'MEDIO' | 'ALTO';
export type AlertaStatus = 'PENDENTE' | 'REVISADO' | 'RESOLVIDO';

export interface IncidentSearchFilters {
  camera?: string;
  severityMin?: number;
  status?: AlertaStatus;
  since?: string;
}

export type ClosedReason =
  | 'STATE_EXIT'
  | 'ESCALATED'
  | 'TRACK_LOST'
  | 'PIPELINE_STOPPED';

export interface Incident {
  id: number;
  incidentKey: string;
  cameraId: string;
  runId: string;
  trackId: number;
  type: IncidentType;
  severity: number;
  nivel: AlertaNivel;
  descricao: string;
  reason: string;
  postureCategory: string;
  rebaScore: number;
  actionLevel: number;
  zoneName: string | null;
  zoneStatus: string;
  epiPresent: string[];
  epiMissing: string[];
  snapshotUrl: string | null;
  detectedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  peakSeverity: number | null;
  closedReason: ClosedReason | null;
  status: AlertaStatus;
  normaAplicavel: string | null;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface Camera {
  id: string;
  nome: string;
  estacaoId: string;
  streamUrl: string | null;
}

export interface Station {
  id: string;
  nome: string;
  setor: string | null;
  ativa: boolean;
  cameras: Camera[];
}

/** Câmera na superfície de administração: a lista não traz `fonte`, o item traz. */
export interface CameraAdmin extends Camera {
  fonte: string | null;
  ativa: boolean;
  rotacao: number;
  anguloCameraGraus: number;
  /**
   * Overrides por câmera dos limiares de detecção de queda (achado SPI
   * 2026-09-16 — câmera com pitch quase vertical gerava falso `person_fallen`
   * em quem só se debruça). `null` = usa o default do YAML do pipeline.
   */
  fallenAspectRatio: number | null;
  fallenVerticalExtent: number | null;
  trunkRotationMax: number | null;
  fallRequireCorroboration: boolean | null;
}

/**
 * Estação na superfície de administração — devolvida só por `POST`/`PUT
 * /stations` e `POST /stations/{id}/token/regenerate` (design doc de E4,
 * §2.4). Sem `cameras`: essa lista só existe na leitura de navegação
 * (`Station`), nunca nesses três endpoints GESTOR-only.
 */
export interface EstacaoAdmin {
  id: string;
  nome: string;
  setor: string | null;
  ativa: boolean;
  token: string;
}

export interface StationPayload {
  id: string;
  nome: string;
  setor: string | null;
  ativa?: boolean;
}

export interface CameraPayload {
  id: string;
  nome: string;
  estacaoId: string;
  streamUrl: string;
  fonte: string | null;
  ativa?: boolean;
  rotacao: number;
  anguloCameraGraus: number;
  fallenAspectRatio?: number | null;
  fallenVerticalExtent?: number | null;
  trunkRotationMax?: number | null;
  fallRequireCorroboration?: boolean | null;
}

/** Mesmo padrão que o backend valida (spec §4): 4 a 19 caracteres. */
export const CODIGO_PADRAO = /^[A-Z0-9]{2,10}-[A-Z0-9]{1,8}$/;

/**
 * Texto que o gestor vai ler.
 *
 * O backend responde `{"erro": "..."}` em 409 e 422 justamente para que a
 * tela possa dizer o que aconteceu; trocar isso por "algo deu errado" seria
 * falha silenciosa com outra roupa.
 */
export function mensagemDeErro(erro: unknown): string {
  const e = erro as { error?: { erro?: string }; status?: number; message?: string } | null;
  if (e?.error?.erro) {
    return e.error.erro;
  }
  if (e?.status) {
    return `A operação falhou (HTTP ${e.status}). Tente novamente.`;
  }
  return 'A operação falhou. Verifique a conexão com a API.';
}

export interface StationCell {
  estacaoId: string;
  nome: string;
  setor: string | null;
  incidentes: number;
}

export interface DayCount {
  dia: string;
  incidentes: number;
}

export interface Summary {
  incidentesHoje: number;
  incidentesOntem: number;
  criticosHoje: number;
  pendentes: number;
  heatmap: StationCell[];
  ultimosSeteDias: DayCount[];
  distribuicaoTemporal: TemporalCell[] | null;
  historicoAnual: DayCount[] | null;
}

/** Uma notificação = um Alerta com estado de leitura, para o GESTOR autenticado (spec central-notificações §2). */
export interface Notificacao {
  id: number;
  cameraId: string;
  type: IncidentType;
  severity: number;
  nivel: AlertaNivel;
  descricao: string;
  detectedAt: string;
  lida: boolean;
}

export interface TemporalCell {
  diaSemana: number;
  faixa2h: number;
  incidentes: number;
}

export interface SummaryFiltros {
  since?: string;
  until?: string;
  turno?: string;
  setor?: string;
  epi?: string;
  detalhado?: boolean;
}

export type ConnectionState = 'conectando' | 'ao vivo' | 'offline';

/** Classe visual da célula do heatmap, a partir da severidade crua 0–4. */
export function severityClass(severity: number): 'ok' | 'low' | 'mid' | 'hi' {
  if (severity <= 0) return 'ok';
  if (severity === 1) return 'low';
  if (severity === 2) return 'mid';
  return 'hi';
}

export function incidentLabel(type: IncidentType): string {
  switch (type) {
    case 'FALL_RISK': return 'Queda / risco imediato';
    case 'ERGONOMIC_RISK': return 'Postura inadequada';
    case 'ZONE_VIOLATION': return 'Zona de risco';
    case 'EPI_VIOLATION': return 'EPI ausente';
  }
}

/**
 * Dica estática de conduta por tipo de incidente (camada educativa, spec §4).
 *
 * Texto fixo no front — não vem da API; a norma (`normaAplicavel`) sim.
 */
export function dicaDe(type: IncidentType): string {
  switch (type) {
    case 'FALL_RISK': return 'Isolar a área e verificar pontos de ancoragem antes de liberar o acesso.';
    case 'ERGONOMIC_RISK': return 'Reforçar pausa e postura na estação; revisar rodízio se recorrente.';
    case 'ZONE_VIOLATION': return 'Confirmar sinalização da zona e treinamento de quem entrou nela.';
    case 'EPI_VIOLATION': return 'Verificar disponibilidade do EPI no posto antes de liberar a operação.';
  }
}

/**
 * Hora e minuto do instante, no fuso em que o evento aconteceu.
 *
 * O offset vem no próprio ISO, então a leitura é a da planta — não a do
 * navegador de quem está olhando o painel.
 */
export function formatTime(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '--:--';
}

/**
 * Data curta e hora, no fuso em que o evento aconteceu (mesma leitura direta
 * do ISO que `formatTime` usa — sem passar por `Date`/fuso do navegador).
 *
 * Necessário em telas que cobrem vários dias (`/incidentes`, `/incidentes/:id`);
 * o dashboard usa só `formatTime` porque sua lista é sempre do dia atual.
 */
export function formatDateTime(iso: string): string {
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[3]}/${match[2]} ${match[4]}:${match[5]}` : '--/-- --:--';
}
