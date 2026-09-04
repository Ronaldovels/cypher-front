import { describe, expect, it } from 'vitest';

import { paraNormalizado, paraPixel } from './zone-canvas.util';

describe('conversão pixel ↔ normalizado (design doc de zonas de risco, §4.3)', () => {
  it('paraNormalizado divide cada vértice pela largura/altura do canvas', () => {
    const resultado = paraNormalizado([{ x: 320, y: 180 }, { x: 960, y: 540 }], 1280, 720);

    expect(resultado).toEqual([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }]);
  });

  it('paraPixel multiplica cada vértice pela largura/altura do canvas', () => {
    const resultado = paraPixel([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }], 1280, 720);

    expect(resultado).toEqual([{ x: 320, y: 180 }, { x: 960, y: 540 }]);
  });

  it('as duas conversões são inversas uma da outra', () => {
    const originais = [{ x: 100, y: 200 }, { x: 300, y: 400 }, { x: 50, y: 600 }];

    const idaEVolta = paraPixel(paraNormalizado(originais, 1920, 1080), 1920, 1080);

    expect(idaEVolta).toEqual(originais);
  });
});
