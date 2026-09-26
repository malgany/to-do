# Preparar o Chrome para finalizar a configuração

O código foi adaptado para **Firebase Spark gratuito + GitHub Pages** e publicado em 25/09/2026. Não ative Blaze nem vincule faturamento ao Firebase. O Jev continua desligado.

## Situação da publicação

- Frontend publicado em https://malgany.github.io/to-do/ pelo commit `6ef56ab`; execução do Pages concluída com sucesso.
- Firebase confirmado no plano Spark. Login Google ativado e domínio `malgany.github.io` autorizado.
- Regras do Realtime Database publicadas. As regras preexistentes de `sharedLists` foram comparadas e preservadas integralmente.
- App Check continua aplicado ao Realtime Database; nenhuma proteção foi desativada.
- Jev permanece sem endpoint e sem chamadas. Nenhum Worker, integração ou plano Cloudflare foi ativado nesta publicação.
- Pendente: identificar as duas contas, concluir o primeiro login de cada uma, cadastrar seus UIDs na casa e validar a sincronização em dois aparelhos. A página nova abriu sem erros no console, e o fluxo Google chegou à escolha de conta.

Os passos abaixo ficam como referência para concluir essa configuração ou repeti-la em outro ambiente.

## Deixe pronto o essencial

1. **Chrome aberto com a extensão do Codex conectada.** Use o perfil onde estão suas sessões. Quando começarmos, a conexão da extensão será conferida; você não precisa copiar cookies ou senhas.
2. **Firebase Console aberto e logado** na conta que administra o projeto `to-do-8574b`: https://console.firebase.google.com/project/to-do-8574b/overview. Essa conta precisa conseguir configurar Authentication, editar as regras e os dados do Realtime Database. Não precisa contratar Cloud Functions, Storage ou Hosting.
3. **GitHub aberto e logado**, com acesso para atualizar e publicar o repositório `malgany/to-do`: https://github.com/malgany/to-do. Deixe disponível a configuração de Pages. Não precisa mudar a hospedagem.
4. **Saiba quais duas contas Google vocês usarão no aplicativo.** Cada pessoa fará seu próprio primeiro login no app, pelo seu aparelho. Sua esposa não precisa deixar Gmail ou senha disponíveis no seu computador. Depois do login, o Firebase terá a identificação das duas contas para autorizarmos a casa.
5. **Deixe os celulares disponíveis para um teste final** de login, lista compartilhada e atualização da PWA. Você pode precisar confirmar 2FA ou concluir o próprio login quando solicitado.

## Só se quiser ativar o Jev nesta mesma etapa

6. **Cloudflare aberto e logado em uma conta gratuita**: https://dash.cloudflare.com/. Se precisar criar a conta e aceitar termos, faça isso antes. Não precisa comprar domínio, trocar DNS do GitHub Pages nem contratar Workers Paid.
7. **Console oficial da TypeSafe aberto e logado**, com acesso à API Jev: https://console.typesafe.ai/. Se a conta estiver em fila de acesso, o aplicativo funciona normalmente sem Jev enquanto isso.
8. **Tenha a chave Jev disponível em local seguro**, ou deixe o console pronto para criá-la. Não cole a chave nesta conversa, no código ou no GitHub. Na configuração, ela será gravada como segredo criptografado no Worker. Caso a interface exija uma ação sua para inserir a chave, você fará apenas essa etapa.

Estar logado na TypeSafe não comprova que a API já está liberada ou tem saldo. Vamos conferir isso antes de habilitar chamadas pagas. A cobrança aceita aqui é somente a API Jev; Firebase fica no Spark e Cloudflare no Workers Free.

## O que faremos quando você avisar

1. Conferir o projeto, plano Spark, URL real do Pages e configuração atual, preservando as listas existentes.
2. Ativar login Google, autorizar o domínio do site e verificar o App Check/reCAPTCHA existente.
3. Publicar as regras Spark e a versão do frontend pelo fluxo do repositório. O primeiro login pode ser feito mesmo antes de vincular a casa.
4. Após o primeiro login de vocês, cadastrar **somente os dois UIDs** na casa `casa_casal` e vincular as contas. Não substituir/importar a raiz do banco: o cadastro será feito apenas nos novos caminhos, preservando `sharedLists`.
5. Conferir lista compartilhada, histórico, sugestões, duas sessões simultâneas, offline/reconexão e a PWA instalada.
6. Se Jev estiver pronto: conectar o Worker ao repositório pelo painel Cloudflare (pasta `jev-worker`), configurar o segredo, avaliar os exemplos e, só após o resultado aprovado, habilitar o serviço e publicar a URL pública em `shopping-config.js`.

O Worker usa uma configuração de limite que não aparece no painel Cloudflare. Por isso sua publicação deve usar a integração Git do Cloudflare, que lê `wrangler.toml` e executa a publicação automaticamente; não basta colar o JavaScript no editor do painel. A conexão do repositório e os acessos serão conferidos na hora. Não é necessário gerar uma chave privada de conta de serviço Google.

Há ações sensíveis em que a extensão pode pedir sua confirmação, como autorizar uma integração ou criar uma chave. Se aparecerem, explicarei a ação específica. Senhas, 2FA, CAPTCHA, termos e eventuais decisões de cobrança ficam com você quando houver necessidade.

## Mensagem que você pode enviar depois

> Pode concluir a configuração pelo Chrome usando a extensão do Codex. Já estou logado no Firebase do projeto to-do-8574b e no GitHub do repositório malgany/to-do. Mantenha Firebase Spark e GitHub Pages, sem ativar faturamento. As duas contas Google e os celulares estão disponíveis para o primeiro login e o teste. [Também estou logado na Cloudflare gratuita e na TypeSafe, com a chave Jev disponível / Deixe o Jev desligado por enquanto.] Pode configurar os acessos, publicar e validar. Se precisar de login, 2FA ou alguma confirmação minha, me avise.

Você não precisa fazer as configurações técnicas antes. Basta preparar as sessões e os acessos acima.
