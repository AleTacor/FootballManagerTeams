import { createContext, useCallback, useContext, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { SlotId } from '../domain/types';
import { useLatest } from './useLatest';

/**
 * Minimal pointer-based drag and drop (mouse, pen and touch) with no dependencies.
 * Draggables call `startDrag` from onPointerDown; drop targets are elements with
 * `data-drop-slot="<SlotId>"`. A short press without movement stays a normal click.
 */
export interface DragPayload {
  playerId: string;
  assignmentId?: string;
  label: string;
}

interface Dnd {
  dragging: DragPayload | null;
  overSlot: SlotId | null;
  startDrag: (e: ReactPointerEvent, payload: DragPayload) => void;
}

const Ctx = createContext<Dnd | null>(null);
const THRESHOLD = 6;

export function DndProvider({ children, onDrop }: { children: ReactNode; onDrop: (p: DragPayload, slot: SlotId) => void }) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [overSlot, setOverSlot] = useState<SlotId | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const pending = useRef<{ x: number; y: number; payload: DragPayload; id: number } | null>(null);
  const active = useRef<DragPayload | null>(null);
  const over = useRef<SlotId | null>(null);
  const dropRef = useLatest(onDrop);

  const moveGhost = (x: number, y: number) => {
    if (ghost.current) ghost.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -120%)`;
  };

  const findSlot = (x: number, y: number): SlotId | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop-slot]');
    return (el?.getAttribute('data-drop-slot') as SlotId | null) ?? null;
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      if (!active.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < THRESHOLD) return;
        active.current = p.payload;
        setDragging(p.payload);
        document.body.classList.add('is-dragging');
      }
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
      const slot = findSlot(e.clientX, e.clientY);
      if (slot !== over.current) {
        over.current = slot;
        setOverSlot(slot);
      }
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      const payload = active.current;
      pending.current = null;
      active.current = null;
      if (payload) {
        // Swallow the click that follows a drag.
        const stop = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
        const slot = e.type === 'pointerup' ? findSlot(e.clientX, e.clientY) : null;
        if (slot) dropRef.current(payload, slot);
      }
      over.current = null;
      setOverSlot(null);
      setDragging(null);
      document.body.classList.remove('is-dragging');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active.current) {
        pending.current = null;
        active.current = null;
        over.current = null;
        setOverSlot(null);
        setDragging(null);
        document.body.classList.remove('is-dragging');
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keydown', onKey);
    };
  }, [dropRef]);

  const startDrag = useCallback((e: ReactPointerEvent, payload: DragPayload) => {
    if (e.button !== 0) return;
    pending.current = { x: e.clientX, y: e.clientY, payload, id: e.pointerId };
    moveGhost(e.clientX, e.clientY);
  }, []);

  return (
    <Ctx.Provider value={{ dragging, overSlot, startDrag }}>
      {children}
      <div ref={ghost} className="drag-ghost" hidden={!dragging} aria-hidden="true">
        {dragging?.label}
      </div>
    </Ctx.Provider>
  );
}

export function useDnd(): Dnd {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDnd outside DndProvider');
  return v;
}
