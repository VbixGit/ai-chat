import React, { useState } from "react";

export default function CitationList({
  citations = [],
  onOpenOne = () => {},
  onOpenAll = () => {},
}) {
  const [confirmIds, setConfirmIds] = useState([]);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");

  const idFor = (c) =>
    c.instanceID ||
    c.instanceId ||
    c.properties?.instanceID ||
    c.properties?.instanceId ||
    c.caseNumber ||
    c.id ||
    c.docId ||
    c.documentId ||
    c.referenceId ||
    c._additional?.id ||
    c._additional?.properties?.instanceID ||
    c._additional?.properties?.instanceId;

  const beginConfirm = (ids, message) => {
    setConfirmIds(ids || []);
    setConfirmMessage(
      message || `Open ${ids?.length || 0} item(s) in Kissflow?`,
    );
    setConfirmVisible(true);
  };

  const cancelConfirm = () => {
    setConfirmVisible(false);
    setConfirmIds([]);
    setConfirmMessage("");
  };

  const doConfirm = async () => {
    try {
      if (confirmIds && confirmIds.length) {
        if (confirmIds.length === 1) await onOpenOne(confirmIds);
        else await onOpenAll(confirmIds);
      }
    } finally {
      cancelConfirm();
    }
  };

  return (
    <div className="refs-inline" aria-live="polite">
      <div className="refs-inline-header">
        <strong>Related Documents</strong>
        <button
          type="button"
          className="refs-open-all"
          onClick={() => {
            const ids = citations.map(idFor).filter(Boolean);
            if (!ids.length) return;
            beginConfirm(ids, `Open ${ids.length} items in Kissflow?`);
          }}
          aria-label={`Open all documents in Kissflow`}
          disabled={citations.map(idFor).filter(Boolean).length === 0}
        >
          Open all ({citations.map(idFor).filter(Boolean).length})
        </button>
      </div>

      {confirmVisible && (
        <div className="kf-inline-confirm" role="status" aria-live="polite">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.95rem" }}>{confirmMessage}</div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={cancelConfirm}
                className="refs-open-one"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doConfirm}
                className="refs-open-all"
              >
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      <ul className="refs-inline-list">
        {citations.map((c, i) => {
          const id = idFor(c);
          const displayScore =
            c.score ?? c._additional?.certainty ?? c._additional?.score;
          return (
            <li key={`${id || i}-${i}`} className="refs-inline-item">
              <div className="refs-inline-meta">
                <div className="refs-inline-title">
                  Doc {i + 1} • {c.title || c.documentTopic || "Untitled"}
                </div>
                <div className="refs-inline-sub">
                  {c.documentDescription && <>{c.documentDescription} • </>}
                  {displayScore
                    ? `Certainty: ${(Number(displayScore) * (displayScore <= 1 ? 100 : 1)).toFixed(1)}%`
                    : ""}
                </div>
              </div>
              {id ? (
                <button
                  type="button"
                  className="refs-open-one"
                  onClick={() =>
                    beginConfirm(
                      [id],
                      "Open selected reference(s) in Kissflow?",
                    )
                  }
                  aria-label={`Open document ${i + 1} in Kissflow`}
                >
                  Open
                </button>
              ) : (
                <span className="refs-no-id">No instanceID</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
