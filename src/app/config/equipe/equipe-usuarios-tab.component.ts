import { Component, signal } from '@angular/core';

import { EquipesConfigComponent } from './equipes-config.component';
import { UsuariosConfigComponent } from './usuarios-config.component';

type SubAba = 'equipes' | 'usuarios';

/**
 * Aba "Equipes e usuários" de `/config/equipe` — hospeda duas sub-abas
 * internas (design doc de E4, §4.2), sem rota própria para cada uma: mesmo
 * padrão de alternância local que `IdentityTabComponent` usa para o tema, só
 * que trocando o painel inteiro em vez de um valor.
 */
@Component({
  selector: 'app-equipe-usuarios-tab',
  imports: [EquipesConfigComponent, UsuariosConfigComponent],
  templateUrl: './equipe-usuarios-tab.component.html',
})
export class EquipeUsuariosTabComponent {
  readonly subaba = signal<SubAba>('equipes');

  irPara(s: SubAba): void {
    this.subaba.set(s);
  }
}
