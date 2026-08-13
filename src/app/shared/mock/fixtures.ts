import { Camera, Incident, Station, Summary } from '../incident.models';

/**
 * Dados de exemplo do modo `useMockData`.
 *
 * Os instantes são de hoje para que os agregados façam sentido, e trazem o
 * offset -03:00 como o backend real traz — `formatTime` lê a hora do próprio
 * instante, então usar Z aqui mostraria o horário errado na tela.
 */

/** Agora, escrito no fuso da planta. */
export function agoraNaPlanta(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 19)}.000-03:00`;
}

function hoje(hhmm: string): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}T${hhmm}:00.000-03:00`;
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

export const INCIDENTS: Incident[] = [
  { ...MOLDE, id: 5, incidentKey: 'exemplo-5', cameraId: 'CAM-02', type: 'FALL_RISK',
    severity: 4, nivel: 'ALTO', descricao: 'Queda detectada', detectedAt: hoje('14:31'),
    reason: 'fallen_sustained', postureCategory: 'immediate_risk', rebaScore: 11,
    actionLevel: 4, peakSeverity: 4 },
  { ...MOLDE, id: 4, incidentKey: 'exemplo-4', cameraId: 'CAM-01', type: 'EPI_VIOLATION',
    severity: 3, nivel: 'ALTO', descricao: 'Capacete ausente', detectedAt: hoje('13:45'),
    epiMissing: ['HELMET'], epiPresent: ['VEST'], peakSeverity: 3 },
  { ...MOLDE, id: 3, incidentKey: 'exemplo-3', cameraId: 'CAM-03', type: 'ZONE_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Entrada em zona de risco',
    detectedAt: hoje('12:10'), zoneName: 'Zona 3 · empilhadeiras', zoneStatus: 'inside',
    status: 'REVISADO', peakSeverity: 2 },
  { ...MOLDE, id: 2, incidentKey: 'exemplo-2', cameraId: 'CAM-01', type: 'ERGONOMIC_RISK',
    severity: 1, nivel: 'BAIXO', descricao: 'Postura inadequada sustentada',
    detectedAt: hoje('10:22'), postureCategory: 'bent_over', rebaScore: 7,
    actionLevel: 2, durationSeconds: 42, endedAt: hoje('10:23'),
    closedReason: 'STATE_EXIT', status: 'RESOLVIDO', peakSeverity: 1 },
  { ...MOLDE, id: 1, incidentKey: 'exemplo-1', cameraId: 'CAM-02', type: 'EPI_VIOLATION',
    severity: 2, nivel: 'MEDIO', descricao: 'Luvas ausentes', detectedAt: hoje('08:05'),
    epiMissing: ['GLOVES'], status: 'RESOLVIDO', peakSeverity: 2 },
];

/** Calculado das fixtures, para os KPIs não contradizerem a lista de incidentes. */
export function resumo(): Summary {
  const estacaoDe = (cameraId: string) =>
    CAMERAS.find(c => c.id === cameraId)?.estacaoId ?? null;

  return {
    incidentesHoje: INCIDENTS.length,
    incidentesOntem: 4,
    criticosHoje: INCIDENTS.filter(i => i.severity >= 3).length,
    pendentes: INCIDENTS.filter(i => i.status === 'PENDENTE').length,
    heatmap: STATIONS.map(s => ({
      estacaoId: s.id,
      nome: s.nome,
      setor: s.setor,
      incidentes: INCIDENTS.filter(i => estacaoDe(i.cameraId) === s.id).length,
    })),
    ultimosSeteDias: Array.from({ length: 7 }, (_, k) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - k));
      const anteriores = [8, 5, 12, 4, 9, 3];
      return {
        dia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        incidentes: k === 6 ? INCIDENTS.length : anteriores[k],
      };
    }),
  };
}
