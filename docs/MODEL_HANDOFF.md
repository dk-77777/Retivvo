# Checkpoint entre segurança crítica e implementação do MVP

## Fase concluída

Fase 2, cibersegurança crítica, executada com GPT-6.2 Astra após a autorização “faça”. Extra High era o nível recomendado. A sessão identificou o modelo e não verificou o seletor de raciocínio.

A fase 1 está registrada em AUDITORIA_MVP.md. A especificação oficial permanece em PROMPT_MASTER_RETIVVO_COMPLETO_MODULOS_0_A_31.md, SHA-256 71172466d9e932c88f92f79a9ce80fa99f0233fab626294a5b9bb70b25943630.

## Entrega real

- server/auth.ts e server/auth-routes.ts configuram Better Auth, confirmação de e-mail, login, MFA, sessão, recuperação, troca de senha e exclusão confirmada.
- server/app.ts, server/http.ts, server/config.ts e server/start.ts implementam o servidor Fastify, controles de origem, quotas, limites de entrada, papéis de organização, gestão de vínculos, operações de clientes e verificação de conectividade.
- migrations/001 a 007 definem o schema da autenticação e do CRM, políticas RLS, privilégios, invalidação de sessões, auditoria e restrições de integridade. scripts/prepare.mjs aplica a sequência em transação, com trava e verificação de checksum.
- compose.yaml adiciona o coletor SMTP local Mailpit. As credenciais de autenticação, negócio e bootstrap são distintas. O papel da API não é proprietário das tabelas comerciais. O servidor restringe as consultas ao usuário identificado pela sessão, e o banco aplica as políticas de acesso.
- package.json, package-lock.json, tsconfig.json e eslint.config.js registram dependências e verificações. tests/security.test.ts exercita o fluxo integrado. scripts/check-secrets.sh examina os arquivos que podem entrar no Git. README.md e SEGURANCA.md documentam execução, decisões, limites e riscos.
- A API de clientes serviu como primeiro recurso comercial persistente para testar isolamento. O frontend e o restante da jornada comercial continuam na fase 3. O e-mail usa uma caixa de desenvolvimento em loopback. Não houve contratação de serviço.

## Evidências desta instância

Instalação pelo lockfile com npm ci --ignore-scripts. A preparação do banco executada novamente reconheceu as migrações aplicadas. A suíte aplicou a sequência também em banco novo, isolado, com usuários de teste. Uma falha inicial de limpeza foi corrigida ao fechar os pools antes de remover o banco temporário. Um teste também mostrou que quatro segundos para a saudação do SMTP eram insuficientes. O transporte passou a usar quinze segundos para essa etapa. O envio ocorre em segundo plano e o teste espera pela mensagem efetivamente recebida.

npm run lint, npm run typecheck e npm run format:check passaram. npm test registrou nove aprovações contando o teste agregador e oito subtestes, sem falhas nem testes ignorados. Cobertura observada: verificação por e-mail, MFA, isolamento de leitura e mutações entre empresas, RLS sem filtros explícitos, papéis de banco, revogação de associação e sessão, expiração, recuperação de uso único, troca de senha, encerramento confirmado, auditoria e limites de tentativas. Os testes ocorreram no Fastify com PostgreSQL e SMTP locais. Na API em execução, GET /api/health respondeu 200 e GET /api/organizations sem sessão respondeu 401.

npm audit não indicou vulnerabilidades no lockfile durante esta verificação. Gitleaks examinou os arquivos incluíveis no repositório e retornou zero detecções. Auditoria de imagens, validação de TLS na hospedagem final, entrega de e-mail externo, backup e restauração e testes em navegador ainda precisam de evidência nas respectivas fases.

## Próximo checkpoint

Fase 3 — Implementação do MVP. O Módulo 29 recomenda trocar para GPT-6.2 Sol com raciocínio Medium. A próxima entrega conecta React à API, persiste propostas e acompanhamentos e alimenta dashboard e relatórios com os dados de cada organização. Todas as novas tabelas e agregações precisam de controles e testes de isolamento. Preservar a nomenclatura e as mensagens oficiais do Módulo 30. Aguardar confirmação da troca manual ou autorização para manter a configuração atual antes de iniciar essa fase.

# Checkpoint entre implementação do MVP e experiência

## Fase concluída

Fase 3, funcionalidade principal, com GPT-6.2 Sol após a autorização “faça”. Medium era o nível recomendado. A sessão identificou o modelo e não verificou o seletor de raciocínio.

A interface React com Vite atende cadastro, entrada, recuperação e configuração de MFA. O Fastify serve o build e a API na mesma origem. A área autenticada permite selecionar a organização, gerir membros, cadastrar clientes, registrar e atualizar propostas, agendar e concluir acompanhamentos e consultar a visão geral e relatórios por período de envio. O valor comercial usa centavos inteiros no banco. O registro da próxima ação é manual. Cada acompanhamento concluído exige um resultado, e a situação da proposta é atualizada pelo usuário.

A migração 008 define as novas tabelas em PostgreSQL, as políticas RLS sobre elas, os vínculos por organização e índices de listagem. O servidor reutiliza a identidade verificada e a transação por organização. Os pontos de entrada estão em server/commercial.ts e server/web.ts. A interface está em web. O build está configurado em vite.config.ts. Os comandos e a primeira jornada estão no README.md. As políticas PostgreSQL foram conferidas usando a mesma referência supabase-postgres-best-practices da fase 2.

O teste integrado em PostgreSQL passou com nove cenários mais o teste agregador, sem falhas ou ignorados. No Chromium a jornada criou e confirmou conta, confirmou MFA, cadastrou cliente e proposta, agendou um acompanhamento, confirmou persistência após recarregar a página, concluiu a ação, marcou proposta ganha, conferiu relatório e encerrou a sessão. Foi corrigido um redirecionamento causado por dados antigos da sessão durante a transição após o login. Lint, tipos, formatação e build passaram. As suítes usaram usuários de teste, bancos descartáveis e SMTP local. Nenhum serviço pago foi contratado.

## Próximo checkpoint

Fase 4A, direção visual. O Módulo 29 recomenda GPT-6.2 Astra com raciocínio High para definir hierarquia visual, componentes e experiência responsiva e acessível. A fase 4B implementará as decisões de interface. O fluxo principal está disponível localmente. Validação mais ampla de acessibilidade, dispositivos, desempenho e preparação para beta pertence às próximas etapas. Aguardar a troca manual confirmada ou autorização para manter a configuração atual.

# Checkpoint da Fase 4A

A direção visual foi definida com GPT-6.2 Astra após a confirmação do usuário. High era o raciocínio recomendado. O seletor de raciocínio não foi observado pela sessão. As decisões de hierarquia, navegação, componentes, foco, toque, feedback, estados vazios e movimento estão em DIRECAO_VISUAL.md. As cores existentes foram organizadas como tokens em web/styles.css. O escopo da subfase foi a definição do design para as telas funcionais existentes.

A medição no Chromium cobriu quatro rotas públicas em quatro larguras. O relatório registra largura e altura dos alvos observados e distingue esses resultados da validação de acessibilidade que ainda será feita. A identidade verbal continua sendo a definida no Módulo 30.

Próxima etapa: Fase 4B, implementação visual. O Módulo 29 recomenda GPT-6.2 Sol com raciocínio Medium para implementar e testar as decisões em React e CSS. Aguardar confirmação da troca ou autorização para continuar com a configuração atual.

# Checkpoint da Fase 4B

A implementação visual foi concluída com GPT-6.2 Sol após a autorização “faça”. Medium era o raciocínio recomendado. A interface inclui menu compacto, atalho para o conteúdo, alvos de toque maiores, organização visível no cabeçalho, cartões com ações identificadas por registro, foco restaurado ao cancelar e acesso direto aos acompanhamentos pelo painel.

Build, checagem de tipos, lint, formatação, nove cenários de integração e o fluxo no Chromium passaram. A suíte verificou navegação por teclado e reflow de título extenso. DIRECAO_VISUAL.md registra larguras, dimensões, contraste e verificações manuais pendentes. Os resultados cobrem o navegador e serviços locais.

A próxima etapa é a Fase 5A, planejamento de infraestrutura. O Módulo 29 recomenda GPT-6.2 Astra com raciocínio High para definir hospedagem, gestão de ambientes, segredos, backups, recuperação de desastre e custos. Aguardar a confirmação da troca ou autorização para manter a configuração atual.

# Checkpoint da Fase 5A

Planejamento realizado com GPT-6.2 Astra após a autorização “faça”. High era o raciocínio recomendado. O plano está em INFRAESTRUTURA.md e cobre arquitetura de hospedagem, limites atuais do runtime, ambientes, acesso ao banco e ao SMTP, migrações, segredos, observabilidade, versões, reversão e seis cenários de consumo. As metas iniciais propostas são RPO de 24 horas e RTO de quatro horas.

O ensaio tests/ensaio-restauracao.sh recuperou schema e dados sintéticos em outra base PostgreSQL 17 do mesmo cluster. A leitura com o papel restrito confirmou o isolamento e o valor persistido. A recuperação em outro host a partir de cópia externa criptografada segue pendente. A seleção comercial depende de cotação, disponibilidade, limites e autorização. O endpoint de saúde e os serviços locais responderam durante a inspeção.

Próxima etapa: Fase 5B, configuração e implementação. O Módulo 29 recomenda GPT-6.2 Sol Medium para configurar pipelines, serviços, backups, alertas e testes operacionais. Começar pelo ambiente isolado. Aguardar a confirmação da troca ou autorização para manter a configuração atual. O deploy público requer autorização própria.

# Checkpoint da Fase 5B

A configuração operacional foi implementada com GPT-6.2 Sol. Foram adicionados o pipeline do GitHub Actions, o comando de início com ambiente injetado, sondas de vida e prontidão, logs HTTP mínimos e scripts de backup criptografado, recuperação e sondagem. O ensaio em um segundo cluster isolado confirmou restauração de dados e RLS e rejeitou arquivo truncado antes de executar pg_restore. A checagem controlada de sondas confirmou 200 e 503 nos estados esperados. O ambiente aprovado ainda precisa de hospedagem, domínio, SMTP, armazenamento externo e destino de alertas.

Próxima etapa: Fase 6, SEO, landing page e apresentação, também em GPT-6.2 Sol Medium.

# Checkpoint da Fase 6

A mesma sessão GPT-6.2 Sol implementou a página comercial estática, CTA de cadastro, FAQ de produto, títulos e descrição, Open Graph, Twitter Card, imagem compartilhável, favicon e 404 com status correto. O servidor habilita canonical e sitemap na publicação HTTPS explicitamente configurada e mantém as rotas da conta e do painel com noindex. A direção visual e o texto do Módulo 30 orientaram o conteúdo. A skill seo-audit foi consultada em coreyhaines31/marketingskills e nenhuma instalação foi necessária.

A jornada comercial e os dois cenários de apresentação passaram no Chromium. Os cenários cobriram a página sem JavaScript, CTA em 320 px, canonical, sitemap, noindex, assets e 404. Nove cenários de integração, build, lint, tipos e formatação passaram. O workflow da Fase 5B concluiu com sucesso no GitHub Actions. Indexação real e Core Web Vitals em produção dependem de publicação em domínio aprovado. Nenhum rastreamento de visitantes está configurado.

Próxima etapa: Fase 7A, testes finais e auditoria preventiva. O Módulo 29 recomenda GPT-6.2 Sol High para executar a bateria de testes e correções. Fase 7B, auditoria aprofundada, tem checkpoint separado. Aguardar confirmação do ajuste de raciocínio ou autorização para continuar na configuração atual.
