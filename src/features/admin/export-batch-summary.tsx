"use client";
import { useState } from "react";
import { AdminButton as Button } from "./admin-button";
import { adminRequest } from "./client";
import type { ExportSummary } from "./export-summary";
import { ExportSummaryView } from "./export-summary-view";

export function ExportBatchSummary({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setSummary(await adminRequest<ExportSummary>(`exports/${id}/summary`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <Button
        variant="outline"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && !summary && !loading) void load();
        }}
      >
        {open ? "준비 물량 접기" : "준비 물량 확인"}
      </Button>
      {open && (
        <div className="mt-3">
          {loading ? (
            <p role="status">준비 물량을 불러오는 중…</p>
          ) : error ? (
            <div role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={load}>
                다시 불러오기
              </Button>
            </div>
          ) : (
            summary && <ExportSummaryView summary={summary} />
          )}
        </div>
      )}
    </div>
  );
}
