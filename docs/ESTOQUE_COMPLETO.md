# Estoque completo — MeuCaixa

## Arquitetura aplicada

- Catálogo de produtos continua compartilhado pela organização.
- Saldo físico continua por filial em `branch_product_stock`.
- Cada filial possui `average_cost` independente.
- Custo médio ponderado é recalculado somente em entradas positivas.
- Saídas usam o custo médio vigente e não recalculam o custo.
- Transferências carregam o custo da filial de origem para a filial de destino.
- `inventory_movements` é o Kardex imutável.
- `quantity_delta` é assinado: entrada positiva, saída negativa.
- Saldo inicial é criado sem alterar os saldos existentes.
- Alterações de estoque passam por RPC transacional.
- Escrita direta em estoque/Kardex/transferência é revogada para usuários autenticados.

## Operações

- Entrada com custo unitário e fornecedor opcional.
- Saída com motivo obrigatório.
- Ajuste de estoque com motivo obrigatório.
- Inventário físico/contagem rápida.
- Transferência `requested -> sent -> received`.
- Estoque em trânsito.
- Cancelamento de transferência com estorno.
- Cancelamento de venda com estorno de estoque e caixa.
- Histórico de custo médio por filial.
- PDV existente continua responsável pela venda e passa a ter seus movimentos normalizados pelo trigger do Kardex.

## Transferências

1. Solicitação não altera estoque.
2. Envio baixa a origem e cria estoque em trânsito.
3. Recebimento adiciona o confirmado ao destino.
4. Cancelamento antes do envio apenas cancela.
5. Cancelamento após envio devolve o trânsito à origem.
6. Cancelamento após recebimento cria estorno no destino e retorno à origem.
7. `request_key` evita duplicação intencional de uma mesma solicitação.

## Segurança

- Estoque é filtrado por `can_access_branch`.
- Alterações administrativas exigem owner/admin/manager.
- Operador não consegue executar RPCs de alteração.
- Kardex não pode sofrer UPDATE/DELETE.
- Transferências não podem ser escritas diretamente pelo cliente.
- Saldo negativo é bloqueado.

## Validação manual no Supabase

Depois de aplicar `0017_stock_complete.sql`, testar:

1. Saldo existente permanece exatamente igual.
2. Existe um `initial_balance` por produto/filial.
3. Entrada 10 unidades a R$5 recalcula custo médio.
4. Segunda entrada a outro custo recalcula média ponderada.
5. Saída maior que o saldo falha e não grava movimento.
6. Ajuste exige motivo.
7. Transferência Matriz -> Filial baixa a origem somente em ENVIADA.
8. ENVIADA cria quantidade em `stock_in_transit`.
9. RECEBIDA aumenta o destino.
10. Cancelamento estorna sem apagar movimentos.
11. Venda do PDV reduz o estoque e aparece no Kardex.
12. Cancelamento da venda repõe estoque e gera movimento de estorno.
13. UPDATE/DELETE em `inventory_movements` falha.
14. Usuário de outra filial não consegue consultar o estoque da filial.
15. Operador não executa entrada/saída/ajuste/transferência.
