export interface OnboardingData {
  company: string;
  cnpj: string;
  sector: string;
  logoUrl: string;
  logoName: string;
  accent: string;
  epis: string[];
  cas: Record<string, CaEntry>;
  picks: Record<string, string>;
  rolePreset?: string;
}

export interface CaEntry {
  ca?: string;
  validade?: string;
  fab?: string;
}

export interface Step {
  key: string;
  name: string;
  hint: string;
}

export interface EpiItem {
  key: string;
  name: string;
  nrm: string;
}

export interface Category {
  key: string;
  name: string;
  sub: string;
  required: boolean;
  slot: string;
}

export interface EpiOption {
  id: string;
  name: string;
  ca: string;
  tag: string;
  incompatible?: string[];
}

export interface RolePreset {
  id: string;
  name: string;
  picks: Record<string, string>;
}

export const STEPS: Step[] = [
  { key: 'identity', name: 'Identidade da empresa', hint: 'Marca · CNPJ · cor' },
  // Antes dos EPIs de propósito: sem câmera cadastrada o sistema não vê nada.
  { key: 'stations', name: 'Estações e câmeras', hint: 'O que será monitorado' },
  { key: 'epis', name: 'EPIs monitorados', hint: 'Seleção dos equipamentos' },
  { key: 'cas', name: 'CAs e validades', hint: 'Opcional · certificados' },
  { key: 'launch', name: 'Confirmação', hint: 'Revisar e iniciar' },
];

export const EPI_LIST: EpiItem[] = [
  { key: 'capacete', name: 'Capacete', nrm: 'NR-6 · CA' },
  { key: 'colete', name: 'Colete refletivo', nrm: 'ALTA VIS.' },
  { key: 'luvas', name: 'Luvas', nrm: 'NR-6' },
  { key: 'oculos', name: 'Óculos de proteção', nrm: 'NR-6' },
  { key: 'mascara', name: 'Máscara / Respirador', nrm: 'NR-15' },
  { key: 'auricular', name: 'Protetor auricular', nrm: 'NR-15' },
  { key: 'botas', name: 'Bota de segurança', nrm: 'NR-6' },
  { key: 'cinto', name: 'Cinto de segurança', nrm: 'NR-35' },
];

export const SECTORS: string[] = ['Metalurgia', 'Automotivo', 'Químico', 'Alimentício', 'Construção', 'Outros'];

export const PRESET_COLORS: string[] = ['#F4622A', '#2A6FDB', '#1F8A5B', '#C03E5C', '#7A4FDB', '#E0A93B'];

export const CATEGORIES: Category[] = [
  { key: 'cabeca', name: 'Cabeça', sub: 'Capacete', required: true, slot: 'capacete' },
  { key: 'olhos', name: 'Olhos · Face', sub: 'Óculos', required: true, slot: 'oculos' },
  { key: 'audicao', name: 'Audição', sub: 'Protetor', required: false, slot: 'auricular' },
  { key: 'respiracao', name: 'Respiração', sub: 'Máscara', required: false, slot: 'mascara' },
  { key: 'maos', name: 'Mãos', sub: 'Luvas', required: true, slot: 'luvas' },
  { key: 'corpo', name: 'Corpo', sub: 'Colete · Avental', required: true, slot: 'colete' },
  { key: 'pes', name: 'Pés', sub: 'Bota', required: true, slot: 'botas' },
  { key: 'altura', name: 'Altura', sub: 'Cinto · Linha de vida', required: false, slot: 'cinto' },
];

export const OPTIONS: Record<string, EpiOption[]> = {
  cabeca: [
    { id: 'cap-a', name: 'Capacete classe A', ca: 'CA 31.469', tag: 'Obrigatório · NR-6' },
    { id: 'cap-b', name: 'Capacete classe B · isolante', ca: 'CA 35.812', tag: 'Eletricistas' },
    { id: 'cap-j', name: 'Capacete com jugular', ca: 'CA 42.901', tag: 'Trabalho em altura' },
  ],
  olhos: [
    { id: 'oc-a', name: 'Óculos ampla visão', ca: 'CA 28.011', tag: 'Obrigatório' },
    { id: 'oc-s', name: 'Óculos solar escuro', ca: 'CA 30.224', tag: 'Solda · luz intensa' },
    { id: 'oc-fs', name: 'Protetor facial', ca: 'CA 37.105', tag: 'Esmerilhamento' },
  ],
  audicao: [
    { id: 'au-p', name: 'Protetor tipo plug', ca: 'CA 11.222', tag: 'Recomendado · NR-15' },
    { id: 'au-c', name: 'Protetor tipo concha', ca: 'CA 19.804', tag: 'Ambientes ≥ 85 dB' },
  ],
  respiracao: [
    { id: 're-p3', name: 'Respirador PFF3', ca: 'CA 38.118', tag: 'Particulados finos' },
    { id: 're-vp', name: 'Máscara full-face', ca: 'CA 41.207', tag: 'Vapores químicos', incompatible: ['oc-a', 'oc-s', 'oc-fs'] },
  ],
  maos: [
    { id: 'lv-vq', name: 'Luva vaqueta', ca: 'CA 28.401', tag: 'Obrigatório' },
    { id: 'lv-ni', name: 'Luva nitrílica', ca: 'CA 31.018', tag: 'Manuseio químico' },
    { id: 'lv-ar', name: 'Luva anticorte 5', ca: 'CA 36.221', tag: 'Corte / metal' },
  ],
  corpo: [
    { id: 'co-cv', name: 'Colete refletivo classe 2', ca: 'CA 29.776', tag: 'Obrigatório · alta vis.' },
    { id: 'co-av', name: 'Avental térmico de raspa', ca: 'CA 34.118', tag: 'Solda' },
  ],
  pes: [
    { id: 'bo-bk', name: 'Bota com bico de aço', ca: 'CA 26.318', tag: 'Obrigatório' },
    { id: 'bo-id', name: 'Bota isolante elétrica', ca: 'CA 39.044', tag: 'Eletricistas' },
  ],
  altura: [
    { id: 'al-c5', name: 'Cinto paraquedista 5 pontos', ca: 'CA 33.501', tag: 'Acima de 2 m' },
    { id: 'al-tr', name: 'Talabarte duplo com ABS', ca: 'CA 38.118', tag: 'Complementar' },
  ],
};

export const ROLE_PRESETS: RolePreset[] = [
  { id: 'machine', name: 'Operador de máquina', picks: { cabeca: 'cap-a', olhos: 'oc-a', audicao: 'au-c', maos: 'lv-vq', corpo: 'co-cv', pes: 'bo-bk' } },
  { id: 'welder', name: 'Soldador', picks: { cabeca: 'cap-a', olhos: 'oc-s', audicao: 'au-p', maos: 'lv-vq', corpo: 'co-av', pes: 'bo-bk' } },
  { id: 'height', name: 'Trabalho em altura', picks: { cabeca: 'cap-j', olhos: 'oc-a', maos: 'lv-vq', corpo: 'co-cv', pes: 'bo-bk', altura: 'al-c5' } },
  { id: 'storage', name: 'Almoxarife', picks: { cabeca: 'cap-a', olhos: 'oc-a', corpo: 'co-cv', pes: 'bo-bk' } },
  { id: 'chem', name: 'Operador químico', picks: { cabeca: 'cap-a', respiracao: 're-vp', maos: 'lv-ni', corpo: 'co-cv', pes: 'bo-bk' } },
];

export const DEFAULT_DATA: OnboardingData = {
  company: '', cnpj: '', sector: '', logoUrl: '', logoName: '',
  accent: '#F4622A', epis: [], cas: {}, picks: {},
};

export function deriveEpis(picks: Record<string, string>): string[] {
  const map: Record<string, string> = {
    cabeca: 'capacete', olhos: 'oculos', audicao: 'auricular',
    respiracao: 'mascara', maos: 'luvas', corpo: 'colete', pes: 'botas', altura: 'cinto',
  };
  return Object.entries(picks).filter(([, v]) => !!v).map(([k]) => map[k]).filter(Boolean);
}

export function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '').match(/.{1,2}/g);
  return m && m.length === 3 ? [parseInt(m[0], 16), parseInt(m[1], 16), parseInt(m[2], 16)] : [244, 98, 42];
}
export function accentRgba(h: string, a: number): string {
  const [r, g, b] = hexToRgb(h);
  return `rgba(${r},${g},${b},${a})`;
}
export function accentShade(h: string, pct: number): string {
  const [r, g, b] = hexToRgb(h);
  const f = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  return `rgb(${Math.round(r + (f - r) * p)},${Math.round(g + (f - g) * p)},${Math.round(b + (f - b) * p)})`;
}

export function cnpjMask(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
