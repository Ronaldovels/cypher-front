import { Component, OnInit, inject, signal } from '@angular/core';

import { CatalogService } from '../../shared/catalog.service';
import { CODIGO_PADRAO, mensagemDeErro } from '../../shared/incident.models';
import { EquipePayload, Turno } from '../../shared/team.models';
import { TeamService } from '../../shared/team.service';

interface FormEquipe {
  id: string; nome: string; turno: Turno; estacaoIds: string[];
  metaConformidade: number | null; metaZeroSeveridade4Ativa: boolean;
  metaTempoReconhecimentoSegundos: number | null;
}

const EQUIPE_VAZIA: FormEquipe = {
  id: '', nome: '', turno: 'MANHA', estacaoIds: [],
  metaConformidade: null, metaZeroSeveridade4Ativa: false, metaTempoReconhecimentoSegundos: null,
};

/**
 * Cadastro de equipes — sub-aba "Equipes" de `/config/equipe`.
 *
 * Mesmo padrão de `StationsConfigComponent`: rascunho local + lista, sem
 * FormGroup. A alocação de estações é um toggle de chips, não um `<select
 * multiple>` — mais fácil de operar com o mouse numa tela de cadastro.
 */
@Component({
  selector: 'app-equipes-config',
  templateUrl: './equipes-config.component.html',
})
export class EquipesConfigComponent implements OnInit {
  private team = inject(TeamService);
  private catalog = inject(CatalogService);

  readonly equipes = this.team.equipes;
  readonly estacoes = this.catalog.stations;
  readonly turnos: Turno[] = ['MANHA', 'TARDE', 'NOITE'];

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novaEquipe = signal<FormEquipe>({ ...EQUIPE_VAZIA });

  ngOnInit(): void {
    this.team.load();
    this.catalog.load();
  }

  alternarEstacao(estacaoId: string): void {
    this.novaEquipe.update(f => ({
      ...f,
      estacaoIds: f.estacaoIds.includes(estacaoId)
        ? f.estacaoIds.filter(id => id !== estacaoId)
        : [...f.estacaoIds, estacaoId],
    }));
  }

  salvar(): void {
    const form = this.novaEquipe();
    if (!CODIGO_PADRAO.test(form.id)) {
      this.erro.set('Código inválido. Use letras maiúsculas e números com um hífen, como EQ-01.');
      return;
    }
    if (!form.nome.trim()) {
      this.erro.set('Informe um nome.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    const payload: EquipePayload = {
      id: form.id, nome: form.nome.trim(), turno: form.turno, estacaoIds: form.estacaoIds,
      metaConformidade: form.metaConformidade,
      metaZeroSeveridade4Ativa: form.metaZeroSeveridade4Ativa,
      metaTempoReconhecimentoSegundos: form.metaTempoReconhecimentoSegundos,
    };
    this.team.createEquipe(payload).subscribe({
      next: () => {
        this.novaEquipe.set({ ...EQUIPE_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativar(id: string): void {
    this.team.deleteEquipe(id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  // Arrow function: o template passa esta referência direto para
  // `estacaoIds.map(nomeEstacao)`, sem `.bind(this)` — um método de classe
  // comum perderia o `this` nesse uso.
  nomeEstacao = (id: string): string => {
    return this.estacoes().find(e => e.id === id)?.nome ?? id;
  };
}
