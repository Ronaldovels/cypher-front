import { Component, OnInit, inject, signal } from '@angular/core';

import { mensagemDeErro } from '../../shared/incident.models';
import { Papel } from '../../shared/auth/auth.models';
import { CatalogService } from '../../shared/catalog.service';
import { TeamService } from '../../shared/team.service';

interface FormUsuario { username: string; papel: Papel; password: string; estacaoId: string; }

const USUARIO_VAZIO: FormUsuario = { username: '', papel: 'OPERADOR', password: '', estacaoId: '' };

/**
 * Cadastro de usuários — sub-aba "Usuários" de `/config/equipe`.
 *
 * Username/papel/senha (design doc de E4, §4.2) mais `estacaoId` quando o
 * papel é OPERADOR (revisão pós-E4: login por usuário/senha vinculado a uma
 * estação, além do token). Sem tela de "esqueci minha senha" nesta entrega,
 * redefinir é a única ação sensível de edição.
 */
@Component({
  selector: 'app-usuarios-config',
  templateUrl: './usuarios-config.component.html',
})
export class UsuariosConfigComponent implements OnInit {
  private team = inject(TeamService);
  private catalog = inject(CatalogService);

  readonly usuarios = this.team.usuarios;
  readonly estacoes = this.catalog.stations;
  readonly papeis: Papel[] = ['GESTOR', 'OPERADOR'];

  readonly erro = signal('');
  readonly salvando = signal(false);
  readonly novoUsuario = signal<FormUsuario>({ ...USUARIO_VAZIO });

  ngOnInit(): void {
    this.team.load();
    this.catalog.load();
  }

  nomeEstacao = (id?: string): string => this.estacoes().find(e => e.id === id)?.nome ?? id ?? '';

  salvar(): void {
    const form = this.novoUsuario();
    if (!form.username.trim()) {
      this.erro.set('Informe um usuário.');
      return;
    }
    if (!form.password) {
      this.erro.set('Informe uma senha para o cadastro.');
      return;
    }
    if (form.papel === 'OPERADOR' && !form.estacaoId) {
      this.erro.set('Selecione a estação do operador.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.team.createUsuario({
      username: form.username.trim(), papel: form.papel, password: form.password,
      estacaoId: form.papel === 'OPERADOR' ? form.estacaoId : undefined,
    }).subscribe({
      next: () => {
        this.novoUsuario.set({ ...USUARIO_VAZIO });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  remover(username: string): void {
    this.team.deleteUsuario(username).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }
}
