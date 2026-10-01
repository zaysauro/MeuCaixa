# MeuCaixa — Definições oficiais dos relatórios

## Fonte de verdade

Os relatórios usam agregações PostgreSQL e as tabelas operacionais existentes. O frontend não baixa o histórico para fazer somas.

### Venda concluída

`sales.status = 'completed'`

Entra em faturamento, quantidade de vendas, ticket, descontos, produtos e lucro.

### Venda cancelada

`sales.status = 'cancelled'`

Não entra em faturamento, ticket ou lucro. Entra somente em quantidade e valor de cancelamentos.

## Vendas

- Faturamento: `SUM(sales.total)` de vendas concluídas.
- Bruto: `SUM(sales.subtotal)`.
- Desconto: `SUM(GREATEST(sales.subtotal - sales.total, 0))`.
- Ticket médio: faturamento / quantidade de vendas, com proteção contra divisão por zero.
- Desconto percentual: desconto / bruto.
- Formas de pagamento: `sale_payments.amount`.
- Horários: interpretados em `America/Sao_Paulo`.

## Produtos

- Quantidade vendida: `SUM(sale_items.quantity)`.
- Faturamento por produto: `SUM(sale_items.total)`.
- Custo histórico: `sale_items.unit_cost` / `sale_items.total_cost`.
- Lucro: custo histórico versus valor efetivamente gravado na venda.
- Margem bruta: lucro / faturamento.
- Quando o custo gravado é zero, o relatório trata o custo como não informado e não calcula margem/lucro para aquela parcela. O custo não é assumido como zero.
- Estoque operacional por filial: `branch_product_stock`.
- Estoque baixo: quantidade em estoque menor ou igual ao estoque mínimo.
- Estoque zerado: quantidade menor ou igual a zero.

## Caixa

- Caixas: `cash_registers`.
- Sangrias/saídas: movimentações com direção `-1` e tipos de saída.
- Reforços/entradas: movimentações com direção `1` e tipos de entrada.
- Diferença de fechamento: `counted_balance - expected_balance`.
- Caixa aberto aparece como “Em andamento”.

## Filiais

Somente filiais retornadas por `get_my_branches()` são consideradas.

Ordenação padrão: matriz primeiro, depois nome da filial.

Participação = faturamento da filial / faturamento consolidado.

## Financeiro

O módulo atual possui `financial_transactions`, não um submódulo contábil completo de contas a pagar/receber.

- Competência: `created_at`.
- Caixa: `paid_at`.
- Receita: `type = 'income'`.
- Despesa: `type = 'expense'`.
- Em aberto: `paid_at IS NULL`.
- Vencida: em aberto e `due_date` anterior ao fim do período.

Vendas do PDV não são duplicadas como receita administrativa em `financial_transactions`.

## Datas

Os limites dos relatórios são construídos no fuso `America/Sao_Paulo` e enviados ao PostgreSQL como intervalos absolutos. Assim, uma venda às 23:30 no horário de Brasília permanece no dia comercial correto.

## Segurança

As RPCs usam `SECURITY DEFINER`, mas não confiam no frontend. Cada consulta primeiro valida a empresa e restringe as filiais ao conjunto retornado por `get_my_branches()`.

## Performance

As agregações são executadas no PostgreSQL. As tabelas detalhadas usam limite/paginação. Índices compostos por empresa, filial e data foram adicionados na migration `0015_reports_foundation.sql`.

Materialized views/resumos diários ficam para quando benchmark real indicar necessidade.
