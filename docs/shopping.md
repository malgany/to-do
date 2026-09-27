# Compras no Firebase Spark

## Arquitetura entregue

O frontend permanece no GitHub Pages. Login Google e Realtime Database usam o projeto existente `to-do-8574b` no plano Spark. Não há Cloud Functions, Firebase Admin, Secret Manager ou serviço Firebase que exija Blaze nesta implementação.

O compartilhamento é específico para uma casa com duas contas previamente autorizadas por um administrador. Não há criação de casas/convites pelo cliente. A interface oferece login e identificação da conta antes do vínculo; depois do provisionamento, listas, histórico e preferências são sincronizados automaticamente.

Categorias e sugestões funcionam no navegador, sem modelo. Jev é opcional: um Cloudflare Worker no plano Free valida o token Firebase e a autorização no banco antes de enviar nomes de itens desconhecidos à TypeSafe. A chave fica no segredo `JEV_API_KEY` do Worker. O app contém somente a URL pública em `shopping-config.js`, vazia por padrão.

## Funcionalidades e critério das sugestões

Mercado, Farmácia e Pet usam o catálogo das pré-listas; nomes desconhecidos ficam em Outros. A categoria pode ser corrigida e há alternativa Manual. Finalizar compra registra comprados/não encontrados/pendentes e bloqueia a lista encerrada. Uma compra nova usa outra lista. O histórico permite corrigir resultados, data, modalidade e remover registros das sugestões.

São consideradas até 12 compras completas do mesmo tipo com ao menos um item comprado. Recorrência exige duas aquisições; a mediana dos últimos cinco intervalos define a frequência. O item começa a aparecer uma rodada antes do intervalo usual, respeitando uma rodada mínima. Reposições rápidas atualizam aquisições sem avançar o ciclo dos outros produtos. Uma aquisição recente suprime a indicação de item não encontrado. Pendentes/excluídos não contam como comprados.

O painel começa com até oito sugestões, sem seleção automática. Há quantidade, Agora não, Não sugerir mais e atalho para outra lista aberta que já contém o produto. A inclusão confere as listas atuais novamente, evitando duplicação. As sugestões refletem registros de compra, não um estoque real.

## Sincronização e segurança

`shopping-remote.js` usa o mesmo modelo de merge local e prepara transações por registro. `shopping-cloud.js` executa `runTransaction` no SDK do Realtime Database. A finalização grava a lista encerrada e a compra na mesma transação; o ID de compra é estável. Requisições repetidas não duplicam o histórico. Conflitos com o conteúdo revisado exigem nova revisão. Correções de histórico usam revisão otimista.

A ACL fica em `householdAccess/{householdId}/{uid}: true`, e o vínculo em `householdUsers/{uid}/householdId`. Esses caminhos são somente leitura pelo cliente; sua criação/alteração é administrativa. Cada conta só lê seu próprio vínculo; somente membros leem a casa e sua ACL. O Worker verifica o token pelas mesmas regras via REST, sem credenciais administrativas.

Cada compra usa `households/{householdId}/records/{listId}` com uma revisão e dois conteúdos JSON em strings: lista de trabalho e histórico sem fotos. Essa representação permite que as regras comparem exatamente os bytes da lista encerrada e preserva arrays vazios. As regras validam permissão, limites de tamanho, revisões, campos externos, datas e consistência entre encerramento e existência do histórico. Proíbem reabrir ou alterar o conteúdo da lista encerrada, apagar fisicamente o registro, remover seu histórico ou alterar a ACL.

As regras RTDB não analisam semanticamente o JSON interno. Os nomes/itens são validados no cliente; as duas contas autorizadas são consideradas coautoras e podem corrigir os registros. Uma alteração manual indevida por um membro pode produzir JSON inválido, que o cliente rejeita com erro em vez de renderizar. Esta é uma arquitetura doméstica para pessoas confiáveis, não um sistema de auditoria contra membros maliciosos.

A fila offline continua separada por UID/casa, persistida antes do envio, com retry limitado. Respostas de sessões antigas são descartadas; troca de conta remove imediatamente a casa anterior da tela. Correções do histórico doméstico exigem conexão. O histórico local permanece no navegador sem conta; ele não é compartilhado silenciosamente. Limpar o cache pelo menu preserva os dados, mas apagar dados do navegador elimina o que só existe localmente.

## Compatibilidade

Códigos antigos em `sharedLists/{code}` mantêm o contrato anterior. A ACL privada protege os novos registros domésticos, não torna privados retroativamente os códigos antigos. Copiar para nossa casa cria uma cópia independente com referência à origem. Repetir a importação da mesma origem não duplica a lista; registros domésticos prevalecem sobre equivalentes locais nas sugestões deste aparelho.

Não se infere histórico a partir de listas antigas. Organize a lista como compra, revise as marcações e finalize com a data correspondente. Remover uma lista não remove o histórico; remover uma compra usa tombstone. A versão anterior baseada em Functions não foi publicada. Não há migração automática de uma eventual implantação externa dessa versão; se ela existir, exporte e converta seus dados antes de usar as novas regras.

## Testes locais

Requisitos: Node.js 22 ou mais recente, Java 21 para os emuladores.

```powershell
npm ci
npm test
npm run test:emulators
npm run eval:jev:check
```

A integração usa somente Authentication e Realtime Database do projeto isolado `demo-todo`. Não requer chave Jev, segredo Google, faturamento ou Functions. Ela provisiona duas identidades sintéticas, testa edição concorrente, fechamento idempotente, correção, arrays vazios, usuários externos e gravações proibidas. Os testes do Worker usam respostas simuladas, sem chamadas à TypeSafe.

Para uso manual local, em terminais separados:

```powershell
npx firebase emulators:start --project demo-todo --only auth,database
python -m http.server 8765 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8765/?emulators`. Apenas localhost/127.0.0.1 aceitam esse parâmetro. As contas/casa também precisam ser provisionadas no banco emulado para usar compartilhamento. Sem o parâmetro, a configuração Firebase é a de produção; não faça testes de escrita reais involuntariamente.

## Configuração e publicação pelo Chrome (etapa posterior)

O roteiro simples para preparar as sessões está em [PREPARAR-CHROME.md](PREPARAR-CHROME.md). Nada foi publicado nesta etapa.

1. Conferir Spark e manter faturamento desligado. Não executar `firebase deploy --only functions` nem criar Cloud Functions.
2. Ativar Google em Authentication, conferir nome/e-mail de suporte e autorizar o hostname real do GitHub Pages, sem caminho. Para a URL padrão do repositório: `malgany.github.io`. Conferir também App Check/reCAPTCHA existente; não desativar proteções para contornar falhas.
3. Publicar `database.rules.json` no Realtime Database preservando o namespace legado. Pelo terminal autenticado, o equivalente é `npx firebase deploy --only database --project to-do-8574b`.
4. Publicar os arquivos estáticos pelo fluxo atual de Pages, incluindo `household-model.js`, todos os `shopping-*.js` e service worker atualizado. Não publicar `.env`, `.dev.vars`, dependências, relatórios ou credenciais.
5. Cada pessoa entra com sua conta Google no app uma vez. Consultar os UIDs no Firebase Authentication ou no botão Copiar identificação da minha conta. Não criar contas e-mail/senha substitutas para representar um login Google.
6. Pelo console administrativo, criar somente estes caminhos (substituir os UIDs reais):

```text
householdAccess/casa_casal/UID_DA_PRIMEIRA_CONTA = true
householdAccess/casa_casal/UID_DA_SEGUNDA_CONTA = true
households/casa_casal/name = "Nossa casa"
householdUsers/UID_DA_PRIMEIRA_CONTA/householdId = "casa_casal"
householdUsers/UID_DA_SEGUNDA_CONTA/householdId = "casa_casal"
```

Criar a ACL antes dos vínculos. Não importar JSON na raiz do banco nem sobrescrever os dados existentes. A interface acompanha os vínculos sem necessidade de código de convite. Fazer teste real nos dois aparelhos, incluindo PWA instalada, offline e reconexão.

## Jev no Cloudflare Workers Free

O Worker está em `jev-worker/worker.mjs` e a configuração em `jev-worker/wrangler.toml`. O nome é `to-do-jev`, a pasta raiz para Workers Builds é `jev-worker`, sem comando de build personalizado, e o comando de deploy é `npx wrangler@4 deploy` (requer versão 4.36 ou superior). Use o plano Workers Free. Não precisa domínio próprio, mudança de DNS ou Firebase pago.

O Worker `to-do-jev` foi criado no painel Cloudflare Workers Free e publicado manualmente em `https://to-do-jev.yopsadida.workers.dev`. O painel agora permite configurar o binding Rate limiter diretamente: variável `RATE_LIMITER`, namespace `20260925`, limite 10, período 60 segundos. As variáveis públicas `ALLOWED_ORIGIN`, `FIREBASE_DATABASE_URL`, `HOUSEHOLD_ID` e `JEV_ENABLED=false` também estão em Production. O código publicado é uma versão minificada de `jev-worker/worker.mjs`; alterações futuras nesse arquivo precisam ser publicadas de novo. A integração Workers Builds pelo Git é opcional e, se usada, deve apontar para a pasta `jev-worker` e manter nome e bindings sincronizados com `wrangler.toml`.

Antes de publicar, confirmar os valores públicos:

- `ALLOWED_ORIGIN`: origem HTTPS do frontend, sem `/to-do/`.
- `FIREBASE_DATABASE_URL`: URL HTTPS exata do banco existente.
- `HOUSEHOLD_ID`: `casa_casal`, igual à casa provisionada.
- `JEV_ENABLED`: manter `false` até a avaliação real aprovada.
- `JEV_API_KEY`: segredo criptografado do Worker, nunca variável pública ou arquivo Git.

O segredo deve ser configurado em Workers & Pages → `to-do-jev` → Settings → Runtime variables and secrets → Add variable, com Key `JEV_API_KEY`, opção Secret marcada e apenas Production selecionado. O usuário deve colar o valor e concluir `Add variable and deploy` diretamente no Cloudflare. Não colocar a chave em variável comum, variável de build, frontend, GitHub ou chat. Após aprovar a avaliação real, colocar a URL HTTPS terminando em `/classify` em `shopping-config.js`, publicar o frontend, mudar `JEV_ENABLED` para `true` e habilitar a preferência da casa. Mudanças nas variáveis definidas em Wrangler devem ser refletidas no arquivo para não serem revertidas numa futura publicação por Wrangler.

O Worker exige Origin exata, Firebase ID token válido, membro da casa, preferência ativa e limitador disponível. Não confia em claims JWT decodificados pelo cliente. Aceita até 25 nomes de 500 caracteres, escolhe categorias de uma lista fixa por tipo e filtra respostas por confiança ≥0,85 e probabilidade ≥0,90. Não recebe fotos nem histórico; falhas deixam os itens no catálogo/Outros.

Há limite aproximado de 10 chamadas/minuto por casa e por localidade Cloudflare, além da cota global do Workers Free. Esse limitador não é um teto diário/mensal de gastos Jev. A chave só é usada após autenticação; não há mais o contador de 200 chamadas/dia da versão antiga com Functions. Confira limites/créditos na TypeSafe antes de ativar. Nunca habilitar Workers Paid ou Blaze automaticamente.

## Avaliação do modelo

`npm run eval:jev:check` valida os 168 exemplos sem chamar a API. Para uma avaliação real, configure `JEV_API_KEY` apenas no ambiente do terminal e rode `npm run eval:jev`; ela envia somente exemplos do conjunto e pode consumir créditos TypeSafe. Não coloque a chave no chat. O relatório local fica em `test-results/jev-evaluation.json` e é ignorado pelo Git. O gate exige ≥98% de precisão entre respostas aceitas e ≥50% de cobertura, também no subconjunto de itens adicionais, sem erros de rede.

A avaliação real ainda não foi executada. No momento da configuração pelo Chrome, podemos usar uma sessão de terminal local autorizada para executar o conjunto com o segredo, sem registrá-lo em arquivos versionados, ou manter Jev desligado até essa verificação ser concluída. Apenas colar a chave no Worker não comprova qualidade. Mudar modelo, prompt ou taxonomia exige nova avaliação e versão de cache.

## Limites e referências

O Spark e o Workers Free têm cotas e podem limitar o serviço quando esgotadas; permanecer nesses planos não cria cobrança por excedente. Fotos no banco aumentam armazenamento/tráfego, por isso o histórico não as duplica. Não há promessa de gratuidade ilimitada. O custo opcional da API Jev é separado. O audit ainda pode apontar dependências transitivas moderadas do Firebase CLI de desenvolvimento; não há pacote Firebase Admin/Functions publicado nesta versão.

- [Cobrança do Realtime Database](https://firebase.google.com/docs/database/usage/billing)
- [Transações no cliente](https://firebase.google.com/docs/database/web/read-and-write)
- [Workers Free](https://developers.cloudflare.com/workers/platform/pricing/)
- [Rate limiting e dashboard](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Workers Builds pelo Git](https://developers.cloudflare.com/workers/ci-cd/builds/)
