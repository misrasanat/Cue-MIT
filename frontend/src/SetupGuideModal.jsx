import React, { useState } from 'react';
import { Terminal, Copy, Check, Sparkles, ShieldCheck, Zap } from 'lucide-react';

export default function SetupGuideModal({ user, onClose }) {
  const [copiedStep1, setCopiedStep1] = useState(false);
  const [copiedStep2, setCopiedStep2] = useState(false);

  const cmdStep1 = "pip install cue-companion";
  const cmdStep2 = "python backend/auth_cli.py";

  const copyToClipboard = (text, setCopied) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={20} className="text-indigo-400" /> Connect Gemini CLI
          </div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '4px 0' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.5' }}>
            Connect your local terminal to your Cue account ({user ? <strong style={{ color: '#818cf8' }}>{user.email}</strong> : 'Not logged in'}). Once connected, Cue will automatically generate real-time Cue Cards whenever you run Gemini CLI!
          </p>

          {/* Step 1 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-normal)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ background: 'var(--indigo-primary, #6366f1)', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>1</span>
              Install Cue CLI Package
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#090d16', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)', fontFamily: 'Fira Code, monospace', fontSize: '13px', color: '#38bdf8' }}>
              <code>{cmdStep1}</code>
              <button onClick={() => copyToClipboard(cmdStep1, setCopiedStep1)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {copiedStep1 ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-normal)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ background: 'var(--indigo-primary, #6366f1)', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>2</span>
              Authenticate & Auto-Install Global Hook
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#090d16', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)', fontFamily: 'Fira Code, monospace', fontSize: '13px', color: '#38bdf8' }}>
              <code>{cmdStep2}</code>
              <button onClick={() => copyToClipboard(cmdStep2, setCopiedStep2)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                {copiedStep2 ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
              </button>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
              This automatically registers the <code>cue-capture</code> hook in <code>~/.gemini/settings.json</code> on your computer.
            </span>
          </div>

          {/* Step 3 */}
          <div style={{ background: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#34d399', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} /> Ready to Code!
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-normal)', margin: 0, lineHeight: '1.4' }}>
              Open terminal in <strong>any project</strong> and run Gemini CLI as usual (e.g. <code>gemini "refactor auth"</code>). Your Cue Cards will automatically stream to this dashboard!
            </p>
          </div>

          <div className="modal-footer" style={{ marginTop: '20px' }}>
            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
              Got It, Let's Go!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
