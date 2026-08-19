import { describe, expect, it } from 'vitest';
import { formatTime, incidentLabel, severityClass } from './incident.models';

describe('severityClass', () => {
  it('mapeia a severidade crua para a classe visual do heatmap', () => {
    expect(severityClass(0)).toBe('ok');
    expect(severityClass(1)).toBe('low');
    expect(severityClass(2)).toBe('mid');
    expect(severityClass(3)).toBe('hi');
    expect(severityClass(4)).toBe('hi');
  });
});

describe('incidentLabel', () => {
  it('descreve cada tipo em português', () => {
    expect(incidentLabel('FALL_RISK')).toBe('Queda / risco imediato');
    expect(incidentLabel('ERGONOMIC_RISK')).toBe('Postura inadequada');
    expect(incidentLabel('ZONE_VIOLATION')).toBe('Zona de risco');
    expect(incidentLabel('EPI_VIOLATION')).toBe('EPI ausente');
  });
});

describe('formatTime', () => {
  it('extrai hora e minuto de um instante com offset', () => {
    expect(formatTime('2026-08-10T14:31:02.482-03:00')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('preserva o horário local do evento, não o do navegador', () => {
    // O offset vem no próprio instante; 14:31 em -03:00 é o que aconteceu na planta.
    expect(formatTime('2026-08-10T14:31:02.482-03:00')).toBe('14:31');
  });
});
