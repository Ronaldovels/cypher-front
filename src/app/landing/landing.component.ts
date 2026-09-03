import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Tela de entrada (design doc de multi-tenant, §5): duas ações lado a lado,
 * sem depender de nenhum estado global — substitui o guard `canActivateOnboarding`,
 * que checava um booleano que deixou de fazer sentido com várias empresas coexistindo.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.component.html',
})
export class LandingComponent {
}
