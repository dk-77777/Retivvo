# Auditoria final do Retivvo

**Decisão da Fase 7B em 23/11/2026. A jornada comercial passou em ambiente controlado. O beta com dados reais aguarda os controles operacionais e de privacidade abaixo.** O objeto da revisão é o monólito Fastify/React, o schema PostgreSQL, a caixa SMTP de desenvolvimento e o pipeline deste repositório. A execução usou dados sintéticos.

## Matriz de cobertura dos Módulos 0 a 31

A coluna de evidências identifica o artefato e a verificação realizada. As prioridades representam o impacto sobre esta versão. O Prompt Master preservado continua sendo a especificação integral.

| Módulo e requisito | Prioridade | Aplicabilidade | Estado atual | Evidência e teste | Resultado | Pendência e risco residual |
| --- | --- | --- | --- | --- | --- | --- |
| 0, 27, 31 · construir um produto funcional | P0 | MVP | Implementado e testado | Build e jornada Chromium com API e PostgreSQL | Cadastro até proposta ganha, relatório e saída | Validar utilidade com empresas participantes |
| 1, 22 · preservar trabalho, configurações e segredos | P0 | Repositório | Implementado e testado | Histórico Git, lockfile, checksum do Master, Gitleaks no checkout e no histórico | Arquivos de ambiente ignorados, sem detecções nas fontes examinadas | Proteção de branch e acesso administrativo dependem do proprietário do repositório |
| 2 · público, escopo, monetização e validação | P1 | Hipóteses de negócio | Necessita revisão humana | Leitura de AUDITORIA_MVP e INFRAESTRUTURA | Jornada e hipóteses identificadas | Preço, margem, ativação e retorno dependem de observação no piloto |
| 3 · arquitetura e fronteiras de confiança | P0 | Monólito de uma instância | Implementado e testado | server/app, server/config e testes de papéis PostgreSQL | Navegador usa API, runtime usa dois papéis restritos, bootstrap separado | Credenciais de runtime são confiáveis para estabelecer contexto. Mais réplicas exigem quotas coordenadas |
| 4, 11 · interface, responsividade e desempenho | P1 | Web móvel e desktop | Parcialmente implementado | Chromium, axe e medições em TESTES_FINAIS | Jornada em cinco larguras, foco e indicadores verificados | Zoom manual, Safari/iOS, TalkBack/VoiceOver, volume de dados e métricas de campo. Busca textual nas listas e componentes de carregamento do módulo 4 seguem pendentes |
| 5 · autenticação, sessão e MFA administrativo | P0 | Todas as contas | Implementado e testado | Testes integrados de verificação, expiração, revogação, recuperação e cookie de sessão com origem HTTPS configurada | Login e troca de senha com reconfirmação do fator funcionaram. Recuperação de senha revogou as sessões | E-mail foi entregue ao Mailpit. TLS do domínio e entregabilidade do remetente dependem do ambiente escolhido |
| 6 · autorização e isolamento | P0 | Toda operação comercial | Implementado e testado | RLS das migrações 002–010, consultas como papel restrito e APIs de duas organizações | Mesmo membro nas duas empresas viu apenas registros da empresa selecionada em consultas comerciais sem filtro. Revogação impediu acesso | Revisar cada recurso novo e repetir na instância hospedada |
| 7 · entradas, origem, menor privilégio, disponibilidade e logs | P0 | API e pipeline | Parcialmente implementado | Zod, consultas parametrizadas, MFA, quotas, testes de logs, npm audit e Gitleaks | Campos inesperados recusados nos recursos comerciais. A 31ª sonda de banco do mesmo IP no minuto recebeu 429. Falha de SMTP gerou evento sem destinatário ou link | Verificar firewall, proxy, logs de infraestrutura e alertas no destino. A varredura de software está discriminada abaixo |
| 8, 14, 20 · IA, cobrança e integrações comerciais opcionais | P2 | Condicionais a decisões próprias | Não aplicável | Inspeção de rotas, dependências e fluxo de proposta | A aplicação registra manualmente o contato, sem transação financeira ou provedor de IA | Reavaliar os respectivos módulos antes de ativar qualquer integração |
| 9 · integridade, concorrência, persistência e recuperação | P0 | Cadastro e banco | Parcialmente implementado | Chaves compostas, RLS, criação concorrente, ensaio de restauração | Dois envios com a mesma chave geraram uma proposta e um valor no relatório. Dump íntegro restaurado em outro cluster com a política de acesso ativa | Agendar e monitorar cópias fora do host. Medir RPO/RTO com volume do piloto |
| 10 · SEO público | P1 | Landing e rotas públicas | Implementado e testado | Dois cenários Chromium com JS desabilitado, canonical, sitemap, 404 e noindex | Landing navegável. Painel e rascunhos jurídicos fora do sitemap | Indexação, PageSpeed no domínio e Search Console dependem de publicação autorizada |
| 12 · privacidade, direitos e resposta a incidentes | P0 | Conta, dados comerciais e operação | Parcialmente implementado | Rascunhos em /privacidade e /termos, teste de links, exclusão confirmada, controles de logs | Informações acessíveis antes do cadastro e exclusão pessoal testada | Controlador, canal real, bases legais, operadores, localização e retenção final exigem validação humana |
| 13, 30 · páginas, jornada e identidade Retivvo | P0 | Produto atual | Implementado e testado | HTML público, telas conectadas, textos oficiais e teste de navegador | Oportunidade, próxima ação e resultado distinguíveis. Relatório reflete valores em centavos | Suporte real e rodapé com contato dependem da identificação do operador |
| 15, 16 · métricas e monitoramento | P0 | Processo e operação | Parcialmente implementado | Sondas de vida/prontidão, eventos de HTTP, auditoria e falha de e-mail. Ensaio de processo | Estado local, limites e erros verificáveis. Sem rastreamento externo de visitantes | Faltam destino, responsável e teste de entrega de alerta. Métricas de ativação, abandono e recorrência dependem do piloto |
| 17 · testes essenciais | P0 | Build atual | Implementado e testado | npm test, test:e2e e test:deploy | 2 testes unitários, 13 subtestes integrados, 3 cenários Chromium e ensaio do processo passaram | A suíte usa bases pequenas e não mede disponibilidade contínua |
| 18, 19 · CI, deploy, lançamento e reversão | P0 | Instalação no destino | Bloqueado por dependência externa | Workflow versionado, build por SHA, início real em loopback e ensaio de restauração | Artefato e processo verificados localmente | Hospedagem, DNS, HTTPS, SMTP, backup externo e teste pós-deploy exigem ambiente autorizado |
| 21 · economia de recursos | P0 | Piloto | Parcialmente implementado | Seis cenários de consumo em INFRAESTRUTURA, revisão dos manifests | Monólito de uma instância, sem nova dependência financeira contratada | Confirmar tarifas, cotas, bloqueio de excedentes e teto antes de contratação |
| 23, 29 · fases e checkpoints | P0 | Execução | Parcialmente implementado | Histórico de commits e MODEL_HANDOFF | Recomendação e autorização registradas até 7B | Abertura da Fase 8 depende da confirmação de modelo. Incluir usuários depende também dos critérios do módulo 24 |
| 24–26 · aceite, entrega e auditoria | P0 | Beta | Parcialmente implementado | Esta matriz, critérios abaixo, histórico e suítes repetidas | Decisão de manter o beta fechado com evidências rastreáveis | Revalidar os itens externos na implantação aprovada |
| 28 · seleção e revisão de skills | P1 | Banco e autenticação | Implementado e testado | Referências upstream de Better Auth na revisão 20c9e88 e PostgreSQL em c9be0e9. Revisão dos controles contra as bibliotecas instaladas | Contexto transacional e logs mínimos implementados e testados | Rever as referências ao atualizar a stack |

## Decisão sobre os critérios do Módulo 24

| Critério de aceite | Evidência observada | Decisão para usuários reais |
| --- | --- | --- |
| Fluxo principal, autenticação, autorização no servidor, isolamento, erros e testes essenciais | Jornada real, sessão com e-mail e MFA, negativa de permissão, duas empresas, rejeição de conteúdo alterado no reenvio | Verificados no ambiente controlado |
| Controles P0 e vulnerabilidades críticas conhecidas | Revisão de código, pacotes, imagens, privilégios e CI. Evidências desta fase abaixo | Reavaliar imagens e configuração do host do beta. Os P0 operacionais permanecem abertos |
| Deploy funcionando e segredos protegidos | Processo iniciado, credenciais separadas, ausência de detecções no repositório examinado | Validar injeção de segredos, DNS, TLS de entrada e PostgreSQL, SMTP e reversão no destino |
| Backups configurados e testados, monitoramento ativo | Cópia criptografada restaurada em cluster isolado. Sondas e eventos locais ativos | Programar cópias externas, restaurar a partir do destino real, receber alerta de indisponibilidade e de atraso de backup |
| Interface nos dispositivos-alvo | Reflow, foco e axe em Chromium | Exercitar Safari/iOS e dispositivo físico com tecnologia assistiva |
| Custos documentados | Cenários de capacidade e custos variáveis registrados | Confirmar cotas e teto com o proprietário da infraestrutura |
| Privacidade adequadamente tratada | Exclusão, minimização de logs, isolamento e páginas de revisão implementados | Identificar e aprovar operador, fornecedores, canal de titulares, retenção e versões jurídicas |
| Riscos residuais documentados | Esta matriz, SEGURANCA, INFRAESTRUTURA e TESTES_FINAIS | Atribuir responsáveis e registrar evidências para os itens pendentes antes de convidar usuários |

## Evidências desta execução

- `npm run db:prepare` aplicou 009 e 010 sobre o banco de desenvolvimento existente. A repetição reconheceu os mesmos checksums. O teste de integração aplicou a sequência a uma base vazia.
- `npm test` passou com 16 aprovações incluindo o teste agregador. Foram exercitados o cookie Secure/HttpOnly/SameSite=Lax de sessão, a recusa de transporte aberto configurado para produção e um erro sintético de SMTP. O teste HTTPS usa a configuração de origem do aplicativo e não realiza handshake com um domínio público.
- `npm run build`, `npm run lint`, `npm run typecheck`, `npm run format:check` e `npm run test:deploy` passaram. O Chromium executou os três cenários com a nova caixa SMTP e o build. Na jornada, a resposta do primeiro POST se perdeu depois do commit. O reenvio devolveu o mesmo registro e manteve um único valor no relatório. Ao trocar a senha, a pessoa reconfirmou o fator e recuperou acesso à organização na mesma sessão.
- `bash tests/ensaio-restauracao.sh` recuperou a proposta e seu cliente em PostgreSQL isolado. O papel comercial precisou do contexto de organização para ler o registro. O arquivo truncado foi rejeitado antes de iniciar a restauração.
- `npm audit --audit-level=high` informou zero vulnerabilidades. `npm run secrets:check` examinou as fontes e os commits alcançáveis por referências Git com Gitleaks em contêiner sem rede. A ausência de achados se refere às regras e às entradas verificadas.
- A aplicação de desenvolvimento respondeu 200 em `/api/health` e `/privacidade`. A imagem anterior do Mailpit, versão 1.27.11, estava na faixa afetada pelo aviso de gravidade alta GHSA-379p-g4f4-hq5h, corrigido pelo projeto a partir de 1.32.0. O Compose fixa a versão 1.34.0 por digest. Cadastro, confirmação, recuperação e exclusão por e-mail foram exercitados com essa imagem. [Aviso do mantenedor](https://github.com/axllent/mailpit/security/advisories/GHSA-379p-g4f4-hq5h)

## Imagens de banco e e-mail

O Trivy 0.76.2 examinou cópias locais das imagens Linux amd64 com `trivy image --input ARQUIVO --scanners vuln --offline-scan --skip-db-update`. O contêiner teve sistema de arquivos somente leitura, capacidades removidas, rede desabilitada e acesso apenas aos arquivos de análise. A base oficial da Aqua teve digest OCI `fe8a3131d4fd0a4a8fa58f18088dd331fc5094be06f9852e5ecb83430f4fb632`, atualizada em 23/11/2026 às 19h02 UTC. A tabela conta ocorrências por pacote. Um mesmo aviso pode afetar vários pacotes.

| Runtime efetivamente examinado | Críticas | Altas | Médias | Baixas | Indefinidas |
| --- | ---: | ---: | ---: | ---: | ---: |
| PostgreSQL 17 Bookworm do volume existente | 4 | 141 | 242 | 204 | 26 |
| PostgreSQL 17 Alpine oficial usado como base de comparação | 1 | 26 | 37 | 7 | 1 |
| PostgreSQL 17 para base nova, construído com infra/postgres/Dockerfile | 0 | 1 | 6 | 4 | 0 |
| Mailpit 1.34.0, desenvolvimento e CI | 0 | 0 | 6 | 4 | 0 |

O Compose de desenvolvimento original permanece compatível com o volume Bookworm. Os quatro alertas críticos observados foram CVE-2025-7458, CVE-2026-6653, CVE-2023-45853 e CVE-2025-68121. O acesso em loopback reduz a exposição externa. Essa imagem permanece bloqueada para o beta. Os achados são de inventário, sem teste de exploração.

Para clusters novos, `compose.banco-novo.yaml` constrói uma variante oficial Alpine por digest em contexto mínimo, sem rede durante o passo de build. O processo inicia como postgres, com capacidades removidas e sem o binário gosu que introduzia a ocorrência crítica na base Alpine. O ensaio local restaurou os registros do PostgreSQL Bookworm em um cluster novo com essa variante. Adotar a variante para uma base existente exige restauração lógica em outro volume, validação de dados, ordenação e extensões e decisão de corte pelo responsável. Nenhum volume existente foi convertido.

O alerta alto remanescente dessa variante é o CVE-2026-86144 no libxml2 2.13.9-r2. O catálogo aponta correção em 2.13.9-r3. O espelho oficial de APK respondeu 403 neste ambiente inclusive na consulta com acesso ampliado. As rotas comerciais não usam processamento XML no banco. A correção e nova varredura da imagem no destino são condições de liberação. Repetir a análise dos pacotes OpenSSL das duas imagens. A seleção de provedor gerenciado exige evidência equivalente do operador.

Na instância usada para esta revisão a caixa Mailpit 1.27.11 foi preservada e desconectada da rede Docker. A caixa 1.34.0 atende em loopback nas portas 11025 (SMTP) e 18025 (interface). A configuração local privada aponta para essa caixa. Os checkouts novos usam as portas documentadas no Compose.
