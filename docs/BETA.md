# Validação do Retivvo · Fase 8

**Estado em 24/11/2026. Ensaio com dados sintéticos. O piloto com empresas permanece pendente.**

## Preparar a rodada

Antes do primeiro convite, registrar a infraestrutura e o responsável pela operação, a versão da aplicação, o período do piloto e o teto de gastos aprovado. Verificar os controles abertos na auditoria, incluindo HTTPS, SMTP externo, backup com restauração, alerta entregue, dispositivos-alvo, termos e canal para titulares. Usar um ambiente separado dos bancos de desenvolvimento. [Auditoria final](AUDITORIA_FINAL.md) · [Infraestrutura e recuperação](INFRAESTRUTURA.md)

Cada empresa participante pode percorrer a jornada com uma pessoa responsável pelo teste. Pedir que confirme o cadastro, configure o autenticador, crie a organização, registre um cliente e uma proposta, agende o retorno e confira o relatório após atualizar o resultado. Anotar a tarefa em que precisou de ajuda, o dispositivo e navegador e se conseguiu concluir. Usar um código de empresa no relatório e excluir nomes de clientes, e-mails e textos de propostas das anotações. Registrar os retornos espontâneos e os problemas no canal acordado para o piloto.

## Medição

A coleta fica desativada por padrão. Em instância dedicada ao piloto, após a revisão de privacidade, a operação pode configurar `BETA_METRICS=1` e reiniciar o serviço. A migração 011 registra apenas organização, dia em São Paulo e tipo. Escritas na mesma transação registram atividade após inserir ou efetivamente alterar uma proposta ou acompanhamento. A primeira criação de acompanhamento no período observado marca a ativação. A observação começa na ativação da coleta e os registros não são retroativos. Encerrar a organização remove seus registros de medição.

O papel da aplicação pode gravar eventos da organização autorizada. A leitura cabe à operação do banco, que deve compartilhar apenas os totais. Exemplo de consulta para um período com começo inclusivo e fim exclusivo:

```sql
SELECT *
FROM crm.beta_summary(DATE '2026-12-01', DATE '2027-01-01');
```

| Indicador | Como registrar |
| --- | --- |
| Atividade | `active` conta empresas com uma escrita comercial qualificada no período |
| Ativação | `activated` conta empresas com seu primeiro acompanhamento observado no período. Comparar com as empresas admitidas no piloto no mesmo intervalo |
| Retenção | `retained / eligible` considera organizações que voltaram a gravar atividade entre o 7º e o 13º dia após ativar. `eligible` exige que a janela inteira esteja coberta pelo relatório. Exibir sem dados quando o denominador for zero |
| Conclusão sem assistência | Dividir as jornadas completas sem ajuda pelas iniciadas. Registrar separadamente em qual tarefa houve abandono |
| Erros e custo | Consolidar indisponibilidade, HTTP 5xx, falhas de e-mail, idade do backup, horas de suporte e gasto por fornecedor. Comparar a soma com o teto aprovado e acompanhar cotas |

## Resultado desta rodada

| Evidência | Resultado |
| --- | --- |
| Cadastro, propostas e acompanhamentos | Cenário integrado com PostgreSQL, Mailpit e duas credenciais com MFA. A criação da proposta e dois acompanhamentos para a mesma organização geraram uma entrada de atividade e uma de ativação no dia |
| Retenção | Datas controladas em banco descartável confirmaram que uma coorte parcial fica fora do denominador. O relatório posterior contou uma empresa elegível e retida |
| Privacidade | A suíte verificou ausência de eventos com a configuração padrão e recusou acesso ao relatório pelo papel da aplicação |
| Validação com empresas | Requer ambiente aprovado e participantes. Ativação, retenção, feedback e custo por empresa ainda carecem de dados do piloto |
| PostgreSQL | A tag oficial `17-alpine` ainda apontava para o digest auditado. O índice de pacotes retornou 403 pelo acesso padrão e pelo ampliado. A correção da imagem no destino segue pendente |
