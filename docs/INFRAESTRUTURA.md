# Infraestrutura do beta Retivvo

## Decisão de arquitetura para a Fase 5B

Preparar um único processo Node 24 com Fastify, o build do Vite e a API na mesma origem HTTPS. Manter uma réplica inicialmente, dois pools PostgreSQL e o SMTP transacional. A implantação mais próxima da aplicação atual é um servidor Linux autorizado com proxy HTTPS no próprio host e PostgreSQL 17 em rede privada. Usar infraestrutura existente depende de capacidade, acesso, localização dos dados e responsabilidade operacional confirmados. Nenhum recurso externo foi provisionado.

| Componente | Evidência atual | Trabalho e condição de aceite para 5B |
| --- | --- | --- |
| Entrada HTTPS | Fastify escuta em loopback. APP_ORIGIN valida origem exata | Proxy no mesmo host encaminha a porta privada. Em contêineres distintos, configurar bind privado e restringir rede. Validar certificado, renovação, redirecionamento HTTPS, cookies Secure, CSRF e ausência de cache de dados autenticados |
| IP e limites | Fastify usa trustProxy false. Autenticação recebe o endereço do peer | Confiar apenas no salto de proxy identificado, sobrescrever cabeçalhos de origem no ingresso e testar limites com dois clientes. Concentrar todo o tráfego no endereço do proxy pode bloquear várias empresas juntas |
| Dados | Dois pools de até oito conexões por processo. TLS com verificação de certificado em produção | Prever até 16 conexões por réplica mais reserva para administração e backup. Validar cadeia de confiança, migrations, privilégios e RLS em staging. Banco e SMTP de desenvolvimento ficam isolados |
| Identidade e envio | Better Auth protege sessões e segredos de MFA. Mailpit recebe em loopback | Provedor SMTPS, domínio do remetente autorizado, SPF/DKIM/DMARC e teste consentido de entrega. Verificar limites de envio e bloqueios de porta antes da escolha da hospedagem |
| Disponibilidade | GET /api/health consulta ambos os pools | Sonda HTTPS de prontidão com intervalo inicial de 60 s e alerta após três falhas consecutivas. Usar sonda de processo distinta para reinício, evitando ciclos durante queda do banco |
| Auditoria e alertas | Eventos em crm.audit; há limites por processo e persistência para limites de autenticação | Agregar erros 5xx, latência p95, saturação dos pools, falhas de SMTP, idade do backup e espaço livre. Redigir tokens inclusive em URLs de recuperação e verificação no proxy. Restringir acesso e definir retenção com o responsável |

Separar desenvolvimento, staging com dados sintéticos e produção por banco, domínio, credenciais e destino de backup. Preparar staging antes de DNS público. A configuração local usa .env e .env.api. Em produção, ajustar o comando de início para injeção de ambiente pelo host. O preparador atual depende de loopback e do bootstrap local, portanto a implantação precisa de um executor de migração próprio com acesso temporário. A aplicação recebe apenas as credenciais de execução. Guardar a chave BETTER_AUTH_SECRET em cofre com cópia recuperável. Planejar sua rotação com verificação de sessões e MFA.

## Publicação e reversão

1. Em CI, instalar pelo lockfile, executar lint, tipos, build, testes reais com PostgreSQL e SMTP de testes, Chromium e análise de segredos e dependências. Produzir um artefato identificado pelo SHA. O pipeline de PR deve rodar sem credenciais de produção.
2. Antes da liberação, verificar espaço e backup restaurável, aplicar migrations uma vez e validar em staging com os dois papéis distintos. Migrações usam checksum e trava. Manter mudanças de schema compatíveis com a versão anterior durante a janela de reversão.
3. No ambiente aprovado, implantar o mesmo artefato e verificar saúde, login com MFA, escopo entre empresas e gravação/leitura em organização de teste. O operador registra versão, horário e resultados.
4. Em regressão compatível, recolocar o artefato anterior. Se houver incompatibilidade de dados, suspender escritas, preservar o estado atual e restaurar em destino separado. Avaliar as escritas entre o ponto recuperado e a interrupção antes de autorizar o corte. Manter a origem preservada até a reconciliação.

## Backup e recuperação

Proposta inicial para validação com o responsável: dump lógico diário, RPO de 24 h, RTO de 4 h e retenção de 7 cópias diárias e 4 semanais. São metas. Uma exigência menor de perda de dados pode requerer archiving de WAL e recuperação pontual, com novo cálculo de custo.

O job deve gerar arquivo em formato custom, verificar o checksum, criptografar com chave de destinatário de recuperação e transmitir por TLS para armazenamento fora da máquina, com credencial de escrita restrita. Manter checksum e manifesto autenticados, cópia protegida das definições de papéis e chaves recuperáveis em local separado. Registrar versão do PostgreSQL e SHA da aplicação. Alertar se a última cópia íntegra passar de 26 h e ensaiar restauração mensal. A retenção também deve contemplar exclusões de titulares após restauração.

No ensaio local, execute na raiz:

```sh
bash tests/ensaio-restauracao.sh
```

O script cria origem e destino novos, prepara o schema na origem, grava dados sintéticos, executa pg_dump, verifica o arquivo e aplica pg_restore em uma transação. Confere a proposta de 123456 centavos, o vínculo com o cliente e a visibilidade por contexto de sessão. Remove os recursos temporários da execução. Foram restaurados 42601 bytes; a etapa pg_restore durou 0,188 s no primeiro ensaio. Esse tempo cobre apenas o arquivo sintético no cluster local.

Para demonstrar recuperação de desastre, a Fase 5B deve repetir em cluster limpo e isolado, a partir da cópia externa: recuperar papéis com proprietários e grants corretos, restaurar banco e chave de MFA, validar políticas e funções SECURITY DEFINER, comparar registros e executar a jornada de login e proposta. Registrar duração desde o início da recuperação até a disponibilidade da aplicação. As contas privilegiadas e os certificados de produção ainda precisam de ensaio.

## Economia e dimensionamento

O desenvolvimento usou recursos já provisionados. Para o beta, orçar em separado execução Node, banco, tráfego, cópias externas, monitoramento, domínio, CI e e-mail. O monólito dispensa um segundo host de frontend. Prever alternativa com PostgreSQL gerenciado se a operação do host próprio custar mais que a economia de hospedagem.

| Serviço avaliado | Finalidade e decisão |
| --- | --- |
| Supabase | Candidato a PostgreSQL. Documentação oficial consultada indica no Free até dois projetos ativos, banco de 500 MB por projeto e 5 GB de egress. Testar acesso por TCP, limites, suspensão, papéis e comportamento das funções privilegiadas com FORCE RLS em projeto descartável antes da escolha. Backup externo continua necessário |
| Cloudflare Pages e DNS | A documentação do Pages informa até 20 mil arquivos por site Free. Separar o frontend exigiria encaminhamento da API na mesma origem e testes das sessões. Avaliar DNS quando existir domínio autorizado |
| Render ou host equivalente | Verificar suporte real a Node 24, porta de bind, conexões SMTPS, suspensão, armazenamento e cobrança. Cotação direta indisponível nesta sessão. Comparar com custo incremental de host existente |
| SMTP transacional | Validar entrega, cotas diárias e mensais, reputação do domínio e política de excedentes. Mailpit atende o desenvolvimento. O orçamento depende do provedor e do volume real |
| GitHub Actions, monitoramento e analytics | Verificar franquia do proprietário, duração dos jobs e retenção. Iniciar com saúde HTTP, logs mínimos e alertas. Avaliar Sentry, UptimeRobot e Cloudflare Web Analytics conforme necessidade e privacidade |
| IA e pagamentos | O fluxo atual opera sem chamadas de modelo ou transações financeiras. Consumo previsto desses serviços nesta versão é zero |

Fontes oficiais consultadas: [Supabase Billing](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/billing-on-supabase.mdx) e [limites do Cloudflare Pages](https://github.com/cloudflare/cloudflare-docs/blob/a0726160a6417d7c4823fb274ebbd43b1697edef/src/content/docs/pages/platform/limits.mdx). Conferir tarifas comerciais e excedentes antes de recomendar contratação. O acesso direto às páginas de preços de Render, Supabase e Resend recebeu recusa HTTP 403 nesta máquina.

Hipóteses de planejamento por usuário ativo por mês: 20 propostas a 4 KB incrementais por proposta incluindo vínculos, acompanhamentos e índices, 10 MB de tráfego e dois e-mails de autenticação. Medir esses valores no piloto. O armazenamento se acumula com o histórico e a auditoria. O tráfego HTTP da aplicação e o egress do banco são medidos em fronteiras diferentes.

| Ativos | Propostas/mês | Crescimento estimado do banco | Tráfego HTTP mensal | E-mails/mês |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0 MB | 0 MB | 0 |
| 10 | 200 | 0,8 MB | 100 MB | 20 |
| 100 | 2000 | 8 MB | 1 GB | 200 |
| 500 | 10000 | 40 MB | 5 GB | 1000 |
| 1000 | 20000 | 80 MB | 10 GB | 2000 |
| 5000 | 100000 | 400 MB | 50 GB | 10000 |

Usar unidades decimais. Somar à simulação o custo fixo mensal do host, domínio e monitoramento, a base inicial, cópias retidas e tráfego de sondas mesmo com zero usuários. Para cada linha, somar as tarifas dos fornecedores e excedentes sobre as respectivas cotas. Dividir pelos ativos para obter custo por usuário quando houver ativos. Margem de contribuição depende de receita acordada, número de organizações pagantes e custos variáveis. Tarifas, conversão e preço do produto ainda não verificados impedem um total monetário confiável. Antes da ativação, registrar teto autorizado, verificar bloqueio de excedentes e aprovar qualquer serviço que possa gerar cobrança. Escalar horizontalmente exigirá compartilhar limites comerciais hoje mantidos por processo.

## Operação preparada na Fase 5B

O GitHub Actions inicia PostgreSQL e Mailpit descartáveis. Executa checagem de tipos, lint, formatação, build, testes integrados, Chromium, ensaio de recuperação, auditoria de dependências e verificação de segredos. O build web fica disponível por SHA como artefato de CI. O job exige apenas leitura do repositório.

### Processo e sondas

No host, execute `npm ci --ignore-scripts` e `npm run build`. Inicie com `npm run start:host` após injetar o ambiente e aplicar o schema com identidade administrativa separada. Use `NODE_ENV=production`, `APP_ORIGIN` com o domínio HTTPS e as variáveis de banco e SMTP documentadas pelo ambiente local. Se um proxy na própria máquina for o único ingresso, configure-o para sobrescrever X-Forwarded-For com o endereço observado e habilite `TRUST_LOOPBACK_PROXY=1`. O processo escuta em loopback. Valide que outros processos no host não podem enviar tráfego de clientes pelo ingresso interno.

O endpoint `/api/live` responde pela vida do processo. O endpoint `/api/health` verifica as duas conexões do banco e retorna 503 se qualquer uma falhar. O processo em produção registra método, código HTTP e duração em JSON. Para acionar o monitorador existente após três falhas consecutivas, aponte-o para o resultado de `bash scripts/check-health.sh https://ORIGEM`. O script não configura destinatários. A URL pública, o provedor SMTP e o destino de alertas dependem do ambiente aprovado.

### Armazenar e recuperar uma cópia

Instale os clientes PostgreSQL compatíveis e o GnuPG no host de operação. Use um chaveiro operacional isolado com a chave pública de recuperação. Confira seu fingerprint por canal independente. Configure libpq com identidade de backup, TLS verificado e arquivo de credencial com modo 0600.

```sh
bash scripts/backup.sh "/diretorio-privado/retivvo.gpg" "$FINGERPRINT" pg_dump --format=custom
bash scripts/restore.sh "/diretorio-privado/retivvo.gpg" pg_restore --dbname="$BANCO_DESCARTAVEL"
```

Use um nome datado e único por cópia diária. O backup publica o arquivo apenas ao terminar e rejeita substituir um arquivo existente. Programe transferência para o armazenamento externo e alerte pela idade da última cópia confirmada. O armazenamento deve controlar quem pode gerar e substituir objetos. O fingerprint verifica o destinatário, e a criptografia verifica integridade, enquanto o controle de escrita no destino protege a origem da cópia. A chave privada fica com a equipe de recuperação. Antes de restaurar em cluster novo, recrie as identidades e proprietários adequados a partir dos registros protegidos. O restaurador usa arquivo temporário privado, exige confirmação de descriptografia íntegra e aplica o dump em uma transação. Reserve espaço para a cópia descriptografada.

O ensaio automatizado gera uma chave descartável, recupera a cópia em um cluster novo sem rede e verifica tanto o registro quanto a RLS após recriar os papéis. O teste negativo confirma que a cópia truncada não é entregue ao restaurador. SMTP externo, guarda externa, agendamento, entrega de alertas, domínio, TLS do host e deploy público seguem para verificação no ambiente aprovado.
