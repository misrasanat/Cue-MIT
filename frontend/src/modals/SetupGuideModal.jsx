import { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import Modal from '../components/Modal';

function Command({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked; the command is still on screen to copy by hand.
    }
  };
  return (
    <div className="command">
      <code>{text}</code>
      <button className="icon-btn" onClick={copy} aria-label={`Copy ${text}`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

export default function SetupGuideModal({ user, onClose }) {
  return (
    <Modal
      title="Connect your terminal"
      icon={Terminal}
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>All set</button>}
    >
      <p className="muted">
        Two quick steps so Cue can see what your coding assistant changes
        {user ? <> and save it to <strong>{user.email}</strong></> : ''}.
      </p>

      <div className="setup-step">
        <span className="step-num">1</span>
        <div>
          <strong>Install Cue in your terminal</strong>
          <Command text="pip install cue-companion" />
        </div>
      </div>

      <div className="setup-step">
        <span className="step-num">2</span>
        <div>
          <strong>Sign in from the terminal</strong>
          <Command text="python backend/auth_cli.py" />
          <p className="muted small">It opens a prompt for the same email and password you use here.</p>
        </div>
      </div>

      <div className="callout callout-cool">
        <strong>That’s it</strong>
        <span>Use your assistant as normal. When you’re ready, come back and turn the session into lessons.</span>
      </div>
    </Modal>
  );
}
