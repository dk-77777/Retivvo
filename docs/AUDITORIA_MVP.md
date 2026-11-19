# Diagnóstico inicial do Retivvo

## Ponto de partida

A inspeção em /workspace/Retivvo encontrou somente .git. A branch local work estava sem commits. A consulta de leitura às referências do origin concluiu com sucesso e devolveu uma lista vazia. O checkout inicial não continha documentação, instruções locais, schema, manifests, lockfiles, CI, backend, frontend, testes, configuração de deploy ou ativos visuais. A busca pelos nomes DATABASE_URL, POSTGRES_*, SMTP_* e SUPABASE_* no ambiente inicial não encontrou vínculos exportados. Os valores de outras variáveis não foram coletados.

Sem aplicação para executar na abertura da fase, tempo de resposta, acessibilidade, qualidade da autenticação e exposição de registros ainda não podiam ser medidos. Também não havia dependências declaradas para uma auditoria de pacotes da aplicação. A primeira superfície concreta de operação é o PostgreSQL de desenvolvimento. A versão do banco e o teste de transação constam no checkpoint. A auditoria da imagem e a revisão de atualizações continuam pendentes antes do beta.

## Produto e critério de validação

Pequenas instaladoras e empresas de manutenção de ar-condicionado precisam saber quais orçamentos enviados aguardam retorno. A jornada a validar começa com cadastro e acesso à organização, passa pelo registro de cliente e proposta, agendamento da próxima ação e registro do contato, e termina com a atualização do resultado. Dashboard e relatórios devem refletir os mesmos dados persistidos. Um contato registrado e uma proposta ganha são eventos distintos. O diferencial a validar é a facilidade com que uma equipe encontra e executa o próximo acompanhamento.

No piloto, observar se uma organização consegue completar a jornada sem assistência, se volta para acompanhar outra proposta e se consegue explicar seus indicadores a partir dos registros. Medir ativação pela primeira proposta com acompanhamento, uso recorrente por organização e propostas abertas sem próxima ação. Definir metas numéricas, preço e período do piloto com dados reais. Assinatura por organização é hipótese comercial para validação. Cobrança e comunicação automática exigem decisões próprias.

## Arquitetura inicial proposta

Monólito modular com React, Vite, TypeScript e React Router no navegador, API REST Fastify em Node.js com validação de entradas por Zod e PostgreSQL com migrações versionadas. Separar módulos de contas, organizações e membros, clientes, propostas, acompanhamentos e relatórios. A interface acessa o banco exclusivamente pela API. O servidor resolve organização e permissões pela sessão e associação vigente. Relatórios devem usar os mesmos filtros de organização e critérios de status do fluxo operacional.

Proposta de modelagem para a próxima fase: a organização possui clientes e propostas, cada proposta referencia um cliente da mesma organização e cada acompanhamento referencia sua proposta. Projetar as chaves estrangeiras compostas com o identificador da organização para impedir vínculos cruzados. Separar a conta de migração da conta de execução. Definir políticas de RLS e testes com duas organizações, inclusive em agregações. Resolver autenticação, recuperação e revogação antes dos recursos comerciais. O módulo 30 fornece nome e textos comerciais. A definição visual segue a fase 4.

## Prioridades, riscos e evidências exigidas

| Prioridade | Risco ou necessidade | Verificação exigida |
| --- | --- | --- |
| P0 | Vazamento de clientes, propostas ou totais entre empresas | Testar leitura, edição, exclusão, relacionamentos e relatórios com duas organizações e papéis diferentes |
| P0 | Tomada de conta, sessão persistente após logout, privilégios administrativos | Testar recuperação de uso único, expiração e revogação, MFA administrativo, cookies, CSRF e limites de tentativas |
| P0 | Dados pessoais e credenciais em código, logs ou backups | Revisar privilégios, tratamento de erros, detecção de segredos, retenção e exercício de restauração |
| P0 | Operações parciais, totais inconsistentes e oportunidades sem histórico | Testar transações, constraints, repetição de mutações e o fluxo completo com PostgreSQL |
| P0 | Beta indisponível ou inacessível | Verificar deploy controlado, backup, monitoramento, navegação mobile e por teclado, testes de aceitação da seção 24 |
| P1 | Atrito no onboarding, dificuldade de encontrar próximas ações e interpretar resultados | Observar tarefas no piloto e medir ativação e retorno com minimização de dados |
| P2 condicional | IA, integrações avançadas ou cobrança por uso | Avaliar benefício, privacidade e custo antes de propor ativação |

A classificação orienta precedência. Os requisitos completos, condições de aplicabilidade e critérios de aceite permanecem no Prompt Master.

## Dependências, skills e custos

Node 24.22.1, npm 11.9.0, Docker 29.9.2 e Compose 2.40.3 foram identificados. O registro público do npm respondeu a npm ping. A imagem oficial PostgreSQL 17 foi obtida por Docker e registrada por digest no Compose. O cliente psql é executado dentro do serviço. O setup usa o ambiente já provisionado e não requereu contratação externa.

Para esta fase, a skill gerenciada cloud-environment-runtime orientou a verificação de Docker e do checkout. O arquivo verification-before-completion de obra/superpowers foi consultado como referência de método na revisão 22f0b463e7a5e579904dd6211a520321035526f7. Nenhum instalador de skills foi executado. As skills específicas de segurança, banco, frontend e testes devem ser avaliadas em suas fases, incluindo licença, manutenção, permissões, scripts e compatibilidade antes de eventual instalação.

Os principais fatores de custo do piloto serão armazenamento e conexões PostgreSQL, retenção de backups, processamento da API, tráfego, e-mails de recuperação, CI e retenção de logs. Começar com execução local e regras determinísticas. Preços, cotas gratuitas, margem e cenários de 0 a 5.000 usuários dependem de fornecedor, volume e modelo comercial; levantá-los na decisão de infraestrutura usando fontes oficiais. Serviços pagos, produção e envio de mensagens reais dependem de autorização. A disponibilidade comercial do nome e do domínio precisa de verificação antes da publicação.

## Sequência de entrega

A fase 2 começa pela fronteira de confiança entre sessão, membros e organizações, depois implementa e testa controles críticos. A fase 3 integra os fluxos de negócio; a 4 valida experiência e acessibilidade; a 5 prepara infraestrutura, recuperação e monitoramento; a 6 trabalha apresentação e SEO; a 7 executa os testes finais e a auditoria; a 8 valida o uso com empresas participantes. O estado atual permite iniciar a fase 2 após o checkpoint.
