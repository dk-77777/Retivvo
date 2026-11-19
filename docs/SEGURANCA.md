# Segurança da API de desenvolvimento

## Identidade e limites de confiança

O navegador usa a API na mesma origem. O servidor exige o cabeçalho Origin esperado em mutações, valida o corpo de entrada e só encaminha ao Better Auth os cabeçalhos necessários. O endereço usado para limitar autenticação vem da conexão aceita pelo Fastify. Um proxy de produção exigirá configuração e teste próprios. O backend inicia em loopback.

Better Auth confirma o endereço de e-mail antes do login, usa scrypt com salt individual para senhas e mantém sessões no banco. A sessão expira após oito horas e o logout a revoga. Cookies são HttpOnly, SameSite=Lax e Secure em HTTPS. O processo recusa origens HTTP em produção. O envio de e-mail acontece em segundo plano para que o tempo de resposta da recuperação não dependa da latência do SMTP. A instância aguarda tarefas pendentes no encerramento normal. Após interrupção abrupta, o usuário pode solicitar outro link. Recuperação usa link de quinze minutos e revoga as sessões anteriores. A exclusão de conta requer uma sessão e confirmação pelo endereço cadastrado. O titular precisa encerrar a organização antes da exclusão pessoal. Para encerrar uma organização, ela deve estar vazia e o titular deve confirmar seu nome exato.

A criação de uma organização e o exercício do papel de titular exigem MFA. O usuário inscreve um autenticador TOTP e guarda os códigos de recuperação. A verificação concluída é registrada na sessão específica. Uma alteração no estado do fator invalida sessões anteriores, inclusive de outros dispositivos. O titular pode conceder acesso a um usuário cadastrado por ID e revogar esse acesso. O membro trabalha nos registros comerciais da organização. A concessão de acesso e o encerramento ficam reservados ao titular.

## Banco, controles e limites

| Identidade | Acesso |
| --- | --- |
| retivvo_bootstrap | Provisionamento local, migrações versionadas e administração do banco descartável de teste |
| retivvo_auth | DML das tabelas do Better Auth e consulta booleana de titularidade para exclusão de conta |
| retivvo_app | Dados comerciais sob RLS, operações de associação permitidas pelas políticas e inserção em auditoria |

As credenciais geradas para a API ficam em .env.api. A senha do bootstrap fica em .env. Ambos usam arquivos locais privados. O processo HTTP recebe somente o primeiro arquivo. Proteja também volumes, cópias de segurança e a chave do Better Auth, usada para assinar cookies e proteger segredos de MFA. A aplicação usa consultas parametrizadas. Cada operação comercial define usuário e confirmação de MFA dentro de uma transação. A conexão retorna ao pool depois de commit ou rollback. A RLS protege consultas comerciais que omitam o filtro do locatário. O backend e suas credenciais continuam componentes confiáveis capazes de estabelecer o contexto da transação.

A API limita o corpo a 16 KiB e a listagem de clientes a 50 por página. Há limites de requisições por IP, usuário e organização. Os contadores de autenticação ficam no PostgreSQL. Os limites gerais do processo servem à instância única de desenvolvimento e precisarão de coordenação antes de escalar horizontalmente. Respostas privadas usam Cache-Control no-store. O histórico crm.audit registra operação, status, horário e, nas alterações administrativas de organização, os identificadores internos. O papel comercial só pode inserir eventos. Para operações de autenticação, os eventos registram tipo e resultado HTTP. Triggers registram criação, revogação e confirmação do segundo fator por sessão, com o identificador interno do usuário. Um desafio de MFA emitido com HTTP 200 ainda requer a verificação do fator. Senhas, cookies, links e corpos de requisição ficam fora desses eventos.

## Testar na raiz do projeto

Suba os dois serviços locais e execute npm run db:prepare, npm run typecheck e npm test. A suíte cria um banco com nome aleatório, aplica as mesmas migrações e encerra as conexões antes de remover esse banco. O teste usa usuários fictícios e lê apenas mensagens dirigidas aos endereços de teste no Mailpit local. O Mailpit aceita SMTP em loopback, permite ler os links dos testes e deve ser usado somente em desenvolvimento isolado. O arquivo README.md contém os comandos de instalação e inicialização.

## Revisão de ferramentas e riscos residuais

Na fase 2, as referências textuais better-auth-security-best-practices e supabase-postgres-best-practices foram consultadas nos repositórios better-auth/skills (20c9e88) e supabase/agent-skills (c9be0e9). As decisões aproveitadas foram verificar a origem das requisições, confirmar MFA, limitar privilégios por papel e testar as políticas com duas empresas. A referência PostgreSQL declara licença MIT. As instruções de Better Auth foram consultadas diretamente na origem. Nenhum instalador de skills foi executado nem houve incorporação de seus scripts ao produto.

Antes do beta, testar HTTPS e encaminhamento de origem na hospedagem escolhida, configurar SMTP real, validar entrega e retenção de e-mails, configurar backup e testar restauração. Definir retenção e monitoramento dos logs e da base de sessões, segredos por ambiente e resposta a abuso. Verificar as novas tabelas, consultas agregadas e fluxos de interface da fase 3 com os mesmos usuários de teste. O usuário do Docker e o administrador do banco local têm acesso privilegiado. O Compose de desenvolvimento destina-se a uma máquina isolada. Nenhum teste desta fase atesta os controles do futuro ambiente de produção.

## Fluxo comercial da fase 3

A migração 008 aplica RLS às propostas e aos acompanhamentos. As chaves estrangeiras compostas incluem a organização e impedem associar uma proposta a cliente de outra empresa ou um acompanhamento a proposta externa. Excluir um registro com dependências exige encerrar esses vínculos primeiro. O servidor recebe o valor em centavos inteiros e exige o resultado do contato ao concluir um acompanhamento. A visão geral e os relatórios calculam contagens e totais dentro da transação restrita à organização. Totais em centavos atravessam a API como texto decimal para preservar precisão.
