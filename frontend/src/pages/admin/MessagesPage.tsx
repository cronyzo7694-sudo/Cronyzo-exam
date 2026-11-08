import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { messagesApi, type UserMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/Loader";

export function MessagesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-messages", filter],
    queryFn: () => messagesApi.listAdmin(filter ? `status=${filter}` : undefined),
  });

  const items: UserMessage[] = data?.items || [];

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => messagesApi.setStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-messages"] }),
  });

  const counts = (status: string) => items.filter((m) => m.status === status).length;

  if (isLoading) return <Loader title="Messages" messages={["Messages load ho rahe hain…"]} />;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Messages & Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">Users ke test-requests aur feedback</p>
      </header>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { k: "", l: `All (${items.length})` },
          { k: "new", l: `New (${counts("new")})` },
          { k: "read", l: `Read (${counts("read")})` },
          { k: "done", l: `Done (${counts("done")})` },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === t.k ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:border-primary/40"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Messages list */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">कोई message नहीं</div>
      ) : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} className={`rounded-2xl border p-4 ${m.status === "new" ? "border-primary/40 bg-primary/5" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize">{m.message_type}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${m.status === "new" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{m.status}</span>
                  {m.name && <span className="text-xs font-medium">{m.name}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground">{m.created_at ? new Date(m.created_at).toLocaleString() : ""}</span>
              </div>
              <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{m.message}</p>
              {(m.email || m.user_id) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {m.email && <>Email: {m.email} • </>}
                  {m.user_id ? `User #${m.user_id}` : "Guest"}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {m.status !== "done" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "done" })}>
                    Mark Done
                  </Button>
                )}
                {m.status === "new" && (
                  <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: m.id, status: "read" })}>
                    Mark Read
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
