# To‑Do (PWA)

Aplicativo de lista de tarefas (PWA) com sincronização via Firebase, suporte offline e **agrupamento visual local**.

## Compras, categorias e sugestões

Listas de **Mercado, Farmácia e Pet** agrupam os produtos pelo catálogo das pré-listas. Itens desconhecidos ficam em **Outros**; a categoria pode ser corrigida no detalhe do item. A opção **Manual** preserva a organização por arraste.

**Finalizar compra** registra o que foi comprado, o que não foi encontrado e o que ficou pendente. Uma reposição rápida atualiza os itens comprados sem contar uma nova rodada para os demais. O histórico permite corrigir ou remover registros.

O botão **Sugestões** aparece na pré-lista e na lista em andamento. Ele usa as compras registradas, explica o motivo de cada sugestão e permite revisar quantidades antes de incluir os itens. Não adiciona produtos automaticamente.

Em **Compras em casa**, Google e duas contas previamente autorizadas permitem compartilhar listas, histórico e preferências no **Firebase Spark gratuito**. O modo local funciona sem conta. Listas antigas podem ser copiadas para a casa; o compartilhamento por código continua independente. Não há Cloud Functions nem requisito de Blaze.

O Jev é opcional e vem desligado. A categorização local e as sugestões por histórico funcionam sem ele. Veja o [guia de implementação, validação e publicação](docs/shopping.md) antes de ativar o compartilhamento doméstico em produção.

Para a próxima etapa com a extensão do Codex no Chrome, siga [o preparo simples de contas e sessões](docs/PREPARAR-CHROME.md). O proxy opcional do Jev está em `jev-worker/`, preparado para Cloudflare Workers Free; nenhuma chave é colocada no site.

### Desenvolvimento e verificação

```powershell
npm ci
npm test
npm run eval:jev:check
npm run test:emulators
```

Os emuladores usam somente Authentication e Realtime Database do projeto isolado `demo-todo` e exigem Java 21 e Node.js 22 ou mais recente. Os testes não precisam de chaves, serviços pagos ou conexão ao banco de produção.

## Agrupamento local de tarefas (não sincroniza)

- **O que é**: organização visual usando drag and drop + *hover* prolongado.
- **Onde salva**: somente no **`localStorage`** (não vai para o Firebase).  
  - **Chave**: `todo_task_groups_v1`
- **Comportamento esperado**: cada dispositivo/navegador pode ter uma organização diferente.

### Como usar

- **Criar grupo**: arraste uma tarefa e segure sobre outra por ~**1,2s**
- **Feedback visual**: borda azul pulsante durante o hover
- **Adicionar ao grupo**: arraste uma tarefa e segure sobre qualquer item de um grupo existente (~1,2s)
- **Desagrupar**: arraste a tarefa para fora da caixa do grupo
- **Limpeza automática**: grupos com menos de 2 tarefas são removidos automaticamente
- **Cores**: sequência automática (azul, amarelo, verde, rosa, roxo, laranja)

## Roteiro de teste rápido (persistência)

1. Abra o app e o console do navegador (F12)
2. Crie uma lista e 4 tarefas (Tarefa 1…4)
3. Crie um grupo (Tarefa 1 sobre Tarefa 2 por ~1,2s)
4. Adicione Tarefa 3 e Tarefa 4 ao mesmo grupo (hover ~1,2s)
5. Recarregue a página (F5 / Ctrl+F5)
6. **Esperado**: o grupo mantém **todas as 4 tarefas**

### Debug

No console do navegador:

```js
JSON.parse(localStorage.getItem('todo_task_groups_v1'))
```
