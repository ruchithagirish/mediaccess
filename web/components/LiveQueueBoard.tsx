"use client";
import { useEffect, useState } from "react";
import { api, apiWebSocketUrl } from "@/lib/api";
import type { QueueEntry } from "@/lib/reception";

interface QueuePayload {
  date: string;
  queue: QueueEntry[];
}

export function LiveQueueBoard() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectDelay = 1000;

    const loadSnapshot = async () => {
      try {
        const result = await api<QueuePayload>("/queue");
        if (active) {
          setQueue(result.queue);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load the queue.");
      }
    };

    const connect = () => {
      if (!active) return;
      socket = new WebSocket(apiWebSocketUrl("/queue/live"));
      socket.onopen = () => {
        reconnectDelay = 1000;
        if (active) setConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type: string; data: QueuePayload };
          if (message.type === "queue.snapshot" || message.type === "queue.update") {
            setQueue(message.data.queue);
            setError("");
          }
        } catch {
          setError("Received an invalid queue update.");
        }
      };
      socket.onerror = () => { if (active) setConnected(false); };
      socket.onclose = () => {
        if (!active) return;
        setConnected(false);
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      };
    };

    void loadSnapshot();
    connect();
    const poll = window.setInterval(() => void loadSnapshot(), 15000);
    return () => {
      active = false;
      window.clearInterval(poll);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return (
    <section className="queue-board" aria-live="polite">
      <div className="ph">
        <h3>Live OPD queue</h3>
        <span className={`queue-connection ${connected ? "connected" : ""}`}>
          <i />{connected ? "Live" : "Reconnecting"}
        </span>
      </div>
      {error && <div className="msg err" role="alert">{error}</div>}
      {queue.length === 0 ? <p className="booking-hint">No patients are waiting or in consultation.</p> : (
        <div className="tw">
          <table>
            <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Visit</th><th>Status</th></tr></thead>
            <tbody>{queue.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.tokenNumber ? `T-${entry.tokenNumber}` : "—"}</td>
                <td>{entry.patient.name}<small className="table-sub">{entry.patient.mrn}</small></td>
                <td>{entry.doctor.name}</td>
                <td><span className={`pill ${entry.source === "WALK_IN" ? "p-info" : "p-ok"}`}>{entry.source === "WALK_IN" ? "Walk-in" : "Scheduled"}</span></td>
                <td>{entry.status.replaceAll("_", " ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}