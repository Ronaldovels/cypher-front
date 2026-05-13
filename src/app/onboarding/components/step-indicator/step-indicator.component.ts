import { Component, input } from '@angular/core';

@Component({
  selector: 'app-step-indicator',
  template: `
    <div class="stepind">
      @for (i of indices(); track i) {
        <div class="seg" [class.done]="i < current()" [class.current]="i === current()">
          <div class="fill"></div>
        </div>
      }
      <span class="counter">{{ pad(current() + 1) }} / {{ pad(total()) }}</span>
    </div>
  `,
})
export class StepIndicatorComponent {
  current = input.required<number>();
  total = input.required<number>();

  indices() { return Array.from({ length: this.total() }, (_, i) => i); }
  pad(n: number) { return String(n).padStart(2, '0'); }
}
