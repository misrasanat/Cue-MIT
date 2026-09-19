import { useState, useEffect } from 'react';
import { Activity, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import Modal from '../components/Modal';
import { API_BASE } from '../utils/api';

export default function DebugLogsModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      if (res.ok) setLogs(await res.json());
    } catch {
      // Backend offline; the list just stays as it was.
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Modal
      title="Activity log"
      icon={Activity}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small">Showing the last {logs.length} events</span>
          <button className="btn btn-soft" onClick={fetchLogs}><RefreshCw size={15} /> Refresh</button>
        </>
      }
    >
      <p className="muted">The raw events Cue receives from your terminal. This updates on its own.</p>
      {logs.length === 0 ? (
        <div className="empty empty-flat">
          <h3>Nothing received yet</h3>
          <p className="muted">Use your coding assistant in a terminal and events will show up here.</p>
        </div>
      ) : (
        <ul className="session-list">
          {logs.map((log) => {
            const open = expandedLogId === log.id;
            return (
              <li key={log.id} className="session">
                <button className="log-row" onClick={() => setExpandedLogId(open ? null : log.id)} aria-expanded={open}>
                  {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                  <span className="muted small">{log.timestamp}</span>
                  <span className="tag">{log.tool_name}</span>
                  <span className="log-summary">{log.summary}</span>
                </button>
                {open && <pre className="raw">{JSON.stringify(log.raw_event, null, 2)}</pre>}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
