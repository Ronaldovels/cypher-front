import { Component, input } from '@angular/core';
import { Step } from '../../models/onboarding.models';

@Component({
  selector: 'app-checklist',
  template: `
    <ul class="checklist">
      @for (s of steps(); track s.key; let i = $index) {
        <li [class.done]="i < current()" [class.current]="i === current()">
          <div class="marker">
            @if (i < current()) { ✓ }
            @else if (i === current()) { ◉ }
            @else { {{ pad(i + 1) }} }
          </div>
          <div class="step-info">
            <div class="step-name">{{ s.name }}</div>
            <div class="step-hint">{{ s.hint }}</div>
          </div>
        </li>
      }
    </ul>
  `,
})
export class ChecklistComponent {
  steps = input.required<Step[]>();
  current = input.required<number>();
  pad(n: number) { return String(n).padStart(2, '0'); }
}
