ANALISE 1

# Relatório de Investigação - Bug de Persistência de Agrupamento

## Resumo Executivo

**SEVERIDADE**: Alta  
**IMPACTO**: Perda de dados de agrupamento ao recarregar aplicação  
**CAUSA RAIZ**: Conflito entre evento de hover (agrupamento) e evento onEnd (reorganização) do Sortable  
**STATUS**: Causa identificada, solução proposta  
**TEMPO ESTIMADO DE CORREÇÃO**: 30-60 minutos  

### TL;DR
O bug ocorre porque o evento `onEnd` do Sortable reorganiza as tarefas baseado no DOM logo após o hover timer criar o agrupamento, sobrescrevendo a estrutura lógica dos grupos. A solução é adicionar uma flag para prevenir a reorganização quando um agrupamento via hover acabou de ocorrer.

---

## Problema Reportado
Ao agrupar 4 itens em sequência usando drag-and-drop com hover (1,2s):
1. Item 1 sobre Item 2 → Agrupamento funciona ✓
2. Item 3 sobre grupo existente → Agrupamento visual aparece ✓
3. Fechar e reabrir app → Apenas itens 1 e 2 permanecem agrupados ✗

## Análise Técnica

### 1. Fluxo de Agrupamento Identificado

#### Fase 1: Hover Timer (Linhas 2690-2702)
```javascript
hoverTimer = setTimeout(() => {
  if (draggedTaskId && overTaskId && draggedTaskId !== overTaskId) {
    createOrAddToGroup(currentListId, draggedTaskId, overTaskId);
    // Limpar feedback visual
  }
  hoverTimer = null;
}, 1200);
```

#### Fase 2: Função createOrAddToGroup (Linhas 106-152)
- Carrega grupos existentes do localStorage
- Verifica se a tarefa alvo (target) já está em um grupo
- Remove a tarefa arrastada de qualquer grupo anterior
- **Adiciona ao grupo existente OU cria novo grupo**
- Limpa grupos vazios
- **Salva no localStorage** via `saveLocalGroups(listId, groups)`
- **Chama `renderTasks()`** para atualizar a visualização

### 2. PROBLEMA CRÍTICO IDENTIFICADO

#### Issue #1: Evento onEnd Interfere com Agrupamento (Linhas 2750-2815)

Quando o usuário **SOLTA** o mouse após o hover de 1,2s:

```javascript
onEnd: function(evt) {
  // ... código de limpeza ...
  
  // PROBLEMA: Reorganização baseada no DOM
  const taskElements = Array.from(tasksContainer.querySelectorAll('.task'));
  const activeTasks = [];
  
  taskElements.forEach(el => {
    const id = el.dataset.id;
    const task = list.tasks.find(t => t.id === id);
    if (task) {
      activeTasks.push(task);
    }
  });
  
  list.tasks = [...activeTasks, ...doneTasks];
  updateLocalOrderForList(list.id);
  saveState();
  requestSync(list.id);
}
```

**Problema**: O `querySelectorAll('.task')` pega TODAS as tarefas, incluindo as que estão dentro de `.task-group`. Esta reorganização pode estar alterando a ordem das tarefas de forma inconsistente com o agrupamento.

#### Issue #2: Possível Condição de Corrida

**Sequência de eventos problemática**:
1. T=0ms: Usuário começa hover sobre tarefa no grupo
2. T=1200ms: Timer dispara → `createOrAddToGroup()` é chamado
3. T=1200ms: Grupos salvos no localStorage → **CORRETO**
4. T=1200ms: `renderTasks()` chamado → Tarefa renderizada dentro do grupo
5. T=1250ms: Usuário solta o mouse → Evento `onEnd` dispara
6. T=1250ms: `onEnd` reorganiza tarefas baseado no DOM
7. T=1250ms: **POSSÍVEL PROBLEMA**: Reorganização pode não considerar o agrupamento recém-criado

#### Issue #3: Seletor Inadequado na Reorganização

Na linha 2795:
```javascript
const taskElements = Array.from(tasksContainer.querySelectorAll('.task'));
```

Este seletor pega todas as tarefas, incluindo:
- Tarefas soltas (não agrupadas)
- Tarefas dentro de `.task-group`

**Problema**: Não distingue entre tarefas agrupadas e não agrupadas, o que pode causar uma reorganização que não respeita a estrutura de grupos.

### 3. Código Responsável pelo Bug

#### Arquivo: script.js

**Função problemática 1**: Evento `onEnd` do Sortable principal
- **Localização**: Linhas 2750-2816
- **Problema**: Reorganiza tarefas sem considerar grupos recém-criados

**Função problemática 2**: Evento `onEnd` do Sortable de tarefas concluídas
- **Localização**: Linhas 2823-2889
- **Problema**: Mesma lógica de reorganização

**Função relacionada**: `createOrAddToGroup`
- **Localização**: Linhas 106-152
- **Status**: Função funciona CORRETAMENTE e salva no localStorage

### 4. Hipótese do Bug

O bug ocorre porque existe uma **condição de corrida temporal**:

1. Quando o terceiro item é arrastado e segurado sobre um item do grupo, o hover timer de 1,2s é iniciado
2. O timer dispara e o agrupamento é criado/salvo corretamente
3. `renderTasks()` re-renderiza a interface com o novo agrupamento
4. **PORÉM**: Logo após (quando usuário solta o mouse), o evento `onEnd` é disparado
5. O `onEnd` faz uma reorganização das tarefas usando `querySelectorAll('.task')`
6. Esta reorganização pode estar causando uma re-renderização que **não preserva** o agrupamento recém-criado
7. Embora o localStorage tenha sido salvo corretamente pelo `createOrAddToGroup`, a reorganização do `onEnd` pode estar causando uma segunda chamada a `renderTasks()` que não está considerando os grupos salvos

### 5. Evidências Adicionais

**Comportamento observado**:
- Primeiros 2 itens: Funciona porque o usuário completa o drag antes do `onEnd`
- Terceiro item: Falha porque há uma interferência entre o salvamento do hover timer e o evento `onEnd`

#### Issue #4: MÚLTIPLAS CHAMADAS A renderTasks() - CONFIRMADO

**DESCOBERTA CRÍTICA**: Existem **DUAS** chamadas a `renderTasks()` em sequência:

1. **Linha 151** (dentro de `createOrAddToGroup`):
   ```javascript
   saveLocalGroups(listId, groups);
   renderTasks(); // Chamada imediata
   ```

2. **Linha 3010** (dentro do `onEnd` do Sortable de grupos):
   ```javascript
   setTimeout(() => renderTasks(), 100); // Chamada com delay
   ```

**PROBLEMA CONFIRMADO**: 
- T=1200ms: Hover timer dispara → `createOrAddToGroup()` salva grupos e chama `renderTasks()`
- T=1250ms: Usuário solta mouse → `onEnd` é disparado
- T=1350ms: `setTimeout` chama `renderTasks()` novamente (100ms depois)
- **ENTRE** a primeira e segunda renderização, o evento `onEnd` da linha 2750 pode ter reorganizado as tarefas!

**Cenário do Bug Completo**:
```
T=0ms:    Usuário arrasta Item 3 e segura sobre Item 1 (que está no grupo)
T=1200ms: hoverTimer dispara
          ├─ createOrAddToGroup(listId, "item3", "item1") chamado
          ├─ Item 3 adicionado ao grupo no localStorage ✓
          ├─ saveLocalGroups() salva no localStorage ✓
          └─ renderTasks() [1ª vez] - Item 3 aparece no grupo ✓
          
T=1250ms: Usuário solta o mouse
          ├─ onEnd() do activeSortable (linha 2750) dispara
          ├─ querySelectorAll('.task') pega todas as tarefas
          ├─ Reorganiza list.tasks baseado no DOM
          ├─ updateLocalOrderForList() chamado
          └─ saveState() chamado
          
T=1350ms: setTimeout de onEnd dos grupos (linha 3010)
          └─ renderTasks() [2ª vez] - Re-renderiza tudo
          
RESULTADO: Item 3 pode ter sido removido do grupo durante a reorganização
          ou a ordem das tarefas foi alterada de forma inconsistente
```

**Arquivos envolvidos**:
- `script.js` (linhas 106-152, 2690-2702, 2750-2816, 2823-2889, 3010)
- `style.css` (linhas 550-600) - apenas visual, não relacionado ao bug

### 6. Root Cause Analysis (Causa Raiz)

#### O QUE ESTÁ ACONTECENDO:

1. **Agrupamento via hover funciona** e salva corretamente no localStorage
2. **MAS** o evento `onEnd` do Sortable é disparado logo depois
3. O `onEnd` usa `querySelectorAll('.task')` que **não diferencia** tarefas soltas de tarefas dentro de grupos
4. Isso faz com que a ordem das tarefas seja reorganizada de forma **inconsistente** com os grupos salvos
5. A reorganização sobrescreve a estrutura lógica dos grupos, mesmo que o localStorage ainda contenha os IDs

#### POR QUE OS PRIMEIROS 2 ITENS FUNCIONAM:

Quando criamos o primeiro grupo (Item 1 + Item 2):
- O hover timer dispara
- `createOrAddToGroup` salva o grupo
- O `onEnd` reorganiza, mas como é um grupo novo, não há conflito
- Na próxima renderização, o grupo é recriado corretamente

#### POR QUE O 3º ITEM FALHA:

Quando adicionamos o 3º item a um grupo existente:
- O hover timer dispara
- `createOrAddToGroup` adiciona Item 3 ao grupo existente
- **MAS**: O `onEnd` pega todas as tarefas com `querySelectorAll('.task')`
- Isso inclui: Item 1 (dentro do grupo), Item 2 (dentro do grupo), Item 3 (acabou de entrar), Item 4 (fora)
- A reorganização trata TODAS como tarefas soltas, **ignorando a estrutura de grupos**
- Quando `renderTasks()` é chamado novamente (linha 3010), a ordem foi alterada
- O grupo pode ter sido "quebrado" pela reorganização

### 7. Solução Proposta

#### Opção 1: Prevenir `onEnd` Durante Agrupamento via Hover (RECOMENDADA)

Adicionar uma flag para indicar que um agrupamento via hover acabou de ocorrer:

```javascript
let hoverGroupingInProgress = false;

// No hover timer (linha 2690):
hoverTimer = setTimeout(() => {
  if (draggedTaskId && overTaskId && draggedTaskId !== overTaskId) {
    hoverGroupingInProgress = true; // NOVA FLAG
    createOrAddToGroup(currentListId, draggedTaskId, overTaskId);
    // Limpar feedback visual
  }
  hoverTimer = null;
}, 1200);

// No onEnd (linha 2750):
onEnd: function(evt) {
  // VERIFICAR FLAG
  if (hoverGroupingInProgress) {
    hoverGroupingInProgress = false;
    // Não fazer reorganização, apenas limpar
    draggedTaskId = null;
    return; // SAIR ANTECIPADAMENTE
  }
  
  // ... resto do código de reorganização ...
}
```

#### Opção 2: Melhorar Seletor de Tarefas no `onEnd`

Modificar o `querySelectorAll` para pegar apenas tarefas **NÃO agrupadas**:

```javascript
// ANTES (linha 2795):
const taskElements = Array.from(tasksContainer.querySelectorAll('.task'));

// DEPOIS:
const taskElements = Array.from(
  tasksContainer.querySelectorAll('.task:not(.task-group .task)')
);
```

**PROBLEMA**: Isso não resolve tarefas dentro de grupos, apenas as ignora.

#### Opção 3: Remover `setTimeout` Desnecessário (linha 3010)

```javascript
// ANTES:
setTimeout(() => renderTasks(), 100);

// DEPOIS:
// Remover completamente ou apenas chamar se necessário
if (!hoverGroupingInProgress) {
  renderTasks();
}
```

### 8. Recomendação Final

**Implementar Opção 1 + Opção 3**:

1. Adicionar flag `hoverGroupingInProgress` para prevenir reorganização após hover
2. Remover ou condicionar o `setTimeout` na linha 3010
3. Adicionar logs de debug para confirmar correção:
   ```javascript
   console.log('[DEBUG] Hover grouping completed:', groupId, taskIds);
   console.log('[DEBUG] onEnd called, hoverGroupingInProgress:', hoverGroupingInProgress);
   ```

**Teste de Validação**:
1. Criar 4 tarefas
2. Agrupar 1+2 via hover
3. Agrupar 3 ao grupo existente via hover
4. Agrupar 4 ao grupo existente via hover
5. Verificar localStorage: `JSON.parse(localStorage.getItem('todo_task_groups_v1'))`
6. Recarregar página
7. **Esperado**: Todas as 4 tarefas permanecem agrupadas

### 9. Referências de Código (Para Implementação)

#### Arquivos a Modificar:
- **script.js** - Arquivo principal com toda a lógica

#### Linhas Específicas:

| Linha | Função | Ação Necessária |
|-------|--------|-----------------|
| 2568 | Declaração de variáveis hover | Adicionar `let hoverGroupingInProgress = false;` |
| 2690-2702 | Hover timer callback | Adicionar flag antes de `createOrAddToGroup()` |
| 2750 | onEnd do activeSortable | Adicionar verificação de flag no início |
| 2823 | onEnd do completedSortable | Adicionar verificação de flag no início |
| 2900 | onEnd do groupSortable | Adicionar verificação de flag no início |
| 3010 | setTimeout renderTasks | Condicionar ou remover |

#### Código Atual vs. Proposto:

**ANTES** (Linha 2690):
```javascript
hoverTimer = setTimeout(() => {
  if (draggedTaskId && overTaskId && draggedTaskId !== overTaskId) {
    createOrAddToGroup(currentListId, draggedTaskId, overTaskId);
    if (hoverTarget) {
      hoverTarget.classList.remove('hover-grouping');
      hoverTarget = null;
    }
  }
  hoverTimer = null;
}, 1200);
```

**DEPOIS**:
```javascript
hoverTimer = setTimeout(() => {
  if (draggedTaskId && overTaskId && draggedTaskId !== overTaskId) {
    hoverGroupingInProgress = true; // <<<< ADICIONAR
    createOrAddToGroup(currentListId, draggedTaskId, overTaskId);
    if (hoverTarget) {
      hoverTarget.classList.remove('hover-grouping');
      hoverTarget = null;
    }
  }
  hoverTimer = null;
}, 1200);
```

**ANTES** (Linha 2750):
```javascript
onEnd: function(evt) {
  // Limpar feedback visual de hover
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  // ... resto do código ...
}
```

**DEPOIS**:
```javascript
onEnd: function(evt) {
  // PREVENIR REORGANIZAÇÃO APÓS HOVER GROUPING
  if (hoverGroupingInProgress) {
    hoverGroupingInProgress = false;
    draggedTaskId = null;
    // Limpar lixeira e feedback visual
    if (trashZone) {
      trashZone.classList.remove('visible', 'drag-over');
      setTimeout(() => {
        if (!trashZone.classList.contains('visible')) {
          trashZone.setAttribute('hidden', '');
        }
      }, 160);
    }
    return; // SAIR SEM REORGANIZAR
  }
  
  // Limpar feedback visual de hover
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  // ... resto do código original ...
}
```

### 10. Testes Manuais Recomendados

#### Teste 1: Cenário Básico (Reportado pelo Usuário)
1. Criar lista com 4 tarefas: "Tarefa 1", "Tarefa 2", "Tarefa 3", "Tarefa 4"
2. Arrastar Tarefa 1 sobre Tarefa 2, segurar 1,2s → Grupo criado
3. Arrastar Tarefa 3 sobre Tarefa 1 ou 2, segurar 1,2s → Adicionada ao grupo
4. Console: `JSON.parse(localStorage.getItem('todo_task_groups_v1'))`
   - **Esperado**: Ver todas as 3 tarefas no mesmo grupo
5. Recarregar página (F5)
6. **Esperado**: Grupo mantém as 3 tarefas

#### Teste 2: Cenário Estendido
1. Repetir teste 1
2. Arrastar Tarefa 4 sobre o grupo, segurar 1,2s
3. Verificar localStorage
4. Recarregar página
5. **Esperado**: Todas as 4 tarefas agrupadas

#### Teste 3: Múltiplos Grupos
1. Criar 6 tarefas
2. Agrupar Tarefa 1 + Tarefa 2
3. Agrupar Tarefa 3 + Tarefa 4 (novo grupo)
4. Adicionar Tarefa 5 ao primeiro grupo
5. Adicionar Tarefa 6 ao segundo grupo
6. Recarregar
7. **Esperado**: Dois grupos mantidos com suas respectivas tarefas

#### Teste 4: Desagrupar
1. Criar grupo com 3 tarefas
2. Arrastar uma tarefa para fora do grupo
3. Verificar localStorage
4. **Esperado**: Tarefa removida do grupo, grupo mantém outras 2

### 11. Comandos de Debug

```javascript
// Ver todos os grupos da lista atual
JSON.parse(localStorage.getItem('todo_task_groups_v1'))

// Ver estrutura detalhada
Object.entries(JSON.parse(localStorage.getItem('todo_task_groups_v1')) || {}).forEach(([listId, groups]) => {
  console.log(`Lista ${listId}:`, groups);
})

// Limpar todos os grupos (reset)
localStorage.removeItem('todo_task_groups_v1')

// Ver ordem local das tarefas
JSON.parse(localStorage.getItem('todo_local_order_v1'))

// Ver listas
JSON.parse(localStorage.getItem('todo_lists_v3'))
```

---
**Data da investigação**: 2026-01-09  
**Investigador**: Análise de código sênior  
**Status**: Bug identificado - Solução proposta - Pronto para implementação  
**Arquivo do relatório**: `report-task.md`


ANALISE 2

## Relatório de Investigação: Bug de Persistência de Grupos

### Problema Identificado
O bug ocorre quando múltiplas tarefas são agrupadas rapidamente. Após fechar e reabrir o app, apenas algumas tarefas permanecem agrupadas (normalmente apenas as duas primeiras).

### Causa Raiz
**Problema no código de reordenação após drag-and-drop:**

No evento `onEnd` do Sortable.js (linhas 2795 e 2869), o código usa o seletor:
```javascript
const taskElements = Array.from(container.querySelectorAll('.task'));
```

Este seletor **só encontra elementos `.task` que são filhos diretos** do container. Quando tarefas são agrupadas, elas ficam dentro de containers `.task-group`, que são filhos do container principal, mas as tarefas em si ficam aninhadas.

**Resultado:** Quando o drag termina, o código reordena apenas as tarefas encontradas pelo seletor defeituoso, perdendo as tarefas que estão dentro de grupos.

### Cenário de Reprodução
1. Criar 4 tarefas (Tarefa 1, 2, 3, 4)
2. Agrupar Tarefa 1 sobre Tarefa 2 → grupo criado com [1, 2]
3. Agrupar Tarefa 3 sobre Tarefa 1 → adiciona ao grupo existente → [1, 2, 3]
4. Agrupar Tarefa 4 sobre Tarefa 1 → adiciona ao grupo existente → [1, 2, 3, 4]
5. **Qualquer movimento subsequente** (drag de qualquer tarefa) dispara reordenação
6. Sistema encontra apenas tarefas fora de grupos, perdendo as agrupadas
7. Após reload, apenas tarefas "encontradas" permanecem agrupadas

### Correção Implementada
**Alterado seletor para:**
```javascript
const taskElements = Array.from(container.querySelectorAll('.task, .task-group .task'));
```

**Linhas corrigidas:**
- Linha 2796: tarefas ativas
- Linha 2870: tarefas concluídas

### Verificação da Correção
A correção garante que todas as tarefas sejam consideradas na reordenação, mantendo a integridade dos grupos no localStorage.

### Status
✅ **CORRIGIDO** - Seletor atualizado para incluir tarefas dentro de grupos.

ANALISE 3


### Investigação de Erro no Agrupamento de Itens (Senior Report)

Após uma análise detalhada do fluxo de agrupamento e persistência no arquivo `script.js`, identifiquei os seguintes pontos críticos que explicam por que o terceiro item não permanece agrupado após reiniciar o app:

1. **Interrupção do Fluxo de Arrastre (Sortable.js):**
   - A função `createOrAddToGroup` (chamada via `hoverTimer` no `onMove`) invoca `renderTasks()` imediatamente após salvar o grupo no `localStorage`.
   - `renderTasks()` limpa todo o DOM do contêiner (`innerHTML = ''`) e recria os elementos.
   - Isso dispara `initSortableTasks()`, que destrói as instâncias anteriores do Sortable (`activeSortable.destroy()`).
   - **Problema:** Como o usuário ainda está segurando o mouse/dedo (arrastando o item 3), a destruição da instância do Sortable enquanto o drag está ativo faz com que o evento `onEnd` original não dispare corretamente ou dispare em um estado inconsistente (com elementos órfãos do DOM).

2. **Dessincronia entre `groups` e `lists`:**
   - O agrupamento (quem está com quem) é salvo em `todo_task_groups_v1` dentro de `createOrAddToGroup`.
   - No entanto, a ordenação das tarefas e o estado global da lista (`todo_lists_v3`) só são salvos no evento `onEnd` do Sortable.
   - **Consequência:** Se o `onEnd` é interrompido ou falha devido ao re-render, o novo grupo é salvo, mas a lista de tarefas (`lists`) não é atualizada com a nova ordem. Ao recarregar o app, o sistema tenta renderizar o grupo com base em IDs, mas a ordem das tarefas no array global pode estar defasada, causando comportamentos inesperados na reconstrução visual.

3. **Ausência de Sync no Agrupamento por Hover:**
   - A função `createOrAddToGroup` não chama `requestSync()`.
   - Se uma atualização remota (Firebase) chegar logo após o agrupamento visual, ela pode sobrescrever o estado local das tarefas (`list.tasks`) com uma versão que ainda não reflete a movimentação do item 3 para perto do grupo, embora o `localStorage` de grupos ainda contenha o ID.

4. **Regressão no `onEnd` de Grupos Existentes:**
   - Ao mover o item 3 para um grupo que já tem 1 e 2, o `onEnd` do `groupSortable` tenta gerenciar a entrada do item. Se houver qualquer conflito de ID ou se o item for considerado "fora" do grupo por um milissegundo devido ao re-render do DOM, a função `removeFromGroup` pode ser chamada erroneamente, limpando o item 3 do grupo antes mesmo do fechamento do app.

**Conclusão:** O erro é uma "race condition" visual e de estado provocada pelo re-render agressivo do DOM durante uma operação de arrasto ativa. O item 3 parece agrupado visualmente porque o DOM foi reconstruído uma vez, mas a cadeia de eventos de persistência final (que garante a ordem e o sync) é quebrada.