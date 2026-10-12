"use client";

import { useActionState } from "react";
import { archiveAnnouncement, deleteAnnouncement, restoreAnnouncement } from "../actions";

export default function DeleteAnnouncementButton({ id, archived = false }: { id: string; archived?: boolean }) {
  const [deleteState, deleteAction, deleting] = useActionState(deleteAnnouncement, null);
  const [archiveState, archiveAction, archiving] = useActionState(archiveAnnouncement, null);
  const [restoreState, restoreAction, restoring] = useActionState(restoreAnnouncement, null);
  return (
    <div className="flex items-center gap-2">
    <form action={archived ? restoreAction : archiveAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={archiving || restoring} className="rounded-full border border-navy/30 px-3 py-1 text-xs font-medium text-navy disabled:opacity-50">
        {archiving || restoring ? "Saving…" : archived ? "Restore" : "Archive"}
      </button>
      {archiveState && !archiveState.ok && <span className="sr-only" role="alert">{archiveState.message}</span>}
      {restoreState && !restoreState.ok && <span className="sr-only" role="alert">{restoreState.message}</span>}
    </form>
    {archived && <form action={deleteAction} onSubmit={(event) => {
      if (!window.confirm("Permanently delete this archived announcement and its version history? This cannot be undone.")) event.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={deleting} className="rounded-full border border-orange/40 px-3 py-1 text-xs font-medium text-orange transition-colors hover:bg-orange/10 disabled:opacity-50">
        {deleting ? "Deleting…" : "Delete permanently"}
      </button>
      {deleteState && !deleteState.ok && <span className="sr-only" role="alert">{deleteState.message}</span>}
    </form>}
    </div>
  );
}
