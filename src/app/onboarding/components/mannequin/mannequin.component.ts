import { Component, input, computed } from '@angular/core';
import { EPI_CATEGORIA } from '../../models/onboarding.models';

@Component({
  selector: 'app-mannequin',
  templateUrl: './mannequin.component.html',
})
export class MannequinComponent {
  picks = input<Record<string, string>>({});
  activeSlot = input<string | null>(null);
  complete = input<boolean>(false);
  accent = input<string>('#F4622A');

  private catBySlot(slot: string): string | undefined {
    return EPI_CATEGORIA[slot];
  }

  isOn(slot: string): boolean { return !!this.picks()[this.catBySlot(slot) ?? '']; }
  isActive(slot: string): boolean { return this.catBySlot(slot) === this.activeSlot(); }
  isRequired(slot: string): boolean {
    return ['capacete', 'oculos', 'luvas', 'colete', 'botas'].includes(slot);
  }
  pickId(cat: string): string | undefined { return this.picks()[cat]; }

  layerClass(slot: string): string {
    const on = this.isOn(slot);
    const active = this.isActive(slot);
    const req = this.isRequired(slot);
    if (on) return 'epi-layer is-on';
    if (active) return 'epi-layer is-ghost is-active';
    if (req) return 'epi-layer is-ghost is-required';
    return 'epi-layer is-ghost';
  }

  capColor = computed(() => {
    const p = this.pickId('cabeca');
    if (p === 'cap-b') return '#E84A2F';
    if (p === 'cap-j') return '#1A6FE0';
    return this.accent();
  });
  coleteColor = computed(() => this.pickId('corpo') === 'co-av' ? '#8B5A2B' : this.accent());
  luvaColor = computed(() => {
    const p = this.pickId('maos');
    if (p === 'lv-ni') return '#2D7A38';
    if (p === 'lv-ar') return '#2A5BB0';
    return this.accent();
  });
  oculoStyle = computed(() => {
    const p = this.pickId('olhos');
    if (p === 'oc-s') return 'dark';
    if (p === 'oc-fs') return 'face';
    return 'std';
  });
  respFull = computed(() => this.pickId('respiracao') === 're-vp');
  isApron = computed(() => this.pickId('corpo') === 'co-av');
  isInsulating = computed(() => this.pickId('pes') === 'bo-id');
  hasJugular = computed(() => this.pickId('cabeca') === 'cap-j');
}
