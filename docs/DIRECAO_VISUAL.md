# Direção visual da interface Retivvo

A tarefa de referência é encontrar um orçamento enviado e decidir o próximo contato. Na área de trabalho, a organização selecionada deve continuar visível ao navegar de clientes para propostas, acompanhamentos e relatórios. Na área pública, usar o nome Retivvo e a apresentação comercial do Módulo 30. A folha de estilos da Fase 3 fornece as cores e a família tipográfica da interface.

## Organização das telas

| Tela | Primeira informação | Ação e feedback |
| --- | --- | --- |
| Visão geral | Organização atual, propostas abertas, ganhas e perdidas, quantidade e valor em reais | Tornar os acompanhamentos pendentes fáceis de localizar. Mostrar o estado vazio quando a organização ainda não tem propostas |
| Propostas | Título, cliente e situação, seguidos de valor e data de envio | Priorizar Nova proposta. Associar Editar e Excluir ao registro pelo nome acessível. Manter a confirmação junto ao item |
| Acompanhamentos | Próxima ação, proposta e prazo | Preservar a ordenação das pendências por prazo. Ao concluir, pedir o resultado e anunciar o salvamento |
| Relatórios | Período de envio e totais por situação | Apresentar contagem e soma com unidades explícitas. Distinguir carregamento, erro e consulta vazia |
| Conta e organizações | Identidade da pessoa e empresa selecionada | Separar as tarefas de MFA e gestão de membros das ações de exclusão. Identificar o alvo e explicar a consequência antes de confirmar |

## Componentes e decisões para a Fase 4B

- Manter uma navegação principal com links reais. Em tela estreita, usar um controle com nome “Menu” e estado expandido anunciado, conservando a organização no cabeçalho. Em tela larga, expor os destinos e destacar a página atual. Incluir um atalho de teclado para o conteúdo principal.
- Reutilizar Listing para a hierarquia das listas, ActionForm para estados de envio, Pager para paginação e Notice para mensagens de estado. Posicionar a ação principal junto ao título e os filtros antes dos resultados. Devolver o foco ao acionador após cancelar uma edição.
- Usar cartões de registro com quebra de títulos longos no celular. Em tela larga, alinhar situação, valor e ações em colunas quando houver espaço. Usar algarismos tabulares nas quantias e datas. Preservar os rótulos textuais das situações em todos os tamanhos.
- Usar os tokens em web/styles.css para texto, fundo, superfície, divisores, links, controles, foco e erros. Manter a fonte de sistema, a linha de texto em 1,5 e o foco visível de 3 px. Reservar o sublinhado para links e combinar mensagem textual com qualquer destaque de erro. A troca de estado pode ser imediata, inclusive com preferência por movimento reduzido.
- A confirmação junto ao registro foi escolhida em lugar de um modal para exclusões de itens da lista. Ela mantém visíveis o nome e o contexto da decisão, com menos deslocamento de foco. No painel, contagem e valor já permitem comparar as três situações em dados pequenos ou vazios.
- Na Fase 4B, buscar alvos de toque de pelo menos 44 × 44 px para os controles principais, como meta de ergonomia do projeto. Validar contraste de texto normal de pelo menos 4,5:1 e contraste de componentes de 3:1 nos estados aplicáveis. Verificar teclado, zoom, foco e mensagens de erro separadamente.

## Evidência da interface de partida

No Chromium, as rotas públicas de início, entrada, cadastro e recuperação foram medidas em 320, 390, 768 e 1440 px. Nas 16 combinações, a largura do documento coube no viewport. O menor link ou botão visível mediu 24 px de altura no início e na entrada e 33 px no cadastro e na recuperação. Aumentar as áreas de toque é uma prioridade da próxima subfase. A medição abrangeu as páginas públicas em estado inicial. As listas com textos extensos, o zoom e as tecnologias assistivas requerem testes próprios.

A referência web-design-guidelines do catálogo vercel-labs/agent-skills orientou a revisão de foco, semântica, formulários e navegação. Foi consultada como texto na fonte, sem instalar scripts, fontes ou componentes de terceiros.
