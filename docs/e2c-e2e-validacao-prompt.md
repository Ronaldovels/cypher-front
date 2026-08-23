# Prompt de validação — E2 ponta a ponta (cypher-front + cypher + cypher-capture)

Uso: colar em uma sessão futura quando os três repositórios puderem rodar juntos
com a E2-A já mergeada no backend. Retoma os Steps 2–7 de
`docs/superpowers/plans/e2/2026-08-20-e2c-front-cadastro.md`, Task 6, que ficaram
bloqueados nesta entrega porque o backend ainda não tinha os endpoints de escrita.

---

```
Execute a verificação de ponta a ponta da E2 (E2-A backend + E2-C front) descrita em
docs/e2c-verificacao.md (repo cypher-front), que ficou bloqueada porque o backend
(cypher) ainda não tinha os endpoints de escrita de estações/câmeras mergeados.
Retome a partir do Step 2 do plano docs/superpowers/plans/e2/2026-08-20-e2c-front-cadastro.md,
Task 6. Antes de começar, confirme que:

- cypher (backend): tem PUT/POST/DELETE em CatalogController para /stations e /cameras
  (não apenas GET) — se não tiver, pare e reporte que a E2-A ainda não está pronta.
- cypher-front: branch com a E2-C mergeada (PR #2, e2c-front-cadastro -> dev).
- cypher-capture: pipeline funcional, com data/validation/cenario2.mp4 disponível.

## 1. Subir os três lados

  cd /home/asaas/projects/cypher && ./mvnw -o spring-boot:run
  cd /home/asaas/projects/challenge/cypher-front && npm start   (useMockData: false)
  # pipeline sobe depois, no passo 4

## 2. Contrato de escrita (backend real, não mock)

Para cada validação abaixo, confirme contra o backend real — o mock já foi validado
e corrigido nesta entrega, mas o contrato real pode divergir do que o mock supôs:

- POST /stations e POST /cameras aceitam `id` no corpo (não `codigo`) e retornam o
  objeto criado com `ativa: true` por padrão.
- 409 (código duplicado) e 422 (estação inexistente numa câmera) retornam
  `{"erro": "..."}` e a mensagem chega verbatim na tela do /config/estacoes
  (não vira "algo deu errado").
- PUT /stations/{id} e PUT /cameras/{id}: confirme que o backend rejeita (ou ignora)
  tentativa de mudar o `id` no corpo — o mock trata isso como 409, mas o comportamento
  real do backend pode ser diferente (validar contra a spec E2-A).
- GET /stations?incluirInativas=true traz as inativas; sem o parâmetro, não traz.
- GET /cameras/{id} traz `fonte`; GET /cameras (lista) não traz — confirme essa
  assimetria também é real no backend, não só uma decisão do mock.
- Todas as chamadas usam `withCredentials: true` e o CORS do backend aceita
  credenciais vindas de localhost:4200.

## 3. Cadastrar pela interface e ver o efeito no heatmap

Em /config/estacoes, cadastrar `EST-30 / Bancada` e `CAM-30` com `streamUrl` para
http://127.0.0.1:8130/stream e `fonte` para data/validation/cenario2.mp4.

Ir a /heatmap e confirmar que a célula nova aparece **sem refresh manual** — isso
depende de duas coisas que a E2-C entregou separadamente e que precisam ser
confirmadas juntas aqui:
  (a) CatalogService.reload() após o write atualiza a lista de estações;
  (b) o heatmap em si só atualiza porque a navegação para /heatmap dispara
      IncidentService.loadSummary() de novo — NÃO é o reload() do catálogo que
      atualiza o heatmap (isso foi corrigido no comentário do código nesta entrega,
      confirme que o comportamento real bate com essa descrição).

## 4. Fechar o ciclo com o pipeline

  cd /home/asaas/projects/challenge/cypher-capture
  ./venv/bin/python src/run_pipeline.py --camera-id CAM-30 \
    --api-url http://localhost:8080/api/v1 --device cuda --no-display

Confirmar no dashboard: feed ao vivo aparece na câmera nova (porta 8130, derivada
do cadastro feito na tela), e incidentes chegam com a estação EST-30 no heatmap —
isto fecha o ciclo cadastro-na-interface -> consumido-pelo-pipeline -> de-volta-na-tela.

## 5. Soft delete de ponta a ponta — inclui uma pergunta em aberto

Desativar CAM-30 na tela de cadastro. Confirmar:
  - sai do seletor de feed e do heatmap;
  - incidentes dela continuam na lista de incidentes do dashboard (não some histórico).

**Pergunta em aberto, resolvida no mock por suposição, precisa de resposta real:**
desativar uma ESTAÇÃO (não uma câmera) faz suas câmeras serem desativadas em
cascata pelo backend, ou elas continuam ativas e visíveis independentemente da
estação estar inativa? O mock desta entrega assumiu que NÃO cascateia (câmeras
continuam ativas). Confirme contra o backend real e documente a resposta —
isso pode exigir ajuste no mock se divergir.

Reativar EST-30 depois e confirmar volta ao estado normal.

**Gap conhecido, já registrado no PR:** não existe reativação de câmera na UI
(só de estação) — o método CatalogService.updateCamera já existe, só falta o
botão. Se esse teste chegar a precisar reativar uma câmera desativada por engano,
vai esbarrar nisso — é esperado, não é um bug novo a reportar, só confirme que
seguimos sem esse caminho.

## 6. Confirmar o reinício da API

Reiniciar o backend e confirmar que EST-30 e CAM-30 continuam cadastradas com os
valores da tela (sem seeder resetando no boot).

## 7. Verificações extras específicas desta entrega (E2-C), fora do texto original do Task 6

- Item "Configurações" do dock (barra inferior) leva a /config/estacoes — confirme
  que o link funciona no app real, não só que a rota resolve isoladamente.
- Com o backend fora do ar, abrir /config/estacoes: hoje a tela mostra "nenhuma
  estação cadastrada" mesmo quando a causa real é a API estar inacessível — não
  há badge de conexão nessa tela (diferente do dashboard/heatmap). Confirme que
  esse comportamento é aceitável ou se vira prioridade de correção.
- No passo de onboarding "Estações e câmeras" (posição 2 de 5), confirme que
  pular sem cadastrar nada realmente não trava o wizard (o aviso amarelo aparece,
  mas "Continuar" segue funcionando) — este foi o maior risco técnico da E2-C
  (migração de validação por índice para por chave) e vale confirmar visualmente
  uma vez com todos os três lados no ar.

## 8. Registrar o resultado

Atualizar docs/e2c-verificacao.md (cypher-front) substituindo a seção "2-6 —
Não executado" pelo que foi de fato observado agora — números reais, divergências
reais, e a resposta à pergunta do cascade de desativação (passo 5). Se algo não
funcionar, o documento registra; ele não certifica sucesso.

  cd /home/asaas/projects/challenge/cypher-front
  git add docs/e2c-verificacao.md
  git commit -m "docs: completa verificacao ponta a ponta de E2 com os 3 repositorios"
```
