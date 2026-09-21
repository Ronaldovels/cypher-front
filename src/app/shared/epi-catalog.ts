/**
 * Ponte entre as chaves em português usadas no onboarding/mannequin
 * (`capacete`, `colete`, ...) e o enum canônico que trafega com o backend e
 * o pipeline (`EpiTipo` — achado de campo 2026-09-20: 3 convenções soltas
 * coexistiam antes disso). `auricular` e `cinto` ficam de fora do mapa de
 * propósito: o modelo de detecção não tem classe pra eles, então nunca
 * poderiam ser confirmados como presentes/ausentes — continuam existindo
 * como registro local (mannequin, onboarding), mas nunca são enviados ao
 * checklist global nem aparecem como EPI exigível de zona.
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
 * `Incident.epiPresent`/`epiMissing` (do pipeline) não trafegam no formato
 * canônico do enum: `epiPresent` traz a classe crua do detector
 * (`HELMET`, `Goggles`, `boots`, ...) e `epiMissing` traz o violation_label
 * (`no_helmet`, `no_gloves`, ...) — ver `epi_catalog.py` no cypher-capture.
 * Estes dois mapas traduzem os dois formatos pro mesmo rótulo em PT.
 */
const DETECTOR_LABEL_TO_PT: Record<string, string> = {
  HELMET: 'Capacete',
  Goggles: 'Óculos de proteção',
  GLOVE: 'Luvas',
  VEST: 'Colete refletivo',
  boots: 'Bota de segurança',
  MASK: 'Máscara / Respirador',
};

const VIOLATION_LABEL_TO_PT: Record<string, string> = {
  no_helmet: 'Capacete',
  no_goggle: 'Óculos de proteção',
  no_gloves: 'Luvas',
  no_vest: 'Colete refletivo',
  no_boots: 'Bota de segurança',
  no_mask: 'Máscara / Respirador',
};

/** Traduz um item cru de `epiPresent`/`epiMissing` pro rótulo em PT; mantém o valor original se não reconhecido. */
export function epiFieldLabel(raw: string): string {
  return VIOLATION_LABEL_TO_PT[raw] ?? DETECTOR_LABEL_TO_PT[raw] ?? EPI_TIPO_LABEL[raw as EpiTipo] ?? raw;
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
