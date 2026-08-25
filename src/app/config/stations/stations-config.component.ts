import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { CatalogService } from '../../shared/catalog.service';
import { CODIGO_PADRAO, mensagemDeErro } from '../../shared/incident.models';

interface FormEstacao { id: string; nome: string; setor: string; }
interface FormCamera {
  id: string; nome: string; estacaoId: string; streamUrl: string; fonte: string;
}

const ESTACAO_VAZIA: FormEstacao = { id: '', nome: '', setor: '' };
const CAMERA_VAZIA: FormCamera = {
  id: '', nome: '', estacaoId: '', streamUrl: '', fonte: '',
};

/**
 * Cadastro de estações e câmeras.
 *
 * Não conhece rota nem onboarding: recebe e emite. O encaixe no wizard é
 * feito por um embrulho, para que exista um formulário e não dois.
 */
@Component({
  selector: 'app-stations-config',
  templateUrl: './stations-config.component.html',
  styleUrl: './stations-config.component.scss',
})
export class StationsConfigComponent implements OnInit {
  private catalog = inject(CatalogService);

  readonly estacoes = this.catalog.stations;
  readonly erro = signal('');
  readonly salvando = signal(false);

  readonly novaEstacao = signal<FormEstacao>({ ...ESTACAO_VAZIA });
  readonly novaCamera = signal<FormCamera>({ ...CAMERA_VAZIA });

  /**
   * Último token visto — de um cadastro/edição de estação ou de uma
   * rotação explícita. Não persiste: o backend não expõe leitura (design
   * doc §2.4), então sair desta tela e voltar apaga o valor, de propósito.
   */
  readonly tokenVisto = signal<{ estacaoId: string; token: string } | null>(null);

  /** Verdadeiro quando o sistema tem ao menos uma câmera ativa vendo algo. */
  readonly cadastroCompleto = computed(() =>
    this.estacoes().some(e => e.ativa && e.cameras.length > 0));

  ngOnInit(): void {
    // Inclui inativas: é preciso vê-las para poder reativá-las.
    this.catalog.load(true);
  }

  camerasDe(estacaoId: string) {
    return this.estacoes().find(e => e.id === estacaoId)?.cameras ?? [];
  }

  salvarEstacao(): void {
    const form = this.novaEstacao();
    const problema = this.validarCodigo(form.id, 'EST-01') ?? this.validarNome(form.nome);
    if (problema) {
      this.erro.set(problema);
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.catalog.createStation({
      id: form.id,
      nome: form.nome.trim(),
      setor: form.setor.trim() || null,
    }).subscribe({
      next: resp => {
        this.tokenVisto.set({ estacaoId: resp.id, token: resp.token });
        this.novaEstacao.set({ ...ESTACAO_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        // Não limpa o formulário: o gestor corrige em vez de redigitar.
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  /**
   * Único jeito de ver o token depois do cadastro inicial (design doc §2.4)
   * — rotaciona e mostra o valor novo; o antigo para de funcionar.
   */
  gerarToken(id: string): void {
    this.erro.set('');
    this.catalog.regenerateStationToken(id).subscribe({
      next: resp => this.tokenVisto.set({ estacaoId: resp.id, token: resp.token }),
      error: e => this.erro.set(mensagemDeErro(e)),
    });
  }

  salvarCamera(): void {
    const form = this.novaCamera();
    const problema = this.validarCodigo(form.id, 'CAM-01')
      ?? this.validarNome(form.nome)
      ?? this.validarEstacao(form.estacaoId)
      ?? this.validarStreamUrl(form.streamUrl);
    if (problema) {
      this.erro.set(problema);
      return;
    }

    this.erro.set('');
    this.salvando.set(true);
    this.catalog.createCamera({
      id: form.id,
      nome: form.nome.trim(),
      estacaoId: form.estacaoId,
      streamUrl: form.streamUrl.trim(),
      fonte: form.fonte.trim() || null,
    }).subscribe({
      next: () => {
        this.novaCamera.set({ ...CAMERA_VAZIA });
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  desativarEstacao(id: string): void {
    this.catalog.deactivateStation(id).subscribe({
      error: e => this.erro.set(mensagemDeErro(e)),
    });
  }

  desativarCamera(id: string): void {
    this.catalog.deactivateCamera(id).subscribe({
      error: e => this.erro.set(mensagemDeErro(e)),
    });
  }

  reativarEstacao(id: string): void {
    const atual = this.estacoes().find(e => e.id === id);
    if (!atual) {
      return;
    }
    this.catalog.updateStation(id, {
      id, nome: atual.nome, setor: atual.setor, ativa: true,
    }).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  // ------------------------------------------------------------------
  // Validação de forma, feita aqui para não gastar ida à API
  // ------------------------------------------------------------------

  private validarCodigo(codigo: string, exemplo: string): string | null {
    if (!CODIGO_PADRAO.test(codigo)) {
      return `Código inválido. Use letras maiúsculas e números com um hífen, como ${exemplo}.`;
    }
    return null;
  }

  private validarNome(nome: string): string | null {
    return nome.trim() ? null : 'Informe um nome.';
  }

  private validarEstacao(estacaoId: string): string | null {
    return estacaoId ? null : 'Escolha a estação que esta câmera cobre.';
  }

  private validarStreamUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (!parsed.port) {
        // O MJPEG não serve em 80 nem 443, e o backend deriva a porta desta URL.
        return 'A URL do stream precisa de porta explícita, como http://127.0.0.1:8090/stream.';
      }
      return null;
    } catch {
      return 'URL do stream inválida.';
    }
  }
}
