# Banco de dados Supabase

O arquivo `migrations/20260919000100_initial_pdv_schema.sql` transforma o modelo atual de `localStorage` em um banco relacional com autenticação, permissões, estoque auditável, vendas transacionais, caixa e relatórios.

## Mapeamento do armazenamento atual

| localStorage atual | Destino no Supabase |
|---|---|
| `pdvpro_vendedores` | `vendedores` |
| `pdvpro_produtos` | `products` + `categories` |
| `pdvpro_estoque_ini` | `products.estoque_inicial` |
| `pdvpro_vendas` | `sales` + `sale_items` |
| `pdvpro_caixa_config` | `store_settings` |
| `pdvpro_historico` | dados consultáveis de `cash_sessions`, `sales`, `sale_items` e `inventory_movements` |
| `pdvpro_last_encerramento` | último `cash_sessions.closed_at` |
| relatório financeiro em memória | `financial_reports` |

## O que o schema resolve

- Login pelo Supabase Auth e perfil em `profiles`.
- Separação por organização, evitando que uma igreja/unidade veja dados de outra.
- Papéis `admin`, `gerente`, `caixa` e `consulta` protegidos por RLS.
- Venda atômica pela função `finalize_sale`: valida o caixa, usa o preço do banco, confere e baixa o estoque, grava os itens e o histórico em uma única transação.
- Ajustes de estoque auditáveis pela função `adjust_stock`.
- Histórico de caixa e relatórios financeiros persistentes.
- Views `sales_report` e `stock_report` para as telas de relatório.

## Ordem para colocar em produção

1. Criar um projeto no Supabase.
2. Executar a migration pelo Supabase CLI ou SQL Editor.
3. Criar o primeiro usuário no Supabase Auth.
4. Logado como esse usuário, inserir a organização; o banco cria automaticamente o vínculo de administrador, as configurações e as categorias padrão.
5. Configurar `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env` do servidor.
6. Ao iniciar a versão nova, as antigas chaves `pdvpro_*` são removidas do `localStorage`.
7. Conferir usuários, vendas, estoque, caixa e relatórios diretamente no Supabase.

## Chamadas que o frontend deverá usar

- CRUD normal: `vendedores`, `categories`, `products`, `cash_sessions` e `financial_reports`.
- Finalizar venda: RPC `finalize_sale`.
- Alterar quantidade em estoque: RPC `adjust_stock`.
- Fechar o caixa: RPC `close_cash_session`.
- Cancelar uma venda e devolver os itens ao estoque: RPC `cancel_sale`.
- Relatórios: leitura das views `sales_report` e `stock_report`, sempre filtrando por organização e período.

O frontend não acessa o Supabase diretamente. As operações passam pelas rotas da pasta `backend`, com sessão em cookies `HttpOnly`; o navegador mantém apenas cache temporário em memória e remove as antigas chaves `pdvpro_*` do `localStorage`.
