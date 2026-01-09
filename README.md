# To‑Do (PWA)

Aplicativo de lista de tarefas (PWA) com sincronização via Firebase, suporte offline e **agrupamento visual local**.

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
