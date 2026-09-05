/** `Zona` — design doc de zonas de risco, §2. */

export type ZoneType = 'RESTRICTED' | 'ATTENTION';

/** Vértice em fração 0.0–1.0 da largura/altura do frame — nunca pixel absoluto. */
export interface Ponto {
  x: number;
  y: number;
}

export interface Zone {
  id: number;
  cameraId: string;
  nome: string;
  zoneType: ZoneType;
  polygon: Ponto[];
  severity: number;
  requiredPpe: string[];
  ativa: boolean;
}

export interface ZonePayload {
  nome: string;
  zoneType: ZoneType;
  polygon: Ponto[];
  severity: number;
  requiredPpe: string[];
}
