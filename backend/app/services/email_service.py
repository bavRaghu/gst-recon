import email.utils
import logging
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional, Tuple

from .. import config

logger = logging.getLogger(__name__)

# Basic regex for email format validation
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

# Mock tracking for test fixtures
_USE_MOCK_SMTP = False
_MOCK_FAIL_NEXT: Optional[str] = None
_MOCK_SENT_EMAILS: List[Dict[str, Any]] = []


def enable_mock_smtp(fail_reason: Optional[str] = None):
    """Enables mock SMTP interceptor for unit tests."""
    global _USE_MOCK_SMTP, _MOCK_FAIL_NEXT
    _USE_MOCK_SMTP = True
    _MOCK_FAIL_NEXT = fail_reason


def disable_mock_smtp():
    """Disables mock SMTP interceptor."""
    global _USE_MOCK_SMTP, _MOCK_FAIL_NEXT
    _USE_MOCK_SMTP = False
    _MOCK_FAIL_NEXT = None


def clear_mock_emails():
    """Clears intercepted mock emails."""
    global _MOCK_SENT_EMAILS
    _MOCK_SENT_EMAILS = []


def get_mock_sent_emails() -> List[Dict[str, Any]]:
    """Retrieves intercepted mock emails."""
    return list(_MOCK_SENT_EMAILS)


def validate_recipient(
    recipient: str,
    is_test_mode: bool = config.SMTP_TEST_MODE,
    allowed_recipients: Optional[List[str]] = None,
    test_recipient: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Validates recipient email address format and enforces test mode security.
    In test mode, only explicitly allowlisted addresses or the test recipient are permitted.
    """
    clean_email = recipient.strip()
    if not clean_email:
        return False, "Recipient email address cannot be empty."

    if not EMAIL_REGEX.match(clean_email):
        return False, f"Invalid email address format: '{clean_email}'."

    if is_test_mode:
        effective_allowed = [
            e.lower().strip() for e in (allowed_recipients or config.SMTP_ALLOWED_RECIPIENTS)
        ]
        effective_test_rec = (test_recipient or config.SMTP_TEST_RECIPIENT).lower().strip()
        if effective_test_rec and effective_test_rec not in effective_allowed:
            effective_allowed.append(effective_test_rec)

        clean_lower = clean_email.lower()
        if clean_lower not in effective_allowed:
            allowed_display = ", ".join(effective_allowed) if effective_allowed else "none"
            return (
                False,
                f"Sending blocked: Test mode is active. '{clean_email}' is not an approved test recipient. "
                f"Allowed recipients in test mode: [{allowed_display}].",
            )

    return True, ""


def send_email_smtp(
    recipient: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
) -> Tuple[bool, str, Optional[str]]:
    """
    Safely delivers an email notice via SMTP, adhering to test-mode safety rules.
    Returns (success: bool, status_message: str, message_id: Optional[str]).
    """
    clean_recipient = recipient.strip()
    clean_cc = cc.strip() if cc else None

    # 1. Check if SMTP is enabled
    if not config.SMTP_ENABLED:
        return False, "SMTP email sending is disabled in backend configuration.", None

    # 2. Enforce test-mode recipient verification
    is_valid, validation_err = validate_recipient(clean_recipient)
    if not is_valid:
        logger.warning("Email dispatch blocked by recipient policy: %s", validation_err)
        return False, validation_err, None

    # Validate CC if supplied
    if clean_cc:
        for cc_addr in [e.strip() for e in clean_cc.split(",") if e.strip()]:
            if not EMAIL_REGEX.match(cc_addr):
                return False, f"Invalid CC email address format: '{cc_addr}'.", None

    message_id = email.utils.make_msgid(domain="gst-recon.local")

    # 3. Check for unit test mock interception
    if _USE_MOCK_SMTP:
        if _MOCK_FAIL_NEXT:
            err = _MOCK_FAIL_NEXT
            logger.warning("Mock SMTP failure triggered: %s", err)
            return False, f"SMTP delivery failed: {err}", None

        _MOCK_SENT_EMAILS.append({
            "message_id": message_id,
            "recipient": clean_recipient,
            "cc": clean_cc,
            "subject": subject,
            "body": body,
            "mode": "test" if config.SMTP_TEST_MODE else "live",
        })
        logger.info("Mock SMTP: email successfully captured for %s", clean_recipient)
        return True, "Email accepted by SMTP server.", message_id

    # 4. Standard SMTP transmission
    try:
        msg = MIMEMultipart("alternative")
        msg["Message-ID"] = message_id
        msg["Date"] = email.utils.formatdate(localtime=True)
        msg["Subject"] = subject
        msg["From"] = f"{config.SMTP_FROM_NAME} <{config.SMTP_FROM_EMAIL}>"
        msg["To"] = clean_recipient
        if clean_cc:
            msg["Cc"] = clean_cc

        # Append plain text part
        text_part = MIMEText(body, "plain", "utf-8")
        msg.attach(text_part)

        destinations = [clean_recipient]
        if clean_cc:
            destinations.extend([e.strip() for e in clean_cc.split(",") if e.strip()])

        logger.info(
            "Connecting to SMTP server at %s:%d (TLS=%s, SSL=%s)...",
            config.SMTP_HOST,
            config.SMTP_PORT,
            config.SMTP_USE_TLS,
            config.SMTP_USE_SSL,
        )

        if config.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(
                host=config.SMTP_HOST,
                port=config.SMTP_PORT,
                timeout=config.SMTP_TIMEOUT_SECONDS,
            )
        else:
            server = smtplib.SMTP(
                host=config.SMTP_HOST,
                port=config.SMTP_PORT,
                timeout=config.SMTP_TIMEOUT_SECONDS,
            )

        with server:
            if config.SMTP_USE_TLS and not config.SMTP_USE_SSL:
                server.starttls()

            if config.SMTP_USERNAME and config.SMTP_PASSWORD:
                server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)

            server.send_message(msg, from_addr=config.SMTP_FROM_EMAIL, to_addrs=destinations)

        logger.info("Email notice dispatched successfully to %s via SMTP", clean_recipient)
        return True, "Email accepted by SMTP server.", message_id

    except smtplib.SMTPAuthenticationError as auth_err:
        err_msg = f"SMTP Authentication Failed: {auth_err}"
        logger.error(err_msg)
        return False, err_msg, None
    except (smtplib.SMTPConnectError, ConnectionRefusedError, OSError) as conn_err:
        err_msg = f"Cannot connect to SMTP server at {config.SMTP_HOST}:{config.SMTP_PORT} ({conn_err})."
        logger.error(err_msg)
        return False, err_msg, None
    except smtplib.SMTPException as smtp_err:
        err_msg = f"SMTP protocol error: {smtp_err}"
        logger.error(err_msg)
        return False, err_msg, None
    except Exception as ex:
        err_msg = f"Unexpected error during SMTP dispatch: {str(ex)}"
        logger.error(err_msg)
        return False, err_msg, None
