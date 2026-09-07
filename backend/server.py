from fastapi import FastAPI, APIRouter, HTTPException, Depends, BackgroundTasks, Request, Query, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson.codec_options import CodecOptions
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
import asyncio
import httpx
import json
import re
from collections import defaultdict
import time
import hashlib
import hmac
import csv
import io
from starlette.responses import StreamingResponse

# Firebase Admin SDK for FCM push notifications
import firebase_admin
from firebase_admin import credentials as firebase_credentials, messaging as firebase_messaging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client.get_database(
    os.environ.get('DB_NAME', 'tefilah_db'),
    codec_options=CodecOptions(tz_aware=True, tzinfo=timezone.utc)
)

# Data-access layer. Collections are migrated behind `repos` one at a time;
# anything not yet migrated still uses `db.<collection>` directly below.
# Swapping DB_BACKEND (mongo -> dynamo) is the cutover, and the rollback.
from repo import make_repos  # noqa: E402
repos = make_repos(db)

# JWT Configuration
_jwt_default = 'tefilah-secret-key-2024-sacred'
JWT_SECRET = os.environ.get('JWT_SECRET', _jwt_default)
if JWT_SECRET == _jwt_default:
    _boot_logger = logging.getLogger(__name__)
    # Fail closed: any deployment against a non-local database (Railway / Atlas /
    # Elastic Beanstalk) is treated as production and MUST NOT run on the built-in
    # default secret — otherwise anyone can forge admin/user tokens. Local dev
    # (localhost Mongo) still boots with a warning; set ALLOW_DEFAULT_JWT_SECRET=true
    # to force-allow the default anywhere else (not recommended).
    _mongo_target = (mongo_url or '').lower()
    _looks_production = bool(
        os.environ.get('RAILWAY_ENVIRONMENT')
        or os.environ.get('PRODUCTION')
        or 'mongodb+srv' in _mongo_target
        or (_mongo_target and 'localhost' not in _mongo_target and '127.0.0.1' not in _mongo_target)
    )
    if _looks_production and os.environ.get('ALLOW_DEFAULT_JWT_SECRET', '').lower() != 'true':
        raise RuntimeError(
            "FATAL: JWT_SECRET must be set to a strong random value in production. "
            "Refusing to start on the built-in default secret."
        )
    _boot_logger.warning("⚠️  Using default JWT_SECRET — set JWT_SECRET env var before deploying to production!")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24  # 24 hours (use refresh tokens for longer sessions)

# LLM Provider Configuration
LLM_PROVIDER = os.environ.get('LLM_PROVIDER', 'gemini')

# Ollama Configuration (Local LLM)
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'deepseek-r1:8b')

# OpenRouter Configuration
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
OPENROUTER_MODEL = os.environ.get('OPENROUTER_MODEL', 'deepseek/deepseek-chat-v3-0324')
OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

# Google Gemini Configuration
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

# Email Configuration (Resend API)
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'admin@tefillah.in')
# Resend's API (api.resend.com) sits behind Cloudflare, which blocks requests
# with non-browser User-Agents (python-httpx / urllib) returning "error 1010".
# A browser UA is required for the email API calls to get through.
RESEND_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Profile photos — uploaded to S3 (tefillah-web-prod/avatars/*) and served via
# the existing CloudFront distribution at https://tefillah.in/avatars/<key>.
# PUBLIC_API_URL stays for the legacy MongoDB-served avatar endpoint (back-compat).
PUBLIC_API_URL = os.environ.get('PUBLIC_API_URL', 'https://api.tefillah.in').rstrip('/')
AVATAR_MAX_BYTES = 3 * 1024 * 1024  # 3 MB hard cap
AVATAR_ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
S3_AVATAR_BUCKET = os.environ.get('S3_AVATAR_BUCKET', 'tefillah-web-prod')
AVATAR_PUBLIC_BASE = os.environ.get('AVATAR_PUBLIC_BASE', 'https://tefillah.in').rstrip('/')
AWS_S3_REGION = os.environ.get('AWS_S3_REGION', 'ap-south-1')
_AVATAR_EXT = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}

try:
    import boto3 as _boto3
except Exception as _boto3_err:  # pragma: no cover
    # Deliberately broader than ImportError. S3 avatars are OPTIONAL, but a
    # partially-installed or corrupted boto3 raises OSError/UnicodeDecodeError
    # rather than ImportError, which would take the ENTIRE API down at import
    # time instead of just disabling avatar uploads. Observed for real:
    # WinError 1392 on a corrupted site-packages/botocore.
    logging.getLogger(__name__).warning(
        "boto3 unavailable (%s: %s) — S3 avatar upload disabled",
        type(_boto3_err).__name__, _boto3_err)
    _boto3 = None

_s3_client = None
def _get_s3():
    """Lazy S3 client; uses the EB instance role credentials (no keys needed)."""
    global _s3_client
    if _s3_client is None:
        _s3_client = _boto3.client('s3', region_name=AWS_S3_REGION)
    return _s3_client

# Admin secret for first admin creation
_admin_default = 'tefilah-admin-secret-2024'
ADMIN_SECRET = os.environ.get('ADMIN_SECRET', _admin_default)
if ADMIN_SECRET == _admin_default:
    if os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('PRODUCTION'):
        raise RuntimeError("FATAL: ADMIN_SECRET must be set to a strong random value in production!")
    logging.getLogger(__name__).warning("⚠️  Using default ADMIN_SECRET — set ADMIN_SECRET env var before deploying!")

# Firebase Admin SDK initialization (for FCM push notifications)
_firebase_creds_path = os.environ.get('FIREBASE_ADMIN_CREDENTIALS', '')
_firebase_initialized = False
if _firebase_creds_path:
    _creds_full_path = ROOT_DIR / _firebase_creds_path if not os.path.isabs(_firebase_creds_path) else Path(_firebase_creds_path)
    if _creds_full_path.exists():
        try:
            _fb_cred = firebase_credentials.Certificate(str(_creds_full_path))
            firebase_admin.initialize_app(_fb_cred)
            _firebase_initialized = True
            logging.getLogger(__name__).info("✅ Firebase Admin SDK initialized for FCM push notifications")
        except Exception as _fb_err:
            logging.getLogger(__name__).warning(f"⚠️  Firebase Admin SDK init failed: {_fb_err}")
    else:
        logging.getLogger(__name__).warning(f"⚠️  Firebase credentials file not found: {_creds_full_path}")
else:
    logging.getLogger(__name__).warning("⚠️  FIREBASE_ADMIN_CREDENTIALS not set — FCM push disabled")

# Rate limiting storage (in-memory for simplicity, use Redis in production)
rate_limit_storage: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 20  # requests per window (tightened from 30)
AUTH_RATE_LIMIT = 5  # auth attempts per window
# Total LLM-backed requests per minute across ALL clients — a hard cost backstop on
# Gemini spend that holds even if the per-IP throttle is bypassed via X-Forwarded-For
# spoofing (get_client_ip trusts the proxy chain; see its note). Generous for launch
# traffic; tune via env if real usage approaches it.
GLOBAL_LLM_RATE_LIMIT = int(os.environ.get("GLOBAL_LLM_RATE_LIMIT", "120"))

# Per-identity failed-login tracking (brute-force / credential stuffing defense)
failed_login_storage: Dict[str, List[float]] = defaultdict(list)
login_lock_until: Dict[str, float] = {}  # identifier -> unix timestamp until unlocked
FAILED_LOGIN_WINDOW = 900          # 15 minutes
FAILED_LOGIN_MAX = 10              # lock after 10 failures within window
FAILED_LOGIN_LOCK_DURATION = 1800  # lock duration: 30 minutes
ADMIN_FAILED_LOGIN_MAX = 5         # admin accounts locked after 5 failures (stricter)
ADMIN_FAILED_LOGIN_LOCK_DURATION = 3600  # admin lock: 1 hour

# Per-email action limits (password reset, signup) — prevents email-spam abuse
email_action_storage: Dict[str, List[float]] = defaultdict(list)
EMAIL_ACTION_WINDOW = 3600  # 1 hour
EMAIL_ACTION_MAX = 3        # max actions per email per hour

# Password-reset brute-force cap — burn the reset code after this many wrong guesses.
# The 6-digit code would otherwise be guessable within its 30-minute lifetime.
PASSWORD_RESET_MAX_ATTEMPTS = 5

# Hard cap on a partner's block list, so the partner document can't grow unbounded.
MAX_BLOCKED_USERS = 5000

# Create the main app
# VULN-01 (TASK-1): API docs / OpenAPI schema are disabled unless explicitly
# enabled. They hand an attacker the entire admin route map otherwise.
_ENABLE_DOCS = os.environ.get("ENABLE_DOCS", "false").lower() == "true"
app = FastAPI(
    title="TEFILAH API",
    description="Sacred Prayer Request Platform - Production Ready",
    docs_url="/docs" if _ENABLE_DOCS else None,
    redoc_url="/redoc" if _ENABLE_DOCS else None,
    openapi_url="/openapi.json" if _ENABLE_DOCS else None,
)

# Create routers
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== SECURITY HELPERS ====================

def sanitize_input(text: str) -> str:
    """Remove potentially dangerous characters from input"""
    if not text:
        return text
    # Remove script tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    # Remove style tags
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.IGNORECASE | re.DOTALL)
    # Remove all HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Remove javascript: urls
    text = re.sub(r'javascript\s*:', '', text, flags=re.IGNORECASE)
    # Remove event handlers (onclick, onerror, onload, etc.)
    text = re.sub(r'on\w+\s*=', '', text, flags=re.IGNORECASE)
    # Remove data: URIs
    text = re.sub(r'data\s*:[^,]*,', '', text, flags=re.IGNORECASE)
    # Remove HTML entities that could hide XSS (don't decode them back into dangerous chars)
    text = re.sub(r'&[a-zA-Z]+;', '', text)
    text = re.sub(r'&#x?[0-9a-fA-F]+;', '', text)
    # Final tag strip
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()

def check_rate_limit(identifier: str, limit: int = RATE_LIMIT_MAX_REQUESTS) -> bool:
    """Check if request should be rate limited"""
    current_time = time.time()
    window_start = current_time - RATE_LIMIT_WINDOW

    # Clean old entries
    rate_limit_storage[identifier] = [t for t in rate_limit_storage[identifier] if t > window_start]

    if len(rate_limit_storage[identifier]) >= limit:
        return False

    rate_limit_storage[identifier].append(current_time)
    return True

def check_login_lockout(identifier: str) -> tuple:
    """Return (is_locked, seconds_remaining) for a given login identity (e.g. 'admin:email')."""
    current_time = time.time()
    if identifier in login_lock_until:
        if current_time < login_lock_until[identifier]:
            return True, int(login_lock_until[identifier] - current_time)
        # Lock expired — clear
        del login_lock_until[identifier]
        failed_login_storage.pop(identifier, None)
    return False, 0

def record_failed_login(identifier: str, max_attempts: int = FAILED_LOGIN_MAX,
                        lock_duration: int = FAILED_LOGIN_LOCK_DURATION) -> int:
    """Record a failed login. Auto-locks the identity after max_attempts within window.
    Returns the current failure count within the window."""
    current_time = time.time()
    window_start = current_time - FAILED_LOGIN_WINDOW
    failed_login_storage[identifier] = [t for t in failed_login_storage[identifier] if t > window_start]
    failed_login_storage[identifier].append(current_time)
    count = len(failed_login_storage[identifier])
    if count >= max_attempts:
        login_lock_until[identifier] = current_time + lock_duration
        logger.warning(f"🔒 Account locked due to {count} failed attempts: {identifier} (locked {lock_duration}s)")
    return count

def reset_failed_logins(identifier: str) -> None:
    """Clear failed-login tracking on successful login."""
    failed_login_storage.pop(identifier, None)
    login_lock_until.pop(identifier, None)

def progressive_login_delay(identifier: str) -> float:
    """Compute increasing delay seconds based on prior failed attempts (0, 1, 2, 4, 8 cap)."""
    current_time = time.time()
    window_start = current_time - FAILED_LOGIN_WINDOW
    recent = [t for t in failed_login_storage.get(identifier, []) if t > window_start]
    count = len(recent)
    if count == 0:
        return 0.0
    # 1→1s, 2→2s, 3→4s, 4+→8s cap
    return float(min(2 ** (count - 1), 8))

def check_email_action_limit(email: str, action: str) -> bool:
    """Per-email action limit — DISABLED per product decision (the 3/hour cap was removed).
    Per-IP rate limiting (check_rate_limit) still guards these endpoints against rapid abuse.
    Always returns True (no per-email throttle)."""
    return True

def get_client_ip(request: Request) -> str:
    """Get client IP address.

    SECURITY / KNOWN LIMITATION: this returns the LEFTMOST X-Forwarded-For entry, which
    is client-controlled — CloudFront *appends* the viewer IP, so an attacker can prepend
    a fake value and land in a fresh per-IP rate-limit bucket every request. The correct
    fix is to take the Nth-from-RIGHT entry, where N = the number of trusted appending
    proxies. That count is deployment-specific and CHANGED this session when the EB env was
    converted to load-balanced (chain is now CloudFront -> LB -> nginx -> uvicorn), so it
    must be VERIFIED against the live X-Forwarded-For before hardcoding — a wrong N collapses
    all users onto one proxy IP and 429s everyone. Until then, the cost-critical path is
    protected by the deployment-independent GLOBAL_LLM_RATE_LIMIT backstop above.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ==================== MODELS ====================

# User Models
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=6, max_length=20)
    address: Optional[str] = Field(None, max_length=200)
    location_city: Optional[str] = Field(None, max_length=100)
    location_country: Optional[str] = Field(None, max_length=100)
    password: str = Field(..., min_length=8)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_input(v)

    @field_validator('address')
    @classmethod
    def sanitize_address(cls, v: str | None) -> str | None:
        return sanitize_input(v) if v else v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=200)
    organization: Optional[str] = Field(None, max_length=200)

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    is_verified: bool = False
    is_admin: bool = False
    profile_photo_url: Optional[str] = None
    pending_email: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None
    status: str = "active"

class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    location_city: Optional[str] = Field(None, max_length=100)
    location_country: Optional[str] = Field(None, max_length=100)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    user_type: str = "user"

# Partner/Agent Models
class PartnerCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=6, max_length=20)
    password: str = Field(..., min_length=8)
    location_city: str = Field(..., min_length=2, max_length=100)
    location_country: str = Field(..., min_length=2, max_length=100)
    organization: Optional[str] = Field(None, max_length=200)
    partner_type: str = "prayer_warrior"  # prayer_warrior, church_partner, organization

class PartnerLogin(BaseModel):
    email: EmailStr
    password: str

class PartnerResponse(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    location_city: str
    location_country: str
    organization: Optional[str] = None
    partner_type: str
    cell_id: Optional[str] = None
    cell_name: Optional[str] = None
    is_verified: bool = False
    is_active: bool = True
    prayers_handled: int = 0
    prayer_capacity: int = 10
    assigned_prayers_count: int = 0
    total_prayer_time_minutes: int = 0
    response_rate: float = 0.0
    profile_photo_url: Optional[str] = None
    created_at: datetime
    last_active: Optional[datetime] = None

class PartnerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    partner: PartnerResponse
    user_type: str = "partner"

class PartnerStats(BaseModel):
    total_prayers_received: int = 0
    prayers_completed: int = 0
    prayers_pending: int = 0
    # Dashboard buckets: new = assigned & not yet opened; assigned = opened & active (<24h);
    # overdue = opened, not prayed, 24h+ elapsed.
    prayers_new: int = 0
    prayers_assigned: int = 0
    prayers_overdue: int = 0
    average_response_time_hours: float = 0.0
    total_prayer_time_minutes: int = 0
    response_rate: float = 0.0
    weekly_activity: List[Dict] = []
    monthly_trend: List[Dict] = []

# Prayer Cell Models
class PrayerCellCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    location_city: str
    location_country: str
    description: Optional[str] = Field(None, max_length=1000)

class PrayerCellResponse(BaseModel):
    id: str
    name: str
    location_city: str
    location_country: str
    description: Optional[str] = None
    agent_count: int = 0
    request_count: int = 0
    is_active: bool = True
    created_at: datetime

# Prayer Request Models
class ReportContentRequest(BaseModel):
    """Used both for a partner reporting an objectionable prayer request and for a
    user flagging the AI-generated comfort message/verse on their own prayer."""
    reason: Optional[str] = Field(None, max_length=500)


class BlockUserRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=100)


class PrayerRequestCreate(BaseModel):
    content: str = Field(..., min_length=10, max_length=2000)
    is_anonymous: bool = False
    location_city: Optional[str] = Field(None, max_length=100)
    location_country: Optional[str] = Field(None, max_length=100)
    location_lat: Optional[float] = None
    location_lon: Optional[float] = None
    language: Optional[str] = Field("en", max_length=5)  # en, hi, te

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        return sanitize_input(v)

    @model_validator(mode='after')
    def require_city_country_if_no_coords(self):
        has_coords = self.location_lat is not None and self.location_lon is not None
        if not has_coords:
            if not self.location_city or not self.location_city.strip():
                raise ValueError('City is required when location access is not granted')
            if not self.location_country or not self.location_country.strip():
                raise ValueError('Country is required when location access is not granted')
        return self

class PrayerRequestResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    content: str
    is_anonymous: bool = False
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    category: Optional[str] = None
    comfort_message: Optional[str] = None
    bible_verse: Optional[str] = None
    bible_reference: Optional[str] = None
    assigned_cell_id: Optional[str] = None
    assigned_cell_name: Optional[str] = None
    assigned_partner_id: Optional[str] = None
    status: str = "pending"
    submitted_at: datetime
    assigned_at: Optional[datetime] = None
    prayed_at: Optional[datetime] = None
    prayer_duration_minutes: Optional[int] = None

class PrayerRequestForPartner(BaseModel):
    id: str
    content: str
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    category: Optional[str] = None
    status: str = "pending"
    submitted_at: datetime
    assigned_at: Optional[datetime] = None
    seen_by_partner: bool = False
    seen_at: Optional[datetime] = None
    requester_id: Optional[str] = None  # internal id for block/report; null for guest submissions

# Admin Models
class AdminCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class AdminStats(BaseModel):
    total_users: int = 0
    total_partners: int = 0
    total_prayers: int = 0
    prayers_pending: int = 0
    prayers_assigned: int = 0
    prayers_completed: int = 0
    total_llm_requests: int = 0
    llm_tokens_used: int = 0
    active_users_today: int = 0
    active_partners_today: int = 0
    new_users_this_week: int = 0
    new_partners_this_week: int = 0
    users_active: int = 0
    users_suspended: int = 0
    partners_active: int = 0
    partners_inactive: int = 0
    partners_pending_approval: int = 0

class LLMLogEntry(BaseModel):
    id: str
    request_type: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    duration_ms: int
    timestamp: datetime
    user_id: Optional[str] = None
    status: str = "success"
    error_message: Optional[str] = None

class ActivityLog(BaseModel):
    id: str
    action: str
    actor_type: str
    actor_id: str
    actor_name: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[Dict] = None
    ip_address: Optional[str] = None
    timestamp: datetime

class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "info"  # info, warning, success, error
    target_type: str = "all"  # all, users, partners, specific
    target_ids: Optional[List[str]] = None

class Notification(BaseModel):
    id: str
    title: str
    message: str
    type: str
    target_type: str
    is_read: bool = False
    created_at: datetime

# Admin management models
class AdminCreateWithPermissions(BaseModel):
    name: str
    email: EmailStr
    password: str
    permissions: List[str] = ["manage_prayers", "manage_partners", "manage_users", "view_analytics"]

class AdminUpdatePermissions(BaseModel):
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None

# Bulk action models
class BulkUserAction(BaseModel):
    user_ids: List[str]
    action: str  # delete, suspend, activate, verify, unverify

class BulkPartnerAction(BaseModel):
    partner_ids: List[str]
    action: str  # delete, activate, deactivate, verify, unverify

class BulkPrayerAction(BaseModel):
    prayer_ids: List[str]
    action: str  # delete, assign, unassign
    partner_id: Optional[str] = None  # for bulk assign

# Push notification model
class PushNotificationRequest(BaseModel):
    title: str
    body: str
    target: str = "all"  # all, users, partners, specific
    target_ids: Optional[List[str]] = None
    data: Optional[Dict[str, str]] = None

# Email to users model
class EmailBroadcast(BaseModel):
    subject: str
    body: str  # HTML body
    target: str = "all"  # all, users, partners, specific
    target_ids: Optional[List[str]] = None

# Other Models
class ComfortResponse(BaseModel):
    message: str
    prayer_id: str
    category: str
    comfort_message: str
    bible_verse: str
    bible_reference: str

class VerificationRequest(BaseModel):
    email: EmailStr
    code: str

class BibleVerseResponse(BaseModel):
    verse: str
    reference: str
    theme: str

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_token(user_id: str, email: str, user_type: str = "user", is_admin: bool = False, expiration_hours: int = None) -> str:
    hours = expiration_hours if expiration_hours is not None else JWT_EXPIRATION_HOURS
    payload = {
        "user_id": user_id,
        "email": email,
        "user_type": user_type,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        # VULN-04 (TASK-4): pin the algorithm (blocks alg:none and RS/HS
        # confusion) AND require the core claims so a token missing exp/iat/
        # user_id is rejected rather than silently accepted.
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "iat", "user_id"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_data = decode_token(credentials.credentials)
    
    if token_data.get("user_type") == "partner":
        user = await repos.partners.get(token_data["user_id"])
    elif token_data.get("user_type") == "admin":
        user = await repos.admins.get(token_data["user_id"])
    else:
        user = await repos.users.get(token_data["user_id"])
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Real-time status enforcement: block suspended/disabled users immediately
    if token_data.get("user_type") == "partner":
        if user.get("status") == "disabled" or not user.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account suspended by administrator")
    elif token_data.get("user_type") != "admin":
        if user.get("status") in ("disabled", "suspended"):
            raise HTTPException(status_code=403, detail="Account suspended by administrator")
    user["_user_type"] = token_data.get("user_type", "user")
    user["_is_admin"] = token_data.get("is_admin", False)
    return user

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except Exception:
        return None

async def get_current_partner(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_data = decode_token(credentials.credentials)
    if token_data.get("user_type") != "partner":
        raise HTTPException(status_code=403, detail="Partner access required")
    partner = await repos.partners.get(token_data["user_id"])
    if not partner:
        raise HTTPException(status_code=401, detail="Partner not found")
    # Real-time status enforcement (mirrors login_partner): a disabled, deactivated,
    # or not-yet-approved partner must not keep access via a still-valid token.
    if partner.get("status") in ("disabled", "pending_approval") or not partner.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is suspended or pending approval")
    # Heartbeat: update last_active on every authenticated partner request,
    # but at most once per 30 seconds to avoid write amplification.
    now = datetime.now(timezone.utc)
    last = partner.get("last_active")
    if not isinstance(last, datetime) or (now - last).total_seconds() > 30:
        await repos.partners.update(partner["_id"], {"last_active": now})
        partner["last_active"] = now
    return partner

async def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_data = decode_token(credentials.credentials)
    if not token_data.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    admin = await repos.admins.get(token_data["user_id"])
    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")
    # Real-time status enforcement: a deactivated admin must lose access immediately,
    # not keep it for the token's remaining lifetime (mirrors get_current_user/partner).
    if not admin.get("is_active", True):
        raise HTTPException(status_code=403, detail="Admin account has been deactivated")
    return admin

async def get_current_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Only super admins can access this endpoint"""
    admin = await get_current_admin(credentials)
    if not admin.get("is_super_admin", False):
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return admin

async def log_activity(action: str, actor_type: str, actor_id: str, actor_name: str, 
                       target_type: str = None, target_id: str = None, 
                       details: Dict = None, ip_address: str = None):
    """Log activity for audit trail"""
    log_entry = {
        "_id": str(uuid.uuid4()),
        "action": action,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "target_type": target_type,
        "target_id": target_id,
        "details": details,
        "ip_address": ip_address,
        "timestamp": datetime.now(timezone.utc),
    }
    await repos.activity_logs.insert(log_entry)

async def log_llm_usage(request_type: str, prompt_tokens: int, completion_tokens: int,
                        duration_ms: int, user_id: str = None, status: str = "success",
                        error_message: str = None):
    """Log LLM API usage. Best-effort — must never raise, or it would break the caller's response flow."""
    # Resolve the active model name based on the configured provider
    if LLM_PROVIDER == "gemini":
        active_model = GEMINI_MODEL
    elif LLM_PROVIDER == "openrouter":
        active_model = OPENROUTER_MODEL
    else:
        active_model = OLLAMA_MODEL

    log_entry = {
        "_id": str(uuid.uuid4()),
        "request_type": request_type,
        "provider": LLM_PROVIDER,
        "model": active_model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "duration_ms": duration_ms,
        "timestamp": datetime.now(timezone.utc),
        "user_id": user_id,
        "status": status,
        "error_message": error_message,
    }
    try:
        await repos.llm_logs.insert(log_entry)
    except Exception as log_err:
        # Never let logging failures break the LLM response — just warn
        logger.warning(f"Failed to write llm_logs entry: {log_err}")

def check_admin_permission(admin: dict, required_permission: str):
    """Check if admin has a specific permission. Super admins always have access."""
    if admin.get("is_super_admin", False):
        return True
    perms = admin.get("permissions", [])
    if "all" in perms or required_permission in perms:
        return True
    raise HTTPException(status_code=403, detail=f"Insufficient permissions: requires '{required_permission}'")

async def send_fcm_push(tokens: List[str], title: str, body: str, data: Dict = None) -> Dict:
    """Send an FCM push to many device tokens.

    Batches into multicast requests (500/req — FCM's cap) and runs the blocking
    firebase-admin HTTP call in a worker thread via asyncio.to_thread, so even a
    5,000-device broadcast never stalls the async event loop (a per-token
    synchronous loop would freeze every other request for minutes)."""
    if not _firebase_initialized:
        return {"success": 0, "failure": 0, "error": "Firebase not initialized"}

    if not tokens:
        return {"success": 0, "failure": 0, "error": "No tokens provided"}

    # FCM requires all data-payload values to be strings.
    str_data = {str(k): str(v) for k, v in (data or {}).items()}
    notification = firebase_messaging.Notification(title=title, body=body)
    success_count = 0
    failure_count = 0

    for i in range(0, len(tokens), 500):
        batch = tokens[i:i + 500]
        message = firebase_messaging.MulticastMessage(
            notification=notification,
            data=str_data,
            tokens=batch,
        )
        try:
            resp = await asyncio.to_thread(firebase_messaging.send_each_for_multicast, message)
            success_count += resp.success_count
            failure_count += resp.failure_count
        except Exception as e:
            failure_count += len(batch)
            logger.warning(f"FCM multicast batch failed ({len(batch)} tokens): {e}")

    return {"success": success_count, "failure": failure_count}

def generate_verification_code() -> str:
    return ''.join([str(uuid.uuid4().int % 10) for _ in range(6)])

async def send_email(to_email: str, subject: str, body: str):
    """Send email via Resend API"""
    if not RESEND_API_KEY:
        logger.warning(f"RESEND_API_KEY not set - skipping email to {to_email}")
        return False
    try:
        async with httpx.AsyncClient(timeout=30.0) as http_client:
            response = await http_client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                    "User-Agent": RESEND_USER_AGENT,
                },
                json={
                    "from": f"Tefillah <{SENDER_EMAIL}>",
                    "to": [to_email],
                    "subject": subject,
                    "html": body,
                },
            )
            if response.status_code == 200:
                logger.info(f"Email sent to {to_email} via Resend")
                return True
            else:
                logger.error(f"Resend API error: {response.status_code} - {response.text}")
                return False
    except Exception as e:
        logger.error(f"Failed to send email via Resend: {e}")
        return False


def _account_email_html(heading: str, paragraphs: List[str]) -> str:
    """Branded dark-theme HTML wrapper for account-lifecycle emails (from Tefillah <admin@tefillah.in>)."""
    body = "".join(
        f'<p style="color:#dddddd;font-size:15px;line-height:1.6;margin:0 0 14px 0;">{p}</p>'
        for p in paragraphs
    )
    return f"""
    <div style="background:#0f0f1a;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#1a1a2e;border-radius:14px;padding:28px;">
        <p style="color:#C0A062;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 4px 0;">Tefillah</p>
        <h2 style="color:#ffffff;font-size:20px;margin:0 0 18px 0;">{heading}</h2>
        {body}
        <p style="color:#666666;font-size:12px;margin-top:26px;border-top:1px solid #2a2a3e;padding-top:14px;">
          Questions? Just reply to this email or contact admin@tefillah.in.
        </p>
      </div>
    </div>
    """


async def send_account_notice(to_email: str, heading: str, subject: str, paragraphs: List[str]):
    """Fire-and-forget branded account-lifecycle email (deletion/suspension/reactivation/approval).
    Never raises — an email failure must not break the underlying account action."""
    if not to_email:
        return
    try:
        await send_email(to_email, subject, _account_email_html(heading, paragraphs))
    except Exception as e:
        logger.error(f"send_account_notice failed for {to_email}: {e}")

# ==================== LLM FUNCTIONS ====================

async def generate_with_ollama(prompt: str, system_prompt: str = None, user_id: str = None) -> tuple:
    """Generate response using local Ollama LLM"""
    start_time = time.time()
    
    try:
        full_prompt = f"{system_prompt}\n\nUser: {prompt}\n\nAssistant:" if system_prompt else prompt
        
        async with httpx.AsyncClient(timeout=120.0) as http_client:
            response = await http_client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9,
                    }
                }
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            if response.status_code != 200:
                await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", f"HTTP {response.status_code}")
                return None, f"LLM API error: {response.status_code}"
            
            result = response.json()
            llm_response = result.get("response", "")
            
            # Estimate tokens (rough approximation)
            prompt_tokens = len(full_prompt.split()) * 1.3
            completion_tokens = len(llm_response.split()) * 1.3
            
            await log_llm_usage("generate", int(prompt_tokens), int(completion_tokens), duration_ms, user_id, "success")
            
            return llm_response, None
            
    except httpx.ConnectError:
        duration_ms = int((time.time() - start_time) * 1000)
        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "Connection failed")
        return None, "Cannot connect to Ollama. Is it running?"
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", str(e))
        return None, str(e)

async def generate_with_openrouter(prompt: str, system_prompt: str = None, user_id: str = None) -> tuple:
    """Generate response using OpenRouter API (OpenAI-compatible)"""
    start_time = time.time()

    try:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=15.0) as http_client:
            response = await http_client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENROUTER_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "top_p": 0.9,
                }
            )

            duration_ms = int((time.time() - start_time) * 1000)

            if response.status_code != 200:
                error_detail = response.text[:200]
                await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", f"HTTP {response.status_code}: {error_detail}")
                return None, f"OpenRouter API error: {response.status_code} - {error_detail}"

            result = response.json()
            llm_response = result.get("choices", [{}])[0].get("message", {}).get("content", "")

            prompt_tokens = result.get("usage", {}).get("prompt_tokens", 0)
            completion_tokens = result.get("usage", {}).get("completion_tokens", 0)

            await log_llm_usage("generate", prompt_tokens, completion_tokens, duration_ms, user_id, "success")

            return llm_response, None

    except httpx.ConnectError:
        duration_ms = int((time.time() - start_time) * 1000)
        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "OpenRouter connection failed")
        return None, "Cannot connect to OpenRouter API."
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", str(e))
        return None, str(e)

async def generate_with_gemini(prompt: str, system_prompt: str = None, user_id: str = None) -> tuple:
    """Generate response using Google Gemini API directly.

    Retries on transient 429/503 responses with exponential backoff so the free tier's
    frequent "high demand" blips don't cascade into user-facing failures.
    """
    start_time = time.time()

    request_body: dict = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "topP": 0.9,
            "maxOutputTokens": 2048,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ],
    }

    if system_prompt:
        request_body["systemInstruction"] = {
            "parts": [{"text": system_prompt}]
        }

    url = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

    max_attempts = 3
    last_error = "Gemini request failed"

    for attempt in range(max_attempts):
        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                response = await http_client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json=request_body,
                )

                if response.status_code == 200:
                    duration_ms = int((time.time() - start_time) * 1000)
                    result = response.json()

                    candidates = result.get("candidates", [])
                    if not candidates:
                        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "No candidates in response")
                        return None, "Gemini returned no candidates (content may have been blocked)"

                    content = candidates[0].get("content", {})
                    parts = content.get("parts", [])
                    if not parts:
                        await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "No parts in response")
                        return None, "Gemini returned empty content"

                    llm_response = parts[0].get("text", "")

                    usage = result.get("usageMetadata", {})
                    prompt_tokens = usage.get("promptTokenCount", 0)
                    completion_tokens = usage.get("candidatesTokenCount", 0)

                    await log_llm_usage("generate", prompt_tokens, completion_tokens, duration_ms, user_id, "success")
                    return llm_response, None

                # Non-200: decide whether to retry
                error_detail = response.text[:300]
                last_error = f"Gemini API error: {response.status_code} - {error_detail}"

                if response.status_code in (429, 503) and attempt < max_attempts - 1:
                    # Transient: backoff and retry (1s, 2s, 4s)
                    backoff = 2 ** attempt
                    logger.warning(f"Gemini returned {response.status_code}, retrying in {backoff}s (attempt {attempt + 1}/{max_attempts})")
                    await asyncio.sleep(backoff)
                    continue

                # Permanent error — don't retry
                duration_ms = int((time.time() - start_time) * 1000)
                await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", f"HTTP {response.status_code}: {error_detail}")
                return None, last_error

        except httpx.ConnectError:
            last_error = "Cannot connect to Gemini API."
            if attempt < max_attempts - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            duration_ms = int((time.time() - start_time) * 1000)
            await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "Gemini connection failed")
            return None, last_error
        except httpx.ReadTimeout:
            last_error = "Gemini API timed out."
            if attempt < max_attempts - 1:
                await asyncio.sleep(2 ** attempt)
                continue
            duration_ms = int((time.time() - start_time) * 1000)
            await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", "Gemini timed out")
            return None, last_error
        except Exception as e:
            last_error = str(e)
            duration_ms = int((time.time() - start_time) * 1000)
            await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", last_error)
            return None, last_error

    # All retries exhausted
    duration_ms = int((time.time() - start_time) * 1000)
    await log_llm_usage("generate", 0, 0, duration_ms, user_id, "error", f"All retries exhausted: {last_error}")
    return None, last_error

async def generate_llm_response(prompt: str, system_prompt: str = None, user_id: str = None) -> tuple:
    """Dispatch to the configured LLM provider"""
    if LLM_PROVIDER == "gemini" and GEMINI_API_KEY:
        return await generate_with_gemini(prompt, system_prompt, user_id)
    elif LLM_PROVIDER == "openrouter" and OPENROUTER_API_KEY:
        return await generate_with_openrouter(prompt, system_prompt, user_id)
    else:
        return await generate_with_ollama(prompt, system_prompt, user_id)

def parse_llm_json(response: str) -> dict:
    """Parse JSON from LLM response, handling various formats"""
    if not response:
        return None
    
    # Remove thinking tags (for deepseek-r1)
    clean = response.strip()
    if "<think>" in clean:
        think_end = clean.find("</think>")
        if think_end != -1:
            clean = clean[think_end + 8:].strip()
    
    # Remove markdown code blocks
    if clean.startswith("```json"):
        clean = clean[7:]
    if clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()
    
    # Find JSON object
    json_start = clean.find("{")
    json_end = clean.rfind("}") + 1
    if json_start != -1 and json_end > json_start:
        clean = clean[json_start:json_end]
    
    try:
        return json.loads(clean)
    except Exception:
        return None

# ==================== CORS ====================
# Production: whitelist your domains. Dev: allow localhost origins.
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")
if not ALLOWED_ORIGINS or ALLOWED_ORIGINS == [""]:
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:8001",
        "http://localhost:5173",
        "https://tefillah.in",
        "https://www.tefillah.in",
        "https://app.tefillah.in",
        "https://admin.tefillah.in",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Admin-Secret"],
)

# Security headers middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: StarletteResponse = await call_next(request)
        # VULN-13 (TASK-12): canonical security headers on every API response.
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; connect-src 'self' https://*.tefillah.in; "
            "font-src 'self'; frame-ancestors 'none'"
        )
        # Strip stack-fingerprinting headers (X-XSS-Protection is deprecated and
        # can itself introduce issues; Server reveals uvicorn).
        response.headers["Server"] = "tefillah"
        if "x-xss-protection" in response.headers:
            del response.headers["x-xss-protection"]
        # VULN-09 (TASK-6): EB's nginx terminates the CloudFront→origin hop over
        # HTTP, so FastAPI's auto slash-redirect builds an http:// Location. All
        # real traffic is HTTPS (CloudFront), so upgrade any http:// redirect to
        # https:// — closes the protocol-downgrade leak.
        loc = response.headers.get("location")
        if loc and loc.startswith("http://"):
            response.headers["location"] = "https://" + loc[len("http://"):]
        return response

app.add_middleware(SecurityHeadersMiddleware)

# VULN-23 (TASK-21): any unhandled exception returns a generic body — never a
# traceback, file path, or SQL/Mongo detail. (FastAPI defaults to debug=False,
# so this only adds JSON shape + audit logging.)
from fastapi.responses import JSONResponse as _JSONResponse
from pymongo.errors import DuplicateKeyError as _DuplicateKeyError

@app.exception_handler(_DuplicateKeyError)
async def _duplicate_key_handler(request: Request, exc: _DuplicateKeyError):
    # A concurrent/double-submitted signup that loses the race to the unique email index
    # should read as a clean 400, not a scary 500. Covers register_user/register_partner
    # and every social-auth create path in one place.
    return _JSONResponse(status_code=400, content={"detail": "This email is already registered."})

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc!r}", exc_info=True)
    return _JSONResponse(status_code=500, content={"detail": "Internal server error"})

# ==================== BIBLE VERSE ENDPOINT ====================

# Bible verses are served from an in-memory pool so the landing/home screens never
# block on a 6-9s LLM call. The pool seeds instantly with curated fallbacks and is
# enriched in the background with LLM-generated verses (capped + deduped by reference).
_VERSE_THEMES = ["prayer", "faith", "hope", "peace", "comfort", "strength", "trust", "healing", "gratitude", "love", "patience", "courage", "forgiveness", "joy", "wisdom"]
_VERSE_BOOK_HINTS = ["Psalms", "Proverbs", "Isaiah", "Matthew", "Romans", "Philippians", "Hebrews", "James", "1 Peter", "John", "Ephesians", "Colossians", "Jeremiah", "Lamentations", "2 Corinthians"]
_VERSE_FALLBACKS = [
    {"verse": "The Lord is near to all who call on Him, to all who call on Him in truth.", "reference": "Psalm 145:18", "theme": "prayer"},
    {"verse": "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.", "reference": "Philippians 4:6", "theme": "prayer"},
    {"verse": "Call to me and I will answer you and tell you great and unsearchable things you do not know.", "reference": "Jeremiah 33:3", "theme": "faith"},
    {"verse": "Come to me, all you who are weary and burdened, and I will give you rest.", "reference": "Matthew 11:28", "theme": "comfort"},
    {"verse": "Trust in the Lord with all your heart, and do not lean on your own understanding.", "reference": "Proverbs 3:5", "theme": "trust"},
    {"verse": "The prayer of a righteous person is powerful and effective.", "reference": "James 5:16", "theme": "prayer"},
    {"verse": "Be still, and know that I am God.", "reference": "Psalm 46:10", "theme": "peace"},
    {"verse": "Cast all your anxiety on Him because He cares for you.", "reference": "1 Peter 5:7", "theme": "comfort"},
    {"verse": "The Lord is my strength and my shield; my heart trusts in Him, and He helps me.", "reference": "Psalm 28:7", "theme": "strength"},
    {"verse": "Weeping may stay for the night, but rejoicing comes in the morning.", "reference": "Psalm 30:5", "theme": "hope"},
]
_VERSE_POOL: dict = {}            # language -> list[verse dict]
_VERSE_REFILLING: set = set()     # languages with an in-flight refill
_VERSE_POOL_MAX = 40
_VERSE_POOL_MIN = 8

async def _refill_verse_pool(language: str):
    """Background: generate a few fresh verses via the LLM and add them to the pool."""
    if language in _VERSE_REFILLING:
        return
    _VERSE_REFILLING.add(language)
    try:
        import random
        lang_map = {"en": "English", "hi": "Hindi", "te": "Telugu"}
        response_language = lang_map.get(language, "English")
        lang_instruction = f"\nIMPORTANT: Respond with the verse text translated into {response_language}. The reference should remain in English." if language != "en" else ""
        pool = _VERSE_POOL.setdefault(language, list(_VERSE_FALLBACKS))
        existing_refs = {v.get("reference") for v in pool}
        for _ in range(5):
            if len(pool) >= _VERSE_POOL_MAX:
                break
            theme = random.choice(_VERSE_THEMES)
            book = random.choice(_VERSE_BOOK_HINTS)
            system_prompt = f"""You are a spiritual guide for a prayer app.
Provide an inspiring Bible verse about {theme}. Try to pick a verse from {book} if possible, but any book of the Bible is fine.
Pick a lesser-known or surprising verse rather than the most common ones.{lang_instruction}

Respond ONLY in this exact JSON format (no other text):
{{
    "verse": "The actual Bible verse text",
    "reference": "Book Chapter:Verse",
    "theme": "{theme}"
}}"""
            resp, err = await generate_llm_response(f"Provide a Bible verse about {theme}.", system_prompt)
            if resp:
                parsed = parse_llm_json(resp)
                ref = parsed.get("reference") if parsed else None
                if parsed and parsed.get("verse") and ref and ref not in existing_refs:
                    pool.append({"verse": parsed.get("verse"), "reference": ref, "theme": parsed.get("theme", theme)})
                    existing_refs.add(ref)
    except Exception as e:
        logger.warning(f"Verse pool refill failed for {language}: {e}")
    finally:
        _VERSE_REFILLING.discard(language)

async def _enrich_prayed_notification(notif_id: str, prayer_content: str, prayer_user_id: str, default_comfort: str):
    """Background: personalise the 'prayer prayed' notification via the LLM, then push.

    Runs after the partner's request has already returned, so the partner never waits
    on the 6-9s LLM call. The in-app notification already exists with a warm default.
    """
    comfort_message = default_comfort
    try:
        comfort_system = """You are a gentle, compassionate spiritual companion. A prayer partner has just finished praying for the user's prayer request. Write a short, warm notification message (2-3 sentences) that:
1. Acknowledges that someone has prayed for their specific need
2. Offers biblical encouragement related to their prayer
3. Assures them that the prayer partner will continue to uphold them in prayer

Be warm, personal and hopeful. Do NOT include any JSON formatting — just the plain message text."""
        llm_result, llm_err = await generate_llm_response(f"Prayer request: {prayer_content[:300]}", comfort_system, prayer_user_id)
        if llm_result and not llm_err:
            comfort_message = llm_result.strip().strip('"').strip("'")
            await repos.notifications.set_message(notif_id, comfort_message)
    except Exception as e:
        logger.warning(f"LLM comfort enrichment failed: {e}")
    try:
        prayer_user = await repos.users.get(prayer_user_id)
        if prayer_user and prayer_user.get("fcm_token"):
            await send_fcm_push(
                [prayer_user["fcm_token"]],
                "Your Prayer Has Been Prayed!",
                comfort_message,
                {"screen": "notifications"},
            )
    except Exception as e:
        logger.warning(f"Push for prayed notification failed: {e}")

@api_router.get("/verse/generate", response_model=BibleVerseResponse)
async def generate_bible_verse(request: Request, language: str = "en"):
    """Return a Bible verse instantly from the in-memory pool (the LLM enriches it in the background)."""
    import random

    client_ip = get_client_ip(request)
    if not check_rate_limit("__global_llm__", GLOBAL_LLM_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="The service is busy right now. Please try again in a moment.")
    if not check_rate_limit(f"verse:{client_ip}", 30):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    pool = _VERSE_POOL.get(language)
    if not pool:
        # Seed instantly with curated fallbacks, then enrich in the background.
        _VERSE_POOL[language] = list(_VERSE_FALLBACKS)
        pool = _VERSE_POOL[language]
        asyncio.create_task(_refill_verse_pool(language))
    elif len(pool) < _VERSE_POOL_MIN:
        asyncio.create_task(_refill_verse_pool(language))

    selected = random.choice(pool)
    return BibleVerseResponse(
        verse=selected["verse"],
        reference=selected.get("reference", "Unknown"),
        theme=selected.get("theme", "prayer"),
    )

# ==================== HEALTH & ROOT ====================

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "tefilah-api", "timestamp": datetime.now(timezone.utc).isoformat()}

@api_router.get("/")
async def root():
    # VULN-08/09 (TASK-5/6): do not fingerprint the stack — no version banner
    # and no LLM provider/model name (that's a cost-attack reconnaissance leak).
    return {
        "message": "Tefillah - Sacred Prayer Platform",
        "status": "active",
    }

# ==================== USER AUTH ====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register_user(user_data: UserCreate, request: Request, background_tasks: BackgroundTasks):
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    email_lower = user_data.email.lower()

    # Per-email limit: throttle repeated signup attempts with the same email
    # (prevents bots iterating passwords, and email-verification spam).
    if not check_email_action_limit(email_lower, "register"):
        logger.warning(f"🚫 Registration email-limit hit for {email_lower} from {client_ip}")
        raise HTTPException(status_code=429, detail="Too many registration attempts for this email. Please try again later.")

    existing = await repos.users.get_by_email(email_lower)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    verification_code = generate_verification_code()
    
    user_doc = {
        "_id": user_id,
        "name": user_data.name,
        "email": user_data.email.lower(),
        "phone": user_data.phone,
        "address": user_data.address,
        "location_city": user_data.location_city,
        "location_country": user_data.location_country,
        "password_hash": await asyncio.to_thread(hash_password, user_data.password),
        "is_verified": False,
        "is_admin": False,
        "status": "active",
        "verification_code": verification_code,
        "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
    }
    
    await repos.users.insert(user_doc)
    
    # Send verification email
    email_body = f"""
    <h2>Welcome to Tefillah!</h2>
    <p>Your verification code is: <strong>{verification_code}</strong></p>
    <p>This code expires in 24 hours.</p>
    """
    background_tasks.add_task(send_email, user_data.email, "Verify Your Tefillah Account", email_body)
    logger.info(f"Verification email sent to {user_data.email}")
    
    await log_activity("user_registered", "user", user_id, user_data.name, ip_address=client_ip)
    
    token = create_token(user_id, user_data.email.lower(), "user")
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            name=user_data.name,
            email=user_data.email.lower(),
            phone=user_data.phone,
            address=user_data.address,
            location_city=user_data.location_city,
            location_country=user_data.location_country,
            is_verified=False,
            is_admin=False,
            created_at=user_doc["created_at"],
        ),
        user_type="user"
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login_user(credentials: UserLogin, request: Request):
    client_ip = get_client_ip(request)
    email_lower = credentials.email.lower()
    identity_key = f"user:{email_lower}"

    # Layer 1 — IP rate limit (existing)
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts from your IP. Please try again later.")

    # Layer 2 — per-email lockout
    locked, remaining = check_login_lockout(identity_key)
    if locked:
        minutes = max(1, remaining // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to repeated failed attempts. Try again in {minutes} minute(s)."
        )

    # Layer 3 — progressive delay on repeat failures (slows credential-stuffing bots)
    delay = progressive_login_delay(identity_key)
    if delay > 0:
        await asyncio.sleep(delay)

    user = await repos.users.get_by_email(email_lower)
    if not user or not await asyncio.to_thread(verify_password, credentials.password, user.get("password_hash", "")):
        record_failed_login(identity_key)
        logger.warning(f"❌ Failed user login for {email_lower} from {client_ip}")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Clear failed-attempt history on success
    reset_failed_logins(identity_key)

    if user.get("status") in ("disabled", "suspended"):
        raise HTTPException(status_code=403, detail="Account is disabled or suspended")

    # Update last login
    await repos.users.update(user["_id"], {"last_login": datetime.now(timezone.utc)})
    
    await log_activity("user_login", "user", user["_id"], user["name"], ip_address=client_ip)
    
    token = create_token(user["_id"], user["email"], "user", user.get("is_admin", False))
    
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["_id"],
            name=user["name"],
            email=user["email"],
            phone=user.get("phone"),
            address=user.get("address"),
            location_city=user.get("location_city"),
            location_country=user.get("location_country"),
            is_verified=user.get("is_verified", False),
            is_admin=user.get("is_admin", False),
            profile_photo_url=user.get("profile_photo_url"),
            created_at=user["created_at"],
            last_login=datetime.now(timezone.utc),
        ),
        user_type="admin" if user.get("is_admin") else "user"
    )

@api_router.post("/auth/verify-email")
async def verify_email(data: VerificationRequest, request: Request):
    # Throttle by IP so the 6-digit code can't be brute-forced at speed.
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"verify:{client_ip}", 10):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    # Check both users and partners collections
    user = await repos.users.get_by_email(data.email.lower())
    collection = repos.users

    if not user:
        user = await repos.partners.get_by_email(data.email.lower())
        collection = repos.partners

    # Uniform response for unknown account vs wrong code (no enumeration).
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or verification code")

    if user.get("is_verified"):
        return {"message": "Email already verified"}

    # Per-account attempt cap: too many wrong codes invalidates the code (forces a resend).
    if user.get("verification_attempts", 0) >= 5:
        await collection.update(user["_id"], unset_fields={"verification_code": "", "verification_expires": ""})
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")

    if user.get("verification_code") != data.code:
        await collection.update(user["_id"], inc_fields={"verification_attempts": 1})
        raise HTTPException(status_code=400, detail="Invalid email or verification code")

    if user.get("verification_expires") and user["verification_expires"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired")

    await collection.update(
        user["_id"],
        set_fields={"is_verified": True},
        unset_fields={"verification_code": "", "verification_expires": "", "verification_attempts": ""},
    )

    return {"message": "Email verified successfully"}

class ResendVerificationBody(BaseModel):
    email: Optional[EmailStr] = None

@api_router.post("/auth/resend-verification")
async def resend_verification(request: Request, background_tasks: BackgroundTasks, body: ResendVerificationBody = None, current_user: dict = Depends(get_current_user_optional)):
    email_from_body = body.email if body else None
    target_email = email_from_body or (current_user["email"] if current_user else None)
    if not target_email:
        raise HTTPException(status_code=400, detail="Email required")
    
    # IP throttle to prevent code-spamming / email bombing.
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"resend-verify:{client_ip}", 5):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    # Check both users and partners collections
    user = await repos.users.get_by_email(target_email.lower())
    collection = repos.users

    if not user:
        user = await repos.partners.get_by_email(target_email.lower())
        collection = repos.partners

    # Non-committal response so resend can't be used to enumerate accounts.
    if not user:
        return {"message": "If an account exists, a verification code has been sent."}

    if user.get("is_verified"):
        return {"message": "Email already verified"}

    new_code = generate_verification_code()
    await collection.update(user["_id"], {
        "verification_code": new_code,
        "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
        "verification_attempts": 0,
    })
    
    email_body = f"""
    <h2>Tefillah Verification Code</h2>
    <p>Your new verification code is: <strong>{new_code}</strong></p>
    <p>This code expires in 24 hours.</p>
    """
    background_tasks.add_task(send_email, target_email, "Your Tefillah Verification Code", email_body)
    logger.info(f"New verification code sent to {target_email}")
    
    return {"message": "Verification code sent"}

# ==================== SWITCH ACCOUNT (user <-> partner) ====================

async def _counterpart_account(current_user: dict):
    """Return (target_type, counterpart_doc) for the signed-in person's other account, or (None, None)."""
    current_type = current_user.get("_user_type", "user")
    email = (current_user.get("email") or "").lower()
    if current_type not in ("user", "partner") or not email:
        return None, None
    if current_type == "user":
        return "partner", await repos.partners.get_by_email(email)
    return "user", await repos.users.get_by_email(email)

def _switchable(current_user: dict, target_type: str, counterpart: dict) -> bool:
    """Both accounts must exist + be verified, and the TARGET must be usable — i.e. it
    must satisfy the same status checks its own auth dependency enforces. Otherwise we'd
    hand out a token for an account that get_current_partner / get_current_user then
    rejects with 403, leaving the switched-into dashboard dead on every request."""
    if not counterpart or not current_user.get("is_verified") or not counterpart.get("is_verified"):
        return False
    if target_type == "partner":
        # Mirror get_current_partner: a disabled, deactivated, or not-yet-approved
        # partner account cannot be switched into.
        if counterpart.get("status") in ("disabled", "pending_approval") or not counterpart.get("is_active", True):
            return False
    elif target_type == "user":
        # Mirror get_current_user: a suspended/disabled user cannot be switched into.
        if counterpart.get("status") in ("disabled", "suspended"):
            return False
    return True

@api_router.get("/auth/switch-availability")
async def switch_availability(current_user: dict = Depends(get_current_user)):
    """Whether the signed-in person has a verified counterpart account to switch to."""
    target, counterpart = await _counterpart_account(current_user)
    can = _switchable(current_user, target, counterpart) if target else False
    return {"can_switch": can, "target_type": target if can else None}

@api_router.post("/auth/switch-account")
async def switch_account(current_user: dict = Depends(get_current_user)):
    """Issue a token for the counterpart account (user<->partner). Both must be verified."""
    target, counterpart = await _counterpart_account(current_user)
    if not target or not counterpart:
        raise HTTPException(status_code=404, detail="No matching account to switch to.")
    if not _switchable(current_user, target, counterpart):
        raise HTTPException(status_code=403, detail="Both accounts must be verified to switch.")
    token = create_token(counterpart["_id"], counterpart.get("email"), target, counterpart.get("is_admin", False))
    account = {
        k: v for k, v in counterpart.items()
        if k not in ("password_hash", "verification_code", "verification_expires",
                     "password_reset_code", "password_reset_expires", "fcm_token",
                     "pending_email", "pending_email_code", "pending_email_expires",
                     "password_reset_attempts")
    }
    account["id"] = account.pop("_id", None)
    return {"access_token": token, "token_type": "bearer", "user_type": target, "account": account}

# ==================== FORGOT / RESET PASSWORD ====================

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, request: Request, background_tasks: BackgroundTasks):
    """Send a 6-digit password reset code to the user's email."""
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"forgot:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    email = data.email.lower()

    # Per-email limit: prevent email-bomb attacks (spamming someone's inbox with reset codes).
    # Silently accept the request but don't send the email if limit exceeded (same response as non-existent account).
    if not check_email_action_limit(email, "forgot_password"):
        logger.warning(f"🚫 Password-reset email-limit hit for {email} from {client_ip}")
        return {"message": "If an account with this email exists, a reset code has been sent."}

    # Find an account that actually has a password to reset. The same email can exist
    # across users/partners/admins (e.g. a Google-login user PLUS a password-based
    # partner/admin), so skip social-login-only accounts and pick the first one that
    # has a password — otherwise a passwordless Google account shadows a resettable one.
    user = None
    collection = None
    for coll in (repos.users, repos.partners, repos.admins):
        candidate = await coll.get_by_email(email)
        if not candidate:
            continue
        social_only = (
            candidate.get("auth_provider")
            and candidate.get("auth_provider") not in ("email", "unknown")
            and not candidate.get("password_hash")
        )
        if social_only:
            continue
        user = candidate
        collection = coll
        break

    # Uniform response — don't reveal whether a resettable account exists.
    if not user:
        return {"message": "If an account with this email exists, a reset code has been sent."}

    reset_code = generate_verification_code()
    reset_expires = datetime.now(timezone.utc) + timedelta(minutes=30)

    await collection.update(user["_id"], {
        "password_reset_code": reset_code,
        "password_reset_expires": reset_expires,
        "password_reset_attempts": 0,
    })

    email_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #d4af37; text-align: center;">Tefillah</h2>
        <h3 style="text-align: center;">Password Reset Request</h3>
        <p>You requested a password reset. Use the code below to reset your password:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">{reset_code}</span>
        </div>
        <p style="color: #666; font-size: 14px;">This code expires in <strong>30 minutes</strong>.</p>
        <p style="color: #666; font-size: 14px;">If you did not request this, please ignore this email.</p>
    </div>
    """
    background_tasks.add_task(send_email, email, "Tefillah - Password Reset Code", email_body)
    logger.info(f"Password reset code sent to {email}")

    return {"message": "If an account with this email exists, a reset code has been sent."}


@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest, request: Request):
    """Verify the reset code and set a new password."""
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"reset:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    email = data.email.lower()
    submitted = (data.code or "").strip()

    # The same email can exist across users/partners/admins, and forgot-password sets the
    # reset code on the password-bearing account. Find the account whose stored code matches
    # the submitted one — comparing with hmac.compare_digest so the match is constant-time
    # and can't be probed by timing.
    user = None
    collection = None
    matched_type = None
    for coll, ctype in ((repos.users, "user"), (repos.partners, "partner"), (repos.admins, "admin")):
        candidate = await coll.get_by_email(email)
        if not candidate:
            continue
        stored = candidate.get("password_reset_code")
        if stored and submitted and hmac.compare_digest(str(stored), submitted):
            user = candidate
            collection = coll
            matched_type = ctype
            break

    if not user:
        # Brute-force defense: count this wrong guess against every account on the email
        # that currently holds a live reset code, and burn the code once too many wrong
        # guesses accumulate — otherwise the 6-digit code is guessable within 30 minutes.
        for coll in (repos.users, repos.partners, repos.admins):
            cand = await coll.get_by_email_with_reset_code(email)
            if not cand:
                continue
            attempts = int(cand.get("password_reset_attempts", 0)) + 1
            if attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
                await coll.update(cand["_id"], unset_fields={"password_reset_code": "", "password_reset_expires": "", "password_reset_attempts": ""})
                logger.warning(f"🚫 Reset code burned after {attempts} wrong attempts for {email}")
            else:
                await coll.update(cand["_id"], {"password_reset_attempts": attempts})
        raise HTTPException(status_code=400, detail="Invalid reset code")

    expires = user.get("password_reset_expires")

    if expires and expires < datetime.now(timezone.utc):
        # Clean up expired code
        await collection.update(user["_id"], unset_fields={"password_reset_code": "", "password_reset_expires": "", "password_reset_attempts": ""})
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new one.")

    # Set the new password and clear the reset code.
    new_hash = hash_password(data.new_password)
    _clear = {"password_reset_code": "", "password_reset_expires": "", "password_reset_attempts": ""}
    if matched_type == "admin":
        # An admin reset only ever touches the admin credential — never cascades elsewhere.
        await repos.admins.update(user["_id"], {"password_hash": new_hash}, unset_fields=_clear)
    else:
        # Apply to the person's non-privileged (user + partner) accounts on this email so
        # all their normal logins stay in sync — and a previously social-login-only (Google)
        # account gains a usable password. Admin credentials are NEVER changed by a
        # user/partner reset: that would let a user-account reset seize admin access.
        for c in (repos.users, repos.partners):
            await c.update_by_email(email, set_fields={"password_hash": new_hash}, unset_fields=_clear)

    logger.info(f"Password reset successful for {email}")
    return {"message": "Password has been reset successfully. You can now sign in with your new password."}


@api_router.put("/auth/change-password")
async def change_password(data: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    """Change password for the currently logged-in user (any role)."""
    user_type = current_user.get("_user_type", "user")

    # Determine collection
    if user_type == "partner":
        collection = repos.partners
    elif user_type == "admin":
        collection = repos.admins
    else:
        collection = repos.users

    # Verify current password
    if not current_user.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="Your account uses social sign-in. Please set a password using the forgot password flow."
        )

    if not verify_password(data.current_password, current_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    new_hash = hash_password(data.new_password)
    await collection.update(current_user["_id"], {"password_hash": new_hash})

    logger.info(f"Password changed for user {current_user['email']}")
    return {"message": "Password changed successfully"}


@api_router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    user_type = current_user.get("_user_type", "user")
    
    if user_type == "partner":
        return PartnerResponse(
            id=current_user["_id"],
            name=current_user["name"],
            email=current_user["email"],
            phone=current_user.get("phone"),
            location_city=current_user.get("location_city", ""),
            location_country=current_user.get("location_country", ""),
            organization=current_user.get("organization"),
            partner_type=current_user.get("partner_type", "prayer_warrior"),
            cell_id=current_user.get("cell_id"),
            cell_name=current_user.get("cell_name"),
            is_verified=current_user.get("is_verified", False),
            is_active=current_user.get("is_active", True),
            prayers_handled=current_user.get("prayers_handled", 0),
            total_prayer_time_minutes=current_user.get("total_prayer_time_minutes", 0),
            response_rate=current_user.get("response_rate", 0.0),
            profile_photo_url=current_user.get("profile_photo_url"),
            created_at=current_user["created_at"],
            last_active=current_user.get("last_active"),
        ).model_dump() | {"user_type": "partner"}

    if user_type == "admin":
        return {
            "id": current_user["_id"],
            "name": current_user["name"],
            "email": current_user["email"],
            "user_type": "admin",
            "is_super_admin": current_user.get("is_super_admin", False),
            "is_admin": True,
            "is_verified": True,
            "created_at": current_user["created_at"].isoformat() if isinstance(current_user["created_at"], datetime) else current_user["created_at"],
        }

    return UserResponse(
        id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        phone=current_user.get("phone"),
        address=current_user.get("address"),
        location_city=current_user.get("location_city"),
        location_country=current_user.get("location_country"),
        is_verified=current_user.get("is_verified", False),
        is_admin=current_user.get("is_admin", False),
        profile_photo_url=current_user.get("profile_photo_url"),
        pending_email=current_user.get("pending_email"),
        created_at=current_user["created_at"],
        last_login=current_user.get("last_login"),
        status=current_user.get("status", "active"),
    ).model_dump() | {"user_type": "user"}

# ==================== SOCIAL AUTH (Firebase) ====================

class SocialAuthRequest(BaseModel):
    firebase_token: str
    is_agent: bool = False
    phone: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    # Sign in with Apple returns the user's name ONCE, to the client, on the
    # first authorization only -- it is never in the identity token. The client
    # forwards it here so the account is not created as "abc123xyz" (the prefix
    # of a private-relay address). Untrusted display text: length-capped, and
    # used ONLY when the verified token carries no name of its own.
    full_name: Optional[str] = Field(None, max_length=100)

class SocialAuthCompleteRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=6, max_length=20)
    address: Optional[str] = Field(None, max_length=300)
    is_agent: bool = False
    location_city: str = Field(..., min_length=2, max_length=100)
    location_country: str = Field(..., min_length=2, max_length=100)

# Firebase Configuration
FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', 'tefillah-2283c')

# ---------------------- Sign in with Apple ----------------------
# Apple's identity token is a plain RS256 JWT signed by Apple, NOT a Firebase
# token, so neither of the two methods below can validate it. We verify it
# directly against Apple's published keys instead of routing it through
# Firebase: that avoids bootstrapping Firebase Auth on native (it is currently
# web-only) and keeps every verifier in one auditable place.
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"

# Allowed audiences. Native iOS tokens carry the BUNDLE ID; web tokens carry the
# Service ID. Both are configured per-environment; there is no default, because
# accepting a token minted for someone else's app would be an auth bypass.
APPLE_BUNDLE_ID = os.environ.get("APPLE_BUNDLE_ID", "")
APPLE_SERVICE_ID = os.environ.get("APPLE_SERVICE_ID", "")

# Apple rotates its signing keys, so the JWKS is cached with a TTL and refetched
# immediately when a token presents an unknown `kid` (rotation mid-cache).
_apple_jwks: dict = {"keys": [], "fetched_at": 0.0}
APPLE_JWKS_TTL_SECONDS = 3600


async def _get_apple_keys(force_refresh: bool = False) -> list:
    now = datetime.now(timezone.utc).timestamp()
    fresh = (now - _apple_jwks["fetched_at"]) < APPLE_JWKS_TTL_SECONDS
    if _apple_jwks["keys"] and fresh and not force_refresh:
        return _apple_jwks["keys"]
    async with httpx.AsyncClient(timeout=10.0) as http_client:
        resp = await http_client.get(APPLE_JWKS_URL)
        resp.raise_for_status()
        _apple_jwks["keys"] = resp.json().get("keys", [])
        _apple_jwks["fetched_at"] = now
    return _apple_jwks["keys"]


async def verify_apple_token(token: str) -> Optional[dict]:
    """Fully verify an Apple identity token; None if it is not trustworthy.

    Checks the RS256 signature against Apple's JWKS, plus issuer, audience and
    expiry. Returns the same shape as the Firebase/Google verifiers so
    /auth/social does not care which provider was used.

    NOTE: Apple never puts the user's NAME in this token — it is returned once,
    by the client, on the FIRST authorization only. The caller supplies it via
    SocialAuthRequest.full_name; here `name` is always "".
    """
    allowed_aud = {a for a in (APPLE_BUNDLE_ID, APPLE_SERVICE_ID) if a}
    if not allowed_aud:
        logger.error("No APPLE_BUNDLE_ID/APPLE_SERVICE_ID configured — refusing Apple token (fail closed)")
        return None

    try:
        header = jwt.get_unverified_header(token)
        kid, alg = header.get("kid"), header.get("alg")
        if alg != "RS256":                       # Apple only ever signs RS256
            logger.warning(f"Apple token unexpected alg={alg!r}")
            return None

        keys = await _get_apple_keys()
        jwk = next((k for k in keys if k.get("kid") == kid), None)
        if jwk is None:                          # key rotated since we cached
            keys = await _get_apple_keys(force_refresh=True)
            jwk = next((k for k in keys if k.get("kid") == kid), None)
        if jwk is None:
            logger.warning(f"Apple token kid={kid!r} not present in Apple's JWKS")
            return None

        from jwt.algorithms import RSAAlgorithm   # needs `cryptography`
        public_key = RSAAlgorithm.from_jwk(json.dumps(jwk))

        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=list(allowed_aud),
            issuer=APPLE_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Apple token rejected: {type(e).__name__}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Apple token verification error: {type(e).__name__}: {e}")
        return None

    email = (claims.get("email") or "").lower()
    if not email:
        # Every Sign in with Apple identity token carries an email (real, or an
        # @privaterelay.appleid.com alias). Without one we cannot key an account,
        # so refuse rather than create a broken row.
        logger.warning("Apple token carried no email — rejecting")
        return None

    verified = claims.get("email_verified")
    return {
        "uid": claims["sub"],                    # stable per (user, team)
        "email": email,
        "name": "",                              # see docstring
        "email_verified": verified is True or verified == "true",
        "provider": "apple.com",                 # matches Firebase's providerId
        "is_private_email": claims.get("is_private_email") in (True, "true"),
    }


async def verify_firebase_token(token: str) -> Optional[dict]:
    """Verify Firebase ID token using Google's public token verification endpoint.
    Falls back to manual JWT decode if the online verification is unavailable."""
    import base64

    # Method 0: Sign in with Apple. The issuer is read WITHOUT verification, and
    # is used ONLY to route to the right validator -- verify_apple_token then
    # checks signature/aud/iss/exp properly, so an attacker cannot gain anything
    # by claiming to be Apple. Routing first also avoids two pointless network
    # round-trips to Google for a token neither Google method could ever accept.
    try:
        if jwt.decode(token, options={"verify_signature": False}).get("iss") == APPLE_ISSUER:
            return await verify_apple_token(token)
    except Exception:
        pass    # not a decodable JWT -- fall through to the existing methods

    # Method 1: Verify via Google's secure token endpoint (recommended)
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            # accounts:lookup does the real project-scoped verification. (A prior
            # getAccountInfo GET here was dead — its response was overwritten immediately.)
            response = await http_client.post(
                f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={os.environ.get('FIREBASE_WEB_API_KEY', '')}",
                json={"idToken": token},
            )
            if response.status_code == 200:
                data = response.json()
                users = data.get("users", [])
                if users:
                    user = users[0]
                    return {
                        "uid": user.get("localId"),
                        "email": user.get("email", ""),
                        "name": user.get("displayName", ""),
                        "email_verified": user.get("emailVerified", False),
                        "provider": user.get("providerUserInfo", [{}])[0].get("providerId", "unknown") if user.get("providerUserInfo") else "unknown",
                    }
            logger.warning(f"Firebase token lookup returned {response.status_code}: {response.text}")
    except Exception as e:
        logger.warning(f"Firebase online verification failed, trying Google tokeninfo: {e}")

    # Method 2: Verify Google ID token via Google's tokeninfo endpoint
    # (handles tokens from native @react-native-google-signin SDK)
    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token},
            )
            if response.status_code == 200:
                # Google's tokeninfo endpoint already validated the signature + expiry.
                # We MUST still enforce that the token was minted for one of OUR OAuth
                # clients (web / android / ios). Fail closed if none are configured —
                # never accept an un-audited token.
                data = response.json()
                allowed_aud = {a for a in (
                    os.environ.get("GOOGLE_WEB_CLIENT_ID", ""),
                    os.environ.get("GOOGLE_ANDROID_CLIENT_ID", ""),
                    os.environ.get("GOOGLE_IOS_CLIENT_ID", ""),
                ) if a}
                if not allowed_aud:
                    logger.error("No GOOGLE_*_CLIENT_ID configured — refusing Google token (fail closed)")
                    return None
                if data.get("aud") not in allowed_aud:
                    logger.warning(f"Google token audience mismatch: got={data.get('aud')}")
                    return None
                return {
                    "uid": data.get("sub"),
                    "email": data.get("email", ""),
                    "name": data.get("name", ""),
                    "email_verified": data.get("email_verified") == "true" or data.get("email_verified") is True,
                    "provider": "google.com",
                }
    except Exception as e:
        logger.warning(f"Google tokeninfo verification failed: {e}")

    # SECURITY: there is intentionally NO offline/unsigned fallback. If neither
    # Method 1 (Firebase token lookup) nor Method 2 (Google tokeninfo, audience-
    # enforced) verified the token against Google's servers, we reject it. The
    # previous base64-decode fallback accepted any forged token and is removed.
    logger.warning("Social token could not be verified by any trusted method — rejecting")
    return None

@api_router.post("/auth/social", response_model=TokenResponse)
async def social_auth(auth_data: SocialAuthRequest, request: Request, background_tasks: BackgroundTasks):
    """Authenticate via Firebase (Google/Apple sign-in)"""
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    # Verify Firebase token
    firebase_user = await verify_firebase_token(auth_data.firebase_token)
    if not firebase_user:
        raise HTTPException(status_code=401, detail="Invalid authentication token")

    email = firebase_user["email"].lower()
    # Provider-verified name wins; then the client-supplied one (Apple's
    # first-authorization name); then the email prefix as a last resort.
    name = (firebase_user.get("name")
            or (auth_data.full_name or "").strip()
            or email.split("@")[0])

    if auth_data.is_agent:
        # Check if partner already exists
        existing_partner = await repos.partners.get_by_email(email)
        if existing_partner:
            # Apply the same status gate as login_partner before issuing a token.
            if existing_partner.get("status") in ("disabled", "pending_approval") or not existing_partner.get("is_active", True):
                raise HTTPException(status_code=403, detail="Account is suspended or pending approval")
            # Login existing partner
            token = create_token(existing_partner["_id"], email, "partner")
            await repos.partners.update(existing_partner["_id"], {"last_active": datetime.now(timezone.utc)})
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=existing_partner["_id"],
                    name=existing_partner["name"],
                    email=email,
                    phone=existing_partner.get("phone"),
                    location_city=existing_partner.get("location_city"),
                    location_country=existing_partner.get("location_country"),
                    is_verified=existing_partner.get("is_verified", False),
                    created_at=existing_partner["created_at"],
                ),
                user_type="partner"
            )

        # Create new partner
        partner_id = str(uuid.uuid4())
        verification_code = generate_verification_code()
        partner_doc = {
            "_id": partner_id,
            "name": name,
            "email": email,
            "phone": auth_data.phone,
            "password_hash": "",
            "location_city": auth_data.location_city or "",
            "location_country": auth_data.location_country or "",
            "partner_type": "prayer_warrior",
            "is_verified": False,
            # SECURITY: is_agent is client-supplied — new social partners must start
            # pending_approval like register_partner, or ?agent=1 self-promotes to an
            # active partner with prayer-data access (get_current_partner gates on this).
            "is_active": False,
            "status": "pending_approval",
            "auth_provider": firebase_user.get("provider", "social"),
            "firebase_uid": firebase_user["uid"],
            "verification_code": verification_code,
            "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
            "prayers_handled": 0,
            "total_prayer_time_minutes": 0,
            "response_rate": 0.0,
            "capacity_limit": 5,
            "active_assignments": 0,
            "created_at": datetime.now(timezone.utc),
            "last_active": datetime.now(timezone.utc),
        }
        await repos.partners.insert(partner_doc)

        email_body = f"""
        <h2>Welcome to Tefillah Prayer Partners!</h2>
        <p>Your verification code is: <strong>{verification_code}</strong></p>
        <p>This code expires in 24 hours.</p>
        """
        background_tasks.add_task(send_email, email, "Verify Your Tefillah Partner Account", email_body)

        token = create_token(partner_id, email, "partner")
        return TokenResponse(
            access_token=token,
            user=UserResponse(
                id=partner_id,
                name=name,
                email=email,
                is_verified=False,
                created_at=partner_doc["created_at"],
            ),
            user_type="partner"
        )
    else:
        # Regular user flow
        existing_user = await repos.users.get_by_email(email)
        if existing_user:
            if existing_user.get("status") in ("disabled", "suspended"):
                raise HTTPException(status_code=403, detail="Account suspended by administrator")
            # Login existing user
            token = create_token(existing_user["_id"], email, "user")
            await repos.users.update(existing_user["_id"], {"last_login": datetime.now(timezone.utc)})
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=existing_user["_id"],
                    name=existing_user["name"],
                    email=email,
                    phone=existing_user.get("phone"),
                    address=existing_user.get("address"),
                    location_city=existing_user.get("location_city"),
                    location_country=existing_user.get("location_country"),
                    is_verified=existing_user.get("is_verified", False),
                    created_at=existing_user["created_at"],
                    last_login=datetime.now(timezone.utc),
                ),
                user_type="user"
            )

        # Create new user
        user_id = str(uuid.uuid4())
        verification_code = generate_verification_code()
        user_doc = {
            "_id": user_id,
            "name": name,
            "email": email,
            "phone": auth_data.phone,
            "password_hash": "",
            "is_verified": False,
            "is_admin": False,
            "status": "active",
            "auth_provider": firebase_user.get("provider", "social"),
            "firebase_uid": firebase_user["uid"],
            "verification_code": verification_code,
            "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
            "created_at": datetime.now(timezone.utc),
            "last_login": datetime.now(timezone.utc),
        }
        await repos.users.insert(user_doc)

        email_body = f"""
        <h2>Welcome to Tefillah!</h2>
        <p>Your verification code is: <strong>{verification_code}</strong></p>
        <p>This code expires in 24 hours.</p>
        """
        background_tasks.add_task(send_email, email, "Verify Your Tefillah Account", email_body)

        token = create_token(user_id, email, "user")
        return TokenResponse(
            access_token=token,
            user=UserResponse(
                id=user_id,
                name=name,
                email=email,
                is_verified=False,
                created_at=user_doc["created_at"],
                last_login=user_doc["last_login"],
            ),
            user_type="user"
        )

@api_router.post("/auth/social/complete", response_model=TokenResponse)
async def complete_social_auth(
    data: SocialAuthCompleteRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Complete profile after social auth — phone + location are MANDATORY for all social users.

    SECURITY: this endpoint REQUIRES the session token issued by /auth/social, and
    can only complete the profile of the authenticated account. Without this gate the
    endpoint trusted a client-supplied email and minted a token for any account.

    Pydantic validation on SocialAuthCompleteRequest already enforces phone,
    location_city, and location_country are non-empty strings with min length.
    """
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    email = data.email.lower()
    if email != (current_user.get("email") or "").strip().lower():
        raise HTTPException(status_code=403, detail="You can only complete your own profile.")
    phone = data.phone.strip()
    location_city = data.location_city.strip()
    location_country = data.location_country.strip()

    if data.is_agent:
        existing = await repos.partners.get_by_email(email)
        if existing:
            # SECURITY (cross-collection takeover): minting a token for an ALREADY-EXISTING
            # partner requires a partner token. Otherwise a user-token holder who registered
            # with a victim partner's email could adopt the victim's partner account. New-
            # partner CREATION (the else branch) is a legitimate self-signup from a user token
            # — the email is already pinned to the caller above, and new partners land in
            # pending_approval regardless.
            if current_user.get("_user_type") != "partner":
                raise HTTPException(status_code=403, detail="Sign in as a prayer partner to update a partner account.")
            # Update partner with all required info
            update = {
                "name": data.name,
                "phone": phone,
                "location_city": location_city,
                "location_country": location_country,
            }
            await repos.partners.update(existing["_id"], update)
            token = create_token(existing["_id"], email, "partner")
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=existing["_id"],
                    name=data.name,
                    email=email,
                    phone=phone,
                    location_city=location_city,
                    location_country=location_country,
                    is_verified=existing.get("is_verified", False),
                    created_at=existing["created_at"],
                ),
                user_type="partner"
            )
        # Create new partner
        partner_id = str(uuid.uuid4())
        verification_code = generate_verification_code()
        partner_doc = {
            "_id": partner_id, "name": data.name, "email": email,
            "phone": phone, "password_hash": "",
            "location_city": location_city, "location_country": location_country,
            # SECURITY: social partner signup is client-driven (is_agent comes from a
            # URL param), so it MUST land in the same pending_approval gate as
            # register_partner — otherwise ?agent=1 self-promotes to an active partner
            # with prayer-data access. get_current_partner (line ~702) blocks
            # pending_approval / is_active=False.
            "partner_type": "prayer_warrior", "is_verified": False, "is_active": False,
            "status": "pending_approval",
            "auth_provider": "social", "verification_code": verification_code,
            "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
            "prayers_handled": 0, "total_prayer_time_minutes": 0,
            "response_rate": 0.0, "capacity_limit": 5, "active_assignments": 0,
            "created_at": datetime.now(timezone.utc), "last_active": datetime.now(timezone.utc),
        }
        await repos.partners.insert(partner_doc)
        email_body = f"<h2>Welcome to Tefillah!</h2><p>Your verification code: <strong>{verification_code}</strong></p>"
        background_tasks.add_task(send_email, email, "Verify Your Tefillah Partner Account", email_body)
        token = create_token(partner_id, email, "partner")
        return TokenResponse(
            access_token=token,
            user=UserResponse(
                id=partner_id, name=data.name, email=email,
                phone=phone, location_city=location_city, location_country=location_country,
                is_verified=False, created_at=partner_doc["created_at"],
            ),
            user_type="partner"
        )
    else:
        address = (data.address or "").strip() or None
        existing = await repos.users.get_by_email(email)
        if existing:
            # Mirror of the partner guard: adopting an EXISTING user requires a user token,
            # so a partner-token holder can't take over a same-email user account.
            if current_user.get("_user_type") == "partner":
                raise HTTPException(status_code=403, detail="This email already has an account.")
            update = {
                "name": data.name,
                "phone": phone,
                "location_city": location_city,
                "location_country": location_country,
            }
            if address:
                update["address"] = address
            await repos.users.update(existing["_id"], update)
            token = create_token(existing["_id"], email, "user")
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=existing["_id"], name=data.name, email=email,
                    phone=phone,
                    address=address or existing.get("address"),
                    location_city=location_city,
                    location_country=location_country,
                    is_verified=existing.get("is_verified", False),
                    created_at=existing["created_at"],
                ),
                user_type="user"
            )
        # Create new user
        user_id = str(uuid.uuid4())
        verification_code = generate_verification_code()
        user_doc = {
            "_id": user_id, "name": data.name, "email": email,
            "phone": phone, "address": address,
            "location_city": location_city, "location_country": location_country,
            "password_hash": "",
            "is_verified": False, "is_admin": False, "status": "active",
            "auth_provider": "social", "verification_code": verification_code,
            "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
            "created_at": datetime.now(timezone.utc), "last_login": datetime.now(timezone.utc),
        }
        await repos.users.insert(user_doc)
        email_body = f"<h2>Welcome to Tefillah!</h2><p>Your verification code: <strong>{verification_code}</strong></p>"
        background_tasks.add_task(send_email, email, "Verify Your Tefillah Account", email_body)
        token = create_token(user_id, email, "user")
        return TokenResponse(
            access_token=token,
            user=UserResponse(
                id=user_id, name=data.name, email=email,
                phone=phone, address=address,
                location_city=location_city, location_country=location_country,
                is_verified=False,
                created_at=user_doc["created_at"], last_login=user_doc["last_login"],
            ),
            user_type="user"
        )

# ==================== PARTNER AUTH ====================

@api_router.post("/partner/register", response_model=PartnerTokenResponse)
async def register_partner(partner_data: PartnerCreate, request: Request, background_tasks: BackgroundTasks):
    client_ip = get_client_ip(request)
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")
    
    # Only block if the email is already registered AS A PARTNER. A person may
    # be both a regular user AND a prayer partner with the same email — these
    # are separate account types with separate login flows (/auth/login vs
    # /partner/login). Previously this also checked db.users, which meant that
    # deleting a partner who *also* had a user account left their email
    # permanently un-registerable as a partner ("Email already registered").
    existing_partner = await repos.partners.get_by_email(partner_data.email.lower())
    if existing_partner:
        raise HTTPException(status_code=400, detail="This email is already registered as a prayer partner")
    
    partner_id = str(uuid.uuid4())
    verification_code = generate_verification_code()
    
    # Find matching prayer cell
    cell = await repos.prayer_cells.find_for_location(
        partner_data.location_city, partner_data.location_country
    )
    
    partner_doc = {
        "_id": partner_id,
        "name": partner_data.name,
        "email": partner_data.email.lower(),
        "phone": partner_data.phone,
        "password_hash": await asyncio.to_thread(hash_password, partner_data.password),
        "location_city": partner_data.location_city,
        "location_country": partner_data.location_country,
        "organization": partner_data.organization,
        "partner_type": partner_data.partner_type,
        "cell_id": cell["_id"] if cell else None,
        "cell_name": cell["name"] if cell else None,
        "is_verified": False,
        "is_active": False,
        "status": "pending_approval",
        "prayers_handled": 0,
        "prayer_capacity": 10,
        "total_prayer_time_minutes": 0,
        "response_rate": 0.0,
        "verification_code": verification_code,
        "verification_expires": datetime.now(timezone.utc) + timedelta(hours=24),
        "created_at": datetime.now(timezone.utc),
        "last_active": None,
    }
    
    await repos.partners.insert(partner_doc)
    
    # Update cell agent count
    if cell:
        await repos.prayer_cells.adjust_agent_count(cell["_id"], 1)
    
    # Send verification email
    email_body = f"""
    <h2>Welcome to Tefillah Prayer Partners!</h2>
    <p>Thank you for joining as a prayer partner.</p>
    <p>Your verification code is: <strong>{verification_code}</strong></p>
    <p>This code expires in 24 hours.</p>
    """
    background_tasks.add_task(send_email, partner_data.email, "Verify Your Tefillah Partner Account", email_body)
    logger.info(f"Partner verification email sent to {partner_data.email}")
    
    await log_activity("partner_registered", "partner", partner_id, partner_data.name, ip_address=client_ip)
    
    token = create_token(partner_id, partner_data.email.lower(), "partner")
    
    return PartnerTokenResponse(
        access_token=token,
        partner=PartnerResponse(
            id=partner_id,
            name=partner_data.name,
            email=partner_data.email.lower(),
            phone=partner_data.phone,
            location_city=partner_data.location_city,
            location_country=partner_data.location_country,
            organization=partner_data.organization,
            partner_type=partner_data.partner_type,
            cell_id=cell["_id"] if cell else None,
            cell_name=cell["name"] if cell else None,
            is_verified=False,
            is_active=False,
            prayers_handled=0,
            total_prayer_time_minutes=0,
            response_rate=0.0,
            created_at=partner_doc["created_at"],
        ),
        user_type="partner"
    )

@api_router.post("/partner/login", response_model=PartnerTokenResponse)
async def login_partner(credentials: PartnerLogin, request: Request):
    client_ip = get_client_ip(request)
    email_lower = credentials.email.lower()
    identity_key = f"partner:{email_lower}"

    # Layer 1 — IP rate limit
    if not check_rate_limit(f"auth:{client_ip}", AUTH_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")

    # Layer 2 — per-email lockout (credential-stuffing defense, mirrors user/admin login)
    locked, remaining = check_login_lockout(identity_key)
    if locked:
        minutes = max(1, remaining // 60)
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to repeated failed attempts. Try again in {minutes} minute(s)."
        )

    # Layer 3 — progressive delay on repeat failures (slows bots; humans barely notice)
    delay = progressive_login_delay(identity_key)
    if delay > 0:
        await asyncio.sleep(delay)

    partner = await repos.partners.get_by_email(email_lower)
    if not partner or not await asyncio.to_thread(verify_password, credentials.password, partner.get("password_hash", "")):
        record_failed_login(identity_key)
        logger.warning(f"❌ Failed partner login for {email_lower} from {client_ip}")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Success — clear failed-attempt history
    reset_failed_logins(identity_key)

    if partner.get("status") == "disabled" or not partner.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account is disabled")

    if partner.get("status") == "pending_approval":
        raise HTTPException(status_code=403, detail="Your account is pending admin approval. You will be notified once approved.")
    
    # Update last active
    await repos.partners.update(partner["_id"], {"last_active": datetime.now(timezone.utc)})
    
    await log_activity("partner_login", "partner", partner["_id"], partner["name"], ip_address=client_ip)
    
    token = create_token(partner["_id"], partner["email"], "partner")
    
    return PartnerTokenResponse(
        access_token=token,
        partner=PartnerResponse(
            id=partner["_id"],
            name=partner["name"],
            email=partner["email"],
            phone=partner.get("phone"),
            location_city=partner["location_city"],
            location_country=partner["location_country"],
            organization=partner.get("organization"),
            partner_type=partner.get("partner_type", "prayer_warrior"),
            cell_id=partner.get("cell_id"),
            cell_name=partner.get("cell_name"),
            is_verified=partner.get("is_verified", False),
            is_active=partner.get("is_active", True),
            prayers_handled=partner.get("prayers_handled", 0),
            total_prayer_time_minutes=partner.get("total_prayer_time_minutes", 0),
            response_rate=partner.get("response_rate", 0.0),
            created_at=partner["created_at"],
            last_active=datetime.now(timezone.utc),
        ),
        user_type="partner"
    )

# ==================== PARTNER DASHBOARD ====================

@api_router.get("/partner/stats", response_model=PartnerStats)
async def get_partner_stats(partner: dict = Depends(get_current_partner)):
    partner_id = partner["_id"]
    
    # Get prayer statistics
    pr = repos.prayer_requests
    total_received = await pr.count(assigned_partner_id=partner_id)
    completed = await pr.count(assigned_partner_id=partner_id, status="prayed")
    pending = await pr.count(assigned_partner_id=partner_id, status_in=["pending", "assigned"])

    # Dashboard buckets (active = assigned, not yet prayed):
    #  New     → not opened by the partner yet
    #  Assigned→ opened and still within the 24h response window
    #  Overdue → opened, 24h+ elapsed, still not prayed
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)
    prayers_new = await pr.count(assigned_partner_id=partner_id, status="assigned", seen=False)
    prayers_assigned = await pr.count(assigned_partner_id=partner_id, status="assigned",
                                      seen=True, seen_after=day_ago)
    prayers_overdue = await pr.count(assigned_partner_id=partner_id, status="assigned",
                                     seen=True, seen_before=day_ago)

    # Calculate response rate
    response_rate = (completed / total_received * 100) if total_received > 0 else 0
    
    # Get average response time
    avg_response_hours = (await pr.avg_response_ms(partner_id)) / 3600000
    
    # Weekly activity (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    weekly_data = await pr.daily_prayed_for_partner(partner_id, week_ago)
    
    # Monthly trend (last 30 days)
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    monthly_data = await pr.daily_prayed_for_partner(partner_id, month_ago)
    
    return PartnerStats(
        total_prayers_received=total_received,
        prayers_completed=completed,
        prayers_pending=pending,
        prayers_new=prayers_new,
        prayers_assigned=prayers_assigned,
        prayers_overdue=prayers_overdue,
        average_response_time_hours=round(avg_response_hours, 2),
        total_prayer_time_minutes=partner.get("total_prayer_time_minutes", 0),
        response_rate=round(response_rate, 2),
        weekly_activity=[{"date": d["_id"], "count": d["count"]} for d in weekly_data],
        monthly_trend=[{"date": d["_id"], "count": d["count"]} for d in monthly_data],
    )

@api_router.get("/partner/requests", response_model=List[PrayerRequestForPartner])
async def get_partner_requests(
    status: Optional[str] = None,
    bucket: Optional[str] = None,  # new | assigned | pending | prayed | all
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    partner: dict = Depends(get_current_partner)
):
    query: dict = {"assigned_partner_id": partner["_id"]}
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    if bucket == "new":
        query.update({"status": "assigned", "seen_by_partner": {"$ne": True}})
    elif bucket == "assigned":
        query.update({"status": "assigned", "seen_by_partner": True, "seen_at": {"$gte": day_ago}})
    elif bucket == "pending":
        query.update({"status": "assigned", "seen_by_partner": True, "seen_at": {"$lt": day_ago}})
    elif bucket == "prayed":
        query["status"] = "prayed"
    elif status:
        query["status"] = status

    skip = (page - 1) * limit
    rows = await repos.prayer_requests.list_for_partner(
        query,
        fields={"_id": 1, "content": 1, "location_city": 1, "location_country": 1,
                "category": 1, "status": 1, "submitted_at": 1, "assigned_at": 1,
                "seen_by_partner": 1, "seen_at": 1, "user_id": 1},
        skip=skip, limit=limit,
    )

    requests = []
    for req in rows:
        try:
            requests.append(PrayerRequestForPartner(
                id=req["_id"],
                content=req.get("content", ""),
                location_city=req.get("location_city"),
                location_country=req.get("location_country"),
                category=req.get("category"),
                status=req.get("status", "pending"),
                submitted_at=req["submitted_at"],
                assigned_at=req.get("assigned_at"),
                seen_by_partner=bool(req.get("seen_by_partner", False)),
                seen_at=req.get("seen_at"),
                requester_id=req.get("user_id"),
            ))
        except Exception as e:
            logger.warning(f"Skipping malformed partner request row {req.get('_id')}: {e}")

    return requests

@api_router.post("/partner/requests/{prayer_id}/seen")
async def mark_request_seen(prayer_id: str, partner: dict = Depends(get_current_partner)):
    """Mark a 'New' request as opened by the partner — moves it from New to Assigned and
    starts its 24h response window + the 60-min minimum prayer timer."""
    prayer = await repos.prayer_requests.get_for_partner(
        prayer_id, partner["_id"], fields={"seen_by_partner": 1}
    )
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer request not found or not assigned to you")
    if not prayer.get("seen_by_partner"):
        await repos.prayer_requests.update_fields(
            prayer_id, {"seen_by_partner": True, "seen_at": datetime.now(timezone.utc)}
        )
    return {"message": "Marked as seen"}


@api_router.post("/partner/requests/{prayer_id}/report")
async def report_prayer_request(
    prayer_id: str,
    data: ReportContentRequest,
    partner: dict = Depends(get_current_partner),
):
    """A partner reports an objectionable/abusive prayer request. The request is
    flagged for admin review and immediately removed from the partner's queue
    (released from assignment). Required for app-store UGC moderation."""
    # Exclude prayed: mark-prayed leaves assigned_partner_id set, so without this a
    # partner could flag a prayer they already prayed, flipping it to "flagged" while
    # keeping its +1 in prayers_handled — quietly shrinking completed counts / response_rate.
    prayer = await repos.prayer_requests.get_for_partner(
        prayer_id, partner["_id"], exclude_prayed=True
    )
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer request not found or not assigned to you")
    await repos.prayer_requests.update_fields(
        prayer_id,
        set_fields={
            "reported": True,
            "reported_by": partner["_id"],
            "reported_by_name": partner.get("name", ""),
            "reported_reason": (data.reason or "").strip()[:500],
            "reported_at": datetime.now(timezone.utc),
            "status": "flagged",
            "assigned_partner_id": None,
            "assigned_partner_name": None,
            "assigned_cell_id": None,
            "assigned_cell_name": None,
            "assigned_at": None,
            "seen_by_partner": False,
        },
        unset_fields={"seen_at": ""},
    )
    await log_activity(
        "prayer_reported", "partner", partner["_id"], partner.get("name", ""),
        "prayer", prayer_id, {"reason": (data.reason or "").strip()[:500]},
    )
    return {"message": "Thank you. This request has been reported for review and removed from your queue."}


@api_router.post("/partner/block-user")
async def partner_block_user(
    data: BlockUserRequest,
    partner: dict = Depends(get_current_partner),
):
    """A partner blocks a user so they're never assigned that user's requests again.
    Any of that user's requests currently assigned (and not yet prayed) are released
    back to the pool. Required for app-store UGC moderation."""
    blocked = partner.get("blocked_users") or []
    if data.user_id not in blocked:
        # Keep the block list bounded so a partner document can't be inflated indefinitely.
        if len(blocked) >= MAX_BLOCKED_USERS:
            raise HTTPException(
                status_code=400,
                detail="Your block list is full. Please contact support to review it.",
            )
        await repos.partners.update(partner["_id"], add_to_set={"blocked_users": data.user_id})
    await repos.prayer_requests.release_user_from_partner(partner["_id"], data.user_id)
    await log_activity(
        "user_blocked", "partner", partner["_id"], partner.get("name", ""),
        "user", data.user_id, None,
    )
    return {"message": "User blocked. You won't be assigned their requests again."}


@api_router.post("/prayer/{prayer_id}/flag")
async def flag_prayer_ai_content(
    prayer_id: str,
    data: ReportContentRequest,
    current_user: dict = Depends(get_current_user),
):
    """A user flags the AI-generated comfort message / Bible verse on their own prayer
    as inappropriate or wrong. Recorded for review. Required for app-store moderation
    of AI-generated content."""
    prayer = await repos.prayer_requests.get_for_user(prayer_id, current_user["_id"])
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer not found")
    await repos.prayer_requests.update_fields(
        prayer_id,
        {
            "ai_flagged": True,
            "ai_flag_reason": (data.reason or "").strip()[:500],
            "ai_flagged_at": datetime.now(timezone.utc),
        },
    )
    await log_activity(
        "ai_content_flagged", "user", current_user["_id"], current_user.get("name", ""),
        "prayer", prayer_id, {"reason": (data.reason or "").strip()[:500]},
    )
    return {"message": "Thank you. This response has been flagged for review."}


@api_router.post("/partner/requests/{prayer_id}/mark-prayed")
async def mark_prayer_as_prayed(
    prayer_id: str,
    prayer_duration_minutes: int = Query(5, ge=1, le=180),
    partner: dict = Depends(get_current_partner)
):
    prayer = await repos.prayer_requests.get_for_partner(prayer_id, partner["_id"])
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer request not found or not assigned to you")
    
    if prayer["status"] == "prayed":
        raise HTTPException(status_code=400, detail="Prayer already marked as prayed")

    # Enforce a 60-minute minimum from when the partner OPENED the request (falls back to
    # assignment time for legacy requests that predate seen-tracking).
    base_time = prayer.get("seen_at") or prayer.get("assigned_at")
    if base_time:
        try:
            if isinstance(base_time, str):
                base_time = datetime.fromisoformat(base_time.replace("Z", "+00:00"))
            # Coerce naive datetimes to UTC so the subtraction below never raises.
            if base_time.tzinfo is None:
                base_time = base_time.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - base_time).total_seconds()
        except (ValueError, TypeError):
            elapsed = 3600  # unparseable/legacy timestamp — don't block marking as prayed
        if elapsed < 3600:  # 1 hour = 3600 seconds
            remaining_min = int((3600 - elapsed) / 60) + 1
            raise HTTPException(
                status_code=400,
                detail=f"Please spend time in prayer. You can mark this as prayed in {remaining_min} minutes."
            )

    # Atomically transition to 'prayed'. The status guard means a concurrent double-tap or
    # client retry becomes a no-op (modified_count == 0) instead of running the whole body
    # twice — so partner stats, the submitter notification and the FCM push each fire exactly
    # once (no double-counted stats, no duplicate pushes, no doubled LLM cost).
    modified = await repos.prayer_requests.mark_prayed(
        prayer_id, partner["_id"], prayer_duration_minutes
    )
    if modified == 0:
        raise HTTPException(status_code=400, detail="Prayer already marked as prayed")

    # Update partner stats
    await repos.partners.update(
        partner["_id"],
        set_fields={"last_active": datetime.now(timezone.utc)},
        inc_fields={"prayers_handled": 1, "total_prayer_time_minutes": prayer_duration_minutes},
    )
    
    # Update response rate
    total = await repos.prayer_requests.count(assigned_partner_id=partner["_id"])
    completed = await repos.prayer_requests.count(assigned_partner_id=partner["_id"], status="prayed")
    response_rate = (completed / total * 100) if total > 0 else 0
    await repos.partners.update(partner["_id"], {"response_rate": round(response_rate, 2)})
    
    await log_activity("prayer_completed", "partner", partner["_id"], partner["name"], "prayer", prayer_id)

    # Notify the prayer submitter. Insert the in-app notification instantly with a warm
    # default, then personalise it + push in the background so the PARTNER never waits on
    # the 6-9s LLM call when marking a prayer as prayed.
    prayer_user_id = prayer.get("user_id")
    # Only notify if the submitter still exists (avoid orphaned notifications to deleted users).
    if prayer_user_id and await repos.users.exists(prayer_user_id):
        default_comfort = "A prayer partner has prayed over your request and will continue to uphold you in prayer. May God's peace and comfort surround you today."
        notif_id = str(uuid.uuid4())
        notif_doc = {
            "_id": notif_id,
            "title": "Your Prayer Has Been Prayed!",
            "message": default_comfort,
            "type": "prayer_prayed",
            "target_type": "specific",
            "target_ids": [prayer_user_id],
            "prayer_id": prayer_id,
            "read_by": [],
            "created_at": datetime.now(timezone.utc),
        }
        await repos.notifications.insert(notif_doc)
        asyncio.create_task(
            _enrich_prayed_notification(notif_id, prayer.get("content", ""), prayer_user_id, default_comfort)
        )

    return {"message": "Prayer marked as prayed", "prayer_duration_minutes": prayer_duration_minutes}

@api_router.get("/partner/notifications", response_model=List[Notification])
async def get_partner_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    partner: dict = Depends(get_current_partner)
):
    skip = (page - 1) * limit
    rows = await repos.notifications.list_for(
        partner["_id"], "partners", unread_only=unread_only, skip=skip, limit=limit
    )

    notifications = []
    for notif in rows:
        try:
            notifications.append(Notification(
                id=notif["_id"],
                title=notif.get("title", ""),
                message=notif.get("message", ""),
                type=notif.get("type", "info"),
                target_type=notif.get("target_type", "all"),
                is_read=partner["_id"] in notif.get("read_by", []),
                created_at=notif["created_at"],
            ))
        except Exception as e:
            logger.warning(f"Skipping malformed notification row {notif.get('_id')}: {e}")

    return notifications

@api_router.post("/partner/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, partner: dict = Depends(get_current_partner)):
    partner_id = partner["_id"]
    matched = await repos.notifications.mark_read(notification_id, partner_id, "partners")
    if matched == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/partner/profile")
async def update_partner_profile(update_data: UserUpdate, partner: dict = Depends(get_current_partner)):
    update_fields = {}
    if update_data.name:
        update_fields["name"] = sanitize_input(update_data.name)
    if update_data.phone:
        update_fields["phone"] = update_data.phone
    if update_data.address:
        update_fields["address"] = sanitize_input(update_data.address)
    # Allow editing (or clearing) the organisation name.
    if update_data.organization is not None:
        update_fields["organization"] = sanitize_input(update_data.organization)

    if update_fields:
        await repos.partners.update(partner["_id"], update_fields)

    return {"message": "Profile updated successfully"}

@api_router.post("/partner/profile/photo")
async def upload_partner_photo(file: UploadFile = File(...), partner: dict = Depends(get_current_partner)):
    """Upload or replace the signed-in partner's profile photo."""
    url = await _save_avatar(partner["_id"], file, partner.get("profile_photo_url"))
    await repos.partners.update(partner["_id"], {"profile_photo_url": url})
    return {"profile_photo_url": url}

# ==================== ADMIN AUTH ====================

@api_router.post("/admin/create-first-admin")
async def create_first_admin(admin_data: AdminCreate, request: Request):
    admin_secret = request.headers.get("x-admin-secret", "")
    if not admin_secret or admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Invalid admin secret")
    
    # VULN-02 (TASK-2): hard-fail once any admin exists (one-time bootstrap only,
    # and already gated by the X-Admin-Secret header above).
    existing_admin = await repos.admins.any_exists()
    if existing_admin:
        raise HTTPException(status_code=409, detail="Admin already exists. Use admin invite flow.")
    
    admin_id = str(uuid.uuid4())
    admin_doc = {
        "_id": admin_id,
        "name": admin_data.name,
        "email": admin_data.email.lower(),
        "password_hash": hash_password(admin_data.password),
        "is_super_admin": True,
        "permissions": ["all"],
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
    }
    
    await repos.admins.insert(admin_doc)
    
    token = create_token(admin_id, admin_data.email.lower(), "admin", True, expiration_hours=4)
    
    return {"message": "Admin created successfully", "access_token": token}

@api_router.post("/admin/login")
async def login_admin(credentials: UserLogin, request: Request):
    client_ip = get_client_ip(request)
    email_lower = credentials.email.lower()
    identity_key = f"admin:{email_lower}"

    # Layer 1 — IP rate limit (existing)
    if not check_rate_limit(f"admin_auth:{client_ip}", 3):
        raise HTTPException(status_code=429, detail="Too many attempts from your IP. Please try again later.")

    # Layer 2 — per-email lockout (credential-stuffing defense)
    locked, remaining = check_login_lockout(identity_key)
    if locked:
        minutes = max(1, remaining // 60)
        logger.warning(f"🔒 Blocked admin login for locked account {email_lower} from {client_ip} ({remaining}s remaining)")
        raise HTTPException(
            status_code=429,
            detail=f"Account temporarily locked due to repeated failed attempts. Try again in {minutes} minute(s)."
        )

    # Layer 3 — progressive delay (slows bots; humans barely notice)
    delay = progressive_login_delay(identity_key)
    if delay > 0:
        await asyncio.sleep(delay)

    admin = await repos.admins.get_by_email(email_lower)
    if not admin or not await asyncio.to_thread(verify_password, credentials.password, admin.get("password_hash", "")):
        count = record_failed_login(identity_key, ADMIN_FAILED_LOGIN_MAX, ADMIN_FAILED_LOGIN_LOCK_DURATION)
        logger.warning(f"❌ Failed admin login attempt #{count} for {email_lower} from {client_ip}")
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Success — clear failed-attempt history
    reset_failed_logins(identity_key)

    await repos.admins.update(admin["_id"], {"last_login": datetime.now(timezone.utc)})

    await log_activity("admin_login", "admin", admin["_id"], admin["name"], ip_address=client_ip)
    
    token = create_token(admin["_id"], admin["email"], "admin", True, expiration_hours=4)

    return {
        "access_token": token,
        "token_type": "bearer",
        "admin": {
            "id": admin["_id"],
            "name": admin["name"],
            "email": admin["email"],
            "is_super_admin": admin.get("is_super_admin", False),
            "is_verified": True,
            "is_admin": True,
            "permissions": admin.get("permissions", []),
        },
        "user_type": "admin"
    }

# ==================== ADMIN MANAGEMENT (Super Admin Only) ====================

@api_router.post("/admin/create-admin")
async def create_admin(admin_data: AdminCreate, super_admin: dict = Depends(get_current_super_admin)):
    """Super Admin creates a new admin"""
    existing = await repos.admins.get_by_email(admin_data.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="An admin with this email already exists")

    admin_id = str(uuid.uuid4())
    admin_doc = {
        "_id": admin_id,
        "name": admin_data.name,
        "email": admin_data.email.lower(),
        "password_hash": hash_password(admin_data.password),
        "is_super_admin": False,
        "permissions": ["manage_prayers", "manage_partners", "manage_users", "view_analytics"],
        "created_at": datetime.now(timezone.utc),
        "created_by": super_admin["_id"],
        "last_login": None,
    }

    await repos.admins.insert(admin_doc)
    await log_activity("admin_created", "admin", super_admin["_id"], super_admin["name"], "admin", admin_id,
                       {"new_admin_email": admin_data.email.lower()})

    return {"message": f"Admin '{admin_data.name}' created successfully", "admin_id": admin_id}

@api_router.delete("/admin/remove-admin/{admin_id}")
async def remove_admin(admin_id: str, super_admin: dict = Depends(get_current_super_admin)):
    """Super Admin removes an admin (cannot remove self)"""
    if admin_id == super_admin["_id"]:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    target = await repos.admins.get(admin_id)
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.get("is_super_admin", False):
        raise HTTPException(status_code=400, detail="Cannot remove Super Admin")

    await repos.admins.delete(admin_id)
    await log_activity("admin_removed", "admin", super_admin["_id"], super_admin["name"], "admin", admin_id,
                       {"removed_admin_email": target["email"]})

    return {"message": f"Admin '{target['name']}' removed successfully"}

@api_router.get("/admin/admins")
async def list_admins(super_admin: dict = Depends(get_current_super_admin)):
    """Super Admin lists all admins"""
    admins = []
    for admin in await repos.admins.list_without_secrets():
        admins.append({
            "id": admin["_id"],
            "name": admin["name"],
            "email": admin["email"],
            "is_super_admin": admin.get("is_super_admin", False),
            "permissions": admin.get("permissions", []),
            "created_at": admin["created_at"].isoformat() if isinstance(admin.get("created_at"), datetime) else str(admin.get("created_at", "")),
            "last_login": admin["last_login"].isoformat() if isinstance(admin.get("last_login"), datetime) else None,
        })
    return {"admins": admins}

# ==================== ADMIN DASHBOARD ====================

@api_router.get("/admin/stats", response_model=AdminStats)
async def get_admin_stats(admin: dict = Depends(get_current_admin)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    
    stats = AdminStats(
        total_users=await repos.users.count(),
        total_partners=await repos.partners.count(),
        total_prayers=await repos.prayer_requests.count(),
        prayers_pending=await repos.prayer_requests.count(status="pending"),
        prayers_assigned=await repos.prayer_requests.count(status="assigned"),
        prayers_completed=await repos.prayer_requests.count(status_in=["prayed", "completed"]),
        total_llm_requests=await repos.llm_logs.count_all(),
        llm_tokens_used=0,
        active_users_today=await repos.users.count(last_login_since=today),
        active_partners_today=await repos.partners.count(last_active_since=today),
        new_users_this_week=await repos.users.count(created_since=week_ago),
        new_partners_this_week=await repos.partners.count(created_since=week_ago),
        users_active=await repos.users.count(status_ne="suspended"),
        users_suspended=await repos.users.count(status="suspended"),
        partners_active=await repos.partners.count(is_active=True),
        partners_inactive=await repos.partners.count(is_active=False),
        partners_pending_approval=await repos.partners.count(status="pending_approval"),
    )
    
    # Get total LLM tokens (0 when empty -- identical to the model default)
    stats.llm_tokens_used = await repos.llm_logs.total_tokens()
    
    return stats

@api_router.get("/admin/analytics")
async def get_admin_analytics(
    period: str = Query("week", enum=["day", "week", "month"]),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "view_analytics")
    if period == "day":
        start_date = datetime.now(timezone.utc) - timedelta(days=1)
        group_format = "%Y-%m-%d %H:00"
    elif period == "week":
        start_date = datetime.now(timezone.utc) - timedelta(days=7)
        group_format = "%Y-%m-%d"
    else:
        start_date = datetime.now(timezone.utc) - timedelta(days=30)
        group_format = "%Y-%m-%d"
    
    # User registrations over time
    user_trend = await repos.users.daily_counts("created_at", start_date, fmt=group_format)
    
    # Prayer submissions over time
    prayer_trend = await repos.prayer_requests.daily_counts("submitted_at", start_date, fmt=group_format)

    # Partner registrations over time
    partner_trend = await repos.partners.daily_counts("created_at", start_date, fmt=group_format)

    # Prayers answered (marked prayed/completed) over time — prefer prayed_at, fall back to updated_at
    completion_trend = await repos.prayer_requests.completion_trend(start_date, group_format)

    # Prayer categories breakdown
    categories = await repos.prayer_requests.category_counts(10)
    
    # LLM usage over time
    llm_trend = await repos.llm_logs.daily_usage(start_date, group_format)
    
    return {
        "user_registrations": [{"date": d["_id"], "count": d["count"]} for d in user_trend],
        "prayer_submissions": [{"date": d["_id"], "count": d["count"]} for d in prayer_trend],
        "partner_registrations": [{"date": d["_id"], "count": d["count"]} for d in partner_trend],
        "prayer_completions": [{"date": d["_id"], "count": d["count"]} for d in completion_trend],
        "prayer_categories": [{"category": d["_id"], "count": d["count"]} for d in categories],
        "llm_usage": [{"date": d["_id"], "requests": d["requests"], "tokens": d["tokens"]} for d in llm_trend],
    }

@api_router.get("/admin/daily-reports")
async def get_daily_reports(
    days: int = Query(60, ge=1, le=90),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "view_analytics")
    end_date = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59)
    start_date = (end_date - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
    date_format = "%Y-%m-%d"

    # User registrations per day
    user_regs = {d["_id"]: d["count"] for d in await repos.users.daily_counts("created_at", start_date, end_date, date_format)}

    # Active users per day (by last_login)
    active_users = {d["_id"]: d["count"] for d in await repos.users.daily_counts("last_login", start_date, end_date, date_format)}

    # Prayer submissions per day
    prayer_subs = {d["_id"]: d["count"] for d in await repos.prayer_requests.daily_counts("submitted_at", start_date, end_date, date_format)}

    # Prayers completed per day (status = prayed, using updated_at or completed_at)
    prayer_comps = {d["_id"]: d["count"] for d in await repos.prayer_requests.daily_completed(start_date, end_date, date_format)}

    # Prayers assigned per day
    prayer_assigns = {d["_id"]: d["count"] for d in await repos.prayer_requests.daily_assigned(start_date, end_date, date_format)}

    # Partner registrations per day
    partner_regs = {d["_id"]: d["count"] for d in await repos.partners.daily_counts("created_at", start_date, end_date, date_format)}

    # Active partners per day
    active_partners = {d["_id"]: d["count"] for d in await repos.partners.daily_counts("last_active", start_date, end_date, date_format)}

    # Build daily reports
    reports = []
    current = start_date
    while current <= end_date:
        date_str = current.strftime(date_format)
        reports.append({
            "date": date_str,
            "new_registrations": user_regs.get(date_str, 0),
            "active_users": active_users.get(date_str, 0),
            "prayer_requests_submitted": prayer_subs.get(date_str, 0),
            "prayers_completed": prayer_comps.get(date_str, 0),
            "prayers_assigned": prayer_assigns.get(date_str, 0),
            "new_partners": partner_regs.get(date_str, 0),
            "active_partners": active_partners.get(date_str, 0),
        })
        current += timedelta(days=1)

    return {"reports": reports, "start_date": start_date.isoformat(), "end_date": end_date.isoformat()}

@api_router.get("/admin/users")
async def get_admin_users(
    search: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_users")
    skip = (page - 1) * limit
    total, docs = await repos.users.list(search=search, status=status, skip=skip, limit=limit)

    users = []
    for user in docs:
        users.append({
            "id": user["_id"],
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone"),
            "address": user.get("address"),
            "location_city": user.get("location_city"),
            "location_country": user.get("location_country"),
            "is_verified": user.get("is_verified", False),
            "status": user.get("status", "active"),
            "profile_photo_url": user.get("profile_photo_url"),
            "created_at": user["created_at"].isoformat() if isinstance(user.get("created_at"), datetime) else str(user.get("created_at", "")),
            "last_login": user["last_login"].isoformat() if isinstance(user.get("last_login"), datetime) else None,
        })
    
    return {"users": users, "total": total, "page": page, "limit": limit}

@api_router.put("/admin/users/{user_id}")
async def update_user(user_id: str, status: Optional[str] = None, is_verified: Optional[bool] = None, name: Optional[str] = None, email: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    check_admin_permission(admin, "manage_users")
    update_fields = {}
    if status is not None:
        if status not in ("active", "suspended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update_fields["status"] = status
    if is_verified is not None:
        update_fields["is_verified"] = is_verified
    if name is not None:
        n = sanitize_input(name).strip()
        if len(n) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        update_fields["name"] = n
    if email is not None:
        new_email = email.strip().lower()
        if "@" not in new_email or "." not in new_email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Invalid email address")
        existing = await repos.users.email_taken_by_other(new_email, user_id)
        if existing:
            raise HTTPException(status_code=400, detail="That email is already in use.")
        update_fields["email"] = new_email

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    target = await repos.users.get(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    old_status = target.get("status", "active")

    await repos.users.update(user_id, update_fields)
    await log_activity("user_updated", "admin", admin["_id"], admin["name"], "user", user_id, update_fields)

    # Email the member when an admin suspends or reactivates their account.
    new_status = update_fields.get("status")
    if new_status and new_status != old_status:
        name = target.get("name") or "there"
        if new_status == "suspended":
            await send_account_notice(
                target.get("email"), "Your account has been suspended",
                "Your Tefillah account has been suspended",
                [f"Hi {name},",
                 "An administrator has suspended your Tefillah account, so you won't be able to sign in for now.",
                 "If you believe this was a mistake or would like to appeal, simply reply to this email."],
            )
        elif new_status == "active":
            await send_account_notice(
                target.get("email"), "Your account has been reactivated",
                "Your Tefillah account has been reactivated",
                [f"Hi {name},",
                 "Good news — your Tefillah account has been reactivated. You can sign in again as usual.",
                 "Welcome back."],
            )
    return {"message": "User updated"}

async def _release_partner_prayers(partner_id: str) -> None:
    """Release a partner's assigned (unprayed, unflagged) prayers back to the pending pool.
    Called on delete AND on disable/deactivate, so a sidelined partner's queue is never left
    stranded and invisible to every other partner."""
    await repos.prayer_requests.release_partner(partner_id)


async def _cascade_delete_user(user_id: str, profile_photo_url: Optional[str] = None) -> int:
    """Delete a user AND its side effects so single- and bulk-delete never drift:
    remove the avatar, scrub the user's PII from their prayer requests (partners keep the
    content, anonymized), and detach them from notifications. Returns the deleted count."""
    deleted = await repos.users.delete(user_id)
    if deleted == 0:
        return 0
    await _delete_avatar(user_id, profile_photo_url)
    await repos.prayer_requests.anonymize_user(user_id)
    await repos.notifications.detach_recipient(user_id)
    return deleted


async def _cascade_delete_partner(partner: dict) -> int:
    """Delete a partner AND release their assigned (unprayed, unflagged) prayers back to the
    pending pool, decrement their cell's agent_count, and remove the avatar. Shared by single-
    and bulk-delete; pass the already-fetched partner doc. Returns the deleted count."""
    partner_id = partner["_id"]
    await _release_partner_prayers(partner_id)
    if partner.get("cell_id"):
        await repos.prayer_cells.adjust_agent_count(partner["cell_id"], -1)
    deleted = await repos.partners.delete(partner_id)
    await _delete_avatar(partner_id, partner.get("profile_photo_url"))
    return deleted


@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(get_current_admin)):
    # Only super admins can delete users
    if not admin.get("is_super_admin", False):
        perms = admin.get("permissions", [])
        if "all" not in perms and "manage_users" not in perms:
            raise HTTPException(status_code=403, detail="Insufficient permissions to delete users")

    target = await repos.users.get(user_id)
    if not await _cascade_delete_user(user_id, (target or {}).get("profile_photo_url")):
        raise HTTPException(status_code=404, detail="User not found")

    if target:
        await send_account_notice(
            target.get("email"), "Your account has been deleted",
            "Your Tefillah account has been deleted",
            [f"Hi {target.get('name') or 'there'},",
             "Your Tefillah account and associated data have been permanently deleted by an administrator.",
             "If you have any questions about this, simply reply to this email."],
        )
    await log_activity("user_deleted", "admin", admin["_id"], admin["name"], "user", user_id)
    return {"message": "User deleted"}

@api_router.get("/admin/partners")
async def get_admin_partners(
    search: Optional[str] = None,
    status: Optional[str] = None,
    partner_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_partners")
    skip = (page - 1) * limit
    total, docs = await repos.partners.list(
        search=search, status=status, partner_type=partner_type, skip=skip, limit=limit
    )

    partners = []
    for partner in docs:
        # Count currently assigned (not yet prayed) prayers for this partner
        assigned_count = await repos.prayer_requests.count(
            assigned_partner_id=partner["_id"], status="assigned")
        partners.append({
            "id": partner["_id"],
            "name": partner["name"],
            "email": partner["email"],
            "phone": partner.get("phone"),
            "organization": partner.get("organization"),
            "partner_type": partner.get("partner_type", "prayer_warrior"),
            "location_city": partner.get("location_city", ""),
            "location_country": partner.get("location_country", ""),
            "cell_name": partner.get("cell_name"),
            "is_verified": partner.get("is_verified", False),
            "is_active": partner.get("is_active", True),
            "status": partner.get("status", "active"),
            "profile_photo_url": partner.get("profile_photo_url"),
            "prayers_handled": partner.get("prayers_handled", 0),
            "prayer_capacity": partner.get("prayer_capacity", 10),
            "assigned_prayers_count": assigned_count,
            "response_rate": partner.get("response_rate", 0),
            "created_at": partner["created_at"].isoformat() if isinstance(partner.get("created_at"), datetime) else str(partner.get("created_at", "")),
            "last_active": partner["last_active"].isoformat() if isinstance(partner.get("last_active"), datetime) else None,
        })

    return {"partners": partners, "total": total, "page": page, "limit": limit}

@api_router.put("/admin/partners/{partner_id}")
async def update_partner(
    partner_id: str,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    status: Optional[str] = None,
    prayer_capacity: Optional[int] = Query(None, ge=0, le=1000),
    name: Optional[str] = None,
    email: Optional[str] = None,
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_partners")
    update_fields = {}
    if is_active is not None:
        update_fields["is_active"] = is_active
    if is_verified is not None:
        update_fields["is_verified"] = is_verified
    if status is not None:
        if status not in ("active", "disabled", "pending_approval"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update_fields["status"] = status
    if prayer_capacity is not None:
        update_fields["prayer_capacity"] = prayer_capacity
    if name is not None:
        n = sanitize_input(name).strip()
        if len(n) < 2:
            raise HTTPException(status_code=400, detail="Name must be at least 2 characters")
        update_fields["name"] = n
    if email is not None:
        new_email = email.strip().lower()
        if "@" not in new_email or "." not in new_email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Invalid email address")
        existing = await repos.partners.email_taken_by_other(new_email, partner_id)
        if existing:
            raise HTTPException(status_code=400, detail="That email is already in use.")
        update_fields["email"] = new_email

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    target = await repos.partners.get(partner_id)
    if not target:
        raise HTTPException(status_code=404, detail="Partner not found")
    old_status = target.get("status", "active")

    await repos.partners.update(partner_id, update_fields)
    await log_activity("partner_updated", "admin", admin["_id"], admin["name"], "partner", partner_id, update_fields)

    # Disabling/deactivating a partner blocks their access (get_current_partner) but left
    # their assigned prayers stranded until an admin manually unassigned each one. Release
    # them back to the pool, same as delete does.
    if update_fields.get("status") == "disabled" or update_fields.get("is_active") is False:
        await _release_partner_prayers(partner_id)

    # Email the partner when an admin disables or reactivates their account.
    new_status = update_fields.get("status")
    if new_status and new_status != old_status:
        name = target.get("name") or "there"
        if new_status == "disabled":
            await send_account_notice(
                target.get("email"), "Your partner account has been suspended",
                "Your Tefillah partner account has been suspended",
                [f"Hi {name},",
                 "An administrator has suspended your Tefillah prayer-partner account, so you won't be able to sign in for now.",
                 "If you believe this was a mistake or would like to appeal, simply reply to this email."],
            )
        elif new_status == "active":
            await send_account_notice(
                target.get("email"), "Your partner account has been reactivated",
                "Your Tefillah partner account has been reactivated",
                [f"Hi {name},",
                 "Good news — your Tefillah prayer-partner account has been reactivated. You can sign in again and continue receiving prayer requests.",
                 "Thank you for serving."],
            )
    return {"message": "Partner updated"}

@api_router.post("/admin/partners/{partner_id}/approve")
async def approve_partner(
    partner_id: str,
    admin: dict = Depends(get_current_admin)
):
    """Admin approves a pending partner — sets status to active and is_active to True."""
    check_admin_permission(admin, "manage_partners")
    partner = await repos.partners.get(partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    await repos.partners.update(partner_id, {"status": "active", "is_active": True, "is_verified": True})

    # Send push notification to partner if they have an FCM token
    if partner.get("fcm_token"):
        await send_fcm_push(
            [partner["fcm_token"]],
            "Account Approved!",
            "Your prayer partner account has been approved. You can now log in and start praying.",
            {"screen": "partner-login"}
        )

    # Email the partner that their account is approved.
    await send_account_notice(
        partner.get("email"), "Your partner account is approved",
        "Your Tefillah partner account has been approved",
        [f"Hi {partner.get('name') or 'there'},",
         "Your Tefillah prayer-partner account has been approved. You can now sign in and start receiving prayer requests to pray over.",
         "Thank you for answering the call to serve."],
    )

    await log_activity("partner_approved", "admin", admin["_id"], admin["name"], "partner", partner_id)
    return {"message": f"Partner '{partner['name']}' approved successfully"}

@api_router.delete("/admin/partners/{partner_id}")
async def delete_partner(partner_id: str, admin: dict = Depends(get_current_admin)):
    if not admin.get("is_super_admin", False):
        perms = admin.get("permissions", [])
        if "all" not in perms and "manage_partners" not in perms:
            raise HTTPException(status_code=403, detail="Insufficient permissions to delete partners")

    partner = await repos.partners.get(partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    await _cascade_delete_partner(partner)

    await log_activity("partner_deleted", "admin", admin["_id"], admin["name"], "partner", partner_id,
                       {"email": partner.get("email")})
    return {"message": "Partner deleted"}

@api_router.get("/admin/prayers")
async def get_admin_prayers(
    status: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_prayers")
    skip = (page - 1) * limit
    total, rows = await repos.prayer_requests.list_admin(
        status=status, category=category, search=search, skip=skip, limit=limit
    )

    prayers = []
    for prayer in rows:
        # Fetch user contact info for admin visibility
        user_email = None
        user_phone = None
        if prayer.get("user_id"):
            user_doc = await repos.users.get(prayer["user_id"])
            if user_doc:
                user_email = user_doc.get("email")
                user_phone = user_doc.get("phone")

        # Fetch partner contact info if assigned
        partner_email = None
        partner_phone = None
        if prayer.get("assigned_partner_id"):
            partner_doc = await repos.partners.get(prayer["assigned_partner_id"])
            if partner_doc:
                partner_email = partner_doc.get("email")
                partner_phone = partner_doc.get("phone")

        prayers.append({
            "id": prayer["_id"],
            "user_id": prayer.get("user_id"),
            "user_name": prayer.get("user_name"),
            "user_email": user_email,
            "user_phone": user_phone,
            "content": prayer.get("content", ""),
            "category": prayer.get("category"),
            "status": prayer.get("status", "pending"),
            "is_anonymous": prayer.get("is_anonymous", False),
            "assigned_partner_id": prayer.get("assigned_partner_id"),
            "assigned_partner_name": prayer.get("assigned_partner_name"),
            "partner_name": prayer.get("assigned_partner_name"),
            "partner_email": partner_email,
            "partner_phone": partner_phone,
            "location_city": prayer.get("location_city"),
            "location_country": prayer.get("location_country"),
            "submitted_at": prayer["submitted_at"].isoformat() if isinstance(prayer.get("submitted_at"), datetime) else str(prayer.get("submitted_at", "")),
            "created_at": prayer["submitted_at"].isoformat() if isinstance(prayer.get("submitted_at"), datetime) else str(prayer.get("submitted_at", "")),
            "assigned_at": prayer["assigned_at"].isoformat() if isinstance(prayer.get("assigned_at"), datetime) else None,
            "prayed_at": prayer["prayed_at"].isoformat() if isinstance(prayer.get("prayed_at"), datetime) else None,
        })

    return {"prayers": prayers, "total": total, "page": page, "limit": limit}

# Admin: Get partners list for assignment (lightweight)
@api_router.get("/admin/partners-for-assignment")
async def get_partners_for_assignment(admin: dict = Depends(get_current_admin)):
    """Get a lightweight list of active, verified partners with their capacity info for assignment dropdowns."""
    check_admin_permission(admin, "manage_prayers")
    partners = []
    for partner in await repos.partners.for_assignment():
        assigned_count = await repos.prayer_requests.count(
            assigned_partner_id=partner["_id"], status="assigned")
        capacity = partner.get("prayer_capacity", 10)
        partners.append({
            "id": partner["_id"],
            "name": partner["name"],
            "email": partner["email"],
            "location_city": partner.get("location_city", ""),
            "location_country": partner.get("location_country", ""),
            "cell_name": partner.get("cell_name"),
            "prayer_capacity": capacity,
            "assigned_prayers_count": assigned_count,
            "available_slots": max(0, capacity - assigned_count),
        })

    return {"partners": partners}

# Admin: Assign a prayer request to a specific partner
@api_router.post("/admin/prayers/{prayer_id}/assign")
async def assign_prayer_to_partner(
    prayer_id: str,
    partner_id: str = Query(..., description="Partner ID to assign the prayer to"),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_prayers")
    # Verify prayer exists
    prayer = await repos.prayer_requests.get(prayer_id)
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer request not found")
    # A prayed prayer is DONE. Reassigning it (this endpoint sets status back to
    # "assigned" without clearing prayed_at) let the new partner mark it prayed again
    # — a second stats increment, notification, and LLM call for one prayer. unassign
    # already rejects prayed; assign must too.
    if prayer.get("status") == "prayed":
        raise HTTPException(status_code=400, detail="This prayer has already been prayed and cannot be reassigned.")

    # Verify partner exists and is active
    partner = await repos.partners.get(partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    if not partner.get("is_active", False):
        raise HTTPException(status_code=400, detail="Partner is not active")
    if not partner.get("is_verified", False):
        raise HTTPException(status_code=400, detail="Partner is not verified")

    # Respect partner's block list — never assign a blocked user's request to them
    requester_id = prayer.get("user_id")
    if requester_id and requester_id in (partner.get("blocked_users") or []):
        raise HTTPException(status_code=400, detail="This partner has blocked the requester; choose a different partner.")

    # Check partner capacity
    capacity = partner.get("prayer_capacity", 10)
    assigned_count = await repos.prayer_requests.count(
        assigned_partner_id=partner_id, status="assigned")
    if assigned_count >= capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Partner has reached their capacity limit ({capacity}). Current assignments: {assigned_count}"
        )

    # If prayer was previously assigned to another partner, we're reassigning
    old_partner_id = prayer.get("assigned_partner_id")

    # Update prayer with new assignment. Reset the seen flags so the new partner
    # gets it as a fresh "New" item (re-opening restarts the 24h + 60-min timers).
    # If this prayer had been reported (status='flagged'), an admin deliberately
    # assigning it counts as reviewing and clearing the report, so we drop the
    # report metadata here. (Silent release paths below must NOT do this — they
    # exclude 'flagged' so reported content can't be recycled without review.)
    await repos.prayer_requests.update_fields(
        prayer_id,
        set_fields={
            "assigned_partner_id": partner["_id"],
            "assigned_partner_name": partner["name"],
            "assigned_cell_id": partner.get("cell_id"),
            "assigned_cell_name": partner.get("cell_name"),
            "status": "assigned",
            "assigned_at": datetime.now(timezone.utc),
            "seen_by_partner": False,
            "reported": False,
        },
        unset_fields={
            "seen_at": "",
            "reported_by": "", "reported_by_name": "",
            "reported_reason": "", "reported_at": "",
        },
    )

    await log_activity(
        "prayer_assigned", "admin", admin["_id"], admin["name"],
        "prayer", prayer_id,
        {"partner_id": partner_id, "partner_name": partner["name"], "old_partner_id": old_partner_id}
    )

    return {
        "message": f"Prayer assigned to {partner['name']}",
        "prayer_id": prayer_id,
        "partner_id": partner_id,
        "partner_name": partner["name"],
    }

# Admin: Unassign a prayer request (set back to pending)
@api_router.post("/admin/prayers/{prayer_id}/unassign")
async def unassign_prayer(
    prayer_id: str,
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "manage_prayers")
    prayer = await repos.prayer_requests.get(prayer_id)
    if not prayer:
        raise HTTPException(status_code=404, detail="Prayer request not found")

    if prayer.get("status") == "prayed":
        raise HTTPException(status_code=400, detail="Cannot unassign a prayer that has already been prayed for")
    if prayer.get("status") == "flagged":
        raise HTTPException(status_code=400, detail="This prayer was reported and is under moderation review. Resolve the report before unassigning.")

    old_partner_id = prayer.get("assigned_partner_id")

    # Status filter guards the read-then-write race: if the partner marks this prayer
    # prayed between the check above and here, this update must NOT silently revert it
    # to pending (which would let it be prayed + counted twice).
    await repos.prayer_requests.unassign(prayer_id)

    await log_activity(
        "prayer_unassigned", "admin", admin["_id"], admin["name"],
        "prayer", prayer_id,
        {"old_partner_id": old_partner_id}
    )

    return {"message": "Prayer unassigned and set back to pending", "prayer_id": prayer_id}

@api_router.get("/admin/llm-logs")
async def get_llm_logs(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "view_analytics")
    skip = (page - 1) * limit
    total, docs = await repos.llm_logs.list(status=status, skip=skip, limit=limit)

    logs = []
    for log in docs:
        logs.append({
            "id": log["_id"],
            "request_type": log.get("request_type", "unknown"),
            "model": log.get("model", "unknown"),
            "prompt_tokens": log.get("prompt_tokens", 0),
            "completion_tokens": log.get("completion_tokens", 0),
            "total_tokens": log.get("total_tokens", 0),
            "duration_ms": log.get("duration_ms", 0),
            "status": log.get("status", "unknown"),
            "error_message": log.get("error_message"),
            "timestamp": log["timestamp"].isoformat() if isinstance(log.get("timestamp"), datetime) else str(log.get("timestamp", "")),
        })

    return {"logs": logs, "total": total, "page": page, "limit": limit}

@api_router.get("/admin/activity-logs")
async def get_activity_logs(
    action: Optional[str] = None,
    actor_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_current_admin)
):
    check_admin_permission(admin, "view_analytics")
    skip = (page - 1) * limit
    total, docs = await repos.activity_logs.list(
        action=action, actor_type=actor_type, skip=skip, limit=limit
    )

    logs = []
    for log in docs:
        logs.append({
            "id": log["_id"],
            "action": log.get("action", "unknown"),
            "actor_type": log.get("actor_type", "unknown"),
            "actor_id": log.get("actor_id", ""),
            "actor_name": log.get("actor_name", "unknown"),
            "target_type": log.get("target_type"),
            "target_id": log.get("target_id"),
            "details": log.get("details"),
            "ip_address": log.get("ip_address"),
            "timestamp": log["timestamp"].isoformat() if isinstance(log.get("timestamp"), datetime) else str(log.get("timestamp", "")),
        })
    
    return {"logs": logs, "total": total, "page": page, "limit": limit}

@api_router.post("/admin/notifications")
async def create_notification(notification: NotificationCreate, admin: dict = Depends(get_current_admin)):
    check_admin_permission(admin, "manage_notifications")
    notif_doc = {
        "_id": str(uuid.uuid4()),
        "title": notification.title,
        "message": notification.message,
        "type": notification.type,
        "target_type": notification.target_type,
        "target_ids": notification.target_ids or [],
        "read_by": [],
        "created_by": admin["_id"],
        "created_at": datetime.now(timezone.utc),
    }
    
    await repos.notifications.insert(notif_doc)
    await log_activity("notification_created", "admin", admin["_id"], admin["name"])
    
    return {"message": "Notification created", "id": notif_doc["_id"]}

@api_router.get("/admin/export/{data_type}")
async def export_data(data_type: str, export_format: str = Query("json", alias="format"), admin: dict = Depends(get_current_super_admin)):
    if data_type == "users":
        data = await repos.users.export_without_secrets(10000)
    elif data_type == "partners":
        data = await repos.partners.export_without_secrets(10000)
    elif data_type == "prayers":
        data = await repos.prayer_requests.export(10000)
    elif data_type == "llm_logs":
        data = await repos.llm_logs.export(10000)
    else:
        raise HTTPException(status_code=400, detail="Invalid data type")
    
    # Convert ObjectId and datetime to string
    for item in data:
        item["id"] = item.pop("_id")
        for key in list(item.keys()):
            if isinstance(item[key], datetime):
                item[key] = item[key].isoformat()
    
    if export_format == "csv":
        if not data:
            return {"data": "", "format": "csv"}
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list({k for row in data for k in row}), extrasaction='ignore')
        writer.writeheader()
        writer.writerows(data)
        return {"data": output.getvalue(), "format": "csv"}

    return {"data": data, "format": "json"}

# ==================== EXPORT CSV DOWNLOAD ====================

@api_router.get("/admin/export-csv/{data_type}")
async def export_csv_download(data_type: str, admin: dict = Depends(get_current_admin)):
    """Download data as a proper CSV file."""
    check_admin_permission(admin, "export_data")

    if data_type == "users":
        data = await repos.users.export_without_secrets(50000)
    elif data_type == "partners":
        data = await repos.partners.export_without_secrets(50000)
    elif data_type == "prayers":
        data = await repos.prayer_requests.export(50000)
    elif data_type == "activity_logs":
        data = await repos.activity_logs.export(10000)
    else:
        raise HTTPException(status_code=400, detail="Invalid data type. Use: users, partners, prayers, activity_logs")

    for item in data:
        item["id"] = item.pop("_id")
        for key in list(item.keys()):
            if isinstance(item[key], datetime):
                item[key] = item[key].isoformat()
            elif isinstance(item[key], (dict, list)):
                item[key] = json.dumps(item[key])

    if not data:
        return StreamingResponse(
            iter(["No data"]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={data_type}_export.csv"}
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list({k for row in data for k in row}), extrasaction='ignore')
    writer.writeheader()
    writer.writerows(data)

    await log_activity("data_exported", "admin", admin["_id"], admin["name"], details={"data_type": data_type, "count": len(data)})

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={data_type}_export_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"}
    )

# ==================== ADMIN MANAGEMENT (Enhanced) ====================

@api_router.post("/admin/create-admin-with-permissions")
async def create_admin_with_permissions(admin_data: AdminCreateWithPermissions, super_admin: dict = Depends(get_current_super_admin)):
    """Super Admin creates a new admin with specific permissions."""
    existing = await repos.admins.get_by_email(admin_data.email.lower())
    if existing:
        raise HTTPException(status_code=400, detail="An admin with this email already exists")

    valid_permissions = ["manage_prayers", "manage_partners", "manage_users", "view_analytics", "manage_notifications", "export_data", "manage_admins"]
    for perm in admin_data.permissions:
        if perm not in valid_permissions and perm != "all":
            raise HTTPException(status_code=400, detail=f"Invalid permission: '{perm}'. Valid: {valid_permissions}")

    admin_id = str(uuid.uuid4())
    admin_doc = {
        "_id": admin_id,
        "name": admin_data.name,
        "email": admin_data.email.lower(),
        "password_hash": hash_password(admin_data.password),
        "is_super_admin": False,
        "is_active": True,
        "permissions": admin_data.permissions,
        "created_at": datetime.now(timezone.utc),
        "created_by": super_admin["_id"],
        "last_login": None,
    }

    await repos.admins.insert(admin_doc)
    await log_activity("admin_created", "admin", super_admin["_id"], super_admin["name"], "admin", admin_id,
                       {"new_admin_email": admin_data.email.lower(), "permissions": admin_data.permissions})

    return {
        "message": f"Admin '{admin_data.name}' created successfully",
        "admin_id": admin_id,
        "permissions": admin_data.permissions,
    }

@api_router.put("/admin/admins/{admin_id}/permissions")
async def update_admin_permissions(admin_id: str, update_data: AdminUpdatePermissions, super_admin: dict = Depends(get_current_super_admin)):
    """Super Admin updates an admin's permissions or active status."""
    target = await repos.admins.get(admin_id)
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.get("is_super_admin", False):
        raise HTTPException(status_code=400, detail="Cannot modify Super Admin permissions")

    update_fields = {}
    if update_data.permissions is not None:
        valid_permissions = ["manage_prayers", "manage_partners", "manage_users", "view_analytics", "manage_notifications", "export_data", "manage_admins"]
        for perm in update_data.permissions:
            if perm not in valid_permissions and perm != "all":
                raise HTTPException(status_code=400, detail=f"Invalid permission: '{perm}'")
        update_fields["permissions"] = update_data.permissions
    if update_data.is_active is not None:
        update_fields["is_active"] = update_data.is_active

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    await repos.admins.update(admin_id, update_fields)
    await log_activity("admin_permissions_updated", "admin", super_admin["_id"], super_admin["name"], "admin", admin_id, update_fields)

    return {"message": f"Admin '{target['name']}' updated successfully", "updates": update_fields}

@api_router.get("/admin/permissions-list")
async def get_available_permissions(admin: dict = Depends(get_current_admin)):
    """Get list of all available permissions with descriptions."""
    return {
        "permissions": [
            {"key": "manage_users", "label": "Manage Users", "description": "View, edit, suspend, delete users"},
            {"key": "manage_partners", "label": "Manage Partners", "description": "View, edit, verify, activate/deactivate partners"},
            {"key": "manage_prayers", "label": "Manage Prayers", "description": "View, assign, unassign prayer requests"},
            {"key": "view_analytics", "label": "View Analytics", "description": "Access dashboard stats, charts, daily reports"},
            {"key": "manage_notifications", "label": "Manage Notifications", "description": "Send push notifications and emails"},
            {"key": "export_data", "label": "Export Data", "description": "Download users, partners, prayers as CSV"},
            {"key": "manage_admins", "label": "Manage Admins", "description": "Create and manage other admin accounts"},
        ]
    }

# ==================== BULK ACTIONS ====================

@api_router.post("/admin/bulk/users")
async def bulk_user_action(bulk: BulkUserAction, admin: dict = Depends(get_current_admin)):
    """Perform bulk actions on multiple users."""
    check_admin_permission(admin, "manage_users")

    if not bulk.user_ids:
        raise HTTPException(status_code=400, detail="No user IDs provided")
    if len(bulk.user_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 users per bulk action")

    results = {"success": 0, "failed": 0, "action": bulk.action}

    if bulk.action == "delete":
        if not admin.get("is_super_admin", False):
            raise HTTPException(status_code=403, detail="Only Super Admin can bulk delete users")
        for uid in bulk.user_ids:
            prof = await repos.users.get(uid)
            deleted = await _cascade_delete_user(uid, (prof or {}).get("profile_photo_url"))
            results["success" if deleted else "failed"] += 1

    elif bulk.action == "suspend":
        for uid in bulk.user_ids:
            matched = await repos.users.update(uid, {"status": "suspended"})
            results["success" if matched else "failed"] += 1

    elif bulk.action == "activate":
        for uid in bulk.user_ids:
            matched = await repos.users.update(uid, {"status": "active"})
            results["success" if matched else "failed"] += 1

    elif bulk.action == "verify":
        for uid in bulk.user_ids:
            matched = await repos.users.update(uid, {"is_verified": True})
            results["success" if matched else "failed"] += 1

    elif bulk.action == "unverify":
        for uid in bulk.user_ids:
            matched = await repos.users.update(uid, {"is_verified": False})
            results["success" if matched else "failed"] += 1
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: '{bulk.action}'. Valid: delete, suspend, activate, verify, unverify")

    await log_activity("bulk_user_action", "admin", admin["_id"], admin["name"], details={
        "action": bulk.action, "count": len(bulk.user_ids), "success": results["success"], "failed": results["failed"]
    })

    return results

@api_router.post("/admin/bulk/partners")
async def bulk_partner_action(bulk: BulkPartnerAction, admin: dict = Depends(get_current_admin)):
    """Perform bulk actions on multiple partners."""
    check_admin_permission(admin, "manage_partners")

    if not bulk.partner_ids:
        raise HTTPException(status_code=400, detail="No partner IDs provided")
    if len(bulk.partner_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 partners per bulk action")

    results = {"success": 0, "failed": 0, "action": bulk.action}

    if bulk.action == "delete":
        if not admin.get("is_super_admin", False):
            raise HTTPException(status_code=403, detail="Only Super Admin can bulk delete partners")
        for pid in bulk.partner_ids:
            partner = await repos.partners.get(pid)
            deleted = await _cascade_delete_partner(partner) if partner else 0
            results["success" if deleted else "failed"] += 1

    elif bulk.action == "activate":
        for pid in bulk.partner_ids:
            matched = await repos.partners.update(pid, {"is_active": True})
            results["success" if matched else "failed"] += 1

    elif bulk.action == "deactivate":
        for pid in bulk.partner_ids:
            matched = await repos.partners.update(pid, {"is_active": False})
            if matched:
                await _release_partner_prayers(pid)  # don't strand their queue
                results["success"] += 1
            else:
                results["failed"] += 1

    elif bulk.action == "verify":
        for pid in bulk.partner_ids:
            matched = await repos.partners.update(pid, {"is_verified": True})
            results["success" if matched else "failed"] += 1

    elif bulk.action == "unverify":
        for pid in bulk.partner_ids:
            matched = await repos.partners.update(pid, {"is_verified": False})
            results["success" if matched else "failed"] += 1
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: '{bulk.action}'. Valid: delete, activate, deactivate, verify, unverify")

    await log_activity("bulk_partner_action", "admin", admin["_id"], admin["name"], details={
        "action": bulk.action, "count": len(bulk.partner_ids), "success": results["success"], "failed": results["failed"]
    })

    return results

@api_router.post("/admin/bulk/prayers")
async def bulk_prayer_action(bulk: BulkPrayerAction, admin: dict = Depends(get_current_admin)):
    """Perform bulk actions on multiple prayers."""
    check_admin_permission(admin, "manage_prayers")

    if not bulk.prayer_ids:
        raise HTTPException(status_code=400, detail="No prayer IDs provided")
    if len(bulk.prayer_ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 prayers per bulk action")

    results = {"success": 0, "failed": 0, "action": bulk.action}

    if bulk.action == "delete":
        if not admin.get("is_super_admin", False):
            raise HTTPException(status_code=403, detail="Only Super Admin can bulk delete prayers")
        for pid in bulk.prayer_ids:
            deleted = await repos.prayer_requests.delete(pid)
            results["success" if deleted else "failed"] += 1

    elif bulk.action == "unassign":
        for pid in bulk.prayer_ids:
            # Never silently release reported ('flagged') content back to the pool —
            # it stays out of circulation until an admin reviews it.
            matched = await repos.prayer_requests.bulk_unassign(pid)
            results["success" if matched else "failed"] += 1

    elif bulk.action == "assign":
        if not bulk.partner_id:
            raise HTTPException(status_code=400, detail="partner_id required for bulk assign")
        partner = await repos.partners.get(bulk.partner_id)
        if not partner:
            raise HTTPException(status_code=404, detail="Partner not found")
        blocked = partner.get("blocked_users") or []
        # Enforce capacity (single-assign does; bulk did not — one call could put 100
        # prayers on a capacity-10 partner). Cap to the remaining slots.
        capacity = partner.get("prayer_capacity", 10)
        assigned_count = await repos.prayer_requests.count(
            assigned_partner_id=partner["_id"], status="assigned")
        remaining = max(0, capacity - assigned_count)
        for pid in bulk.prayer_ids:
            if remaining <= 0:
                results["failed"] += 1
                continue
            # Respect the partner's block list (mirrors single-assign): never hand a
            # blocked user's request to the partner who blocked them.
            matched = await repos.prayer_requests.assign_if_pending(
                pid,
                {
                    "assigned_partner_id": partner["_id"],
                    "assigned_partner_name": partner["name"],
                    "assigned_cell_id": partner.get("cell_id"),
                    "assigned_cell_name": partner.get("cell_name"),
                    "status": "assigned",
                    "assigned_at": datetime.now(timezone.utc),
                    "seen_by_partner": False,
                },
                blocked=blocked,
            )
            if matched > 0:
                results["success"] += 1
                remaining -= 1
            else:
                results["failed"] += 1
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: '{bulk.action}'. Valid: delete, assign, unassign")

    await log_activity("bulk_prayer_action", "admin", admin["_id"], admin["name"], details={
        "action": bulk.action, "count": len(bulk.prayer_ids), "success": results["success"], "failed": results["failed"]
    })

    return results

# ==================== PUSH NOTIFICATIONS (FCM) ====================

@api_router.post("/admin/push-notification")
async def send_push_notification(notif: PushNotificationRequest, background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    """Send FCM push notification to users/partners."""
    check_admin_permission(admin, "manage_notifications")

    if not _firebase_initialized:
        raise HTTPException(status_code=503, detail="Firebase not initialized. Check FIREBASE_ADMIN_CREDENTIALS env var.")

    # Collect device tokens based on target
    tokens = []
    if notif.target == "all":
        tokens.extend(await repos.users.fcm_tokens())
        tokens.extend(await repos.partners.fcm_tokens())
    elif notif.target == "users":
        tokens.extend(await repos.users.fcm_tokens())
    elif notif.target == "partners":
        tokens.extend(await repos.partners.fcm_tokens())
    elif notif.target == "specific" and notif.target_ids:
        for repo in (repos.users, repos.partners):
            tokens.extend(await repo.fcm_tokens_for_ids(notif.target_ids))
    else:
        raise HTTPException(status_code=400, detail="Invalid target. Use: all, users, partners, specific")

    if not tokens:
        return {"message": "No devices with push tokens found", "sent": 0, "failed": 0, "total_tokens": 0}

    # Store the in-app notification immediately, then hand the actual FCM fan-out to a
    # background task so the admin request returns at once — a large broadcast must never
    # block the request (which would 504 at the proxy and get re-sent, duplicating pushes).
    notif_doc = {
        "_id": str(uuid.uuid4()),
        "title": notif.title,
        "message": notif.body,
        "type": "push",
        "target_type": notif.target,
        "target_ids": notif.target_ids or [],
        "read_by": [],
        "created_by": admin["_id"],
        "created_at": datetime.now(timezone.utc),
        "push_result": {"status": "queued", "total_tokens": len(tokens)},
    }
    await repos.notifications.insert(notif_doc)

    background_tasks.add_task(send_fcm_push, tokens, notif.title, notif.body, notif.data)

    await log_activity("push_notification_sent", "admin", admin["_id"], admin["name"], details={
        "title": notif.title, "target": notif.target, "tokens_count": len(tokens),
    })

    return {"message": f"Push queued to {len(tokens)} devices", "total_tokens": len(tokens), "status": "queued"}

# Device token registration (called by mobile app)
@api_router.post("/user/register-device")
async def register_user_device_token(
    token: str = Query(..., description="FCM device token"),
    current_user: dict = Depends(get_current_user)
):
    """Register/update FCM device token for push notifications."""
    user_type = current_user.get("_user_type", "user")
    collection = repos.partners if user_type == "partner" else repos.users
    await collection.update(current_user["_id"], {"fcm_token": token, "fcm_updated_at": datetime.now(timezone.utc)})
    return {"message": "Device token registered"}

@api_router.post("/user/unregister-device")
async def unregister_user_device_token(current_user: dict = Depends(get_current_user)):
    """Remove the FCM device token so the user stops receiving push notifications."""
    user_type = current_user.get("_user_type", "user")
    collection = repos.partners if user_type == "partner" else repos.users
    await collection.update(current_user["_id"], unset_fields={"fcm_token": "", "fcm_updated_at": ""})
    return {"message": "Device token removed"}

@api_router.put("/user/profile")
async def update_user_profile(
    data: UserProfileUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    """Update the current user's profile. Changing the email is staged until the new address is confirmed."""
    # This endpoint only manages USER records. A partner/admin token (reachable via
    # switch-account) would otherwise update_one 0 rows and then dereference a None
    # find_one -> 500 (and fire a stray email-change confirmation). Reject cleanly.
    if current_user.get("_user_type") != "user":
        raise HTTPException(status_code=403, detail="This endpoint is for user accounts.")
    updates: dict = {}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.phone is not None:
        updates["phone"] = data.phone.strip()
    if data.location_city is not None:
        updates["location_city"] = data.location_city.strip()
    if data.location_country is not None:
        updates["location_country"] = data.location_country.strip()

    email_change_pending = False
    pending_email = None
    if data.email and data.email.lower() != (current_user.get("email") or "").lower():
        new_email = data.email.lower()
        # The new address must not already belong to another account.
        existing = await repos.users.email_taken_by_other(new_email, current_user["_id"])
        if existing:
            raise HTTPException(status_code=400, detail="That email is already in use.")
        code = generate_verification_code()
        # Stage the new email — the live email/login stays unchanged until it is confirmed.
        updates["pending_email"] = new_email
        updates["pending_email_code"] = code
        updates["pending_email_expires"] = datetime.now(timezone.utc) + timedelta(hours=24)
        email_change_pending = True
        pending_email = new_email

    if not updates:
        raise HTTPException(status_code=400, detail="No changes provided.")

    await repos.users.update(current_user["_id"], updates)

    if email_change_pending:
        body = (
            "<h2>Confirm your new Tefillah email</h2>"
            f"<p>Your confirmation code is <strong>{updates['pending_email_code']}</strong>.</p>"
            "<p>Enter it in Tefillah to switch your account to this address. "
            "Your current email stays active until you confirm.</p>"
            "<p>This code expires in 24 hours.</p>"
        )
        background_tasks.add_task(send_email, pending_email, "Confirm your new Tefillah email", body)

    fresh = await repos.users.get(current_user["_id"])
    return {
        "message": "Profile updated." + (" Enter the code we emailed your new address to confirm the change." if email_change_pending else ""),
        "email_change_pending": email_change_pending,
        "pending_email": pending_email,
        "user": {
            "id": fresh["_id"],
            "name": fresh.get("name"),
            "email": fresh.get("email"),
            "phone": fresh.get("phone"),
            "location_city": fresh.get("location_city"),
            "location_country": fresh.get("location_country"),
            "is_verified": fresh.get("is_verified", False),
            "profile_photo_url": fresh.get("profile_photo_url"),
        },
    }


class EmailChangeVerify(BaseModel):
    code: str = Field(..., min_length=4, max_length=10)


@api_router.post("/user/verify-email-change")
async def verify_email_change(data: EmailChangeVerify, current_user: dict = Depends(get_current_user)):
    """Confirm a staged email change with the code sent to the NEW address, then swap it in.
    Works for both users and partners (whichever account the token belongs to)."""
    coll = repos.partners if current_user.get("_user_type") == "partner" else repos.users
    pending = current_user.get("pending_email")
    if not pending:
        raise HTTPException(status_code=400, detail="There is no pending email change to confirm.")
    if current_user.get("pending_email_code") != (data.code or "").strip():
        raise HTTPException(status_code=400, detail="Invalid confirmation code.")
    exp = current_user.get("pending_email_expires")
    if exp:
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="That code has expired. Save the new email again to get a fresh code.")
    # Re-check uniqueness at apply time (someone may have taken it meanwhile).
    existing = await coll.email_taken_by_other(pending, current_user["_id"])
    if existing:
        raise HTTPException(status_code=400, detail="That email is now in use by another account.")
    await coll.update(
        current_user["_id"],
        set_fields={"email": pending, "is_verified": True},
        unset_fields={"pending_email": "", "pending_email_code": "", "pending_email_expires": ""},
    )
    return {"message": "Your email has been updated.", "email": pending}


@api_router.post("/user/cancel-email-change")
async def cancel_email_change(current_user: dict = Depends(get_current_user)):
    """Discard a staged email change — clears the pending email and its code so the
    confirmation prompt goes away. Works for both users and partners."""
    coll = repos.partners if current_user.get("_user_type") == "partner" else repos.users
    await coll.update(current_user["_id"], unset_fields={"pending_email": "", "pending_email_code": "", "pending_email_expires": ""})
    return {"message": "Pending email change cancelled."}


@api_router.delete("/me")
async def delete_my_account(current_user: dict = Depends(get_current_user)):
    """Permanently delete the signed-in account and its associated data.

    Required by Google Play and the Apple App Store (5.1.1(v)): users who can create
    an account must be able to delete it (and their data) from within the app. This is
    a HARD delete, not a deactivate. Works for both users and partners.
    """
    uid = current_user["_id"]
    utype = current_user.get("_user_type", "user")
    if utype == "admin":
        raise HTTPException(status_code=400, detail="Admin accounts cannot be self-deleted here.")

    if utype == "partner":
        # Release any prayers still assigned to this partner back to the pending pool
        # (but not reported 'flagged' content — that stays out for moderation),
        # decrement their prayer-cell count, then delete the partner record.
        await repos.prayer_requests.release_partner(uid)
        if current_user.get("cell_id"):
            await repos.prayer_cells.adjust_agent_count(current_user["cell_id"], -1)
        await repos.partners.delete(uid)
    else:
        # Strip the deleted user's PII from their prayer requests (the prayer text may
        # already be with a partner) and remove the user record.
        await repos.prayer_requests.anonymize_user(uid)
        await repos.users.delete(uid)

    # Common cleanup: avatar (Mongo + S3), notification targeting, audit log.
    await _delete_avatar(uid, current_user.get("profile_photo_url"))
    await repos.notifications.detach_recipient(uid)
    await log_activity("account_self_deleted", utype, uid, current_user.get("name", ""), utype, uid,
                       {"email": current_user.get("email")})
    await send_account_notice(
        current_user.get("email"), "Your account has been deleted",
        "Your Tefillah account has been deleted",
        [f"Hi {current_user.get('name') or 'there'},",
         "This confirms that your Tefillah account and all associated data have been permanently deleted, as you requested. This action cannot be undone.",
         "We're sorry to see you go — you're always welcome to create a new account in future. If you did not request this, reply to this email straight away."],
    )
    return {"message": "Your account and associated data have been permanently deleted."}


@api_router.get("/community/pulse")
async def community_pulse(current_user: dict = Depends(get_current_user)):
    """Aggregate stats for the home 'Living Prayer Billboard' — community scale + the
    signed-in user's personal 'prayed over you' moments. All cheap count queries."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    uid = current_user["_id"]

    _answered = ["prayed", "completed"]
    prayers_this_week = await repos.prayer_requests.count(submitted_since=week_ago)
    prayers_total = await repos.prayer_requests.count()
    prayers_answered = await repos.prayer_requests.count(status_in=_answered)
    your_prayers_prayed = await repos.prayer_requests.count(user_id=uid, status_in=_answered)

    last_prayed_at = None
    last = await repos.prayer_requests.last_answered_for_user(uid)
    if last and last.get("prayed_at"):
        lp = last["prayed_at"]
        last_prayed_at = lp.isoformat() if isinstance(lp, datetime) else str(lp)

    return {
        "prayers_this_week": prayers_this_week,
        "prayers_total": prayers_total,
        "prayers_answered": prayers_answered,
        "your_prayers_prayed": your_prayers_prayed,
        "last_prayed_at": last_prayed_at,
    }

# ==================== PROFILE PHOTOS (avatars) ====================

async def _delete_avatar(owner_id: str, profile_photo_url: str = None):
    """Best-effort removal of a user's/partner's avatar on account deletion — both the
    legacy Mongo doc AND the S3 object the profile_photo_url points at. Never raises, so
    an S3 hiccup can't block the account deletion. Required for complete data deletion."""
    try:
        await repos.avatars.delete(owner_id)
    except Exception as e:
        logger.warning(f"avatar mongo cleanup failed for {owner_id}: {e}")
    if profile_photo_url and "/avatars/" in profile_photo_url and _boto3 is not None:
        try:
            key = "avatars/" + profile_photo_url.split("/avatars/", 1)[1].split("?", 1)[0]
            await asyncio.to_thread(_get_s3().delete_object, Bucket=S3_AVATAR_BUCKET, Key=key)
        except Exception as e:
            logger.warning(f"avatar S3 cleanup failed for {owner_id}: {e}")


async def _save_avatar(owner_id: str, file: UploadFile, previous_url: str = None) -> str:
    """Validate an uploaded image, store it in S3, and return its public CloudFront URL.

    Each upload uses a unique timestamped key so the URL changes (no CDN cache
    staleness); the previous object is deleted best-effort to avoid orphans.
    """
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in AVATAR_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type. Use JPEG, PNG, WEBP or GIF.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large. Maximum size is 3 MB.")
    if _boto3 is None:
        raise HTTPException(status_code=503, detail="Photo storage is not available right now.")

    ext = _AVATAR_EXT.get(content_type, "jpg")
    ts = int(datetime.now(timezone.utc).timestamp())
    key = f"avatars/{owner_id}-{ts}.{ext}"
    try:
        await asyncio.to_thread(
            _get_s3().put_object,
            Bucket=S3_AVATAR_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    except Exception as e:
        logger.error(f"S3 avatar upload failed for {owner_id}: {e}")
        raise HTTPException(status_code=502, detail="Could not save the photo. Please try again.")

    # Best-effort cleanup of the user's previous S3 avatar object.
    if previous_url and "/avatars/" in previous_url:
        old_key = "avatars/" + previous_url.split("/avatars/", 1)[1].split("?", 1)[0]
        if old_key != key:
            try:
                await asyncio.to_thread(_get_s3().delete_object, Bucket=S3_AVATAR_BUCKET, Key=old_key)
            except Exception as e:
                logger.warning(f"Could not delete old avatar {old_key}: {e}")

    return f"{AVATAR_PUBLIC_BASE}/{key}"


@api_router.post("/user/profile/photo")
async def upload_user_photo(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload or replace the signed-in user's profile photo."""
    url = await _save_avatar(current_user["_id"], file, current_user.get("profile_photo_url"))
    await repos.users.update(current_user["_id"], {"profile_photo_url": url})
    return {"profile_photo_url": url}


@api_router.get("/avatar/{owner_id}")
async def get_avatar(owner_id: str):
    """Public: stream a stored avatar. Users and partners share the store by id."""
    doc = await repos.avatars.get(owner_id)
    if not doc or not doc.get("data"):
        raise HTTPException(status_code=404, detail="No avatar")
    data = doc["data"]
    if isinstance(data, str):  # defensive: legacy base64
        import base64
        try:
            data = base64.b64decode(data)
        except Exception:
            raise HTTPException(status_code=404, detail="No avatar")
    return StarletteResponse(
        content=bytes(data),
        media_type=doc.get("content_type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )

# ==================== USER NOTIFICATIONS ====================

@api_router.get("/user/notifications")
async def get_user_notifications(
    unread_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get notifications for the current user — includes targeted and broadcast notifications."""
    user_id = current_user["_id"]
    skip = (page - 1) * limit
    rows = await repos.notifications.list_for(
        user_id, "users", unread_only=unread_only, skip=skip, limit=limit
    )

    notifications = []
    for notif in rows:
        notifications.append({
            "id": notif["_id"],
            "title": notif.get("title", ""),
            "message": notif.get("message", ""),
            "type": notif.get("type", "info"),
            "is_read": user_id in notif.get("read_by", []),
            "prayer_id": notif.get("prayer_id"),
            "created_at": notif["created_at"].isoformat() if isinstance(notif.get("created_at"), datetime) else str(notif.get("created_at", "")),
        })

    total = await repos.notifications.count_for(user_id, "users", unread_only=unread_only)
    unread_count = await repos.notifications.count_for(user_id, "users", unread_only=True)

    return {"notifications": notifications, "total": total, "unread_count": unread_count}

@api_router.post("/user/notifications/{notification_id}/read")
async def mark_user_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read for the current user."""
    user_id = current_user["_id"]
    # Scope the write to notifications actually visible to this user (no blind writes by id).
    matched = await repos.notifications.mark_read(notification_id, user_id, "users")
    if matched == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.post("/user/notifications/read-all")
async def mark_all_user_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    """Mark all notifications as read for the current user."""
    user_id = current_user["_id"]
    await repos.notifications.mark_all_read(user_id, "users")
    return {"message": "All notifications marked as read"}

# ==================== EMAIL BROADCAST ====================

@api_router.post("/admin/send-email")
async def send_email_broadcast(email_req: EmailBroadcast, background_tasks: BackgroundTasks, admin: dict = Depends(get_current_admin)):
    """Send email to users/partners. Uses Resend API."""
    check_admin_permission(admin, "manage_notifications")

    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email service not configured. Set RESEND_API_KEY env var.")

    # Collect email addresses based on target (skip any doc without an email — never KeyError).
    recipients = []
    seen_emails = set()

    def _add_recipient(doc):
        email = doc.get("email")
        if email and email not in seen_emails:
            seen_emails.add(email)
            recipients.append({"email": email, "name": doc.get("name", "")})

    if email_req.target == "all":
        for user in await repos.users.all_email_name():
            _add_recipient(user)
        for partner in await repos.partners.all_email_name():
            _add_recipient(partner)
    elif email_req.target == "users":
        for user in await repos.users.all_email_name():
            _add_recipient(user)
    elif email_req.target == "partners":
        for partner in await repos.partners.all_email_name():
            _add_recipient(partner)
    elif email_req.target == "specific" and email_req.target_ids:
        for repo in (repos.users, repos.partners):
            for doc in await repo.email_name_for_ids(email_req.target_ids):
                _add_recipient(doc)
    else:
        raise HTTPException(status_code=400, detail="Invalid target. Use: all, users, partners, specific")

    if not recipients:
        return {"message": "No recipients found", "sent": 0}

    # Wrap the body in Tefillah email template
    html_template = f"""
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #121220; color: #fff; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #C0A062; font-size: 28px; font-weight: 300; letter-spacing: 4px;">Tefillah</h1>
        </div>
        <div style="background: #1a1a2e; padding: 24px; border-radius: 12px; border: 1px solid #2a2a3e;">
            {email_req.body}
        </div>
        <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a3e;">
            <p style="color: #666; font-size: 12px;">Tefillah Prayer Platform</p>
        </div>
    </div>
    """

    # Send emails in background to avoid timeout
    async def _send_emails():
        sent = 0
        failed = 0
        for recipient in recipients:
            try:
                async with httpx.AsyncClient() as client_http:
                    await client_http.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json", "User-Agent": RESEND_USER_AGENT},
                        json={"from": f"Tefillah <{SENDER_EMAIL}>", "to": recipient["email"], "subject": email_req.subject, "html": html_template}
                    )
                sent += 1
            except Exception as e:
                failed += 1
                logger.warning(f"Failed to send email to {recipient['email']}: {e}")
            # Rate limit: max 2 emails per second (Resend free tier)
            await asyncio.sleep(0.5)

        await log_activity("email_broadcast_completed", "admin", admin["_id"], admin["name"], details={
            "subject": email_req.subject, "target": email_req.target, "sent": sent, "failed": failed
        })

    background_tasks.add_task(_send_emails)

    await log_activity("email_broadcast_started", "admin", admin["_id"], admin["name"], details={
        "subject": email_req.subject, "target": email_req.target, "recipients_count": len(recipients)
    })

    return {"message": f"Email broadcast started to {len(recipients)} recipients", "recipients_count": len(recipients)}

# ==================== PRAYER CELLS ====================

@api_router.get("/cells", response_model=List[PrayerCellResponse])
async def get_prayer_cells():
    cells = []
    for cell in await repos.prayer_cells.list_active():
        cells.append(PrayerCellResponse(
            id=cell["_id"],
            name=cell["name"],
            location_city=cell["location_city"],
            location_country=cell["location_country"],
            description=cell.get("description"),
            agent_count=cell.get("agent_count", 0),
            request_count=cell.get("request_count", 0),
            is_active=cell.get("is_active", True),
            created_at=cell["created_at"],
        ))
    return cells

@api_router.post("/admin/cells", response_model=PrayerCellResponse)
async def create_prayer_cell(cell_data: PrayerCellCreate, admin: dict = Depends(get_current_admin)):
    check_admin_permission(admin, "manage_partners")
    cell_id = str(uuid.uuid4())
    cell_doc = {
        "_id": cell_id,
        "name": cell_data.name,
        "location_city": cell_data.location_city,
        "location_country": cell_data.location_country,
        "description": cell_data.description,
        "agent_count": 0,
        "request_count": 0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await repos.prayer_cells.insert(cell_doc)
    
    cell_doc.pop("_id", None)
    return PrayerCellResponse(id=cell_id, **cell_doc)

# ==================== PRAYER SUBMISSION ====================

@api_router.post("/prayer/submit", response_model=ComfortResponse)
async def submit_prayer(
    prayer_data: PrayerRequestCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    client_ip = get_client_ip(request)
    if not check_rate_limit("__global_llm__", GLOBAL_LLM_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="The service is busy right now. Please try again in a moment.")
    if not check_rate_limit(f"prayer:{client_ip}", 5):
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")
    
    prayer_id = str(uuid.uuid4())
    user_id = current_user["_id"]
    
    # Generate comfort message and categorize using LLM
    lang_map = {"en": "English", "hi": "Hindi", "te": "Telugu"}
    response_language = lang_map.get(prayer_data.language or "en", "English")
    lang_instruction = f"\nIMPORTANT: Write the comfort_message and bible_verse in {response_language}. The category and bible_reference should remain in English." if (prayer_data.language or "en") != "en" else ""

    system_prompt = f"""You are a deeply compassionate Christian spiritual companion responding to a real person sharing a raw, personal prayer request.

Read the request carefully and pick up on:
- The specific situation (illness, job loss, family conflict, fear, gratitude, grief, etc.)
- Who is involved (names, relationships — reference them gently if mentioned)
- The underlying emotion (fear, shame, hope, exhaustion, doubt, joy)
- The tone (quiet sadness vs desperate vs hopeful vs thankful)

Then respond with:
1. category: ONE of [health, family, finance, spiritual, relationship, work, grief, gratitude, other]
2. comfort_message: 2-3 sentences, warm and personal, that:
   - Acknowledge the *specific* thing they shared — not a generic "I'm sorry you're going through a hard time"
   - Speak to their actual emotion, not a template
   - Offer gentle hope rooted in God's nearness, not religious platitudes
   - Feel like a trusted friend who prays — not a sermon or a greeting card
   - NEVER start with "Dear child" or similar generic openers
   - NEVER use "I pray that..." or "May God..." as the ONLY response — address the situation first
3. bible_verse + bible_reference: A verse that genuinely fits THIS situation.
   - Vary the verses — do not default to Psalm 34:18, Jeremiah 29:11, or Philippians 4:6 unless they are the most fitting match.
   - Favour verses that speak to the specific emotion or circumstance.{lang_instruction}

CRITICAL: Do NOT be generic. Do NOT repeat the same formulas. Every response should feel like it was written for *this* person's *this* situation.

Respond ONLY in this exact JSON format (no markdown, no code fences, no extra text):
{{
    "category": "category_name",
    "comfort_message": "Your personalized comfort message",
    "bible_verse": "The Bible verse text",
    "bible_reference": "Book Chapter:Verse"
}}"""

    # Cap total LLM time well under the proxy's 120s read timeout so a Gemini brownout
    # can never hang the request to a 504 (which the client would retry, duplicating the
    # prayer). On timeout the hardcoded comfort_message/verse fallback below applies and
    # the submission still succeeds.
    try:
        llm_response, error = await asyncio.wait_for(
            generate_llm_response(
                f"Prayer request from user:\n\n\"{prayer_data.content}\"",
                system_prompt,
                user_id,
            ),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        llm_response, error = None, "LLM timeout"

    # Parse LLM response or use fallbacks
    category = "prayer"
    comfort_message = "Your prayer has been received with love. God hears every prayer and holds you close to His heart."
    bible_verse = "The Lord is near to the brokenhearted and saves the crushed in spirit."
    bible_reference = "Psalm 34:18"

    if error:
        logger.error(f"LLM comfort message generation failed: {error}")

    if llm_response:
        logger.info(f"LLM raw response (first 500 chars): {llm_response[:500]}")
        parsed = parse_llm_json(llm_response)
        if parsed:
            category = parsed.get("category", category)
            comfort_message = parsed.get("comfort_message", comfort_message)
            bible_verse = parsed.get("bible_verse", bible_verse)
            bible_reference = parsed.get("bible_reference", bible_reference)
        else:
            logger.error(f"Failed to parse LLM JSON response for prayer comfort message")
    
    # All prayers go to admin as "pending" - admin will manually assign to partners
    prayer_doc = {
        "_id": prayer_id,
        "user_id": user_id,
        "user_name": current_user["name"] if not prayer_data.is_anonymous else None,
        "user_email": current_user["email"] if not prayer_data.is_anonymous else None,
        "content": prayer_data.content,
        "is_anonymous": prayer_data.is_anonymous,
        "location_city": prayer_data.location_city,
        "location_country": prayer_data.location_country,
        "location_lat": prayer_data.location_lat,
        "location_lon": prayer_data.location_lon,
        "category": category,
        "comfort_message": comfort_message,
        "bible_verse": bible_verse,
        "bible_reference": bible_reference,
        "assigned_cell_id": None,
        "assigned_cell_name": None,
        "assigned_partner_id": None,
        "assigned_partner_name": None,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc),
        "assigned_at": None,
    }

    await repos.prayer_requests.insert(prayer_doc)

    await log_activity("prayer_submitted", "user", user_id, current_user["name"], "prayer", prayer_id)

    # Send prayer confirmation email (fire-and-forget)
    if current_user.get("email"):
        try:
            email_body = f"""
            <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #121220; color: #fff; border-radius: 16px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <h1 style="color: #C0A062; font-size: 28px; font-weight: 300; letter-spacing: 4px;">Tefillah</h1>
                </div>
                <div style="background: #1a1a2e; padding: 24px; border-radius: 12px; border: 1px solid #2a2a3e;">
                    <h2 style="color: #C0A062; font-size: 18px; margin: 0 0 12px 0;">Your Prayer Has Been Received</h2>
                    <p style="color: #ccc; line-height: 1.6; margin: 0 0 16px 0;">
                        Thank you for sharing your heart with us. Your prayer has been received and will be lifted up by our prayer partners.
                    </p>
                    <div style="background: #121220; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="color: #C0A062; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Category</p>
                        <p style="color: #fff; font-size: 16px; margin: 0;">{category.title()}</p>
                    </div>
                    <div style="background: #121220; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="color: #C0A062; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Words of Comfort</p>
                        <p style="color: #ddd; font-style: italic; line-height: 1.6; margin: 0;">{comfort_message}</p>
                    </div>
                    <div style="background: #121220; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="color: #C0A062; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Scripture</p>
                        <p style="color: #ddd; font-style: italic; line-height: 1.6; margin: 0 0 4px 0;">"{bible_verse}"</p>
                        <p style="color: #C0A062; font-size: 14px; margin: 0;">— {bible_reference}</p>
                    </div>
                </div>
                <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">
                    You can revisit your prayers anytime in the Prayer History section of the app.
                </p>
            </div>
            """
            background_tasks.add_task(
                send_email,
                current_user["email"],
                f"Your Prayer Has Been Received — {category.title()}",
                email_body,
            )
        except Exception as e:
            logger.error(f"Failed to queue prayer confirmation email: {e}")

    return ComfortResponse(
        message="Prayer submitted successfully",
        prayer_id=prayer_id,
        category=category,
        comfort_message=comfort_message,
        bible_verse=bible_verse,
        bible_reference=bible_reference,
    )

@api_router.post("/prayer/guest-submit", response_model=ComfortResponse)
async def submit_guest_prayer(prayer_data: PrayerRequestCreate, request: Request):
    client_ip = get_client_ip(request)
    if not check_rate_limit("__global_llm__", GLOBAL_LLM_RATE_LIMIT):
        raise HTTPException(status_code=429, detail="The service is busy right now. Please try again in a moment.")
    if not check_rate_limit(f"guest_prayer:{client_ip}", 3):
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")
    
    prayer_id = str(uuid.uuid4())
    
    # Generate comfort message using LLM
    lang_map = {"en": "English", "hi": "Hindi", "te": "Telugu"}
    response_language = lang_map.get(prayer_data.language or "en", "English")
    lang_instruction = f"\nIMPORTANT: Write the comfort_message and bible_verse in {response_language}. The category and bible_reference should remain in English." if (prayer_data.language or "en") != "en" else ""

    system_prompt = f"""You are a deeply compassionate Christian spiritual companion responding to a real person sharing a raw, personal prayer request.

Read the request carefully and pick up on:
- The specific situation (illness, job loss, family conflict, fear, gratitude, grief, etc.)
- Who is involved (names, relationships — reference them gently if mentioned)
- The underlying emotion (fear, shame, hope, exhaustion, doubt, joy)
- The tone (quiet sadness vs desperate vs hopeful vs thankful)

Then respond with:
1. category: ONE of [health, family, finance, spiritual, relationship, work, grief, gratitude, other]
2. comfort_message: 2-3 sentences, warm and personal, that:
   - Acknowledge the *specific* thing they shared — not a generic "I'm sorry you're going through a hard time"
   - Speak to their actual emotion, not a template
   - Offer gentle hope rooted in God's nearness, not religious platitudes
   - Feel like a trusted friend who prays — not a sermon or a greeting card
   - NEVER start with "Dear child" or similar generic openers
3. bible_verse + bible_reference: A verse that genuinely fits THIS situation.
   - Vary the verses — do not default to Psalm 34:18, Jeremiah 29:11, or Philippians 4:6 unless they are the most fitting match.{lang_instruction}

CRITICAL: Do NOT be generic. Every response should feel like it was written for *this* person's *this* situation.

Respond ONLY in this exact JSON format (no markdown, no code fences, no extra text):
{{
    "category": "category_name",
    "comfort_message": "message",
    "bible_verse": "verse text",
    "bible_reference": "Book Chapter:Verse"
}}"""

    try:
        llm_response, error = await asyncio.wait_for(
            generate_llm_response(
                f"Prayer request from guest user:\n\n\"{prayer_data.content}\"",
                system_prompt,
            ),
            timeout=25.0,
        )
    except asyncio.TimeoutError:
        llm_response, error = None, "LLM timeout"

    category = "prayer"
    comfort_message = "Your prayer has been received. God hears every prayer and holds you in His loving care."
    bible_verse = "Cast all your anxiety on Him because He cares for you."
    bible_reference = "1 Peter 5:7"

    if error:
        logger.error(f"LLM guest comfort message generation failed: {error}")

    if llm_response:
        logger.info(f"LLM guest raw response (first 500 chars): {llm_response[:500]}")
        parsed = parse_llm_json(llm_response)
        if parsed:
            category = parsed.get("category", category)
            comfort_message = parsed.get("comfort_message", comfort_message)
            bible_verse = parsed.get("bible_verse", bible_verse)
            bible_reference = parsed.get("bible_reference", bible_reference)
        else:
            logger.error(f"Failed to parse LLM JSON response for guest prayer comfort message")
    
    # Create prayer request
    prayer_doc = {
        "_id": prayer_id,
        "user_id": None,
        "content": prayer_data.content,
        "is_anonymous": True,
        "location_city": prayer_data.location_city,
        "location_country": prayer_data.location_country,
        "location_lat": prayer_data.location_lat,
        "location_lon": prayer_data.location_lon,
        "category": category,
        "comfort_message": comfort_message,
        "bible_verse": bible_verse,
        "bible_reference": bible_reference,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc),
    }
    
    await repos.prayer_requests.insert(prayer_doc)
    
    return ComfortResponse(
        message="Prayer submitted successfully",
        prayer_id=prayer_id,
        category=category,
        comfort_message=comfort_message,
        bible_verse=bible_verse,
        bible_reference=bible_reference,
    )

@api_router.get("/prayer/history", response_model=List[PrayerRequestResponse])
async def get_prayer_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    skip = (page - 1) * limit
    rows = await repos.prayer_requests.list_for_user(
        current_user["_id"], skip=skip, limit=limit
    )

    prayers = []
    for prayer in rows:
        try:
            prayers.append(PrayerRequestResponse(
                id=prayer["_id"],
                user_id=prayer.get("user_id"),
                user_name=prayer.get("user_name"),
                content=prayer.get("content", ""),
                is_anonymous=prayer.get("is_anonymous", False),
                location_city=prayer.get("location_city"),
                location_country=prayer.get("location_country"),
                category=prayer.get("category"),
                comfort_message=prayer.get("comfort_message"),
                bible_verse=prayer.get("bible_verse"),
                bible_reference=prayer.get("bible_reference"),
                assigned_cell_id=prayer.get("assigned_cell_id"),
                assigned_cell_name=prayer.get("assigned_cell_name"),
                assigned_partner_id=prayer.get("assigned_partner_id"),
                status=prayer.get("status", "pending"),
                submitted_at=prayer["submitted_at"],
                assigned_at=prayer.get("assigned_at"),
                prayed_at=prayer.get("prayed_at"),
                prayer_duration_minutes=prayer.get("prayer_duration_minutes"),
            ))
        except Exception as e:
            logger.warning(f"Skipping malformed prayer history row {prayer.get('_id')}: {e}")

    return prayers

# ==================== SEED DATA ====================

@api_router.post("/admin/seed-data")
async def seed_database(admin: dict = Depends(get_current_super_admin)):
    """Seed database with sample prayer cells. Super-admin only (VULN-02 / TASK-2)."""
    
    cells = [
        {"name": "Jerusalem Prayer Cell", "location_city": "Jerusalem", "location_country": "Israel", "description": "Prayers from the Holy City"},
        {"name": "New York Prayer Cell", "location_city": "New York", "location_country": "USA", "description": "Serving the Northeast USA"},
        {"name": "London Prayer Cell", "location_city": "London", "location_country": "UK", "description": "Serving the United Kingdom"},
        {"name": "Global Prayer Cell", "location_city": "Global", "location_country": "Worldwide", "description": "International prayer requests"},
    ]
    
    for cell in cells:
        existing = await repos.prayer_cells.get_by_name(cell["name"])
        if not existing:
            await repos.prayer_cells.insert({
                "_id": str(uuid.uuid4()),
                **cell,
                "agent_count": 0,
                "request_count": 0,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
            })
    
    return {"message": "Database seeded successfully"}

# Include router
app.include_router(api_router)

# Startup/shutdown events
async def _purge_limit_stores():
    """Evict stale in-memory rate-limit / lockout entries every 10 min so the
    dicts never grow without bound (bot/scanner traffic adds a key per unique
    IP across ~6 prefixes; nothing removed them before)."""
    while True:
        await asyncio.sleep(600)
        try:
            now = time.time()
            for k in [k for k, v in list(rate_limit_storage.items()) if not v or v[-1] < now - RATE_LIMIT_WINDOW]:
                rate_limit_storage.pop(k, None)
            for k in [k for k, v in list(failed_login_storage.items()) if not v or v[-1] < now - FAILED_LOGIN_WINDOW]:
                failed_login_storage.pop(k, None)
            for k in [k for k, until in list(login_lock_until.items()) if until < now]:
                login_lock_until.pop(k, None)
        except Exception as e:
            logger.warning(f"limit-store purge error: {e}")


@app.on_event("startup")
async def startup_db_client():
    # --- Indexes: every hot query path must be covered so the DB scales with traffic.
    # Idempotent; safe to run on every boot (and in every uvicorn worker).
    await repos.users.ensure_indexes()
    await repos.partners.ensure_indexes()
    await repos.admins.ensure_indexes()
    # prayer_requests — largest, hottest collection (lists always sort by submitted_at desc)
    await repos.prayer_requests.ensure_indexes()
    # analytics / dashboard date filters
    # logs & notifications
    await repos.activity_logs.ensure_indexes()
    await repos.llm_logs.ensure_indexes()
    await repos.notifications.ensure_indexes()
    logger.info("Database indexes ensured")
    # (The old single-field prayer_requests indexes on user_id/assigned_partner_id/status
    #  are now subsumed by the compound prefixes above and may be dropped in Atlas.)
    asyncio.create_task(_purge_limit_stores())

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
