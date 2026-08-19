# Runbook — subir os 3 projetos do E1 localmente

Para teste visual do dashboard com dados reais. Cada bloco vai num terminal
separado.

## 1. API — E1-A

```bash
cd ~/projects/cypher
./mvnw spring-boot:run
```

Pronta quando logar `Started ... in Xs`. Confira:

```bash
curl -s localhost:8080/api/v1/cameras
```

## 2. Front — E1-C

```bash
cd ~/projects/challenge/cypher-front
npm start
```

Serve em <http://localhost:4200>. `environment.development.ts` precisa de
`useMockData: false` (já é o padrão). Ligar a flag serve para desenvolver sem
backend: o interceptor e o `EventSource` de exemplo entram no lugar da rede, e o
badge de conexão passa a se anunciar como dado de exemplo.

## 3. Captura — E1-B

**A pegadinha que decide se o vídeo aparece:** o dashboard renderiza
`cameras()[0]`, e o `<img [src]>` do `LiveFeedComponent` vem do `streamUrl` que a
API devolve para aquela câmera — não da porta que você escolheu no comando. Hoje
`cameras()[0]` é a **CAM-01, cujo `streamUrl` é a porta 8090**. Rodar o pipeline em
outra porta deixa o card em "câmera indisponível" com o pipeline perfeitamente
saudável. Confira o catálogo antes de escolher os parâmetros:

```bash
curl -s localhost:8080/api/v1/cameras
```

```bash
cd ~/projects/challenge/cypher-capture
./venv/bin/python src/run_pipeline.py \
  --source data/validation/cenario2.mp4 \
  --device cuda --no-display \
  --camera-id CAM-01 \
  --api-url http://localhost:8080/api/v1 \
  --stream-port 8090
```

### Escolha da fonte de vídeo

| Fonte | Vídeo | Incidente |
|---|---|---|
| Clipe de validação | 44–51s, e **o stream morre quando o arquivo acaba** | sim, queda real |
| Clipe em loop (abaixo) | o quanto você quiser | sim, repetidamente |
| Webcam (`--source 0`) | contínuo, não acaba | **não verificado** — ver ressalva |

Para um teste longo sem o card virar "câmera indisponível" no meio da inspeção,
gere um loop antes (precisa de ffmpeg):

```bash
cd ~/projects/challenge/cypher-capture/data/validation
for i in $(seq 1 12); do echo "file '$PWD/cenario2.mp4'"; done > /tmp/loop.txt
ffmpeg -y -f concat -safe 0 -i /tmp/loop.txt -c copy /tmp/cenario2-loop.mp4
```

e use `--source /tmp/cenario2-loop.mp4` (dá ~9 min).

**Ressalva sobre a webcam.** Que ela serve vídeo está verificado: 640x480, ~15 fps,
76 quadros JPEG em 5s na 8090. Que ela **gere incidente** não está: violação de EPI
tem severidade 2 e o `--min-severity` padrão também é 2, então em teoria
`no_helmet` qualificaria — mas não cheguei a observar isso acontecer. A hipótese
não testada é que um enquadramento de busto sirva mal a um modelo de pose/queda
treinado em corpo inteiro. Se quiser vídeo seu **e** incidente real ao mesmo tempo,
rode dois pipelines em paralelo: webcam como CAM-01/8090 (o card que você vê) e um
clipe como CAM-02/8091. Os dois alimentam a mesma API.

## O que olhar na tela

1. card de vídeo em movimento (não "câmera indisponível")
2. badge de conexão escrevendo "ao vivo"
3. card de incidente entrando **sem refresh**
4. KPI incrementando em ~2s (é o debounce do resumo)
5. heatmap acendendo a estação da câmera que rodou (CAM-01 → EST-01)
6. `Ctrl-C` no pipeline → o card vira "câmera indisponível"
7. derrube e suba a API → badge vai a "offline" e volta a "ao vivo", com o
   re-fetch por `since` cobrindo o intervalo

Os itens 1–5 já foram observados; ver `e1c-verificacao.md`. O **item 7 é o único
caminho que ninguém observou ao vivo** — tem cobertura de unidade, não observação.
