import { Component, input, signal, computed, ElementRef, Renderer2, inject, OnDestroy, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

type DockPos = 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center' | 'left-center';

interface SnapZone { pos: DockPos; label: string; cx(): number; cy(): number; }
interface DockItem  { key: string; label: string; route?: string; badge?: number; alertDot?: boolean; }

const SNAP_ZONES: SnapZone[] = [
  { pos: 'bottom-center', label: 'Bottom · Center', cx: () => window.innerWidth / 2,       cy: () => window.innerHeight - 64 },
  { pos: 'bottom-left',   label: 'Bottom · Left',   cx: () => 168,                          cy: () => window.innerHeight - 64 },
  { pos: 'bottom-right',  label: 'Bottom · Right',  cx: () => window.innerWidth - 168,      cy: () => window.innerHeight - 64 },
  { pos: 'top-center',    label: 'Top · Center',    cx: () => window.innerWidth / 2,        cy: () => 116 },
  { pos: 'left-center',   label: 'Left · Vertical', cx: () => 68,                           cy: () => window.innerHeight / 2 },
];

const ITEMS: (DockItem | null)[] = [
  { key: 'dashboard', label: 'Dashboard',     route: '/dashboard' },
  { key: 'live',      label: 'Ao Vivo',       route: '/estacoes' },
  { key: 'alerts',    label: 'Alertas',       route: '/incidentes' },
  null,
  { key: 'heatmap',   label: 'Heatmap',       route: '/heatmap' },
  { key: 'placar',    label: 'Placar',        route: '/placar' },
  null,
  { key: 'team',      label: 'Colaboradores', route: '/config/equipe' },
  { key: 'invite',    label: 'Cadastrar' },
  null,
  { key: 'config',    label: 'Configurações',   route: '/config/estacoes' },
];

function nearestZone(x: number, y: number): DockPos {
  let best = SNAP_ZONES[0], bestD = Infinity;
  for (const z of SNAP_ZONES) {
    const d = (x - z.cx()) ** 2 + (y - z.cy()) ** 2;
    if (d < bestD) { bestD = d; best = z; }
  }
  return best.pos;
}

@Component({
  selector: 'app-dock',
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    <!-- Snap zones overlay -->
    <div [class]="'snap-zones' + (dragging() ? ' visible' : '')">
      @for (z of snapZones; track z.pos) {
        <div [class]="'snap-zone ' + z.pos + (targetZone() === z.pos ? ' target' : '')">
          <span class="sz-label">{{ z.label }}</span>
        </div>
      }
    </div>

    <!-- Toast -->
    <div [class]="'dock-toast' + (toast() ? ' show' : '')">
      <span class="dot"></span>Dock reposicionado
    </div>

    <!-- Dock -->
    <div #wrapRef
         [class]="'dock-wrap snap-anim' + (dragging() ? ' dragging' : '') + (isVertical() ? ' vertical' : '')"
         [attr.data-pos]="dragging() ? '' : position()"
         [style.left.px]="dragging() ? dragPoint().x - dragOffset().x : null"
         [style.top.px]="dragging()  ? dragPoint().y - dragOffset().y : null"
         [style.right]="dragging()   ? 'auto' : null"
         [style.bottom]="dragging()  ? 'auto' : null"
         [style.transform]="dragging() ? 'none' : null"
         [style.padding]="dragging()   ? '0' : null"
         (mouseenter)="armHandle()"
         (mousemove)="armHandle()"
         (mouseleave)="disarmHandle()">
      <div class="dock">
        <div [class]="'dock-handle' + (handleVisible() ? ' visible' : '')"
             (mousedown)="onHandleMouseDown($event)"
             title="Arrastar para reposicionar"></div>

        @for (item of items; track $index) {
          @if (!item) {
            <div class="dock-sep"></div>
          } @else if (item.route) {
            <a [routerLink]="item.route"
               [class]="'dock-item' + (activeKey() === item.key ? ' active' : '')"
               [attr.aria-label]="item.label">
              <div class="dock-icon">
                <ng-container *ngTemplateOutlet="iconTpl; context: { key: item.key }"/>
                @if (item.badge) { <span class="dock-badge">{{ item.badge }}</span> }
                @if (item.alertDot) { <span class="dock-dot"></span> }
              </div>
              <span class="dock-label">{{ item.label }}</span>
              <span class="dock-tooltip">{{ item.label }}</span>
            </a>
          } @else {
            <button [class]="'dock-item' + (activeKey() === item.key ? ' active' : '')"
                    [attr.aria-label]="item.label">
              <div class="dock-icon">
                <ng-container *ngTemplateOutlet="iconTpl; context: { key: item.key }"/>
                @if (item.badge) { <span class="dock-badge">{{ item.badge }}</span> }
                @if (item.alertDot) { <span class="dock-dot"></span> }
              </div>
              <span class="dock-label">{{ item.label }}</span>
              <span class="dock-tooltip">{{ item.label }}</span>
            </button>
          }
        }
      </div>
    </div>

    <!-- Icon templates -->
    <ng-template #iconTpl let-key="key">
      @switch (key) {
        @case ('dashboard') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/>
            <rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>
          </svg>
        }
        @case ('live') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="6.5" width="13" height="11" rx="2"/><path d="M15.5 10.5 L21 7 V17 L15.5 13.5 Z"/>
          </svg>
        }
        @case ('alerts') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 16c0-7 1.5-10 6-10s6 3 6 10"/><path d="M4.5 16h15"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/>
          </svg>
        }
        @case ('heatmap') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
            <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" stroke="none" opacity="0.55"/>
            <rect x="15.5" y="3.5" width="5" height="5" fill="currentColor" stroke="none" opacity="0.3"/>
          </svg>
        }
        @case ('placar') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 20V10M12 20V4M18 20v-7"/><path d="M3 20h18"/>
          </svg>
        }
        @case ('team') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
            <circle cx="17" cy="9" r="2.5"/><path d="M15.5 20c0-2.4 1.8-4.4 4-5"/>
          </svg>
        }
        @case ('invite') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="8" r="3.5"/><path d="M3 20c0-3.8 3-6.8 7-6.8"/>
            <path d="M18 14v6M15 17h6"/>
          </svg>
        }
        @case ('config') {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7h7M14 7h7"/><circle cx="12" cy="7" r="2"/>
            <path d="M3 17h11M18 17h3"/><circle cx="16" cy="17" r="2"/>
          </svg>
        }
        @default {
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"/>
          </svg>
        }
      }
    </ng-template>
  `,
})
export class DockComponent implements OnDestroy {
  activeKey = input<string>('dashboard');

  private readonly wrapRef = viewChild<ElementRef>('wrapRef');
  private readonly renderer  = inject(Renderer2);

  readonly snapZones  = SNAP_ZONES;
  readonly items      = ITEMS;

  position      = signal<DockPos>(this.loadPos());
  handleVisible = signal(false);
  dragging      = signal(false);
  dragOffset    = signal({ x: 0, y: 0 });
  dragPoint     = signal({ x: 0, y: 0 });
  targetZone    = signal<DockPos | null>(null);
  toast         = signal(false);

  isVertical = computed(() => this.position() === 'left-center');

  private stillTimer?: ReturnType<typeof setTimeout>;
  private moveCleanup?: () => void;
  private upCleanup?: () => void;
  private lastPoint = { x: 0, y: 0 };

  private loadPos(): DockPos {
    try { return (localStorage.getItem('cypher.dockPos') as DockPos) || 'bottom-center'; }
    catch { return 'bottom-center'; }
  }

  armHandle() {
    if (this.dragging()) return;
    clearTimeout(this.stillTimer);
    this.stillTimer = setTimeout(() => this.handleVisible.set(true), 600);
  }

  disarmHandle() {
    clearTimeout(this.stillTimer);
    this.handleVisible.set(false);
  }

  onHandleMouseDown(e: MouseEvent) {
    e.preventDefault();
    const el = this.wrapRef()?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.dragOffset.set({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    this.lastPoint = { x: e.clientX, y: e.clientY };
    this.dragPoint.set(this.lastPoint);
    this.dragging.set(true);
    this.handleVisible.set(true);

    this.moveCleanup = this.renderer.listen('window', 'mousemove', (ev: MouseEvent) => {
      this.lastPoint = { x: ev.clientX, y: ev.clientY };
      this.dragPoint.set({ ...this.lastPoint });
      this.targetZone.set(nearestZone(ev.clientX, ev.clientY));
    });

    this.upCleanup = this.renderer.listen('window', 'mouseup', () => {
      const pos = nearestZone(this.lastPoint.x, this.lastPoint.y);
      this.position.set(pos);
      try { localStorage.setItem('cypher.dockPos', pos); } catch {}
      this.dragging.set(false);
      this.targetZone.set(null);
      this.toast.set(true);
      setTimeout(() => this.toast.set(false), 1800);
      this.moveCleanup?.();
      this.upCleanup?.();
    });
  }

  ngOnDestroy() {
    clearTimeout(this.stillTimer);
    this.moveCleanup?.();
    this.upCleanup?.();
  }
}
