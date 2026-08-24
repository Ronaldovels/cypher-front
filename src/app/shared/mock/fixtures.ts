import { Camera, CameraAdmin, Incident, Station, Summary } from '../incident.models';

/**
 * Dados de exemplo do modo `useMockData`.
 *
 * Os instantes são de hoje para que os agregados façam sentido, e trazem o
 * offset -03:00 como o backend real traz — `formatTime` lê a hora do próprio
 * instante, então usar Z aqui mostraria o horário errado na tela.
 */

/** "Agora", já deslocado para o fuso da planta — fonte única de tempo do módulo. */
function agora(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function instante(deltaMs: number): string {
  const d = new Date(agora().getTime() - deltaMs);
  return `${d.toISOString().slice(0, 19)}.000-03:00`;
}

/** Agora, escrito no fuso da planta. */
export function agoraNaPlanta(): string {
  return instante(0);
}

/**
 * Um instante de N minutos atrás, escrito no fuso da planta.
 *
 * Relativo a `agoraNaPlanta()`, não à data local da máquina: assim todo
 * incidente do histórico fica mais antigo que qualquer incidente emitido ao
 * vivo pelo `MockEventSource`, em qualquer hora do dia e em qualquer fuso de
 * quem roda o app — o que uma hora de parede fixa (ex.: "14:31") não garante.
 */
function minutosAtras(n: number): string {
  return instante(n * 60 * 1000);
}

/** Rótulo AAAA-MM-DD do dia N atrás, no mesmo relógio deslocado de `agora()`. */
function diaAtras(n: number): string {
  const d = agora();
  d.setUTCDate(d.getUTCDate() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

type Molde = Omit<Incident,
  'id' | 'incidentKey' | 'cameraId' | 'type' | 'severity' | 'nivel' | 'descricao' | 'detectedAt'>;

const MOLDE: Molde = {
  runId: 'run-exemplo',
  trackId: 1,
  reason: 'exemplo',
  postureCategory: 'neutral',
  rebaScore: 3,
  actionLevel: 1,
  zoneName: null,
  zoneStatus: 'outside',
  epiPresent: [],
  epiMissing: [],
  snapshotUrl: null,
  endedAt: null,
  durationSeconds: null,
  peakSeverity: null,
  closedReason: null,
  status: 'PENDENTE',
};

export const CAMERAS: Camera[] = [
  { id: 'CAM-01', nome: 'Esteira · frontal', estacaoId: 'EST-01', streamUrl: null },
  { id: 'CAM-02', nome: 'Prensa · lateral', estacaoId: 'EST-02', streamUrl: null },
  { id: 'CAM-03', nome: 'Expedição · alto', estacaoId: 'EST-03', streamUrl: null },
];

export const STATIONS: Station[] = [
  { id: 'EST-01', nome: 'Esteira de montagem', setor: 'montagem', ativa: true, cameras: [] },
  { id: 'EST-02', nome: 'Prensa hidráulica', setor: 'estamparia', ativa: true, cameras: [] },
  { id: 'EST-03', nome: 'Doca de expedição', setor: 'logística', ativa: true, cameras: [] },
];

// Espaçamento relativo a "agora", do mais novo para o mais velho — nunca hora
// de parede fixa, para o mais recente do histórico ficar sempre atrás de
// qualquer incidente emitido ao vivo (que nasce em minutosAtras(0)).
export const INCIDENTS: Incident[] = [
  { ...MOLDE, id: 5, incidentKey: 'exemplo-5', cameraId: 'CAM-02', type: 'FALL_RISK',
    severity: 4, nivel: 'ALTO', descricao: 'Queda detectada', detectedAt: minutosAtras(12),
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, peakSeverity: 4 },
  { ...MOLDE, id: 4, incidentKey: 'exemplo-4', cameraId: 'CAM-01', type: 'EPI_VIOLATION',
    severity: 3, nivel: 'ALTO', descricao: 'Capacete ausente', detectedAt: minutosAtras(90),
    epiMissing: ['HELMET'], epiPresent: ['VEST'], peakSeverity: 3 },
  { ...MOLDE, id: 3, incidentKey: 'exemplo-3', cameraId: 'CAM-03', type: 'ZONE_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Entrada em zona de risco',
    detectedAt: minutosAtras(200), zoneName: 'Zona 3 · empilhadeiras', zoneStatus: 'inside',
    status: 'REVISADO', peakSeverity: 2 },
  { ...MOLDE, id: 2, incidentKey: 'exemplo-2', cameraId: 'CAM-01', type: 'ERGONOMIC_RISK',
    severity: 1, nivel: 'BAIXO', descricao: 'Postura inadequada sustentada',
    detectedAt: minutosAtras(320), postureCategory: 'bent_over', rebaScore: 7,
    actionLevel: 2, durationSeconds: 60, endedAt: minutosAtras(319),
    closedReason: 'STATE_EXIT', status: 'RESOLVIDO', peakSeverity: 1 },
  { ...MOLDE, id: 1, incidentKey: 'exemplo-1', cameraId: 'CAM-02', type: 'EPI_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Luvas ausentes', detectedAt: minutosAtras(480),
    epiMissing: ['GLOVES'], durationSeconds: 300, endedAt: minutosAtras(475),
    closedReason: 'STATE_EXIT', status: 'RESOLVIDO', peakSeverity: 2 },
];

/**
 * Incidentes que o EventSource falso já emitiu.
 *
 * O interceptor precisa deles para que reconhecer um incidente que chegou ao
 * vivo funcione igual a reconhecer um do histórico — sem isto, o PUT cai na
 * rede e falha em silêncio justamente nos incidentes que a demo mostra.
 */
export const EMITIDOS: Incident[] = [];

/** Contagens dos seis dias anteriores a hoje, do mais antigo para o mais recente. */
const DIAS_ANTERIORES = [8, 5, 12, 4, 9, 3];

/** Calculado das fixtures, para os KPIs não contradizerem a lista de incidentes. */
export function resumo(): Summary {
  const estacaoDe = (cameraId: string) =>
    CAMERAS_MUTAVEL.find(c => c.id === cameraId)?.estacaoId ?? null;

  return {
    incidentesHoje: INCIDENTS.length,
    incidentesOntem: DIAS_ANTERIORES[DIAS_ANTERIORES.length - 1],
    criticosHoje: INCIDENTS.filter(i => i.severity >= 3).length,
    pendentes: INCIDENTS.filter(i => i.status === 'PENDENTE').length,
    heatmap: STATIONS_MUTAVEL.filter(s => s.ativa).map(s => ({
      estacaoId: s.id,
      nome: s.nome,
      setor: s.setor,
      incidentes: INCIDENTS.filter(i => estacaoDe(i.cameraId) === s.id).length,
    })),
    ultimosSeteDias: Array.from({ length: 7 }, (_, k) => ({
      dia: diaAtras(6 - k),
      incidentes: k === 6 ? INCIDENTS.length : DIAS_ANTERIORES[k],
    })),
  };
}

/**
 * Estado mutável do catálogo no modo de exemplo.
 *
 * O interceptor precisa de escrita para que as telas de cadastro sejam
 * desenvolvíveis sem backend. As constantes acima seguem sendo a semente;
 * estas são a cópia que muda.
 */
export let STATIONS_MUTAVEL: Station[] = [];
export let CAMERAS_MUTAVEL: CameraAdmin[] = [];

export function resetMockCatalog(): void {
  STATIONS_MUTAVEL = STATIONS.map(s => ({ ...s, cameras: [...s.cameras] }));
  CAMERAS_MUTAVEL = CAMERAS.map(c => ({
    ...c,
    fonte: `rtsp://\${${c.id.replace('-', '_')}_USER}@10.0.0.7/stream`,
    ativa: true,
  }));
}

resetMockCatalog();

// ---------------- autenticação (mock) ----------------

/** Credencial única do modo de exemplo — mostrada em tela por `LoginComponent` quando `USE_MOCK_DATA` é true. */
export const GESTOR_DEMO = { username: 'gestor.demo', password: 'demo123' };

/** Token de estação por id — só existe no mock; no backend real fica em `Estacao.token`, nunca exposto ao dashboard (design doc de E4, §2.4). */
export const TOKENS_ESTACAO: Record<string, string> = {
  'EST-01': 'est-tok-01',
  'EST-02': 'est-tok-02',
  'EST-03': 'est-tok-03',
};

export type SessaoMock =
  | { papel: 'GESTOR'; username: string }
  | { papel: 'OPERADOR'; estacaoId: string };

/**
 * Sessão atual do mock.
 *
 * Objeto com propriedade mutável, não `let` exportado: um módulo importador
 * (o interceptor) não pode reatribuir um `let` importado, só mutar o que ele
 * referencia — a mesma razão de `STATIONS_MUTAVEL` ser um array mutado via
 * `.push()`, nunca reatribuído fora deste arquivo.
 */
export const SESSAO_MOCK: { atual: SessaoMock | null } = { atual: null };

export function resetMockSessao(): void {
  SESSAO_MOCK.atual = null;
}

/**
 * Se o onboarding (o "setup de execução única", design doc de E4 §2.5) já
 * rodou no mock. Independente de `USUARIOS_MUTAVEL` (Task 10) de propósito:
 * esse array ainda não existe neste ponto do plano, e o mock aqui só precisa
 * provar o contrato request/response de `/setup*` e a autenticação da sessão
 * — não uma réplica fiel de "existe ≥1 Usuario" (ver comentário no handler
 * de `POST /setup`, no interceptor).
 */
export const SETUP_MOCK: { concluido: boolean } = { concluido: false };

export function resetMockSetup(): void {
  SETUP_MOCK.concluido = false;
}
