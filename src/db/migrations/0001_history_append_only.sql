-- Status history and delivery events are an audit trail: rows may be inserted but
-- never updated or deleted. Enforced in the database so no code path can bypass it.
CREATE FUNCTION "forbid_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "order_status_history_append_only"
  BEFORE UPDATE OR DELETE ON "order_status_history"
  FOR EACH ROW EXECUTE FUNCTION "forbid_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "delivery_events_append_only"
  BEFORE UPDATE OR DELETE ON "delivery_events"
  FOR EACH ROW EXECUTE FUNCTION "forbid_history_mutation"();
