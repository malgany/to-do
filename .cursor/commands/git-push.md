# Git Push

Comita e faz push das alterações para a branch main.

```bash
#!/bin/bash

# Obtém a branch atual
CURRENT_BRANCH=$(git branch --show-current)

# Verifica se está na branch main
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo "❌ Erro: Não é possível seguir, pois a branch atual ($CURRENT_BRANCH) não é a principal (main/master)."
    exit 1
fi

# Verifica se há alterações
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ Não há alterações para comitar."
    exit 0
fi

# Lista arquivos modificados (antes do staging)
MODIFIED_FILES=$(git status --porcelain | awk '{print $2}')

# Função para incrementar versão (incrementa o último número)
increment_version() {
    local version=$1
    # Extrai as partes da versão (ex: 1.0.1 -> major=1, minor=0, patch=1)
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)
    local patch=$(echo "$version" | cut -d. -f3)
    # Incrementa o patch (último número)
    patch=$((patch + 1))
    echo "$major.$minor.$patch"
}

# Incrementa versão do style.css se foi modificado
if echo "$MODIFIED_FILES" | grep -q "^style\.css$"; then
    if [ -f "index.html" ]; then
        # Extrai a versão atual do style.css
        CURRENT_CSS_VERSION=$(grep -oP 'style\.css\?v=\K[0-9]+\.[0-9]+\.[0-9]+' index.html | head -1)
        if [ -n "$CURRENT_CSS_VERSION" ]; then
            NEW_CSS_VERSION=$(increment_version "$CURRENT_CSS_VERSION")
            # Atualiza a versão no index.html
            sed -i "s/style\.css?v=$CURRENT_CSS_VERSION/style.css?v=$NEW_CSS_VERSION/g" index.html
            echo "📦 style.css: $CURRENT_CSS_VERSION → $NEW_CSS_VERSION"
        fi
    fi
fi

# Incrementa versão do script.js se foi modificado
if echo "$MODIFIED_FILES" | grep -q "^script\.js$"; then
    if [ -f "index.html" ]; then
        # Extrai a versão atual do script.js
        CURRENT_JS_VERSION=$(grep -oP 'script\.js\?v=\K[0-9]+\.[0-9]+\.[0-9]+' index.html | head -1)
        if [ -n "$CURRENT_JS_VERSION" ]; then
            NEW_JS_VERSION=$(increment_version "$CURRENT_JS_VERSION")
            # Atualiza a versão no index.html
            sed -i "s/script\.js?v=$CURRENT_JS_VERSION/script.js?v=$NEW_JS_VERSION/g" index.html
            echo "📦 script.js: $CURRENT_JS_VERSION → $NEW_JS_VERSION"
        fi
    fi
fi

# Adiciona todas as alterações
git add .

# Lista os arquivos alterados para criar uma mensagem de commit
CHANGED_FILES=$(git diff --cached --name-only)
NUM_FILES=$(echo "$CHANGED_FILES" | wc -l)

# Cria uma mensagem de commit genérica baseada nos arquivos alterados
if [ $NUM_FILES -eq 1 ]; then
    FILE_NAME=$(basename "$CHANGED_FILES")
    COMMIT_MSG="Atualiza $FILE_NAME"
else
    # Pega as extensões dos arquivos alterados
    EXTENSIONS=$(echo "$CHANGED_FILES" | sed 's/.*\.//' | sort -u | head -3 | tr '\n' ', ' | sed 's/,$//')
    COMMIT_MSG="Atualiza $NUM_FILES arquivos"
fi

# Faz o commit
git commit -m "$COMMIT_MSG"

# Faz o push
git push origin "$CURRENT_BRANCH"

echo "✅ Commit e push realizados com sucesso!"
echo "📝 Mensagem do commit: $COMMIT_MSG"
```

