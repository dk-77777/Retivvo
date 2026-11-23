# Retivvo

Você enviou o orçamento. O Retivvo ajuda a cuidar do próximo passo.

O Retivvo reúne clientes, propostas e acompanhamentos por organização. A interface usa a mesma API e base PostgreSQL para o fluxo comercial, a visão geral e os relatórios. A especificação oficial está em [docs](docs/PROMPT_MASTER_RETIVVO_COMPLETO_MODULOS_0_A_31.md). O [diagnóstico](docs/AUDITORIA_MVP.md) registra o escopo e o [checkpoint](docs/MODEL_HANDOFF.md) indica a próxima etapa.

## Iniciar e verificar o banco local

Na raiz do checkout, use Node.js e Docker com Compose v2. Na primeira execução, gere uma senha exclusiva de desenvolvimento. O comando protege o arquivo contra sobrescrita. Em um ambiente já preparado, preserve o arquivo existente associado ao volume.

```sh
(umask 077 && set -C && node -e 'console.log("POSTGRES_PASSWORD="+require("node:crypto").randomBytes(32).toString("hex"))' > .env)
```

```sh
docker compose up -d --wait db
sh tests/verificar-banco.sh
```

O volume nomeado mantém o banco entre execuções. Use `docker compose stop db` para interromper o serviço. A porta local é 5432. A conta retivvo_bootstrap administra o banco de desenvolvimento. A API usa papéis próprios para autenticação e dados comerciais. O arquivo .env.example documenta a variável necessária.

O teste abre uma sessão TCP com senha e usa uma tabela temporária para validar escrita, commit, leitura e rollback. A tabela desaparece ao fechar a conexão. Este teste verifica o serviço de banco isoladamente. A suíte de segurança exercita a API sobre esse mesmo mecanismo de persistência.

## Executar o Retivvo

Use Node 24 e npm com o lockfile do repositório. Após preparar o arquivo .env como indicado acima, execute na raiz:

```sh
npm ci --ignore-scripts
docker compose up -d --wait
npm run db:prepare
npm run build
npm start
```

A interface e a API usam a mesma origem em 127.0.0.1:3000. A API escuta nesse endereço e consulta os dois papéis do banco em GET /api/health. O script de preparação gera .env.api com modo 0600 na primeira execução e aplica as migrações pendentes. Preserve esse arquivo ao reutilizar o volume. SMTP de desenvolvimento e a caixa Mailpit estão restritos a loopback, nas portas 1025 e 8025. Use remetente e destinatários fictícios nesse ambiente.

As rotas de conta ficam em /api/auth. As rotas /api/organizations e /api/organizations/:org/clients utilizam sessão por cookie. As mutações requerem o cabeçalho Origin igual a APP_ORIGIN. Consulte a [documentação de segurança](docs/SEGURANCA.md) para permissões e o [teste integrado](tests/security.test.ts) para exemplos completos de cadastro, MFA, acesso comercial e revogação.

```sh
npm run lint
npm run typecheck
npm run format:check
npm test
npm run secrets:check
```

A suíte usa o Docker Compose local, um banco exclusivo por execução e a caixa de e-mail de desenvolvimento. O servidor HTTP pode estar desligado durante os testes. Com o build atualizado, execute `npm run test:e2e` para testar a jornada no Chromium do Playwright. Se a máquina já tiver Chromium compatível, use `RETIVVO_CHROMIUM=/usr/bin/chromium npm run test:e2e`. A suíte inicia uma instância e um banco descartáveis, separados da aplicação de desenvolvimento.

Crie uma conta com um endereço fictício, confirme o cadastro na caixa Mailpit e entre no Retivvo. Configure o autenticador em Minha conta para criar uma organização. Cadastre um cliente, registre uma proposta e agende a próxima ação em Acompanhamentos. Ao concluir um acompanhamento, informe o resultado do contato. Atualize a situação comercial em Propostas. A visão geral e os relatórios leem o estado persistido. O filtro de relatórios abrange a data de envio da proposta, inclusive nos dois limites.

## Publicação da página inicial

O build gera a página inicial estática em português, os assets de compartilhamento e a página 404. A indexação pública é desativada por padrão. Habilite `SEO_INDEXABLE=1` junto a `NODE_ENV=production` apenas quando `APP_ORIGIN` corresponder ao domínio HTTPS público aprovado. Nesse modo, o Fastify entrega o canonical, a imagem de compartilhamento e o sitemap para a raiz. Rotas de acesso e da área autenticada continuam com `noindex`, independentemente da opção pública.

O teste de publicação exercita as duas configurações no Chromium, inclusive com JavaScript desabilitado. Verificação real no Search Console e dados de navegação dependem de domínio público e de uma decisão sobre mensuração.
