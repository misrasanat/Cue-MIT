import { Terminal } from 'lucide-react';
import Modal from '../components/Modal';
import Command from '../components/Command';

export default function SetupGuideModal({ user, onClose }) {
  return (
    <Modal
      title="Connect your terminal"
      icon={Terminal}
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>All set</button>}
    >
      <p className="muted">
        Three commands, once per machine, so Cue can follow along while your assistant works
        {user ? <> and save it to <strong>{user.email}</strong></> : ''}. Cue supports Gemini CLI and Antigravity for now.
      </p>

      <div className="setup-step">
        <span className="step-num">1</span>
        <div>
          <strong>Install Cue</strong>
          <Command text="pip install cue-companion" />
        </div>
      </div>

      <div className="setup-step">
        <span className="step-num">2</span>
        <div>
          <strong>Create your account or log in</strong>
          <Command text="cue" />
          <p className="muted small">Use the same email and password you use here.</p>
        </div>
      </div>

      <div className="setup-step">
        <span className="step-num">3</span>
        <div>
          <strong>Connect your assistant</strong>
          <Command text="cue-setup" />
          <p className="muted small">Installs the Gemini CLI and Antigravity hooks on this computer.</p>
        </div>
      </div>

      <div className="callout callout-cool">
        <strong>That&rsquo;s it</strong>
        <span>Use your assistant as normal. When you&rsquo;re ready, come back and turn the session into lessons.</span>
      </div>
    </Modal>
  );
}
