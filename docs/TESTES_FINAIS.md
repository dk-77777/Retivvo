# Evidências da Fase 7A

Execução em 23 de novembro de 2026 em Linux, Node 24, PostgreSQL 17, Mailpit de desenvolvimento e Chromium 156. Os testes de negócio usaram usuários e bancos descartáveis. A publicação no GitHub usa o mesmo lockfile e executa o build antes de iniciar as suítes.

| Verificação | Comando | Resultado local |
| --- | --- | --- |
| Instalação reproduzível | `npm ci --ignore-scripts` | 234 pacotes instalados a partir do lockfile |
| Qualidade e build | `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build` | Todos passaram |
| Unidade | `npm test` | Dois testes de moeda passaram. Cobrem centavos, o limite por proposta e a formatação de um total inteiro maior que o limite seguro do Number |
| Integração e controles | `npm test` | Nove cenários passaram com PostgreSQL e SMTP. Cobrem limites, sessão, MFA, validação, isolamento entre duas empresas, permissões, recuperação e trilha de auditoria |
| Navegador | `RETIVVO_CHROMIUM=/usr/bin/chromium npm run test:e2e` | Três cenários passaram. Cobrem a jornada completa, validação do valor do orçamento, redimensionamento, foco por teclado, indexação e 404 |
| Acessibilidade | Suíte Chromium com axe-core 4.14.1 | Zero violações nas regras automatizadas WCAG A/AA executadas nas seis telas e estados amostrados |
| Ensaio de publicação | `npm run test:deploy` | O processo de entrada real iniciou a partir do build, serviu CSS, respondeu às sondas, exigiu sessão na API, marcou o painel com noindex e encerrou com SIGTERM |
| Recuperação | `bash tests/ensaio-restauracao.sh` | Arquivo truncado rejeitado antes de executar pg_restore. A cópia íntegra foi restaurada em segundo cluster isolado, com dados e RLS conferidos |
| Dependências e segredos | `npm audit --audit-level=high` e `npm run secrets:check` | Zero vulnerabilidades reportadas pelo npm e zero detecções pelo Gitleaks no checkout examinado |

O runner Node também conta o teste agregador da suíte de integração. A saída foi de 12 aprovações, sem falhas ou casos ignorados. No navegador, o axe verificou página inicial, cadastro, formulário de cliente, formulário de proposta, formulário de acompanhamento e relatório com dados. A jornada verificou foco e reflow em 320, 390, 640, 768 e 1440 px. A análise automatizada cobre parte dos critérios de acessibilidade. Testes com leitores de tela, zoom manual, Safari e dispositivos físicos continuam pendentes.

## Desempenho em laboratório

Lighthouse 13.6.0 executado uma vez por rota em Chromium 156. Perfil móvel simulado com RTT de 150 ms, taxa aproximada de 1,6 Mb/s e CPU 4× mais lenta. Aplicação local, cache de navegação limpo e dados sintéticos. As notas usam escala de 0 a 100.

| Página | LCP | FCP | TBT | CLS | Transferência | Desempenho | Acessibilidade |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | 0,76 s | 0,76 s | 0 ms | 0 | 11,7 kB | 100 | 100 |
| Entrar | 0,76 s | 0,76 s | 9,5 ms | 0 | 290,9 kB | 100 | 100 |

A jornada autenticada executou dez rodadas de três leituras concorrentes, nas rotas de clientes, propostas e relatórios. Todas as 30 requisições retornaram 200. Com uma organização sintética e resposta JSON completa, a última execução local marcou p95 de 25,6 ms e máximo de 27,8 ms. A amostra serve para verificar o caminho crítico com concorrência baixa. Carga representativa de usuários e volume de dados de beta requer medição própria.

PageSpeed Insights, INP de campo e dados de navegação dependem de um domínio público e tráfego real. O ensaio de publicação cobre o processo local e os artefatos. Proxy HTTPS real, TLS do banco hospedado, SMTP externo, alertas em produção e recuperação a partir do armazenamento externo dependem do ambiente autorizado. A auditoria da Fase 7B avalia essas lacunas antes de qualquer declaração de prontidão para beta.
