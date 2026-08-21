"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  assignTable,
  autofillTables,
  deleteTable,
  saveTable,
} from "@/app/actions/admin";
import type { DinnerTable } from "@/lib/types";

export type BoardPair = {
  id: string;
  table_id: string | null;
  name_a: string;
  name_b: string;
};

export default function SeatingBoard({
  tables,
  pairs,
}: {
  tables: DinnerTable[];
  pairs: BoardPair[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DinnerTable | "new" | null>(null);

  const byTable = useMemo(() => {
    const map = new Map<string, BoardPair[]>();
    for (const p of pairs) {
      if (!p.table_id) continue;
      map.set(p.table_id, [...(map.get(p.table_id) ?? []), p]);
    }
    return map;
  }, [pairs]);

  const unseated = pairs.filter((p) => !p.table_id);
  const totalCapacity = tables
    .filter((t) => t.is_open)
    .reduce((s, t) => s + t.capacity, 0);
  const shortfall = unseated.length * 2 - (totalCapacity - (pairs.length - unseated.length) * 2);

  function move(pairId: string, tableId: string | null) {
    startTransition(async () => {
      const res = await assignTable(pairId, tableId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function autofill() {
    startTransition(async () => {
      const res = await autofillTables();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.placed === 0
          ? "Nothing to place — or no room left."
          : `Seated ${res.placed} ${res.placed === 1 ? "pair" : "pairs"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ------------------------------------------------------ unseated */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Not yet seated</span>
            <h3 className="text-2xl">
              {unseated.length === 0
                ? "Everyone has a table"
                : `${unseated.length} ${unseated.length === 1 ? "pair" : "pairs"} to place`}
            </h3>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || unseated.length === 0}
              onClick={autofill}
            >
              Fill automatically
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing("new")}
            >
              Add table
            </button>
          </div>
        </div>

        {shortfall > 0 ? (
          <div
            className="p-4 border text-[14px]"
            style={{ borderColor: "var(--danger)", background: "var(--danger-wash)" }}
          >
            You are <strong>{shortfall} seats short</strong> for the pairs you
            already have. Add a table or increase capacity before filling.
          </div>
        ) : null}

        {unseated.length > 0 ? (
          <ul className="flex flex-col gap-px bg-rule border border-rule">
            {unseated.map((p) => (
              <li
                key={p.id}
                className="bg-ivory p-3 flex flex-wrap items-center gap-3 justify-between"
              >
                <span className="text-[14px]">
                  {p.name_a} <span style={{ color: "var(--gold)" }}>&amp;</span>{" "}
                  {p.name_b}
                </span>
                <select
                  className="field w-auto text-[13px] py-1.5"
                  value=""
                  disabled={pending}
                  aria-label={`Seat ${p.name_a} and ${p.name_b}`}
                  onChange={(e) => e.target.value && move(p.id, e.target.value)}
                >
                  <option value="">Seat at…</option>
                  {tables
                    .filter((t) => t.is_open)
                    .map((t) => {
                      const taken = (byTable.get(t.id)?.length ?? 0) * 2;
                      const room = t.capacity - taken >= 2;
                      return (
                        <option key={t.id} value={t.id} disabled={!room}>
                          {t.label} ({taken}/{t.capacity})
                        </option>
                      );
                    })}
                </select>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* --------------------------------------------------------- board */}
      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <span className="eyebrow">The room</span>

        {tables.length === 0 ? (
          <div className="card p-10 text-center flex flex-col gap-3 items-center">
            <h3 className="text-2xl">No tables yet</h3>
            <p className="text-ink-soft max-w-[38ch]">
              Add your first table to start laying out the room.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              Add a table
            </button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => {
              const seated = byTable.get(t.id) ?? [];
              const taken = seated.length * 2;
              const full = t.capacity - taken < 2;

              return (
                <li
                  key={t.id}
                  className="border p-4 flex flex-col gap-3"
                  style={{
                    borderColor: t.is_open ? "var(--rule-strong)" : "var(--rule)",
                    background: "var(--paper)",
                    opacity: t.is_open ? 1 : 0.6,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <h4 className="font-display text-2xl leading-none">{t.label}</h4>
                      {t.zone ? (
                        <span className="text-[11px] uppercase tracking-[0.13em] text-ink-faint">
                          {t.zone}
                        </span>
                      ) : null}
                    </div>
                    <span className={`pill ${full ? "pill-olive" : "pill-quiet"}`}>
                      {taken}/{t.capacity}
                    </span>
                  </div>

                  <ul className="flex flex-col gap-1.5 min-h-[40px]">
                    {seated.length === 0 ? (
                      <li className="text-[13px] text-ink-faint">Empty</li>
                    ) : (
                      seated.map((p) => (
                        <li
                          key={p.id}
                          className="text-[13px] flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            {p.name_a} &amp; {p.name_b}
                          </span>
                          <button
                            type="button"
                            className="text-[11px] text-ink-faint hover:text-danger shrink-0"
                            disabled={pending}
                            onClick={() => move(p.id, null)}
                            aria-label={`Remove ${p.name_a} and ${p.name_b} from ${t.label}`}
                          >
                            remove
                          </button>
                        </li>
                      ))
                    )}
                  </ul>

                  <div className="flex gap-2 mt-auto pt-2 border-t border-rule">
                    <button
                      type="button"
                      className="btn btn-quiet text-[12px]"
                      onClick={() => setEditing(t)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet text-[12px]"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await deleteTable(t.id);
                          if (!res.ok) {
                            toast.error(res.error);
                            return;
                          }
                          toast.success(`${t.label} removed.`);
                          router.refresh();
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {editing ? (
        <TableDialog
          table={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function TableDialog({
  table,
  onClose,
  onSaved,
}: {
  table: DinnerTable | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(table?.label ?? "");
  const [capacity, setCapacity] = useState(table?.capacity ?? 10);
  const [zone, setZone] = useState(table?.zone ?? "");
  const [isOpen, setIsOpen] = useState(table?.is_open ?? true);
  const [order, setOrder] = useState(table?.sort_order ?? 0);

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveTable({
        id: table?.id,
        label,
        capacity,
        zone,
        is_open: isOpen,
        sort_order: order,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(table ? "Table updated." : "Table added.");
      onSaved();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-5"
      style={{ background: "color-mix(in srgb, var(--olive-deep) 85%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label={table ? "Edit table" : "Add table"}
    >
      <form onSubmit={save} className="card p-6 w-full max-w-[420px] flex flex-col gap-5">
        <h3 className="text-2xl">{table ? `Edit ${table.label}` : "Add a table"}</h3>

        <div>
          <label className="label" htmlFor="t-label">Name</label>
          <input
            id="t-label" className="field" required maxLength={40} autoFocus
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Table 1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="t-cap">Seats</label>
            <select
              id="t-cap" className="field"
              value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}
            >
              {[2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <p className="text-[11px] text-ink-faint mt-1">
              Even only — pairs are never split.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="t-order">Order</label>
            <input
              id="t-order" className="field numeric" type="number" min={0} max={999}
              value={order} onChange={(e) => setOrder(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="t-zone">Zone</label>
          <input
            id="t-zone" className="field" maxLength={40}
            value={zone} onChange={(e) => setZone(e.target.value)}
            placeholder="Optional — e.g. Near the stage"
          />
        </div>

        <label className="flex items-center gap-3 text-[14px] cursor-pointer">
          <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} />
          Guests can choose this table
        </label>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
