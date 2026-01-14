# Sistema de Alertas e Confirmações Personalizados

Este sistema substitui os alertas e confirmações nativos do JavaScript (`alert` e `confirm`) por modais personalizados com design moderno e suporte a dark mode.

## Como Usar

### 1. Alerta Simples

```javascript
// Alerta informativo (padrão)
await showAlert('Operação concluída com sucesso!');

// Alerta de sucesso
await showAlert('Tarefa criada!', 'success');

// Alerta de aviso
await showAlert('Por favor, preencha todos os campos', 'warning');

// Alerta de erro
await showAlert('Erro ao processar sua solicitação', 'error');
```

**Tipos disponíveis:**
- `info` (padrão) - ícone: info, cor: azul
- `success` - ícone: check_circle, cor: verde
- `warning` - ícone: warning, cor: laranja
- `error` - ícone: error, cor: vermelho

### 2. Confirmação

```javascript
// Confirmação simples
const confirmed = await showConfirm('Deseja continuar?');
if (confirmed) {
  // Usuário confirmou
}

// Confirmação com opções personalizadas
const confirmed = await showConfirm(
  'Deseja realmente excluir este item?\n\nEsta ação não pode ser desfeita.',
  {
    title: 'Excluir Item',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    type: 'danger'
  }
);

if (confirmed) {
  // Usuário confirmou a exclusão
} else {
  // Usuário cancelou
}
```

**Opções de configuração:**
- `title` - Título do modal (padrão: 'Confirmação')
- `confirmText` - Texto do botão de confirmar (padrão: 'Confirmar')
- `cancelText` - Texto do botão de cancelar (padrão: 'Cancelar')
- `type` - Tipo visual: 'warning', 'danger', 'info' (padrão: 'warning')

**Tipos de confirmação:**
- `warning` - aviso (laranja)
- `danger` - perigo/exclusão (vermelho)
- `info` - informação (azul)

## Características

- ✨ Design moderno e responsivo
- 🌓 Suporte a dark mode automático
- 🎨 Animações suaves de entrada e saída
- ⌨️ Suporte a teclado (ESC para fechar)
- 📱 Otimizado para dispositivos móveis
- 🔒 Previne XSS automaticamente

## Exemplos de Uso no App

### Validação de formulário
```javascript
if (!name) {
  await showAlert('Por favor, digite um nome para a lista', 'warning');
  return;
}
```

### Confirmação de exclusão
```javascript
const confirmed = await showConfirm(
  `Deseja realmente excluir a lista "${listName}"?\n\nTodas as tarefas serão perdidas.`,
  {
    title: 'Excluir Lista',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    type: 'danger'
  }
);

if (confirmed) {
  await deleteList(listId);
}
```

### Mensagem de erro
```javascript
try {
  await saveData();
} catch (error) {
  await showAlert('Erro ao salvar dados: ' + error.message, 'error');
}
```

## Substituições Realizadas

Todos os usos de `alert()` e `confirm()` nativos foram substituídos:

1. **main.js**: Validação de nome de lista, confirmação de exclusão de lista
2. **api.js**: Mensagens de erro
3. **detail.js**: Confirmação de remoção de foto

## Notas

- As funções `showAlert` e `showConfirm` são **assíncronas** e retornam Promises
- Sempre use `await` ao chamar essas funções
- Os modais são automaticamente removidos após o usuário interagir
- Apenas um modal pode estar visível por vez (modais antigos são removidos automaticamente)

