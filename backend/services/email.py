import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from config import settings

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    """Send an email via SMTP. Falls back to console logging in dev."""
    if not settings.SMTP_HOST:
        logger.info(f"[DEV] Email to {to_email}: {subject}")
        print(f"\n{'='*60}")
        print(f"EMAIL (dev mode)")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body: {text_body}")
        print(f"{'='*60}\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def send_password_reset_email(to_email: str, reset_url: str) -> bool:
    """Send password reset email."""
    subject = "FieldScout — Reset Your Password"
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2E7D32;">FieldScout</h2>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <p style="margin: 24px 0;">
            <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: #2E7D32; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Reset Password
            </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    </div>
    """
    return _send_email(to_email, subject, html_body, f"Reset your password: {reset_url}")


def send_verification_email(to_email: str, verify_url: str) -> bool:
    """Send email verification email."""
    subject = "FieldScout — Verify Your Email"
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #2E7D32;">FieldScout</h2>
        <p>Welcome to FieldScout! Please verify your email address to keep your account active:</p>
        <p style="margin: 24px 0;">
            <a href="{verify_url}" style="display: inline-block; padding: 12px 24px; background: #2E7D32; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Verify Email
            </a>
        </p>
        <p style="color: #666; font-size: 14px;">This link expires in 24 hours. You can use the app immediately, but please verify within the grace period.</p>
    </div>
    """
    return _send_email(to_email, subject, html_body, f"Verify your email: {verify_url}")
