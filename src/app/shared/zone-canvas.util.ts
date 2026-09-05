import { Ponto } from './zone.models';

/** Vértice em pixel do canvas atual — nunca persistido assim, só usado durante o desenho. */
export interface PixelPonto {
  x: number;
  y: number;
}

/** Pixel do canvas -> fração 0.0–1.0 (o que vai no `ZonePayload`). */
export function paraNormalizado(vertices: PixelPonto[], largura: number, altura: number): Ponto[] {
  return vertices.map(v => ({ x: v.x / largura, y: v.y / altura }));
}

/** Fração 0.0–1.0 -> pixel do canvas atual (usado ao carregar uma zona já cadastrada). */
export function paraPixel(polygon: Ponto[], largura: number, altura: number): PixelPonto[] {
  return polygon.map(p => ({ x: p.x * largura, y: p.y * altura }));
}
