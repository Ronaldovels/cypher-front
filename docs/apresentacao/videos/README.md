# Vídeos do pitch final (Fase 4)

Gravados em 29/09/2026 com os 3 projetos rodando localmente, sobre o banco da
empresa `demo`, e montados com motion (títulos, legendas, zoom, tela dividida)
seguindo o `Roteiro-Pitch-Final-Cypher.pdf`.

| Vídeo | Duração | Uso |
|---|---|---|
| [`pitch-final-demo-ao-vivo.mp4`](pitch-final-demo-ao-vivo.mp4) | 60s | **Backup do slide 12 (demonstração ao vivo).** Mesma ordem da narração: detecção → decisão → alerta nas duas telas → análise. Se a demo ao vivo falhar, corte para ele e siga a fala igual. |
| [`pitch-final-tour-telas.mp4`](pitch-final-tour-telas.mp4) | 1min45 | Tour pelas telas: acesso por papel, dashboard, ao vivo, heatmap, incidentes, placar, EPIs, editor de zonas, MCP e fechamento. |
| [`pitch-final-completo.mp4`](pitch-final-completo.mp4) | 2min45 | Tour seguido da demonstração ao vivo, em um arquivo só. |

Os vídeos não têm áudio.

## O que aparece em cada passo da demo

1. **Detecção.** Kiosk da estação `EST-FRESA1`, com o feed da `CAM-FRESA1` mostrando esqueleto, zona e violação de EPI.
2. **Decisão.** Zoom na zona `Zona Teste` e um painel que ilustra a histerese. O número exibido é o `enter_frames: 5` de `cypher-capture/config/pose_config.yaml`.
3. **Alerta.** Kiosk do operador e dashboard do gestor gravados ao mesmo tempo, com os alertas chegando por SSE. O kiosk foi aberto com a sessão do gestor, que a rota `/estacao/:id` também aceita.
4. **Análise.** Incidente `560` (CAM-FRESA1, câmera real da Metaindústria), com a análise por IA que já estava salva. O LLM não é chamado na gravação, como pede o roteiro.

## Como foram gerados

- As câmeras RTSP da fábrica só respondem na rede da SPI, então o feed ao vivo
  vem dos vídeos de validação do `cypher-capture` (`cenario2/3/4.mp4`). O
  pipeline de verdade roda sobre eles. Os vídeos são retrato com metadado de
  rotação, então foram girados para 1920x1080 em pé, que é a resolução para a
  qual as zonas estão cadastradas.
- **Gravação:** Playwright com screencast CDP em JPEG q95, com cursor animado e
  rolagem suave. **Motion:** Remotion (React), nas cores e fontes do
  [design system](../../design-system.md).
- O projeto que gera os vídeos (scripts de gravação, composições Remotion e o
  passo a passo para regravar) fica em `challenge/cypher-motion/`, fora dos
  3 repositórios.
