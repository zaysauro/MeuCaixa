-- 0016_rbac_security_foundation.sql
-- RBAC centralizado + acesso por filial + desconto do operador + PIN de autorização.
-- Compatibilidade: preserva roles legadas (cashier/employee) e acessos existentes.
-- Nenhuma conta existente é apagada ou removida.

BEGIN;

-- ============================================================
-- 1. COMPATIBILIDADE DA MEMBRESIA
-- ============================================================

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS branch_access_mode text NOT NULL DEFAULT 'restricted'
  CHECK (branch_access_mode IN ('all', 'restricted'));

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS branch_id uuid
  REFERENCES public.branches(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_members_active_idx
  ON public.organization_members(organization_id, active);

CREATE INDEX IF NOT EXISTS organization_members_role_idx
  ON public.organization_members(organization_id, role);

CREATE INDEX IF NOT EXISTS organization_members_user_active_idx
  ON public.organization_members(user_id, active);

-- A arquitetura 0006 já prevê branch_id.
-- Se um ambiente antigo ainda não tiver a coluna, o ADD acima mantém compatibilidade.

-- Preserva exatamente o acesso legado:
-- branch_id preenchido = restrito à filial.
-- branch_id nulo = todas as filiais.
-- Owner continua sempre com acesso total.
UPDATE public.organization_members
SET branch_access_mode = CASE
  WHEN role::text = 'owner' THEN 'all'
  WHEN branch_id IS NULL THEN 'all'
  ELSE 'restricted'
END;

-- ============================================================
-- 2. CATÁLOGO CENTRAL DE PERMISSÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  module text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read permissions"
  ON public.permissions;

CREATE POLICY "authenticated can read permissions"
ON public.permissions
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.permissions TO authenticated;

INSERT INTO public.permissions (key, module, description) VALUES
  ('sales.view', 'sales', 'Visualizar vendas'),
  ('sales.create', 'sales', 'Registrar vendas'),
  ('sales.edit', 'sales', 'Editar vendas permitidas'),
  ('sales.cancel', 'sales', 'Cancelar vendas'),
  ('sales.discount', 'sales', 'Aplicar desconto'),
  ('sales.history', 'sales', 'Consultar histórico de vendas'),
  ('sales.receipt.view', 'sales', 'Visualizar comprovantes'),
  ('sales.receipt.reprint', 'sales', 'Reimprimir comprovantes'),

  ('cash.view', 'cash', 'Visualizar caixa'),
  ('cash.open', 'cash', 'Abrir caixa'),
  ('cash.close', 'cash', 'Fechar caixa'),
  ('cash.withdrawal', 'cash', 'Realizar retirada'),
  ('cash.reinforcement', 'cash', 'Realizar suprimento'),
  ('cash.count', 'cash', 'Realizar conferência de caixa'),
  ('cash.history', 'cash', 'Consultar histórico do caixa'),
  ('cash.view_all_registers', 'cash', 'Visualizar todos os caixas'),

  ('products.view', 'products', 'Visualizar produtos'),
  ('products.create', 'products', 'Cadastrar produtos'),
  ('products.edit', 'products', 'Editar produtos'),
  ('products.delete', 'products', 'Desativar produtos'),
  ('products.price_edit', 'products', 'Alterar preço de venda'),
  ('products.cost_edit', 'products', 'Alterar custo'),
  ('products.category_manage', 'products', 'Gerenciar categorias'),

  ('stock.view', 'stock', 'Visualizar estoque'),
  ('stock.adjust', 'stock', 'Ajustar estoque'),
  ('stock.entry', 'stock', 'Registrar entrada'),
  ('stock.transfer', 'stock', 'Transferir estoque'),
  ('stock.history', 'stock', 'Consultar histórico de estoque'),
  ('stock.inventory', 'stock', 'Realizar inventário'),

  ('customers.view', 'customers', 'Visualizar clientes'),
  ('customers.create', 'customers', 'Cadastrar clientes'),
  ('customers.edit', 'customers', 'Editar clientes'),
  ('customers.delete', 'customers', 'Desativar clientes'),

  ('reports.view', 'reports', 'Visualizar relatórios'),
  ('reports.view_branch', 'reports', 'Visualizar relatórios da filial'),
  ('reports.view_all_branches', 'reports', 'Visualizar relatórios de todas as filiais'),
  ('reports.export', 'reports', 'Exportar relatórios'),
  ('reports.financial', 'reports', 'Visualizar relatórios financeiros'),

  ('finance.view', 'finance', 'Visualizar financeiro'),
  ('finance.create', 'finance', 'Cadastrar lançamento financeiro'),
  ('finance.edit', 'finance', 'Editar lançamento financeiro'),
  ('finance.delete', 'finance', 'Excluir lançamento financeiro'),
  ('finance.pay', 'finance', 'Registrar pagamento financeiro'),
  ('finance.export', 'finance', 'Exportar financeiro'),

  ('branches.view', 'branches', 'Visualizar filiais'),
  ('branches.create', 'branches', 'Criar filial'),
  ('branches.edit', 'branches', 'Editar filial'),
  ('branches.deactivate', 'branches', 'Desativar filial'),
  ('branches.manage_access', 'branches', 'Gerenciar acesso às filiais'),

  ('users.view', 'users', 'Visualizar usuários'),
  ('users.invite', 'users', 'Convidar usuários'),
  ('users.edit', 'users', 'Editar usuários'),
  ('users.change_role', 'users', 'Alterar função'),
  ('users.manage_branches', 'users', 'Gerenciar filiais do usuário'),
  ('users.deactivate', 'users', 'Desativar usuário'),
  ('users.reactivate', 'users', 'Reativar usuário'),
  ('users.resend_invite', 'users', 'Reenviar convite'),
  ('users.cancel_invite', 'users', 'Cancelar convite'),

  ('settings.view', 'settings', 'Visualizar configurações'),
  ('settings.edit', 'settings', 'Editar configurações'),
  ('settings.receipt', 'settings', 'Configurar comprovantes'),
  ('settings.company', 'settings', 'Editar dados da empresa'),
  ('settings.permissions', 'settings', 'Configurar permissões'),

  ('billing.view', 'billing', 'Visualizar cobrança'),
  ('billing.manage', 'billing', 'Gerenciar cobrança'),
  ('billing.cancel', 'billing', 'Cancelar assinatura'),

  ('company.view', 'company', 'Visualizar empresa'),
  ('company.edit', 'company', 'Editar empresa'),
  ('company.delete', 'company', 'Excluir empresa'),
  ('company.transfer_ownership', 'company', 'Transferir propriedade'),

  ('audit.view', 'audit', 'Visualizar auditoria'),

  ('sales.discount_limit.manage', 'sales', 'Configurar limite de desconto do operador'),
  ('sensitive_operation.authorize', 'security', 'Autorizar operação sensível por credencial')
ON CONFLICT (key) DO UPDATE
SET
  module = EXCLUDED.module,
  description = EXCLUDED.description;

-- ============================================================
-- 3. MATRIZ ROLE -> PERMISSION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role text NOT NULL,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read role permissions"
  ON public.role_permissions;

CREATE POLICY "authenticated can read role permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.role_permissions TO authenticated;

-- Limpa somente o catálogo desta matriz. Não altera usuários.
DELETE FROM public.role_permissions
WHERE role IN ('owner', 'admin', 'manager', 'operator', 'cashier', 'employee');

-- OWNER: tudo.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'owner', key
FROM public.permissions
ON CONFLICT DO NOTHING;

-- ADMIN: praticamente tudo, mas não controla propriedade da conta nem cobrança destrutiva.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'admin', key
FROM public.permissions
WHERE key NOT IN (
  'company.delete',
  'company.transfer_ownership',
  'billing.cancel',
  'billing.manage',
  'settings.permissions'
)
ON CONFLICT DO NOTHING;

-- ADMIN pode visualizar cobrança, sem controlar a assinatura.
INSERT INTO public.role_permissions (role, permission_key)
VALUES ('admin', 'billing.view')
ON CONFLICT DO NOTHING;

-- MANAGER: operação das filiais permitidas.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('manager','sales.view'),
  ('manager','sales.create'),
  ('manager','sales.edit'),
  ('manager','sales.cancel'),
  ('manager','sales.discount'),
  ('manager','sales.history'),
  ('manager','sales.receipt.view'),
  ('manager','sales.receipt.reprint'),
  ('manager','cash.view'),
  ('manager','cash.open'),
  ('manager','cash.close'),
  ('manager','cash.withdrawal'),
  ('manager','cash.reinforcement'),
  ('manager','cash.count'),
  ('manager','cash.history'),
  ('manager','cash.view_all_registers'),
  ('manager','products.view'),
  ('manager','products.create'),
  ('manager','products.edit'),
  ('manager','products.delete'),
  ('manager','products.price_edit'),
  ('manager','products.cost_edit'),
  ('manager','products.category_manage'),
  ('manager','stock.view'),
  ('manager','stock.adjust'),
  ('manager','stock.entry'),
  ('manager','stock.transfer'),
  ('manager','stock.history'),
  ('manager','stock.inventory'),
  ('manager','customers.view'),
  ('manager','customers.create'),
  ('manager','customers.edit'),
  ('manager','customers.delete'),
  ('manager','reports.view'),
  ('manager','reports.view_branch'),
  ('manager','reports.export'),
  ('manager','reports.financial'),
  ('manager','finance.view'),
  ('manager','finance.create'),
  ('manager','finance.edit'),
  ('manager','finance.pay'),
  ('manager','finance.export'),
  ('manager','settings.view'),
  ('manager','settings.receipt'),
  ('manager','company.view'),
  ('manager','branches.view'),
  ('manager','sensitive_operation.authorize')
ON CONFLICT DO NOTHING;

-- OPERATOR: PDV + caixa próprio + clientes + consulta de produtos.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('operator','sales.view'),
  ('operator','sales.create'),
  ('operator','sales.discount'),
  ('operator','sales.history'),
  ('operator','sales.receipt.view'),
  ('operator','sales.receipt.reprint'),
  ('operator','cash.view'),
  ('operator','cash.open'),
  ('operator','cash.close'),
  ('operator','cash.history'),
  ('operator','products.view'),
  ('operator','customers.view'),
  ('operator','customers.create'),
  ('operator','customers.edit'),
  ('operator','reports.view_branch')
ON CONFLICT DO NOTHING;

-- Compatibilidade: usuários antigos continuam com o mesmo conjunto operacional.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'cashier', permission_key
FROM public.role_permissions
WHERE role = 'operator'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'employee', permission_key
FROM public.role_permissions
WHERE role = 'operator'
ON CONFLICT DO NOTHING;

-- ============================================================
-- HELPERS LEGADOS: respeitam active e preservam as assinaturas atuais
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_organization_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = org_id
      AND om.user_id = auth.uid()
      AND om.active = true
  );
$;

REVOKE ALL ON FUNCTION public.is_organization_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_organization_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = org_id
      AND om.user_id = auth.uid()
      AND om.active = true
      AND om.role::text IN ('owner', 'admin')
  );
$;

REVOKE ALL ON FUNCTION public.is_organization_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_organization_admin(uuid) TO authenticated;

-- ============================================================
-- HELPERS DE AUTORIZAÇÃO USADOS PELAS POLICIES ABAIXO
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_owner(
  p_organization_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = COALESCE(p_user_id, auth.uid())
      AND om.active = true
      AND om.role::text = 'owner'
  );
$;

REVOKE ALL ON FUNCTION public.is_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_key text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.role_permissions rp
      ON rp.role = om.role::text
     AND rp.permission_key = p_permission_key
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND (
        p_organization_id IS NULL
        OR om.organization_id = p_organization_id
      )
  );
$;

REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;

-- ============================================================
-- 4. ACESSO A MÚLTIPLAS FILIAIS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organization_member_branches (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL
    REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS organization_member_branches_user_idx
  ON public.organization_member_branches(user_id, organization_id);

CREATE INDEX IF NOT EXISTS organization_member_branches_branch_idx
  ON public.organization_member_branches(branch_id);

ALTER TABLE public.organization_member_branches ENABLE ROW LEVEL SECURITY;

-- Migra o vínculo legado de uma filial para o modelo N:N.
INSERT INTO public.organization_member_branches (
  organization_id,
  user_id,
  branch_id,
  created_by
)
SELECT
  om.organization_id,
  om.user_id,
  om.branch_id,
  om.user_id
FROM public.organization_members om
WHERE om.branch_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "members can view their branch access"
  ON public.organization_member_branches;

CREATE POLICY "members can view their branch access"
ON public.organization_member_branches
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_permission('users.view', organization_id)
);

DROP POLICY IF EXISTS "admins can manage branch access"
  ON public.organization_member_branches;

CREATE POLICY "admins can manage branch access"
ON public.organization_member_branches
FOR ALL
TO authenticated
USING (public.has_permission('users.manage_branches', organization_id))
WITH CHECK (public.has_permission('users.manage_branches', organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.organization_member_branches
TO authenticated;

-- ============================================================
-- 5. CONFIGURAÇÕES DE SEGURANÇA DA ORGANIZAÇÃO
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organization_security_settings (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  operator_discount_limit numeric(5,2) NOT NULL DEFAULT 5.00
    CHECK (operator_discount_limit >= 0 AND operator_discount_limit <= 100),
  require_sensitive_pin boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.organization_security_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can view security settings"
  ON public.organization_security_settings;

CREATE POLICY "members can view security settings"
ON public.organization_security_settings
FOR SELECT
TO authenticated
USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS "admins can manage security settings"
  ON public.organization_security_settings;

CREATE POLICY "admins can manage security settings"
ON public.organization_security_settings
FOR UPDATE
TO authenticated
USING (public.has_permission('sales.discount_limit.manage', organization_id))
WITH CHECK (public.has_permission('sales.discount_limit.manage', organization_id));

GRANT SELECT, UPDATE
ON public.organization_security_settings
TO authenticated;

INSERT INTO public.organization_security_settings (organization_id)
SELECT id
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ============================================================
-- 6. CREDENCIAL/PIN PARA OPERAÇÕES SENSÍVEIS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_sensitive_credentials (
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_type text NOT NULL DEFAULT 'sensitive_pin'
    CHECK (credential_type = 'sensitive_pin'),
  credential_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, user_id, credential_type)
);

ALTER TABLE public.user_sensitive_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can view own credential metadata"
  ON public.user_sensitive_credentials;

CREATE POLICY "users can view own credential metadata"
ON public.user_sensitive_credentials
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_permission('users.view', organization_id)
);

-- Hash nunca fica disponível para o navegador.
REVOKE ALL ON public.user_sensitive_credentials FROM authenticated;

-- ============================================================
-- 7. HELPERS CENTRAIS DE AUTORIZAÇÃO
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_owner(
  p_organization_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = COALESCE(p_user_id, auth.uid())
      AND om.active = true
      AND om.role::text = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.is_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_key text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.role_permissions rp
      ON rp.role = om.role::text
     AND rp.permission_key = p_permission_key
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND (
        p_organization_id IS NULL
        OR om.organization_id = p_organization_id
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_branches(
  p_organization_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  is_headquarters boolean,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    b.id,
    b.name,
    b.is_headquarters,
    b.active
  FROM public.branches b
  JOIN public.organization_members om
    ON om.organization_id = b.organization_id
   AND om.user_id = COALESCE(p_user_id, auth.uid())
   AND om.active = true
  WHERE b.organization_id = p_organization_id
    AND b.active = true
    AND (
      om.role::text = 'owner'
      OR om.branch_access_mode = 'all'
      OR om.branch_id = b.id
      OR EXISTS (
        SELECT 1
        FROM public.organization_member_branches omb
        WHERE omb.organization_id = om.organization_id
          AND omb.user_id = om.user_id
          AND omb.branch_id = b.id
      )
    )
  ORDER BY b.is_headquarters DESC, b.created_at, b.name;
$$;

REVOKE ALL ON FUNCTION public.user_branches(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_branches(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_branches()
RETURNS TABLE (
  branch_id uuid,
  organization_id uuid,
  branch_name text,
  branch_code text,
  is_headquarters boolean,
  active boolean,
  role public.member_role,
  can_manage boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $
  SELECT
    ub.branch_id,
    om.organization_id,
    ub.branch_name,
    b.code,
    ub.is_headquarters,
    ub.active,
    om.role,
    public.has_permission('branches.edit', om.organization_id)
  FROM public.organization_member_branches omb
  RIGHT JOIN public.organization_members om
    ON om.organization_id = omb.organization_id
   AND om.user_id = omb.user_id
  JOIN public.branches b
    ON b.id = ub.branch_id
  JOIN LATERAL (
    SELECT *
    FROM public.user_branches(om.organization_id, om.user_id)
  ) ub ON ub.branch_id = b.id
  WHERE om.user_id = auth.uid()
    AND om.active = true
  GROUP BY
    ub.branch_id,
    om.organization_id,
    ub.branch_name,
    b.code,
    ub.is_headquarters,
    ub.active,
    om.role;
$;

REVOKE ALL ON FUNCTION public.get_my_branches() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_branches() TO authenticated;

-- ============================================================
-- 8. CAN_ACCESS_BRANCH: substitui a regra ampla anterior
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_branch(
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.branches b
      ON b.id = p_branch_id
     AND b.organization_id = om.organization_id
     AND b.active = true
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND (
        om.role::text = 'owner'
        OR om.branch_access_mode = 'all'
        OR om.branch_id = p_branch_id
        OR EXISTS (
          SELECT 1
          FROM public.organization_member_branches omb
          WHERE omb.organization_id = om.organization_id
            AND omb.user_id = om.user_id
            AND omb.branch_id = p_branch_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_branch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid) TO authenticated;

-- ============================================================
-- 9. LIMITE DE DESCONTO DO OPERADOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_operator_discount_limit(
  p_organization_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (
      SELECT oss.operator_discount_limit
      FROM public.organization_security_settings oss
      WHERE oss.organization_id = p_organization_id
    ),
    5.00
  );
$$;

REVOKE ALL ON FUNCTION public.get_operator_discount_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operator_discount_limit(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_operator_discount_limit(
  p_organization_id uuid,
  p_limit numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit numeric(5,2);
BEGIN
  IF NOT public.has_permission('sales.discount_limit.manage', p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_limit := round(coalesce(p_limit, 0), 2);

  IF v_limit < 0 OR v_limit > 100 THEN
    RAISE EXCEPTION 'invalid_discount_limit';
  END IF;

  INSERT INTO public.organization_security_settings (
    organization_id,
    operator_discount_limit,
    updated_at,
    created_by
  )
  VALUES (
    p_organization_id,
    v_limit,
    now(),
    auth.uid()
  )
  ON CONFLICT (organization_id)
  DO UPDATE SET
    operator_discount_limit = EXCLUDED.operator_discount_limit,
    updated_at = now();

  RETURN v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.set_operator_discount_limit(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_operator_discount_limit(uuid, numeric) TO authenticated;

-- ============================================================
-- 10. CONFIGURAÇÃO DE PIN
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_sensitive_pin(
  p_organization_id uuid,
  p_user_id uuid,
  p_pin text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pin text := trim(coalesce(p_pin, ''));
BEGIN
  IF NOT (
    p_user_id = auth.uid()
    OR public.has_permission('users.edit', p_organization_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF length(v_pin) < 4 OR length(v_pin) > 8 OR v_pin !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_user_id
      AND om.active = true
  ) THEN
    RAISE EXCEPTION 'invalid_user';
  END IF;

  INSERT INTO public.user_sensitive_credentials (
    organization_id,
    user_id,
    credential_type,
    credential_hash,
    active,
    failed_attempts,
    locked_until,
    created_by
  )
  VALUES (
    p_organization_id,
    p_user_id,
    'sensitive_pin',
    crypt(v_pin, gen_salt('bf')),
    true,
    0,
    NULL,
    auth.uid()
  )
  ON CONFLICT (organization_id, user_id, credential_type)
  DO UPDATE SET
    credential_hash = EXCLUDED.credential_hash,
    active = true,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_sensitive_pin(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_sensitive_pin(uuid, uuid, text) TO authenticated;

-- Verifica o PIN e devolve o usuário que autorizou a operação.
-- Não retorna hash, tentativas nem outros dados da credencial.
CREATE OR REPLACE FUNCTION public.authorize_sensitive_operation(
  p_organization_id uuid,
  p_permission_key text,
  p_pin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_hash text;
  v_locked_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT usc.user_id, usc.credential_hash, usc.locked_until
    INTO v_user_id, v_hash, v_locked_until
  FROM public.user_sensitive_credentials usc
  JOIN public.organization_members om
    ON om.organization_id = usc.organization_id
   AND om.user_id = usc.user_id
   AND om.active = true
  JOIN public.role_permissions rp
    ON rp.role = om.role::text
   AND rp.permission_key = p_permission_key
  WHERE usc.organization_id = p_organization_id
    AND usc.credential_type = 'sensitive_pin'
    AND usc.active = true
    AND (usc.locked_until IS NULL OR usc.locked_until <= now())
  ORDER BY
    CASE om.role::text
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'manager' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authorization_unavailable';
  END IF;

  IF crypt(coalesce(p_pin, ''), v_hash) = v_hash THEN
    UPDATE public.user_sensitive_credentials
    SET
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id
      AND credential_type = 'sensitive_pin';

    RETURN v_user_id;
  END IF;

  UPDATE public.user_sensitive_credentials
  SET
    failed_attempts = failed_attempts + 1,
    locked_until = CASE
      WHEN failed_attempts + 1 >= 5
      THEN now() + interval '15 minutes'
      ELSE locked_until
    END,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND credential_type = 'sensitive_pin';

  RAISE EXCEPTION 'invalid_authorization';
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_sensitive_operation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_sensitive_operation(uuid, text, text) TO authenticated;

-- ============================================================
-- 11. PROTEÇÕES DE OWNER
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS organization_one_active_owner_idx
  ON public.organization_members(organization_id)
  WHERE active = true AND role::text = 'owner';

CREATE OR REPLACE FUNCTION public.prevent_invalid_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Nunca permite remover/desativar o último owner.
  IF OLD.role::text = 'owner' AND (
    NEW.active = false OR NEW.role::text <> 'owner'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = OLD.organization_id
        AND om.user_id <> OLD.user_id
        AND om.active = true
        AND om.role::text = 'owner'
    ) THEN
      RAISE EXCEPTION 'organization_requires_active_owner';
    END IF;
  END IF;

  -- Somente o owner atual pode criar outro owner.
  IF NEW.role::text = 'owner'
     AND OLD.role::text <> 'owner'
     AND auth.uid() IS NOT NULL
     AND NOT public.is_owner(OLD.organization_id, auth.uid())
  THEN
    RAISE EXCEPTION 'only_owner_can_assign_owner';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_owner_membership
  ON public.organization_members;

CREATE TRIGGER protect_owner_membership
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invalid_owner_change();

-- ============================================================
-- 12. GARANTE CONFIGURAÇÃO DE SEGURANÇA PARA NOVAS ORGANIZAÇÕES
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_organization_security_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.organization_security_settings (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_security_settings_after_insert
  ON public.organizations;

CREATE TRIGGER organization_security_settings_after_insert
AFTER INSERT ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.ensure_organization_security_settings();

-- ============================================================
-- 13. UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION public.rbac_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_security_settings_updated_at
  ON public.organization_security_settings;

CREATE TRIGGER organization_security_settings_updated_at
BEFORE UPDATE ON public.organization_security_settings
FOR EACH ROW
EXECUTE FUNCTION public.rbac_set_updated_at();

DROP TRIGGER IF EXISTS organization_members_updated_at
  ON public.organization_members;

CREATE TRIGGER organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.rbac_set_updated_at();

DROP TRIGGER IF EXISTS user_sensitive_credentials_updated_at
  ON public.user_sensitive_credentials;

CREATE TRIGGER user_sensitive_credentials_updated_at
BEFORE UPDATE ON public.user_sensitive_credentials
FOR EACH ROW
EXECUTE FUNCTION public.rbac_set_updated_at();

-- ============================================================
-- 14. CACHE DO POSTGREST
-- ============================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
