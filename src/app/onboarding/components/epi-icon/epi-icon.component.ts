import { Component, input } from '@angular/core';

@Component({
  selector: 'app-epi-icon',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" fill="none"
         [attr.stroke]="color()" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      @switch (key()) {
        @case ('capacete') {
          <path d="M5 22h22"/>
          <path d="M6 22c0-7 4.5-11 10-11s10 4 10 11"/>
          <path d="M14 11V7h4v4"/>
          <path d="M10 16h12"/>
        }
        @case ('colete') {
          <path d="M9 6l3 4h8l3-4"/>
          <path d="M9 6l-2 4v16h18V10l-2-4"/>
          <path d="M16 10v16"/>
          <path d="M11 16h2M19 16h2"/>
        }
        @case ('luvas') {
          <path d="M10 27V13c0-1 .8-2 2-2s2 1 2 2v3"/>
          <path d="M14 16v-5c0-1 .8-2 2-2s2 1 2 2v5"/>
          <path d="M18 16v-3c0-1 .8-2 2-2s2 1 2 2v6"/>
          <path d="M22 19v-2c0-1 .8-2 2-2s2 1 2 2v6c0 3-2 6-5 6h-7c-3 0-4-2-4-4"/>
        }
        @case ('oculos') {
          <circle cx="9" cy="17" r="5"/>
          <circle cx="23" cy="17" r="5"/>
          <path d="M14 17h4"/>
          <path d="M4 13l3-2M28 13l-3-2"/>
        }
        @case ('mascara') {
          <path d="M6 12c0-2 2-3 4-3l3 1h6l3-1c2 0 4 1 4 3v8c0 2-2 3-4 3l-3-1h-6l-3 1c-2 0-4-1-4-3z"/>
          <path d="M11 14l-4-2M21 14l4-2M11 21l-4 2M21 21l4 2"/>
          <path d="M11 16h10M11 19h10"/>
        }
        @case ('botas') {
          <path d="M9 6h5v14"/>
          <path d="M9 20v-6"/>
          <path d="M14 20l9 2c2 .5 3 1 3 3v1H6v-2c0-2 1-3 3-4z"/>
          <path d="M14 12h4"/>
        }
      }
    </svg>
  `,
})
export class EpiIconComponent {
  key = input.required<string>();
  size = input<number>(28);
  color = input<string>('currentColor');
}
