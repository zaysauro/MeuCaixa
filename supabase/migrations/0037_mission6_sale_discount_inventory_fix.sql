-- Mission 6: keep sale discounts explicit and normalize signed stock deltas.
-- inventory_movements.quantity is the absolute movement size; quantity_delta
-- carries the signed stock change used by the Kardex.
BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.quantity := abs(NEW.quantity);
  NEW.quantity_delta := COALESCE(NEW.quantity_delta, NEW.new_quantity - NEW.previous_quantity);
  NEW.balance_after := COALESCE(NEW.balance_after, NEW.new_quantity);

  IF NEW.unit_cost IS NULL THEN
    SELECT COALESCE(ps.average_cost, p.cost_price, 0)
      INTO NEW.unit_cost
    FROM public.products p
    LEFT JOIN public.branch_product_stock ps
      ON ps.product_id = NEW.product_id
     AND ps.branch_id = NEW.branch_id
    WHERE p.id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_inventory_movement_before_insert ON public.inventory_movements;
CREATE TRIGGER normalize_inventory_movement_before_insert
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.normalize_inventory_movement();

COMMIT;
