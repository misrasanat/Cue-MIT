"""
Tells the team when something needs attention (today: the AI spending limit was reached).

Email needs an account to send from, which Cue can't create for you. Two options, both read from backend/.env:
  1. Gmail / any SMTP:  SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASSWORD, optional SMTP_FROM
     (for Gmail, use an "App password", not your normal password)
  2. Resend:            RESEND_API_KEY, optional ALERT_FROM
Whatever happens, the alert is also written to ~/.cue/budget_alert.txt and shown inside the app.
"""

import json
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage
from pathlib import Path

DEFAULT_RECIPIENTS = "misrasanat123@gmail.com,dhweya.modi@gmail.com"
ALERT_FILE = Path.home() / ".cue" / "budget_alert.txt"


def recipients():
    raw = os.environ.get("BUDGET_ALERT_EMAILS", DEFAULT_RECIPIENTS)
    return [e.strip() for e in raw.split(",") if e.strip()]


def can_send():
    return bool(os.environ.get("RESEND_API_KEY") or (os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")
                                                       and os.environ.get("SMTP_PASSWORD")))


def _send_smtp(to, subject, body):
    host, user = os.environ["SMTP_HOST"], os.environ["SMTP_USER"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    message = EmailMessage()
    message["From"] = os.environ.get("SMTP_FROM", user)
    message["To"] = ", ".join(to)
    message["Subject"] = subject
    message.set_content(body)
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as server:
            server.login(user, os.environ["SMTP_PASSWORD"])
            server.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(user, os.environ["SMTP_PASSWORD"])
            server.send_message(message)


def _send_resend(to, subject, body):
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps({"from": os.environ.get("ALERT_FROM", "Cue <onboarding@resend.dev>"),
                         "to": to, "subject": subject, "text": body}).encode("utf-8"),
        headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}", "Content-Type": "application/json"},
    )
    urllib.request.urlopen(request, timeout=20).read()


def send_alert(subject, body):
    """Returns {"emailed": bool, "to": [...], "error": str|None}. Never raises."""
    to = recipients()
    try:
        ALERT_FILE.parent.mkdir(parents=True, exist_ok=True)
        ALERT_FILE.write_text(f"{subject}\n\n{body}\n", encoding="utf-8")
    except Exception:
        pass
    print(f"[Cue ALERT] {subject}")

    if not to:
        return {"emailed": False, "to": [], "error": "No alert email addresses are set (BUDGET_ALERT_EMAILS)."}
    try:
        if os.environ.get("RESEND_API_KEY"):
            _send_resend(to, subject, body)
        elif can_send():
            _send_smtp(to, subject, body)
        else:
            return {"emailed": False, "to": to, "error": "No email account is set up. Add SMTP_* or RESEND_API_KEY to backend/.env."}
        return {"emailed": True, "to": to, "error": None}
    except Exception as e:
        print(f"[Cue ALERT] Email failed: {e}")
        return {"emailed": False, "to": to, "error": str(e)}
