import resend
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


class ResendEmailBackend(BaseEmailBackend):
    def open(self):
        resend.api_key = settings.RESEND_API_KEY
        return True

    def close(self):
        pass

    def send_messages(self, email_messages):
        resend.api_key = settings.RESEND_API_KEY
        sent = 0
        for msg in email_messages:
            try:
                payload = {
                    "from": msg.from_email,
                    "to": msg.to,
                    "subject": msg.subject,
                    "text": msg.body,
                }
                for content, mimetype in getattr(msg, "alternatives", []):
                    if mimetype == "text/html":
                        payload["html"] = content
                        break
                resend.Emails.send(payload)
                sent += 1
            except Exception:
                if not self.fail_silently:
                    raise
        return sent
