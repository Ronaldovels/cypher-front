import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';

import { ConfigService } from '../../shared/config.service';
import { mensagemDeErro } from '../../shared/incident.models';
import { PixelPonto, paraNormalizado, paraPixel } from '../../shared/zone-canvas.util';
import { Zone, ZonePayload, ZoneType } from '../../shared/zone.models';
import { ZoneService } from '../../shared/zone.service';

interface FormZona { nome: string; zoneType: ZoneType; severity: number; requiredPpe: string[]; }
const FORM_VAZIO: FormZona = { nome: '', zoneType: 'RESTRICTED', severity: 3, requiredPpe: [] };

/**
 * Editor de zonas de risco (design doc de zonas de risco, §4.2/§4.3): congela
 * um frame do MJPEG num canvas e desenha o polígono por cima. Único
 * componente do produto que não reaproveita `.field`/`.input` para o desenho
 * em si — exceção deliberada, justificada na spec (§4).
 *
 * `jsdom` não implementa `<canvas>.getContext('2d')` de verdade — todo
 * método de desenho guarda contra contexto nulo, e os specs testam estado
 * (vértices, formulário, chamadas HTTP), nunca pixel renderizado.
 */
@Component({
  selector: 'app-zone-editor',
  templateUrl: './zone-editor.component.html',
})
export class ZoneEditorComponent implements OnInit {
  readonly codigo = input.required<string>();
  readonly streamUrl = input<string | null>(null);

  private zoneService = inject(ZoneService);
  private configService = inject(ConfigService);

  readonly zonas = this.zoneService.zonas;
  readonly episDisponiveis = computed(() => this.configService.config()?.epis ?? []);

  readonly imgRef = viewChild<ElementRef<HTMLImageElement>>('liveImg');
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  readonly frameCapturado = signal(false);
  readonly canvasWidth = signal(0);
  readonly canvasHeight = signal(0);

  readonly vertices = signal<PixelPonto[]>([]);
  readonly poligonoFechado = signal(false);
  readonly editandoId = signal<number | null>(null);

  readonly form = signal<FormZona>({ ...FORM_VAZIO });
  readonly erro = signal('');
  readonly salvando = signal(false);

  ngOnInit(): void {
    this.zoneService.load(this.codigo());
  }

  capturarFrame(): void {
    const img = this.imgRef()?.nativeElement;
    const canvas = this.canvasRef()?.nativeElement;
    if (!img || !canvas || !img.naturalWidth) {
      this.erro.set('Aguarde a imagem da câmera carregar antes de capturar o frame.');
      return;
    }
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    this.canvasWidth.set(img.naturalWidth);
    this.canvasHeight.set(img.naturalHeight);
    this.frameCapturado.set(true);
    this.erro.set('');
    this.redesenhar();
  }

  onCanvasClick(event: MouseEvent): void {
    if (!this.frameCapturado() || this.poligonoFechado()) {
      return;
    }
    this.vertices.update(v => [...v, this.posicaoNoCanvas(event)]);
    this.redesenhar();
  }

  fecharPoligono(): void {
    if (this.vertices().length < 3) {
      this.erro.set('Um polígono precisa de ao menos 3 vértices.');
      return;
    }
    this.poligonoFechado.set(true);
    this.erro.set('');
  }

  removerUltimoVertice(): void {
    this.vertices.update(v => v.slice(0, -1));
    this.redesenhar();
  }

  private posicaoNoCanvas(event: MouseEvent): PixelPonto {
    const canvas = this.canvasRef()!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const escalaX = rect.width ? canvas.width / rect.width : 1;
    const escalaY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * escalaX,
      y: (event.clientY - rect.top) * escalaY,
    };
  }

  private redesenhar(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const img = this.imgRef()?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !img) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    this.desenharPoligono(ctx, this.vertices());
  }

  private desenharPoligono(ctx: CanvasRenderingContext2D, vertices: PixelPonto[]): void {
    if (vertices.length === 0) {
      return;
    }
    ctx.strokeStyle = '#F4622A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    vertices.slice(1).forEach(v => ctx.lineTo(v.x, v.y));
    if (this.poligonoFechado()) {
      ctx.closePath();
    }
    ctx.stroke();
    vertices.forEach(v => {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F4622A';
      ctx.fill();
    });
  }

  salvar(): void {
    const f = this.form();
    if (!f.nome.trim()) {
      this.erro.set('Informe um nome.');
      return;
    }
    if (this.vertices().length < 3) {
      this.erro.set('Feche o polígono antes de salvar.');
      return;
    }
    if (f.severity < 1 || f.severity > 4) {
      this.erro.set('Severidade deve estar entre 1 e 4.');
      return;
    }

    const payload: ZonePayload = {
      nome: f.nome.trim(),
      zoneType: f.zoneType,
      polygon: paraNormalizado(this.vertices(), this.canvasWidth(), this.canvasHeight()),
      severity: f.severity,
      requiredPpe: f.requiredPpe,
    };

    this.erro.set('');
    this.salvando.set(true);
    const id = this.editandoId();
    const acao = id != null
      ? this.zoneService.update(this.codigo(), id, payload)
      : this.zoneService.create(this.codigo(), payload);
    acao.subscribe({
      next: () => {
        this.reiniciarDesenho();
        this.salvando.set(false);
      },
      error: e => {
        this.erro.set(mensagemDeErro(e));
        this.salvando.set(false);
      },
    });
  }

  editar(zona: Zone): void {
    this.editandoId.set(zona.id);
    this.form.set({
      nome: zona.nome, zoneType: zona.zoneType, severity: zona.severity, requiredPpe: [...zona.requiredPpe],
    });
    this.vertices.set(paraPixel(zona.polygon, this.canvasWidth(), this.canvasHeight()));
    this.poligonoFechado.set(true);
    this.redesenhar();
  }

  desativar(id: number): void {
    this.zoneService.deactivate(this.codigo(), id).subscribe({ error: e => this.erro.set(mensagemDeErro(e)) });
  }

  alternarPpe(epi: string): void {
    this.form.update(f => ({
      ...f,
      requiredPpe: f.requiredPpe.includes(epi) ? f.requiredPpe.filter(e => e !== epi) : [...f.requiredPpe, epi],
    }));
  }

  reiniciarDesenho(): void {
    this.vertices.set([]);
    this.poligonoFechado.set(false);
    this.editandoId.set(null);
    this.form.set({ ...FORM_VAZIO });
    this.redesenhar();
  }
}
