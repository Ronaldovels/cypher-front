# Cypher — Zonas de Risco pela Interface

**Data:** 2026-08-29
**Status:** aprovado (design)
**Escopo:** trazer o cadastro/edição de zonas de risco (hoje um arquivo JSON local, desenhado por uma ferramenta de linha de comando) para uma interface web onde o gestor desenha os polígonos sobre um frame congelado da câmera.

**Depende de:** `2026-08-29-multi-tenant-design.md` implementado — este documento assume que `Empresa`/`empresaId` já existem e que `Camera` já tem chave composta por tenant. Zona herda o escopo por `empresaId` via `Camera`, sem trabalho adicional de isolamento aqui, mesma premissa já assumida em `2026-08-29-cadastro-webhook-design.md`.

Este item não constava explicitamente no roteiro de §14 de `2026-08-10-notificacao-de-incidentes-design.md` como entrega própria — zonas eram tratadas como configuração de captura já resolvida (E1 §12/§13 tratam só de estação/câmera). Este documento é o registro de que a *edição* de zonas pela interface ficou de fora de todas as entregas anteriores e precisa de spec própria.

---

## 1. Contexto e diagnóstico

### 1.1 Estado atual em `cypher-capture`

Zonas são definidas em JSON puro, um arquivo por câmera/deploy do pipeline (`config/zones/zones.json`, referenciado por `pose_config.yaml` via `zones_config`, ou passado por `--zones`). Formato (`config/zones/zones.example.json`):

```json
[
  {
    "zone_id": "demo0001",
    "name": "Area Restrita",
    "zone_type": "restricted",
    "polygon": [[700, 300], [1180, 300], [1180, 680], [700, 680]],
    "severity": 4,
    "required_ppe": ["helmet", "boots"]
  }
]
```

`ZoneManager` (`src/zones/manager.py`) carrega o arquivo **uma vez no boot**; `ZoneDetector` (`src/zones/detector.py`) testa se os pontos dos tornozelos da pessoa estão dentro do polígono via `cv2.pointPolygonTest`, e marca `APPROACHING` se a distância à borda for menor que `approach_buffer_px` (80px por padrão). Não há hot-reload — `_poly_cache` documenta explicitamente "zones are static after load".

**Limitação documentada:** as coordenadas são pixels absolutos do frame nativo, e o próprio README avisa que os polígonos precisam ser desenhados "sobre um frame da mesma câmera/resolução em que você vai rodar" — trocar a câmera por uma de resolução diferente sem redesenhar quebra a zona silenciosamente.

Hoje a única ferramenta de cadastro é `scripts/annotate_zones.py`, um utilitário de anotação por mouse rodando localmente no host do pipeline, sem qualquer integração com o cadastro de câmeras já existente no backend (E2). Zonas não têm `camera_id` no schema — a relação é implícita por qual arquivo o processo aponta.

### 1.2 Consequência de escopo

Diferente de webhook (gap de superfície administrativa sobre uma funcionalidade já completa), zonas hoje **não têm nenhum cadastro remoto** — é puramente um arquivo local por processo, sem endpoint, sem `camera_id` estruturado, sem normalização de coordenada. Esta entrega introduz a entidade e a API do zero, além da UI.

---

## 2. Backend — `Zona` e endpoints

```java
@Entity
public class Zona {
    @Id @GeneratedValue(strategy = IDENTITY)
    private Long id;                          // gerado — zona não é ativo físico com etiqueta própria
    private String empresaId;                 // solto, herdado do multi-tenant
    private String cameraId;                  // referência solta a Camera (empresaId+codigo), sem FK
    private String nome;                      // rótulo livre, ex. "Área da prensa"

    @Enumerated(EnumType.STRING)
    private ZoneType zoneType;                // RESTRICTED | ATTENTION

    @ElementCollection
    private List<PontoNormalizado> polygon;   // (x, y) em fração 0.0–1.0, nunca pixel absoluto

    private int severity;                     // 1-4, mesmo campo do JSON atual

    @ElementCollection
    private List<String> requiredPpe;         // mesmo formato de epiPresent/epiMissing em Alerta

    private boolean ativa;
}
```

```
GET    /api/v1/cameras/{codigo}/zones           lista (GESTOR)
POST   /api/v1/cameras/{codigo}/zones           cadastrar (GESTOR)
PUT    /api/v1/cameras/{codigo}/zones/{id}      editar (GESTOR)
DELETE /api/v1/cameras/{codigo}/zones/{id}      desativar — soft delete (GESTOR)
GET    /api/v1/cameras/{codigo}/zones/config    zonas ativas, normalizadas — superfície de máquina
```

`GET .../zones/config` segue o mesmo padrão de `GET /cameras/{codigo}/config` (E2 §5.2): `X-Cypher-Key` (pipeline) ou `GESTOR`. Retorna a lista de zonas ativas com coordenadas normalizadas — quem converte para pixel é o pipeline, nunca o backend (que não conhece a resolução real da câmera).

### 2.1 Por que `id` gerado, e não código digitado

Diferente de `Estacao`/`Camera` (código escolhido pelo operador, correspondendo a uma etiqueta física existente), zona não tem contraparte física com nome prévio — o gestor desenha primeiro, nomeia depois. `nome` cumpre o papel de identificador legível; a PK não precisa ser memorizável.

### 2.2 Soft delete

Mesmo padrão de `Camera`/`Estacao`/`WebhookSubscription`: zona desativada some de `.../zones/config` (o pipeline para de aplicá-la no próximo boot), mas não é apagada — preserva a explicabilidade de um incidente antigo cuja `zoneName` não existe mais no cadastro atual.

---

## 3. `cypher-capture` — busca remota e conversão de coordenadas

### 3.1 `ZoneConfigClient` (novo, `src/zones/config_client.py`)

Mesma escada de degradação já estabelecida por `CameraConfigClient` (E2 §2.2/§6.1) — padrão replicado, não uma abstração compartilhada forçada:

1. **API responde** — busca `GET /cameras/{codigo}/zones/config`, converte cada polígono normalizado para pixel usando a resolução real do frame (`cv2.CAP_PROP_FRAME_WIDTH`/`HEIGHT`, lida uma vez após abrir a captura) e grava cache (`outputs/zones-config-cache.json`, coordenadas **normalizadas** — a conversão para pixel é refeita a cada boot, nunca cacheada já convertida, porque a resolução pode mudar entre execuções).
2. **API fora, cache existe** — usa o cache normalizado e converte com a resolução atual. Imprime de qual data é o cache.
3. **API fora, sem cache** — cai para o arquivo local `zones_config`/`--zones` (`config/zones/zones.json`), **no formato pixel absoluto de hoje, sem conversão** — preserva `annotate_zones.py` como caminho totalmente offline, independente do backend.

Zero zonas em todos os três níveis é aceito, comportamento já existente hoje.

### 3.2 Conversão acontece no pipeline, não no backend

O backend nunca abre a câmera — não tem como saber a resolução real do frame. Fazer a conversão no processo que já chama `cv2.VideoCapture` resolve de graça a limitação hoje documentada no README: a UI desenha sobre **qualquer** frame congelado, salva normalizado, e cada pipeline converte para a própria resolução real no boot — trocar a câmera por uma de resolução diferente deixa de exigir redesenhar as zonas.

### 3.3 `ZoneManager`/`ZoneDetector` não mudam

Ambos continuam recebendo `Zone` com `polygon` em pixels — `ZoneConfigClient` entrega esse formato depois de converter (casos 1 e 2) ou já vem pronto assim (caso 3). Nenhuma mudança em `cv2.pointPolygonTest` nem no cache estático de polígonos.

### 3.4 Sem hot-reload nesta entrega

Mudança feita na UI só é aplicada no próximo boot do pipeline daquela câmera — mesma limitação que já existe hoje. Comunicação em tempo real entre a UI e o pipeline já rodando fica registrada como item de entrega futura (§7).

---

## 4. Front — editor de zonas

**Nota de design:** exceto pelo canvas de desenho do polígono (§4.3, sem equivalente nos primitivos existentes), todo o resto desta seção reaproveita os primitivos globais já existentes em `src/styles.scss` (`.field`, `.input`, `.btn`, `.panel`) e o padrão de formulário "signal de rascunho + `patch()`" já usado no restante do app — mesmo princípio seguido em E3 §0, E4 §4 e nas duas specs anteriores desta rodada. O canvas é a única exceção deliberada, justificada em §4.3.

### 4.1 Onde entra

Dentro do fluxo de cadastro de câmera já existente (`StationsConfigComponent`, E2 §7.1): cada câmera cadastrada ganha uma ação "Editar zonas", que abre um painel (`ZoneEditorComponent`) recebendo `codigo` e `streamUrl` daquela câmera.

### 4.2 Congelar o frame

`ZoneEditorComponent` reaproveita o mesmo `<img [src]="streamUrl">` do `LiveFeedComponent` (MJPEG). Um botão "Capturar frame" desenha o `<img>` atual num `<canvas>` oculto via `drawImage`, lendo `naturalWidth`/`naturalHeight` — essa imagem congelada vira o fundo do editor. Nenhuma mudança no `cypher-capture` nem endpoint novo de snapshot.

### 4.3 Desenho do polígono

Canvas sobreposto ao frame congelado: clique adiciona vértice, duplo-clique ou botão "Fechar polígono" fecha a forma — mesmo fluxo conceitual do `annotate_zones.py`, agora no navegador. Cada vértice é salvo como fração da largura/altura do canvas (`x / canvas.width`, `y / canvas.height`) — nunca pixel absoluto.

Zonas já cadastradas são carregadas e desenhadas sobre o frame na abertura do editor (convertendo normalizado → pixel do canvas atual, o inverso da conversão do pipeline), permitindo editar vértices de um polígono existente arrastando-os.

Formulário por zona: `nome`, `zoneType` (`RESTRICTED`/`ATTENTION`), `severity` (1–4), `requiredPpe` (multi-seleção sobre `ConfigService.config().epis`, já cadastrado no onboarding). Segue o padrão signal-de-rascunho já usado no resto do app para os campos de texto/seleção; o canvas de desenho é a única peça que foge dos primitivos globais (`.field`/`.input` não cobrem desenho de polígono) — exceção justificada, não um padrão visual novo para o resto do app.

### 4.4 `ZoneService`

`src/app/shared/zone.service.ts`, mesmo esqueleto de `TeamService`/`WebhookService`: `load(cameraId)` popula um signal por câmera, `create()`/`update()`/`deactivate()` com recarregamento após escrita, `withCredentials: true`.

### 4.5 Modo mock

`mock-api.interceptor.ts` ganha seção de zonas, array mutável `ZONAS_MUTAVEL` filtrável por `cameraId`, mesmo esqueleto das seções já existentes.

### 4.6 Aviso de reinício

Como não há hot-reload (§3.4), ao salvar uma zona o painel mostra um aviso explícito: "reinicie o pipeline desta câmera para aplicar a mudança" — mesma transparência já praticada em outros lugares do produto (ex.: badge de conexão do SSE em E1 §6.3), em vez de deixar a mudança parecer aplicada quando não está.

---

## 5. Comportamento sob falha

| Situação | Comportamento |
|---|---|
| Polígono com menos de 3 vértices | `400` (`@Size(min=3)` em `ZoneRequest.polygon` — mesmo padrão consolidado em `2026-08-29-cadastro-webhook-design.md` §4: violação de anotação de formato no próprio corpo é sempre `400`; `422` fica reservado a checagem de negócio entre entidades, que não existe aqui) |
| `severity` fora de 1–4 | `400` (`@Min`/`@Max` em `ZoneRequest.severity`) |
| `cameraId` da URL não cadastrado (ou de outra empresa) | `404` — mesmo padrão de `CatalogService`/isolamento multi-tenant |
| API indisponível no boot do pipeline | Escada de §3.1: cache normalizado convertido → arquivo local pixel absoluto → lista vazia |
| Resolução da câmera muda entre execuções | Zonas continuam corretas — conversão normalizado→pixel refeita a cada boot com a resolução atual |
| Zona desativada | Some de `.../zones/config`; pipeline para de aplicá-la no próximo boot daquela câmera |
| Zona salva com o pipeline já rodando | Aviso explícito na UI: sem efeito até reiniciar (§3.4/§4.6) |

---

## 6. Estratégia de testes

**Java** — CRUD completo; `400` de polígono com menos de 3 vértices e de `severity` inválido; soft delete removendo do `.../zones/config`; escopo por `empresaId` (zona de câmera de uma empresa não aparece/edita por outra, câmera de outra empresa na URL devolve 404).

**Python** — `ZoneConfigClient` nos três degraus da escada (API, cache, arquivo local), com conversão normalizado→pixel testada contra resoluções diferentes (ex.: mesma zona normalizada produzindo polígonos corretos em 1280×720 e em 1920×1080); nenhuma mudança de comportamento em `ZoneDetector`/`ZoneManager`, já cobertos pelos testes existentes.

**Angular** — spec do `ZoneEditorComponent` cobrindo captura de frame, adição/edição/remoção de vértice, conversão pixel↔normalizado do canvas; spec do `ZoneService` via `HttpTestingController`; interceptor mock.

**Ponta a ponta** — cadastrar uma zona pela UI sobre uma câmera real, reiniciar o pipeline daquela câmera, provocar uma invasão de zona e confirmar que o incidente `ZONE_VIOLATION` é gerado com o `zoneName` correto.

---

## 7. Fora de escopo

- **Hot-reload** (comunicação entre a UI e o pipeline já rodando, sem reiniciar) — registrado para avaliação futura.
- `EPI_VIOLATION` continua sem disparar de fato — `requiredPpe` é cadastrado e devolvido pela API, mas o cruzamento zona×EPI depende do mesmo retreino do detector já registrado como pendente em E1 §4.6; esta spec só move o *cadastro* do campo para a UI, não resolve a limitação do detector.
- Anotação de múltiplas câmeras simultaneamente numa mesma tela (um editor por vez, uma câmera por vez).
- Deletar de verdade uma zona (só soft delete, mesmo padrão do resto do catálogo).
- Zona relativa a estação (cobrindo várias câmeras) — zona é sempre por câmera individual, mesma granularidade de hoje.

---

## 8. Premissas

- O multi-tenant (`2026-08-29-multi-tenant-design.md`) já está implementado.
- `annotate_zones.py` continua existindo como caminho de anotação totalmente offline, sem depender do backend — não é substituído, é complementado.
- O host do pipeline tem acesso de rede ao backend no boot (mesma premissa de `CameraConfigClient`).

---

## 9. Ordem de implementação

1. **Backend.** `Zona`, CRUD, `.../zones/config`, validação de polígono/severidade, escopo por `empresaId`. Verificável com `curl`.
2. **Python.** `ZoneConfigClient` com a escada de três níveis e conversão normalizado→pixel. Fim a fim contra a API real, com resoluções diferentes.
3. **Angular.** `ZoneEditorComponent`, `ZoneService`, integração na tela de cadastro de câmera, mock interceptor.
4. **Ponta a ponta.** Cadastro pela UI → reinício do pipeline → invasão real → incidente `ZONE_VIOLATION` correto.
