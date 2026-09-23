/**
 * Ponte entre as chaves em português usadas no onboarding/mannequin
 * (`capacete`, `colete`, ...) e o enum canônico que trafega com o backend e
 * o pipeline (`EpiTipo` — achado de campo 2026-09-20: 3 convenções soltas
 * coexistiam antes disso). Só existem os 6 EPIs que o modelo de detecção
 * reconhece — na UI e no contrato; `auricular` e `cinto` saíram de vez,
 * porque nunca poderiam ser confirmados como presentes/ausentes.
 */
export type EpiTipo = 'HELMET' | 'GOGGLES' | 'GLOVE' | 'VEST' | 'BOOTS' | 'MASK';

export const EPI_TIPO_LABEL: Record<EpiTipo, string> = {
  HELMET: 'Capacete',
  GOGGLES: 'Óculos de proteção',
  GLOVE: 'Luvas',
  VEST: 'Colete refletivo',
  BOOTS: 'Bota de segurança',
  MASK: 'Máscara / Respirador',
};

export const PT_KEY_TO_EPI_TIPO: Record<string, EpiTipo> = {
  capacete: 'HELMET',
  oculos: 'GOGGLES',
  luvas: 'GLOVE',
  colete: 'VEST',
  botas: 'BOOTS',
  mascara: 'MASK',
};

export function epiTipoLabel(tipo: string): string {
  return EPI_TIPO_LABEL[tipo as EpiTipo] ?? tipo;
}

/**
 * `Incident.epiPresent`/`epiMissing` chegam já no formato canônico
 * (`['HELMET', 'GOGGLES']`): o pipeline passou a enviar `EpiTipo` e a API
 * normaliza as linhas antigas na leitura. Valor desconhecido passa cru.
 */
export function epiFieldLabel(raw: string): string {
  return EPI_TIPO_LABEL[raw as EpiTipo] ?? raw;
}

/** Traduz as chaves PT do onboarding para o checklist canônico enviado ao backend. */
export function toEpiChecklist(ptKeys: string[]): EpiTipo[] {
  const vistos = new Set<EpiTipo>();
  for (const chave of ptKeys) {
    const tipo = PT_KEY_TO_EPI_TIPO[chave];
    if (tipo) vistos.add(tipo);
  }
  return [...vistos];
}

const EPI_TIPO_TO_PT_KEY: Partial<Record<EpiTipo, string>> = Object.fromEntries(
  Object.entries(PT_KEY_TO_EPI_TIPO).map(([chave, tipo]) => [tipo, chave]),
);

/** Traduz o checklist canônico do backend de volta para as chaves PT da grade. */
export function fromEpiChecklist(epis: EpiTipo[]): string[] {
  return epis.map(tipo => EPI_TIPO_TO_PT_KEY[tipo]).filter((k): k is string => !!k);
}
