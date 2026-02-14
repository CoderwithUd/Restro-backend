from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs"
OUT_FILE = OUT_DIR / "Restro_SaaS_API_Documentation.pdf"


def heading(text, level=1):
    base = {
        1: ParagraphStyle(
            "H1", fontName="Helvetica-Bold", fontSize=16, leading=20, spaceAfter=8
        ),
        2: ParagraphStyle(
            "H2", fontName="Helvetica-Bold", fontSize=13, leading=16, spaceBefore=6, spaceAfter=6
        ),
        3: ParagraphStyle(
            "H3", fontName="Helvetica-Bold", fontSize=11, leading=14, spaceBefore=4, spaceAfter=4
        ),
    }
    return Paragraph(text, base[level])


def para(text):
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        spaceAfter=4,
    )
    return Paragraph(text, body)


def bullet(text):
    return para(f"- {text}")


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT_FILE),
        pagesize=A4,
        rightMargin=1.8 * cm,
        leftMargin=1.8 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title="Restro Backend SaaS Documentation",
    )
    story = []

    story.append(heading("Restro Backend SaaS Documentation", 1))
    story.append(para(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"))
    story.append(Spacer(1, 8))

    story.append(heading("1. Overview", 2))
    story.append(para("This backend is designed as a multi-tenant restaurant SaaS platform."))
    story.append(bullet("One restaurant = one tenant."))
    story.append(bullet("Owner registration creates user + tenant + owner membership + trial subscription."))
    story.append(bullet("Staff are mapped through role-based memberships."))
    story.append(bullet("Authentication uses access and refresh token cookies with rotating refresh sessions."))

    story.append(heading("2. Roles", 2))
    story.append(para("Supported roles: OWNER, MANAGER, KITCHEN, WAITER"))

    story.append(heading("3. Tenant Resolution Strategy", 2))
    story.append(para("Restaurant tenant is resolved in this priority order:"))
    story.append(bullet("x-tenant-slug header"))
    story.append(bullet("tenantSlug in request body"))
    story.append(bullet("tenantSlug in query params"))
    story.append(bullet("subdomain from hostname (abc.myapp.com -> abc)"))
    story.append(
        para("After login, JWT carries tenantId + role, so same URL can still safely separate restaurant data.")
    )

    story.append(heading("4. Database Design", 2))
    tables = [
        (
            "users",
            [
                ["Field", "Type", "Notes"],
                ["_id", "ObjectId", "Primary key"],
                ["name", "String", "User name"],
                ["email", "String", "Unique, lowercase"],
                ["password", "String", "bcrypt hash, select false"],
                ["isActive", "Boolean", "User status"],
                ["createdAt/updatedAt", "Date", "Timestamps"],
            ],
        ),
        (
            "tenants",
            [
                ["Field", "Type", "Notes"],
                ["_id", "ObjectId", "Primary key"],
                ["name", "String", "Restaurant name"],
                ["slug", "String", "Unique URL-safe id"],
                ["status", "Enum", "ACTIVE/SUSPENDED"],
                ["ownerUserId", "ObjectId", "Ref users._id"],
                ["createdAt/updatedAt", "Date", "Timestamps"],
            ],
        ),
        (
            "memberships",
            [
                ["Field", "Type", "Notes"],
                ["userId", "ObjectId", "Ref users._id"],
                ["tenantId", "ObjectId", "Ref tenants._id"],
                ["role", "Enum", "OWNER/MANAGER/KITCHEN/WAITER"],
                ["isActive", "Boolean", "Membership status"],
            ],
        ),
        (
            "subscriptions",
            [
                ["Field", "Type", "Notes"],
                ["tenantId", "ObjectId", "Unique Ref tenants._id"],
                ["planCode", "String", "TRIAL or paid plan code"],
                ["status", "Enum", "TRIAL/ACTIVE/PAST_DUE/CANCELED/EXPIRED"],
                ["startsAt", "Date", "Subscription start"],
                ["endsAt", "Date", "Subscription end"],
            ],
        ),
        (
            "refreshsessions",
            [
                ["Field", "Type", "Notes"],
                ["_id", "ObjectId", "Session id used as JWT sid"],
                ["userId", "ObjectId", "Ref users._id"],
                ["tenantId", "ObjectId", "Ref tenants._id"],
                ["role", "String", "Role for session scope"],
                ["tokenHash", "String", "sha256(refresh token)"],
                ["expiresAt", "Date", "TTL indexed"],
                ["revokedAt", "Date", "Null unless revoked"],
            ],
        ),
    ]

    for title, data in tables:
        story.append(heading(f"4.x {title}", 3))
        tbl = Table(data, colWidths=[4.5 * cm, 3.5 * cm, 8.2 * cm])
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 6))

    story.append(heading("5. API Endpoints", 2))
    endpoint_data = [
        ["Method", "Path", "Access"],
        ["GET", "/api/health", "Public"],
        ["POST", "/api/auth/register-owner", "Public"],
        ["POST", "/api/auth/register", "Public (alias)"],
        ["POST", "/api/auth/login", "Public"],
        ["POST", "/api/auth/refresh", "Public (cookie required)"],
        ["POST", "/api/auth/logout", "Authenticated session cookie"],
        ["GET", "/api/auth/me", "Authenticated"],
        ["GET", "/api/auth/staff-roles", "Public"],
        ["GET", "/api/tenant/staff", "OWNER or MANAGER + active subscription"],
        ["POST", "/api/tenant/staff", "OWNER or MANAGER + active subscription"],
    ]
    endpoint_table = Table(endpoint_data, colWidths=[2.5 * cm, 7.5 * cm, 6.2 * cm])
    endpoint_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(endpoint_table)
    story.append(Spacer(1, 8))

    story.append(heading("6. Sample Requests", 2))
    story.append(heading("6.1 Register Owner", 3))
    story.append(
        para(
            '{"name":"Uday","email":"uday@example.com","password":"StrongPass123","restaurantName":"Spicy Hub","restaurantSlug":"spicy-hub"}'
        )
    )
    story.append(heading("6.2 Login", 3))
    story.append(
        para(
            '{"email":"waiter@example.com","password":"StrongPass123","role":"WAITER","tenantSlug":"spicy-hub"}'
        )
    )
    story.append(heading("6.3 Create Staff", 3))
    story.append(
        para('{"name":"Ravi","email":"ravi.waiter@example.com","password":"StrongPass123","role":"WAITER"}')
    )

    story.append(heading("7. Environment Variables", 2))
    story.append(bullet("Required: PORT, MONGO_URI (or MONGO_URL), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET"))
    story.append(
        bullet("Optional: ACCESS_TOKEN_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN, COOKIE_SECURE, COOKIE_DOMAIN")
    )

    story.append(heading("8. Production Checklist", 2))
    story.append(bullet("Enable HTTPS and set COOKIE_SECURE=true"))
    story.append(bullet("Store secrets in vault/secret manager"))
    story.append(bullet("Add rate limiting to auth routes"))
    story.append(bullet("Add audit logs and invitation workflow"))
    story.append(bullet("Wire billing webhook to update subscription status"))

    doc.build(story)
    print(str(OUT_FILE))


if __name__ == "__main__":
    build()
