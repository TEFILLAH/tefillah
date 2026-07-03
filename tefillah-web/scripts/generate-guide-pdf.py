"""
Generate the Tefillah Complete System Guide & Hardening Manual as a PDF.

Single-file generator using reportlab Platypus. Designed to be readable by:
  - A curious 12-year-old (lots of analogies, plain language)
  - A non-technical adult (sufficient context but no condescension)
  - Skim-friendly for a technical reader (tables, code blocks, references)
"""

from __future__ import annotations

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import KeepInFrame

OUT_PATH = Path(r"D:/tefilah-fixed/tefilah-fixed/Tefillah-Complete-Guide.pdf")

# --------------------------------------------------------------------------
# Page setup with auto running footer / page numbers
# --------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN_L = 18 * mm
MARGIN_R = 18 * mm
MARGIN_T = 22 * mm
MARGIN_B = 22 * mm

NAVY = colors.HexColor("#1a1a2e")
GOLD = colors.HexColor("#b8941f")
GOLD_LIGHT = colors.HexColor("#f7eccb")
CREAM = colors.HexColor("#fbf7ed")
INK = colors.HexColor("#111111")
SOFT = colors.HexColor("#3d3d4a")
DIM = colors.HexColor("#666677")
RED = colors.HexColor("#b91c1c")
RED_BG = colors.HexColor("#fdecec")
GREEN_BG = colors.HexColor("#e8f5ec")
GREEN = colors.HexColor("#1f7a3a")
BLUE_BG = colors.HexColor("#eaf2fb")
BLUE = colors.HexColor("#1d4ed8")
BORDER = colors.HexColor("#dad6c8")


def draw_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(DIM)
    # Footer line
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.4)
    canvas.line(MARGIN_L, 14 * mm, PAGE_W - MARGIN_R, 14 * mm)
    canvas.drawString(MARGIN_L, 9 * mm, "Tefillah - Complete System Guide & Hardening Manual")
    canvas.drawRightString(PAGE_W - MARGIN_R, 9 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def make_doc(path: Path):
    doc = BaseDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title="Tefillah - Complete System Guide & Hardening Manual",
        author="Built for the Tefillah team",
    )
    frame = Frame(
        MARGIN_L, MARGIN_B, PAGE_W - MARGIN_L - MARGIN_R, PAGE_H - MARGIN_T - MARGIN_B,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )
    doc.addPageTemplates(
        [
            PageTemplate(id="body", frames=[frame], onPage=draw_footer),
        ]
    )
    return doc


# --------------------------------------------------------------------------
# Paragraph styles
# --------------------------------------------------------------------------
styles = getSampleStyleSheet()

TITLE = ParagraphStyle(
    "TitleBig",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=30,
    leading=36,
    textColor=NAVY,
    alignment=TA_CENTER,
    spaceAfter=10,
)
SUBTITLE = ParagraphStyle(
    "Subtitle",
    parent=styles["Title"],
    fontName="Helvetica",
    fontSize=14,
    leading=18,
    textColor=GOLD,
    alignment=TA_CENTER,
    spaceAfter=10,
)
COVER_NOTE = ParagraphStyle(
    "CoverNote",
    parent=styles["Normal"],
    fontName="Helvetica-Oblique",
    fontSize=11,
    leading=15,
    textColor=SOFT,
    alignment=TA_CENTER,
    spaceAfter=4,
)

H1 = ParagraphStyle(
    "H1",
    parent=styles["Heading1"],
    fontName="Helvetica-Bold",
    fontSize=20,
    leading=26,
    textColor=NAVY,
    spaceBefore=12,
    spaceAfter=8,
)
H2 = ParagraphStyle(
    "H2",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=NAVY,
    spaceBefore=10,
    spaceAfter=4,
)
H3 = ParagraphStyle(
    "H3",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=11.5,
    leading=15,
    textColor=GOLD,
    spaceBefore=8,
    spaceAfter=3,
)

BODY = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=INK,
    alignment=TA_JUSTIFY,
    spaceAfter=6,
)
BODY_LEFT = ParagraphStyle(
    "BodyLeft",
    parent=BODY,
    alignment=TA_LEFT,
)
BULLET = ParagraphStyle(
    "Bullet",
    parent=BODY,
    leftIndent=18,
    bulletIndent=6,
    bulletFontName="Helvetica",
    bulletFontSize=10,
    spaceAfter=3,
)
KIDS_NOTE = ParagraphStyle(
    "KidsNote",
    parent=BODY,
    fontName="Helvetica",
    fontSize=10.5,
    leading=15,
    textColor=INK,
    leftIndent=0,
    rightIndent=0,
    alignment=TA_LEFT,
)
ADULT_NOTE = ParagraphStyle(
    "AdultNote",
    parent=KIDS_NOTE,
)
WARN_TITLE = ParagraphStyle(
    "WarnTitle",
    parent=H3,
    textColor=RED,
    spaceAfter=2,
)
GOOD_TITLE = ParagraphStyle(
    "GoodTitle",
    parent=H3,
    textColor=GREEN,
    spaceAfter=2,
)
NOTE_TITLE = ParagraphStyle(
    "NoteTitle",
    parent=H3,
    textColor=BLUE,
    spaceAfter=2,
)
CAPTION = ParagraphStyle(
    "Caption",
    parent=BODY,
    fontSize=9,
    leading=12,
    textColor=DIM,
    alignment=TA_CENTER,
)
CODE = ParagraphStyle(
    "Code",
    parent=styles["Code"],
    fontName="Courier",
    fontSize=9,
    leading=11.5,
    textColor=INK,
    backColor=colors.HexColor("#f3eedf"),
    borderColor=BORDER,
    borderWidth=0.5,
    borderPadding=6,
    leftIndent=0,
    rightIndent=0,
    spaceBefore=4,
    spaceAfter=8,
)
TOC_ITEM = ParagraphStyle(
    "TocItem",
    parent=BODY,
    fontSize=11,
    leading=15,
    leftIndent=18,
    spaceAfter=2,
    alignment=TA_LEFT,
)
TOC_PART = ParagraphStyle(
    "TocPart",
    parent=H3,
    fontSize=12,
    leading=16,
    textColor=NAVY,
    spaceBefore=8,
    spaceAfter=4,
    leftIndent=0,
)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def p(text: str, style=BODY):
    return Paragraph(text, style)


def bullets(items: list[str], style=BULLET, bullet_char="-"):
    out = []
    for item in items:
        out.append(Paragraph(item, style, bulletText=bullet_char))
    return out


def code_block(text: str):
    safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    safe = safe.replace("\n", "<br/>")
    return Paragraph(f"<font face='Courier' size='9'>{safe}</font>", CODE)


def hr():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceBefore=4, spaceAfter=6)


def callout(title: str, body, kind: str = "kids"):
    """Coloured callout box.

    kind: 'kids' (gold), 'adult' (blue), 'warn' (red), 'good' (green).
    """
    bg_map = {
        "kids": CREAM, "adult": BLUE_BG, "warn": RED_BG, "good": GREEN_BG,
    }
    border_map = {
        "kids": GOLD, "adult": BLUE, "warn": RED, "good": GREEN,
    }
    title_style = {
        "kids": ParagraphStyle("KT", parent=H3, textColor=GOLD, spaceAfter=2),
        "adult": NOTE_TITLE,
        "warn": WARN_TITLE,
        "good": GOOD_TITLE,
    }[kind]

    if isinstance(body, str):
        body_flowable = Paragraph(body, BODY_LEFT)
    elif isinstance(body, list):
        body_flowable = body
    else:
        body_flowable = body

    inner = [Paragraph(title, title_style)]
    if isinstance(body_flowable, list):
        inner.extend(body_flowable)
    else:
        inner.append(body_flowable)

    tbl = Table([[inner]], colWidths=[PAGE_W - MARGIN_L - MARGIN_R])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg_map[kind]),
        ("BOX", (0, 0), (-1, -1), 0.8, border_map[kind]),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether(tbl)


def service_table(rows: list[list[str]], col_widths=None):
    headers = rows[0]
    data = [[Paragraph(c, ParagraphStyle("h", parent=BODY, fontName="Helvetica-Bold", fontSize=10, textColor=colors.white, alignment=TA_LEFT, leading=12)) for c in headers]]
    cell_style = ParagraphStyle("cell", parent=BODY, fontSize=9.5, leading=12, alignment=TA_LEFT)
    for r in rows[1:]:
        data.append([Paragraph(c, cell_style) for c in r])
    n_cols = len(headers)
    if col_widths is None:
        col_widths = [(PAGE_W - MARGIN_L - MARGIN_R) / n_cols] * n_cols
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


def diagram_box(lines: list[str], caption: str | None = None):
    safe = "<br/>".join(
        l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
        for l in lines
    )
    para = Paragraph(f"<font face='Courier' size='9'>{safe}</font>",
                     ParagraphStyle("dia", fontName="Courier", fontSize=9, leading=12,
                                    textColor=NAVY, leftIndent=0, alignment=TA_LEFT))
    tbl = Table([[para]], colWidths=[PAGE_W - MARGIN_L - MARGIN_R])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    out = [tbl]
    if caption:
        out += [Spacer(1, 4), p("Figure: " + caption, CAPTION)]
    return KeepTogether(out)


# --------------------------------------------------------------------------
# Story (content) — built section by section to keep readable
# --------------------------------------------------------------------------
def build_story() -> list:
    s: list = []

    # ----- COVER PAGE -----
    s.append(Spacer(1, 60))
    s.append(p("TEFILLAH", TITLE))
    s.append(p("Complete System Guide and Hardening Manual", SUBTITLE))
    s.append(Spacer(1, 12))
    s.append(p("A walkthrough of the entire system from the inside out, written so a curious 12-year-old can follow it and a non-technical adult can rely on it. Plus a security hardening roadmap.", COVER_NOTE))
    s.append(Spacer(1, 30))

    cover_table = Table(
        [[
            [p("<b>Audience</b>", H3), p("Curious 12-year-old, non-technical adult, future engineers maintaining this system.", BODY_LEFT)],
            [p("<b>Version</b>", H3), p("v1.0 - written the day tefillah.in went live on AWS.", BODY_LEFT)],
        ]],
        colWidths=[(PAGE_W - MARGIN_L - MARGIN_R) / 2 - 6] * 2,
    )
    cover_table.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, BORDER),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    s.append(cover_table)
    s.append(Spacer(1, 40))

    s.append(p("Read with patience. Each chapter starts with a story for a child, then unfolds into what an engineer needs to know. Skip whichever part already feels obvious.", CAPTION))
    s.append(PageBreak())

    # ----- TABLE OF CONTENTS -----
    s.append(p("Table of Contents", H1))
    s.append(hr())
    toc = [
        ("Part 1", "What Tefillah Is", "3"),
        ("Part 2", "The Pieces, Explained Simply", "5"),
        ("   Chapter 1", "The Mobile App", "5"),
        ("   Chapter 2", "The New Web App (tefillah.in)", "6"),
        ("   Chapter 3", "The Admin Panel", "8"),
        ("   Chapter 4", "The Backend Brain", "9"),
        ("   Chapter 5", "The Database (MongoDB)", "11"),
        ("   Chapter 6", "The Address Book (DNS)", "12"),
        ("   Chapter 7", "All the Helpers (Email, Auth, etc.)", "14"),
        ("Part 3", "How a Prayer Travels (Request Flow)", "16"),
        ("Part 4", "The Tools and Services Inventory", "18"),
        ("Part 5", "The AWS Deploy We Performed Today", "21"),
        ("Part 6", "Security Hardening Roadmap", "25"),
        ("   6.1", "Honest Framing of 'Non-hackable'", "25"),
        ("   6.2", "Do TODAY (critical)", "26"),
        ("   6.3", "Do this WEEK (high priority)", "28"),
        ("   6.4", "Do this QUARTER (defence in depth)", "30"),
        ("   6.5", "Cost Summary", "32"),
        ("Part 7", "Operations and Maintenance", "33"),
        ("Part 8", "Glossary", "35"),
    ]
    for part, name, page in toc:
        is_chapter = part.strip().startswith("Chapter") or part.strip().startswith("6.")
        style = TOC_ITEM if is_chapter else TOC_PART
        leader = "." * max(2, 70 - len(part) - len(name))
        line = f"<b>{part}</b>&nbsp;&nbsp;{name}&nbsp;<font color='#999999'>{leader}</font>&nbsp;<b>{page}</b>"
        s.append(p(line, style))
    s.append(PageBreak())

    # ===================================================================
    # PART 1
    # ===================================================================
    s.append(p("Part 1 - What Tefillah Is", H1))
    s.append(hr())

    s.append(callout(
        "Story for a 12-year-old",
        "Imagine a quiet church where anyone in the world can drop a folded note into a wooden box. "
        "A volunteer reads each note, prays over it, and leaves a small scripture verse on the windowsill in return. "
        "Tefillah is that church, but it lives on the internet. The wooden box is a phone app and a website. "
        "The volunteers are real people who signed up to be 'prayer partners.' The scripture verse comes back to "
        "the person who wrote the note. That's it.",
        kind="kids",
    ))
    s.append(Spacer(1, 6))
    s.append(callout(
        "For the grown-up",
        "Tefillah is a multi-tenant prayer-request platform with three client surfaces (iOS/Android via Expo, a "
        "responsive web app, and an operator admin panel) sharing one FastAPI backend on AWS Elastic Beanstalk, a "
        "MongoDB Atlas database, and several third-party services for email, identity, and language generation. "
        "Users submit prayers; the system routes them to vetted partner volunteers based on region; partners "
        "acknowledge each prayer; the user receives a scripture verse in response.",
        kind="adult",
    ))

    s.append(p("Two kinds of people use the app:", H3))
    s += bullets([
        "<b>Users</b> - any person who wants to submit a prayer, read scripture daily, or look back at their own prayer history.",
        "<b>Prayer Partners</b> - vetted volunteers who receive prayer requests, pray over them, and mark them complete. The admin must approve a partner before they can receive requests.",
        "<b>Admins</b> - the people who run the platform (you). They use the admin panel to onboard partners, watch usage, and handle reports.",
    ])

    s.append(p("Three places the same software lives:", H3))
    s += bullets([
        "<b>Mobile app</b> for phones (will be in the Apple App Store and Google Play once you publish).",
        "<b>tefillah.in</b> for desktop and mobile browsers - this is the one we shipped today.",
        "<b>admin.tefillah.in</b> for operators - same code style as tefillah.in but with admin-only features.",
    ])
    s.append(p("All three talk to the <i>same backend</i> at <b>api.tefillah.in</b>. So when a user submits a prayer from their iPhone, the admin sees it instantly in the panel. There is one source of truth.", BODY))
    s.append(PageBreak())

    # ===================================================================
    # PART 2 - The Pieces
    # ===================================================================
    s.append(p("Part 2 - The Pieces, Explained Simply", H1))
    s.append(hr())

    s.append(diagram_box([
        "        [phone app]   [tefillah.in]   [admin.tefillah.in]",
        "             \\           |               /",
        "              \\          |              /",
        "               \\_________V_____________/",
        "                         |",
        "                  api.tefillah.in       <-- the brain",
        "                  (FastAPI, Python)",
        "                         |",
        "                  MongoDB Atlas         <-- the memory",
        "                  (database)",
        "                         |",
        "          +--------+-----+------+-------+",
        "          |        |            |       |",
        "       Resend   Firebase    Amazon SES  LLM",
        "       (email)  (login)     (email)     (verse generator)",
    ], caption="The whole system on one page. Everything routes through the backend."))

    s.append(p("Chapter 1 - The Mobile App", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "The mobile app is like a small magical notebook in your pocket. You open it, write a prayer, and tap a "
        "button. The notebook quietly sends the prayer out into the world to find a partner who can pray for you. "
        "Then it shows you a scripture verse. The notebook also remembers every prayer you ever wrote in it, "
        "and lights up softly when someone has prayed over one of them.",
        kind="kids",
    ))
    s.append(p("Where the code lives:", H3))
    s += bullets([
        "<b>frontend/</b> in the project repository.",
        "Built with <b>Expo</b> (a framework on top of React Native) so the same JavaScript code becomes a real iOS app and a real Android app.",
        "Screens are organised by folder: <b>(auth)/</b> for sign-in flows, <b>(main)/</b> for the after-login user experience, <b>(partner)/</b> for the partner dashboard.",
    ])
    s.append(p("What it stores on the phone:", H3))
    s += bullets([
        "The login token (called a JWT - a small encoded string proving who you are) is stored in <b>expo-secure-store</b>, which is the phone's keychain on iOS and Keystore on Android. The app cannot share this with another app.",
        "Language preference and theme choice in regular storage.",
        "Nothing else. All real data lives on the server.",
    ])
    s.append(p("Notable libraries:", H3))
    s += bullets([
        "<b>axios</b> - sends HTTP requests to the backend",
        "<b>zustand</b> - small state management library (keeps track of who is logged in)",
        "<b>expo-router</b> - turns files into navigable screens, like Next.js but for mobile",
        "<b>expo-notifications</b> - lets the app receive push notifications when a partner has prayed for you",
        "<b>i18next</b> + <b>react-i18next</b> - supports multiple languages",
        "<b>firebase</b> - allows 'sign in with Google'",
    ])

    s.append(p("Chapter 2 - The New Web App (tefillah.in)", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "Imagine the church has a website now. The website looks elegant - cream and gold like the inside of an "
        "old book - and works exactly like the mobile app. You can sign up, write a prayer, see your history, "
        "everything. It looks classic but feels modern. You can use it on a phone browser too. It is fast because "
        "it lives on hundreds of servers across the world, and your computer talks to the closest one.",
        kind="kids",
    ))
    s.append(p("Where the code lives:", H3))
    s += bullets([
        "<b>tefillah-web/</b> in the project repository.",
        "Built with <b>Vite</b> (a fast build tool) + <b>React 19</b> + <b>TypeScript</b>.",
        "Styled with <b>Tailwind CSS v4</b> (utility classes like text-2xl, mt-4, bg-gray-900).",
        "Pages live under <b>tefillah-web/src/pages/</b>. There are 18 pages.",
    ])

    s.append(p("Pages in the web app:", H3))
    s.append(service_table([
        ["Public pages", "Auth/recovery pages", "User-only (after login)", "Partner-only"],
        ["LandingPage (the gold-on-cream hero)", "LoginPage", "HomePage (verse + quick actions)", "PartnerDashboardPage"],
        ["PrivacyPage", "SignupPage", "PrayerPage (submit form)", ""],
        ["TermsPage", "VerifyPage (6-digit OTP)", "ConfirmationPage (post-submit thank-you)", ""],
        ["NotFoundPage (gentle 404)", "ForgotPasswordPage / Reset", "HistoryPage (timeline of prayers)", ""],
        ["PartnerLoginPage", "ChangePasswordPage", "MenuPage (settings, sign out)", ""],
        ["PartnerSignupPage", "", "NotificationsPage", ""],
    ], col_widths=[(PAGE_W - MARGIN_L - MARGIN_R) / 4] * 4))

    s.append(p("How it loads from the user's perspective:", H3))
    s += bullets([
        "Browser requests https://tefillah.in/.",
        "DNS (Route 53) returns CloudFront edge IP.",
        "CloudFront serves <b>index.html</b> (about 1.3 KB).",
        "Browser reads the script tag, fetches the main JavaScript bundle (about 110 KB gzipped). CloudFront serves it from its cache, immutable for one year.",
        "JavaScript boots, React renders the landing page, and the page fetches a daily verse from <b>api.tefillah.in</b>.",
        "When the user clicks 'Sign in', React Router shows the LoginPage. No new page load - the URL changes but the same JavaScript handles it. That's what 'SPA' means - Single Page Application.",
    ])

    s.append(p("The breathing logo (a nice detail):", H3))
    s.append(p("The flame icon at the top is the Ionicons 'flame' SVG, with two extra concentric circles behind it. "
                "Each layer breathes on its own CSS animation timeline: the outer circle slowly expands and dims; "
                "the inner circle pulses opacity; the flame gently scales up and down. The combined effect is "
                "that the logo visibly 'luminates' but never feels jittery.", BODY))

    s.append(p("Chapter 3 - The Admin Panel", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "The admin panel is the private back-office where you, the operator, can see everyone using the church. "
        "You can approve new partners, look at the prayers that have been submitted (only when investigating a "
        "problem - normal operations don't read prayers), see who is currently online, and watch numbers grow.",
        kind="kids",
    ))
    s += bullets([
        "Lives in <b>admin-panel/</b> in the repository. Same tech stack as tefillah-web: Vite + React + TypeScript + Tailwind.",
        "Hosted on <b>Cloudflare Pages</b> at the address <b>tefillah-admin.pages.dev</b>. (Not on AWS - this is a leftover from before today's migration. It still works because DNS for admin.tefillah.in is just a CNAME pointing at Cloudflare Pages.)",
        "Talks to the same <b>api.tefillah.in</b> backend, but uses admin-only endpoints under <b>/api/admin/*</b>. Those endpoints require a valid admin JWT and refuse anyone else.",
    ])
    s.append(p("Pages in the admin panel: Dashboard, Users, Partners, Prayers, Analytics, Calendar, Admins, Audit Logs, Notifications.", BODY))

    s.append(p("Chapter 4 - The Backend Brain", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "The brain is a Python program that listens for messages from the phone apps and websites all day long. "
        "Every time someone signs up, sends a prayer, asks for a verse, or logs in, the brain reads the message, "
        "checks if it's allowed, talks to the database, sometimes asks a friend (the verse generator, the email "
        "sender) for help, and sends an answer back. It is one big Python file: <b>server.py</b>.",
        kind="kids",
    ))
    s.append(p("The technical stack:", H3))
    s.append(service_table([
        ["Component", "What it does"],
        ["<b>FastAPI</b> (Python 3.12)", "The web framework. Defines all the URL endpoints and their inputs/outputs."],
        ["<b>Uvicorn</b>", "The actual HTTP server that runs the FastAPI code. Listens on port 8000."],
        ["<b>Motor</b>", "Async driver for MongoDB - allows the backend to talk to the database without blocking other requests."],
        ["<b>Pydantic</b>", "Validates that incoming JSON has the right shape. If someone sends bad data, FastAPI rejects with a 422 automatically."],
        ["<b>PyJWT</b>", "Issues and verifies the JSON Web Tokens (login proofs)."],
        ["<b>bcrypt / passlib</b>", "Hashes passwords. The database NEVER stores a plaintext password."],
        ["<b>firebase-admin</b>", "Verifies Google sign-in tokens from the mobile app."],
        ["<b>Resend SDK</b>", "Sends transactional email (signup confirmations, password resets)."],
        ["<b>httpx / requests</b>", "Used to call third-party APIs from inside the backend (the LLM, payment gateways if added)."],
        ["<b>python-dotenv</b>", "Loads secrets from <b>.env</b> in development. In production these come from EB environment variables."],
    ], col_widths=[120, PAGE_W - MARGIN_L - MARGIN_R - 120]))

    s.append(p("Where it runs:", H3))
    s += bullets([
        "AWS <b>Elastic Beanstalk</b> in the <b>ap-south-1</b> region (Mumbai). EB is Amazon's 'I'll run a web app for you' service: you upload a zip, EB installs dependencies, starts the server, and puts it behind a load balancer.",
        "The custom domain <b>api.tefillah.in</b> is a CNAME to the EB load balancer.",
        "Logs are visible in the EB web console under 'Logs'.",
    ])

    s.append(p("Endpoints, grouped by family:", H3))
    s.append(service_table([
        ["URL group", "Example endpoints", "Purpose"],
        ["/api/auth/*", "register, login, verify-email, forgot-password, reset-password, change-password, me, social", "User identity and account lifecycle"],
        ["/api/prayer/*", "submit, guest-submit, history", "Prayer submission and reading history"],
        ["/api/partner/*", "register, login, stats, requests, requests/{id}/mark-prayed, profile", "Partner onboarding and workflow"],
        ["/api/user/*", "notifications, notifications/{id}/read, read-all, register-device", "Notification inbox and push-token registration"],
        ["/api/admin/*", "dashboard, users, partners, prayers, analytics, audit-logs", "Admin panel"],
        ["/api/verse/generate", "(public, query param: language)", "Calls the LLM to produce a daily verse. Falls back to fixed verses if LLM fails."],
        ["/api/health", "(public)", "Returns 200 OK. Used by monitors and load balancers."],
    ], col_widths=[80, 220, PAGE_W - MARGIN_L - MARGIN_R - 300]))

    s.append(p("Chapter 5 - The Database (MongoDB)", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "The database is the brain's memory. It is a giant shelf of folders. Every time someone signs up, a new "
        "folder appears in the 'users' drawer. Every time someone writes a prayer, a folder appears in the "
        "'prayers' drawer. The brain can open any folder by name and read what's inside. The database itself "
        "lives on a different company's computers (MongoDB Atlas) - not on your AWS account.",
        kind="kids",
    ))
    s.append(p("The eight collections (think of them as drawers or tables):", H3))
    s.append(service_table([
        ["Collection", "What's in it"],
        ["users", "Every user account: name, email (lowercased), bcrypt password hash, phone, city, is_verified, created_at."],
        ["partners", "Every partner: same as users plus organization, partner_type, cell_id, total_prayer_time_minutes, prayers_handled, last_active (for the 'Online Now' counter)."],
        ["prayers", "Every prayer ever submitted: content, category, status (pending, assigned, prayed), assigned partner id, returned bible verse, comfort message, created_at."],
        ["notifications", "Per-user/partner inbox of short messages and pings."],
        ["admin", "Admin user accounts (separate from regular users for safety)."],
        ["email_verifications", "Short-lived 6-digit OTP codes for email confirmation. Auto-expire."],
        ["password_resets", "Short-lived 6-digit codes for password recovery. Auto-expire."],
        ["rate_limits", "Per-email throttling state. E.g. 'no more than 3 password reset attempts per hour'."],
    ], col_widths=[110, PAGE_W - MARGIN_L - MARGIN_R - 110]))
    s.append(p("Why MongoDB and not SQL? - The data shapes vary (a prayer has different fields from a notification), and we don't do complex joins, so a document database is the simpler fit. The trade-off is that you cannot run easy 'SELECT name, count(*) FROM users JOIN prayers' style queries; you have to think in aggregation pipelines.", BODY))

    s.append(p("Chapter 6 - The Address Book (DNS)", H2))
    s.append(callout(
        "Story for a 12-year-old",
        "The internet is like a giant city. Every website has a number address (an IP address) like 192.168.1.1. "
        "Humans hate numbers, so we use names like tefillah.in. The DNS is the giant phonebook that turns names "
        "into numbers. When you type tefillah.in in a browser, the browser secretly asks the phonebook 'what's the "
        "number?' and only then knocks on the door. The phonebook for tefillah.in lives in AWS Route 53 now. "
        "Before today, it lived at Cloudflare.",
        kind="kids",
    ))

    s.append(p("The full picture today:", H3))
    s.append(diagram_box([
        "  Visitor's computer asks: 'where is tefillah.in?'",
        "                           |",
        "                           V",
        "  ISP resolver --> root DNS --> .in TLD --> 'ask Route 53'",
        "                           |",
        "                           V",
        "  Route 53 hosted zone (Z06246302MVTLD5P84FBW)",
        "       returns the right answer for the right name:",
        "",
        "    tefillah.in      A ALIAS   -> CloudFront edge",
        "    www.tefillah.in  A ALIAS   -> CloudFront edge",
        "    api.tefillah.in  CNAME     -> EB load balancer",
        "    admin.tefillah.in CNAME    -> tefillah-admin.pages.dev",
        "    MX records                 -> Cloudflare Email Routing",
        "    TXT records                -> SPF, DKIM, DMARC",
    ], caption="Route 53 is the new authoritative answer-keeper for tefillah.in."))

    s.append(p("Why the apex uses an ALIAS and not a CNAME:", H3))
    s.append(p("DNS rules forbid CNAME at the apex (the root domain, with no subdomain). Route 53 offers a "
                "non-standard 'ALIAS' record that behaves like a CNAME but is allowed at the apex. It also has no "
                "extra DNS lookup cost. This is one of the small reasons people pick Route 53 over generic DNS "
                "providers for AWS deployments.", BODY))

    s.append(p("Chapter 7 - All the Helpers (Email, Auth, etc.)", H2))
    s.append(p("The backend talks to several outside services. Each one does one job well. None of them sees your user's password.", BODY))
    s.append(service_table([
        ["Service", "What it does", "How it talks to us"],
        ["<b>Resend</b>", "Sends emails the backend wants to send out (verify your email, reset password).", "Backend POSTs to api.resend.com with our API key in the Authorization header."],
        ["<b>Amazon SES</b>", "Alternative outbound email path. The DNS has SPF/DKIM records pointing at SES, so SES email passes spam checks.", "Backend uses the AWS SDK with the IAM user's keys."],
        ["<b>Firebase</b>", "Lets users 'Sign in with Google'. Firebase verifies the Google identity and returns a token; our backend trusts Firebase to confirm 'yes, this is really suraj@gmail.com.'", "Mobile app uses the Firebase client SDK; backend uses firebase-admin to verify the token signature."],
        ["<b>LLM provider</b>", "Generates the daily verse and comfort messages.", "Backend POSTs the prayer text and asks for a relevant verse. The response is returned to the app. Fall-back static verses kick in if the LLM is down."],
        ["<b>Cloudflare Email Routing</b>", "Receives email sent TO @tefillah.in addresses. Configured to forward to a chosen inbox.", "Email servers around the world deliver to Cloudflare's MX servers; Cloudflare looks up the routing rule for the recipient."],
    ], col_widths=[90, 220, PAGE_W - MARGIN_L - MARGIN_R - 310]))
    s.append(PageBreak())

    # ===================================================================
    # PART 3 - Request flow
    # ===================================================================
    s.append(p("Part 3 - How a Prayer Travels (Request Flow)", H1))
    s.append(hr())

    s.append(callout(
        "Story for a 12-year-old",
        "Let's follow Mary as she submits a prayer for her grandmother. Mary opens tefillah.in on her laptop. "
        "She types her prayer and clicks 'Lift this prayer.' Now imagine that prayer is a tiny letter being "
        "passed through a long chain of helpers. We're going to follow the letter from Mary's keyboard all the "
        "way to the database, and back.",
        kind="kids",
    ))

    s.append(p("Step by step (~10 hops):", H3))
    s.append(diagram_box([
        " 1. Mary's browser puts her prayer text in a JSON object, attaches her",
        "    login JWT (from localStorage), and sends POST to",
        "    https://api.tefillah.in/api/prayer/submit",
        "",
        " 2. Her ISP's DNS asks Route 53 for api.tefillah.in. R53 returns the",
        "    EB load balancer hostname.",
        "",
        " 3. Browser opens TLS to the EB load balancer. TLS is the lock that",
        "    encrypts everything between Mary and the server.",
        "",
        " 4. EB load balancer picks a healthy backend instance and forwards",
        "    the request.",
        "",
        " 5. The Python backend (FastAPI) parses the JSON. Pydantic confirms",
        "    the shape is correct (content not empty, etc).",
        "",
        " 6. The backend verifies Mary's JWT signature with the JWT_SECRET.",
        "    If valid, it extracts her user id from inside the token.",
        "",
        " 7. The backend asks MongoDB Atlas: 'is this user verified and not",
        "    banned?' Atlas answers.",
        "",
        " 8. The backend records a new prayer document in MongoDB.",
        "",
        " 9. The backend asks the LLM for a verse appropriate to the prayer's",
        "    category. If the LLM is down, it picks a random fallback verse.",
        "",
        "10. The backend returns JSON: prayer_id, category, comfort_message,",
        "    bible_verse, bible_reference.",
        "",
        "11. Mary's browser receives the JSON, navigates her to the",
        "    /prayer/confirmation page, and shows her the verse with",
        "    the 'thank you' animation.",
    ], caption="A prayer's journey from Mary's keyboard back to her screen."))

    s.append(p("Why HTTPS matters at every hop:", H3))
    s.append(p("If any of these hops happened over plain HTTP, someone on Mary's WiFi network could read her "
                "prayer in transit. With HTTPS, even her own ISP cannot read it. Today, every hop in the chain "
                "above happens over TLS 1.2 or higher.", BODY))

    s.append(p("Where each piece of data ends up:", H3))
    s += bullets([
        "Mary's prayer text -> MongoDB Atlas (encrypted at rest by Atlas).",
        "Mary's JWT -> stays in her browser's localStorage.",
        "Mary's email -> only known to MongoDB and Resend (when sending verification emails).",
        "Mary's IP address -> visible to CloudFront, the EB load balancer, and MongoDB Atlas (which logs connection metadata).",
        "Mary's password (only at signup or change) -> bcrypt-hashed and stored as a hash. The plaintext is never written to disk anywhere.",
    ])
    s.append(PageBreak())

    # ===================================================================
    # PART 4 - Tools and services inventory
    # ===================================================================
    s.append(p("Part 4 - The Tools and Services Inventory", H1))
    s.append(hr())
    s.append(p("Every external account, framework, and tool involved. If you wanted to inventory the whole system for an audit, this is the list.", BODY))

    s.append(p("Programming languages", H3))
    s.append(service_table([
        ["Language", "Where", "Why"],
        ["TypeScript / JavaScript", "All three frontends (mobile, web, admin)", "Browser language; React's first-class language"],
        ["Python 3.12", "Backend (server.py)", "FastAPI ecosystem, easy to write, fast enough for our scale"],
        ["HTML / CSS / Tailwind", "All UI", "Standard web building blocks"],
        ["MongoDB query language", "Backend -> Atlas", "Document-style queries, no SQL"],
    ], col_widths=[140, 200, PAGE_W - MARGIN_L - MARGIN_R - 340]))

    s.append(p("Frameworks and libraries", H3))
    s.append(p("Mobile (Expo 54, React Native 0.81):", BODY))
    s += bullets([
        "expo-router, expo-secure-store, expo-notifications, expo-location",
        "axios, zustand, i18next, react-i18next",
        "firebase JS SDK, @react-native-google-signin",
        "react-native-reanimated for animations",
    ])
    s.append(p("Web (Vite + React 19):", BODY))
    s += bullets([
        "react-router 7, axios, zustand",
        "Tailwind CSS v4 via @tailwindcss/vite",
        "lucide-react for icons",
        "Cormorant Garamond + Inter from Google Fonts",
    ])
    s.append(p("Backend (FastAPI on Python 3.12):", BODY))
    s += bullets([
        "fastapi 0.110, uvicorn 0.25",
        "motor 3.3 + pymongo 4.5 (MongoDB)",
        "pyjwt + bcrypt + passlib (auth)",
        "firebase-admin 6.4 (Google sign-in verification)",
        "httpx, requests (third-party API calls)",
        "python-dotenv (config)",
    ])

    s.append(p("AWS resources (account 020262236044)", H3))
    s.append(service_table([
        ["Resource", "Identifier", "Region"],
        ["IAM user (CLI deploy)", "tefillah-web-deploy", "global"],
        ["Elastic Beanstalk environment", "tefillah-api-prod (FastAPI backend)", "ap-south-1"],
        ["S3 bucket", "tefillah-web-prod (private, OAC-only)", "ap-south-1"],
        ["CloudFront distribution", "E20DJ1IDF5M5MD (dc71sb5z88jh2.cloudfront.net)", "global"],
        ["CloudFront OAC", "E3EQPRBAT2OUWZ", "global"],
        ["CloudFront response headers policy", "3c3cd71b-468f-4ef7-bfbf-4efb649a29bf", "global"],
        ["ACM certificate", "e1749f45-... (tefillah.in + www.tefillah.in)", "us-east-1"],
        ["Route 53 hosted zone", "Z06246302MVTLD5P84FBW (tefillah.in)", "global"],
        ["Amazon SES", "(used for outbound email per DNS SPF/DKIM)", "ap-northeast-1"],
    ], col_widths=[160, 280, PAGE_W - MARGIN_L - MARGIN_R - 440]))

    s.append(p("Third-party vendors", H3))
    s.append(service_table([
        ["Vendor", "Purpose", "Account login"],
        ["MongoDB Atlas", "Hosted MongoDB cluster (the database)", "Your Atlas account email"],
        ["Cloudflare", "Hosts admin.tefillah.in on Pages; was the DNS provider until today", "tefillahprayerapp@gmail.com"],
        ["GoDaddy", "Domain registrar - owns tefillah.in", "Your GoDaddy account"],
        ["Resend", "Outbound transactional email", "Your Resend account"],
        ["Firebase", "Google sign-in + push notifications", "Your Google account"],
        ["LLM provider (OpenAI/Anthropic)", "Generates daily verses and comfort messages", "Your account at the provider"],
        ["Expo / EAS", "Builds the mobile app for the stores", "Your Expo account"],
    ], col_widths=[140, 230, PAGE_W - MARGIN_L - MARGIN_R - 370]))

    s.append(p("Where every secret lives on disk", H3))
    s.append(service_table([
        ["File", "What's inside", "Sensitivity"],
        ["C:\\Users\\suraj\\.aws\\credentials", "AWS access key ID + secret for tefillah-web-deploy", "HIGH - never share, never commit"],
        ["backend\\.env", "MongoDB URI, JWT_SECRET, Resend API key, Firebase Web API key, Google client ID, FIREBASE_PROJECT_ID", "HIGH - never commit"],
        ["backend\\firebase-credentials.json", "Firebase service-account JSON (admin-level for the Firebase project)", "HIGH - never commit"],
        ["tefillah-web\\.env", "VITE_API_URL only (public URL)", "LOW"],
    ], col_widths=[180, 240, PAGE_W - MARGIN_L - MARGIN_R - 420]))
    s.append(PageBreak())

    # ===================================================================
    # PART 5 - The AWS deploy
    # ===================================================================
    s.append(p("Part 5 - The AWS Deploy We Performed Today", H1))
    s.append(hr())
    s.append(p("This is a faithful log of what happened today. If you ever need to repeat it for a fresh environment, follow this sequence.", BODY))

    s.append(p("Step 1 - Inspect the current Cloudflare zone", H3))
    s.append(p("I called the Cloudflare dashboard API using your browser session cookies and pulled all 17 existing DNS records (CNAMEs, MX, TXT, SRV) for tefillah.in into a JSON file in your Downloads folder.", BODY))

    s.append(p("Step 2 - Create the Route 53 hosted zone", H3))
    s.append(code_block(
        "aws route53 create-hosted-zone --name tefillah.in \\\n"
        "    --caller-reference tefillah-r53-...  \\\n"
        "    --hosted-zone-config 'Comment=Tefillah primary zone'"
    ))
    s.append(p("AWS returned the zone ID and four nameservers. Those four NS values are what GoDaddy needs.", BODY))

    s.append(p("Step 3 - Mirror every Cloudflare record into Route 53", H3))
    s.append(p("A Python script (import-cf-to-r53.py) parsed the JSON, grouped records by (name, type), translated each into a Route 53 change-batch entry, and applied them with change-resource-record-sets. The apex A records and www CNAME were skipped because they would be replaced later with ALIAS records pointing at CloudFront.", BODY))

    s.append(p("Step 4 - Build the production assets", H3))
    s.append(code_block(
        "cd tefillah-web\n"
        "npm install\n"
        "npm run build       # -> dist/ folder with index.html + assets/"
    ))

    s.append(p("Step 5 - Create the S3 bucket (private)", H3))
    s.append(code_block(
        "aws s3api create-bucket --bucket tefillah-web-prod \\\n"
        "    --region ap-south-1 \\\n"
        "    --create-bucket-configuration LocationConstraint=ap-south-1\n\n"
        "aws s3api put-public-access-block --bucket tefillah-web-prod \\\n"
        "    --public-access-block-configuration \\\n"
        "       'BlockPublicAcls=true,IgnorePublicAcls=true,\\\n"
        "        BlockPublicPolicy=true,RestrictPublicBuckets=true'\n\n"
        "aws s3api put-bucket-versioning --bucket tefillah-web-prod \\\n"
        "    --versioning-configuration Status=Enabled"
    ))

    s.append(p("Step 6 - Upload the assets with smart cache headers", H3))
    s.append(code_block(
        "# Hashed assets get year-long immutable caching\n"
        "aws s3 sync dist/assets s3://tefillah-web-prod/assets \\\n"
        "    --cache-control 'public, max-age=31536000, immutable'\n\n"
        "# index.html, icons get no-cache (so updates show up instantly)\n"
        "aws s3 sync dist s3://tefillah-web-prod \\\n"
        "    --cache-control 'no-cache, must-revalidate' \\\n"
        "    --exclude 'assets/*' --delete"
    ))

    s.append(p("Step 7 - Request ACM certificate (us-east-1)", H3))
    s.append(code_block(
        "aws acm request-certificate \\\n"
        "    --region us-east-1 \\\n"
        "    --domain-name tefillah.in \\\n"
        "    --subject-alternative-names www.tefillah.in \\\n"
        "    --validation-method DNS \\\n"
        "    --key-algorithm RSA_2048"
    ))
    s.append(p("ACM returns two DNS CNAME values to prove ownership. Those go into Route 53.", BODY))

    s.append(p("Step 8 - CloudFront response headers policy", H3))
    s.append(p("A policy named 'tefillah-web-security-headers' was created with: HSTS (max-age 1 year, includeSubDomains, preload), CSP locked to api.tefillah.in for connect-src, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy disabling camera/microphone and restricting geolocation to first-party only.", BODY))

    s.append(p("Step 9 - CloudFront Origin Access Control + Distribution", H3))
    s.append(code_block(
        "# OAC so the distribution can sign requests to S3\n"
        "aws cloudfront create-origin-access-control \\\n"
        "    --origin-access-control-config file://oac.json\n\n"
        "# Distribution (initial - no aliases yet)\n"
        "aws cloudfront create-distribution \\\n"
        "    --distribution-config file://cloudfront-distribution-initial.json"
    ))
    s.append(p("Distribution domain: dc71sb5z88jh2.cloudfront.net. SPA rewrite is enabled by mapping 403/404 to /index.html with response code 200.", BODY))

    s.append(p("Step 10 - Bucket policy scoped to the new distribution only", H3))
    s.append(code_block(
        "{\n"
        '  "Version": "2012-10-17",\n'
        '  "Statement": [{\n'
        '    "Sid": "AllowCloudFrontReadOnly",\n'
        '    "Effect": "Allow",\n'
        '    "Principal": {"Service": "cloudfront.amazonaws.com"},\n'
        '    "Action": "s3:GetObject",\n'
        '    "Resource": "arn:aws:s3:::tefillah-web-prod/*",\n'
        '    "Condition": {"StringEquals": {\n'
        '       "AWS:SourceArn": "arn:aws:cloudfront::020262236044:'
        'distribution/E20DJ1IDF5M5MD"\n'
        '    }}\n'
        '  }]\n'
        "}"
    ))
    s.append(p("This is the magic that makes the bucket private while still serving traffic globally.", BODY))

    s.append(p("Step 11 - Change nameservers at GoDaddy (the only manual step)", H3))
    s += bullets([
        "Logged in to GoDaddy, opened tefillah.in.",
        "Set custom nameservers to: ns-258.awsdns-32.com, ns-934.awsdns-52.net, ns-1137.awsdns-14.org, ns-1774.awsdns-29.co.uk.",
    ])

    s.append(p("Step 12 - Wait for global propagation", H3))
    s.append(p("A Python script polled Google's and Cloudflare's DNS-over-HTTPS resolvers every 90 seconds. When both confirmed AWS nameservers, the script moved on. In our case, this took about 40 minutes.", BODY))

    s.append(p("Step 13 - ACM cert auto-validates, distribution rebound", H3))
    s.append(p("ACM checks the two validation CNAMEs in Route 53. Once visible, cert flips to ISSUED. Distribution updated to add tefillah.in + www.tefillah.in aliases and bind the ACM certificate. Minimum TLS bumped to 1.2_2021.", BODY))

    s.append(p("Step 14 - Add the two A-ALIAS records and run live smoke tests", H3))
    s.append(p("R53 A ALIAS records for the apex and www pointing at the CloudFront distribution. After ~30 seconds for CloudFront to redeploy, https://tefillah.in/ returned HTTP 200 with the full security header set, the SPA rewrite worked for deep links, and HTTP redirected to HTTPS.", BODY))

    s.append(callout(
        "What you can re-run later",
        "Any future website deploy is now this short sequence: <br/>"
        "<br/>"
        "cd tefillah-web<br/>"
        "npm run build<br/>"
        "aws s3 sync dist/ s3://tefillah-web-prod/ --delete<br/>"
        "aws cloudfront create-invalidation --distribution-id E20DJ1IDF5M5MD --paths \"/*\"",
        kind="good",
    ))
    s.append(PageBreak())

    # ===================================================================
    # PART 6 - SECURITY HARDENING
    # ===================================================================
    s.append(p("Part 6 - Security Hardening Roadmap", H1))
    s.append(hr())

    s.append(p("6.1 Honest framing of 'non-hackable'", H2))
    s.append(callout(
        "Read this first",
        "There is no such thing as a system that is literally non-hackable. Anything connected to the public "
        "internet can, in principle, be attacked. What we can do is make a successful attack require sophisticated "
        "tools, significant time, and luck. The recommendations below raise the cost of attack and the speed of "
        "detection. If someone with a nation-state budget targets you specifically, no amount of off-the-shelf "
        "hardening will hold. But everyday opportunistic attacks, credential stuffing, and accidental data leaks "
        "are absolutely preventable with what's listed here.",
        kind="warn",
    ))

    s.append(p("6.2 Do TODAY (critical)", H2))

    s.append(p("Action 1 - Rotate JWT_SECRET", H3))
    s.append(callout(
        "Why this is critical",
        "The current value in backend/.env is literally the placeholder text that includes the word "
        "'change-in-production'. JWT_SECRET is what the backend uses to sign every login token. If anyone "
        "obtains this string, they can forge an admin token and access everything as you. Treat it like a "
        "master password.",
        kind="warn",
    ))
    s += bullets([
        "Generate a new random value: <font face='Courier'>python -c \"import secrets; print(secrets.token_urlsafe(48))\"</font>",
        "Update <font face='Courier'>backend/.env</font> with the new value (local development).",
        "In the AWS EB console, open the environment -> Configuration -> Software -> set <font face='Courier'>JWT_SECRET</font> environment variable to the new value.",
        "EB will restart the application. Every existing user session becomes invalid (everyone has to log in again). This is a one-time cost, not a recurring one.",
        "Cost: $0. Time: 5 minutes.",
    ])

    s.append(p("Action 2 - Confirm backend/.env is not in git", H3))
    s += bullets([
        "Run <font face='Courier'>cd backend && git check-ignore -v .env</font>. It must report .env is ignored.",
        "Also confirm <font face='Courier'>firebase-credentials.json</font> is in .gitignore.",
        "If they were ever committed historically, rotate every secret in them (MongoDB password, Resend API key, Firebase service account, LLM key).",
        "Cost: $0. Time: 5 minutes (to check) or up to 2 hours (if rotation is needed).",
    ])

    s.append(p("Action 3 - Enable MFA on every admin-grade account", H3))
    s += bullets([
        "AWS root user (most important): authenticator app or hardware key (YubiKey).",
        "AWS IAM users with write permissions (tefillah-web-deploy if you grant it console access later).",
        "Cloudflare (still hosts admin.tefillah.in Pages project + email routing).",
        "GoDaddy (anyone who controls the domain registrar controls everything).",
        "MongoDB Atlas (database access).",
        "Firebase (controls Google sign-in for the mobile app).",
        "Gmail account tied to all the above.",
        "Cost: $0 (authenticator app) to $50 once (YubiKey). Time: 30 minutes.",
    ])

    s.append(p("Action 4 - Move secrets out of .env into AWS Systems Manager Parameter Store", H3))
    s += bullets([
        "Why: secrets in environment variables are visible to anyone who can read the EB config or SSH onto the instance. Parameter Store with SecureString encryption is the proper place.",
        "Migrate one at a time: <font face='Courier'>aws ssm put-parameter --name /tefillah/prod/JWT_SECRET --type SecureString --value '...'</font>",
        "Update the backend to read these at startup via boto3.",
        "Remove the values from EB environment variables once parameters are loading correctly.",
        "Cost: $0 (Parameter Store standard tier is free up to 10k parameters). Time: 2 hours.",
    ])

    s.append(p("6.3 Do this WEEK (high priority)", H2))

    s.append(p("Action 5 - Tighten the tefillah-web-deploy IAM policy", H3))
    s += bullets([
        "Today this user has 4 *FullAccess policies. Replace with a tight inline policy scoped to: only the specific S3 bucket, only the specific CloudFront distribution, only the specific Route 53 zone, only the specific ACM cert.",
        "If the keys ever leak, the blast radius is limited to those resources, not the entire account.",
        "Cost: $0. Time: 1 hour to write and test the policy.",
    ])

    s.append(p("Action 6 - Enable AWS GuardDuty + CloudTrail across the account", H3))
    s += bullets([
        "CloudTrail records every API call to AWS. GuardDuty watches CloudTrail for suspicious patterns (someone trying to disable logging, IAM keys being used from an unusual country, instances making cryptocurrency-mining DNS queries).",
        "Both can be turned on with a few clicks in the console.",
        "Cost: ~$3-15/month depending on activity volume. Time: 15 minutes.",
    ])

    s.append(p("Action 7 - Lock MongoDB Atlas to your specific origins", H3))
    s += bullets([
        "In Atlas, set the IP allowlist to only the EB instance public IPs (use a VPC peering or PrivateLink for the strongest version).",
        "Database user permissions: create a dedicated user for the backend with only the collections it needs (not 'root@admin').",
        "Enable Atlas continuous backup (point-in-time recovery).",
        "Cost: Atlas backup is included in M10+ tiers; PrivateLink adds ~$30/month per region. Time: 1 hour.",
    ])

    s.append(p("Action 8 - Deploy AWS WAF in front of CloudFront", H3))
    s += bullets([
        "Adds a managed ruleset (AWSManagedRulesCommonRuleSet, AWSManagedRulesKnownBadInputs, AWSManagedRulesAmazonIpReputationList) that blocks obvious junk traffic before it hits the backend.",
        "Plus rate-based rules: 'block any IP making more than 500 requests/5 minutes.'",
        "Cost: ~$5-15/month at low traffic. Time: 30 minutes.",
    ])

    s.append(p("Action 9 - Enable AWS Shield Standard (free) and verify it's protecting CloudFront", H3))
    s += bullets([
        "Shield Standard is automatically on for all CloudFront distributions. Verify in the console.",
        "Shield Advanced is $3000/month and overkill unless you become a public target.",
        "Cost: $0. Time: 5 minutes.",
    ])

    s.append(p("Action 10 - Backend rate limiting per IP, not just per email", H3))
    s += bullets([
        "Current backend throttles by email (3 password-reset attempts per hour). An attacker rotating emails bypasses this.",
        "Add IP-based throttling using slowapi (FastAPI extension): 60 requests/min for /api/auth/login, 5 requests/min for /api/auth/forgot-password.",
        "Cost: $0. Time: 2 hours.",
    ])

    s.append(p("Action 11 - Subscribe to dependency-vulnerability alerts", H3))
    s += bullets([
        "Enable GitHub Dependabot (free) on the repo. It opens PRs when one of your npm or pip dependencies gets a published CVE.",
        "Add Snyk free tier or npm audit --production to CI for the same purpose.",
        "Cost: $0 for the free tier. Time: 30 minutes.",
    ])

    s.append(p("6.4 Do this QUARTER (defence in depth)", H2))

    s.append(p("Action 12 - Centralised logging and alerting", H3))
    s += bullets([
        "Route EB application logs to CloudWatch Logs, then set up CloudWatch Alarms on key signals: 5xx error rate over 1%, P99 latency above 2s, sudden drop in /api/health 200s.",
        "Pair with SNS to send SMS or email alerts to you.",
        "Cost: $5-20/month. Time: half a day.",
    ])

    s.append(p("Action 13 - Application-level error tracking (Sentry)", H3))
    s += bullets([
        "Both the frontends and backend send caught exceptions to Sentry. You see real-time stack traces from production.",
        "Free tier covers ~5k events/month, plenty for a starting project.",
        "Cost: $0 for free tier; ~$26/month for the team tier.",
    ])

    s.append(p("Action 14 - Tighten Content Security Policy further", H3))
    s += bullets([
        "Move from 'unsafe-inline' for styles to nonce-based CSP for stylesheets if you can do without inline styles (Tailwind's emit can be configured for this).",
        "Add a CSP report-uri so violations get reported to a tracker (Sentry supports this).",
        "Cost: $0. Time: half a day if Tailwind cooperates.",
    ])

    s.append(p("Action 15 - Penetration test by a third party", H3))
    s += bullets([
        "Before scaling to a large user base, commission a one-time pen test from a reputable firm like NCC Group, Cure53, or Trail of Bits, or a freelance via HackerOne.",
        "They will try to break in legitimately and write you a report.",
        "Cost: $3000-15000 once. Time: 2-4 weeks calendar time.",
    ])

    s.append(p("Action 16 - Disaster recovery and backup verification", H3))
    s += bullets([
        "Atlas continuous backup is good but verify your restore actually works. Do one restore-to-staging dry-run per quarter.",
        "Document the recovery steps in a runbook.",
        "Cost: $0 if you already have Atlas backup. Time: half a day per dry-run.",
    ])

    s.append(p("Action 17 - Compliance baseline if you handle minors' data", H3))
    s += bullets([
        "If users include children under 13 (US COPPA), under 16 (EU GDPR), have a privacy policy reviewed by counsel.",
        "Make data export and deletion endpoints in the admin panel.",
        "Cost: legal review ~$500-2000.",
    ])

    s.append(p("6.5 Cost summary at a glance", H2))
    s.append(service_table([
        ["Item", "One-time cost", "Monthly cost"],
        ["JWT secret rotation", "$0", "$0"],
        ["MFA / YubiKey", "$0-50", "$0"],
        ["Parameter Store migration", "$0", "$0"],
        ["IAM tightening", "$0", "$0"],
        ["GuardDuty + CloudTrail", "$0", "$3-15"],
        ["MongoDB Atlas PrivateLink (optional)", "$0", "$30"],
        ["AWS WAF (managed rules)", "$0", "$5-15"],
        ["AWS Shield Standard", "$0", "$0"],
        ["Backend rate limiting (code)", "$0", "$0"],
        ["Dependabot (GitHub)", "$0", "$0"],
        ["CloudWatch alarms + SNS", "$0", "$5-20"],
        ["Sentry (team tier)", "$0", "$0-26"],
        ["Penetration test (yearly)", "$3000-15000", "(amortised ~$300-1250)"],
    ], col_widths=[(PAGE_W - MARGIN_L - MARGIN_R) / 3] * 3))
    s.append(p("Total recurring at modest scale: roughly $40-80 per month after the suggestions above. Adds up to a system that resists almost every opportunistic attack and recovers gracefully from accidents.", BODY))
    s.append(PageBreak())

    # ===================================================================
    # PART 7 - OPS
    # ===================================================================
    s.append(p("Part 7 - Operations and Maintenance", H1))
    s.append(hr())

    s.append(p("Daily web-app deploy (after a code change)", H3))
    s.append(code_block(
        "cd tefillah-web\n"
        "npm install                # only when dependencies change\n"
        "npm run build              # produces dist/\n"
        "aws s3 sync dist/ s3://tefillah-web-prod/ --delete\n"
        "aws cloudfront create-invalidation \\\n"
        "    --distribution-id E20DJ1IDF5M5MD \\\n"
        "    --paths '/index.html' '/'\n"
        "# Asset files have hashed names so they don't need invalidation."
    ))

    s.append(p("Backend deploy (after a code change to server.py)", H3))
    s.append(code_block(
        "cd backend\n"
        "# Build a fresh deployment bundle\n"
        "zip -r ../tefillah-api-v<n>.zip . -x 'venv/*' '__pycache__/*' '.env'\n"
        "# Upload via EB CLI or AWS console -> Upload and Deploy\n"
        "eb deploy tefillah-api-prod"
    ))
    s.append(p("Watch the EB Events tab while it deploys. Health goes Severe -> Warning -> Ok as instances cycle.", BODY))

    s.append(p("Cert renewal", H3))
    s.append(p("Nothing to do. ACM automatically reaches out to Route 53 every 11 months and renews. As long as the validation CNAMEs we put in step 13 of the deploy stay in Route 53 (they're permanent), renewal is fully automatic.", BODY))

    s.append(p("Monitoring the live site", H3))
    s += bullets([
        "Manual: <font face='Courier'>curl -sI https://tefillah.in/</font> - should return 200 and the security header set.",
        "Manual: <font face='Courier'>curl -s https://api.tefillah.in/api/health</font> - should return JSON.",
        "Automated: set up a free UptimeRobot or BetterUptime monitor on both URLs.",
    ])

    s.append(p("Rolling back a bad deploy", H3))
    s += bullets([
        "Web app: S3 versioning is on. Restore the previous version of index.html and the previous assets/.",
        "CloudFront: not strictly needed for asset rollback (cache invalidation alone won't suffice).",
        "Backend: EB keeps the last N application versions. From the EB console, pick the previous version and 'Deploy.' Rollback takes ~3 minutes.",
    ])

    s.append(p("Adding a new admin user", H3))
    s += bullets([
        "There is no public sign-up for admins by design. To create one, an existing admin must invite via the admin panel or you can insert directly into the MongoDB <font face='Courier'>admin</font> collection.",
        "Use bcrypt to hash the new admin's password before inserting.",
    ])

    s.append(p("Reading a user's prayer history (only when investigating)", H3))
    s.append(p("Operators should only read prayers when responding to a specific complaint or abuse report. Every such read happens via the admin panel and is recorded in the <font face='Courier'>audit_logs</font> collection. The privacy promise in your Privacy Policy depends on this discipline.", BODY))

    s.append(PageBreak())

    # ===================================================================
    # PART 8 - Glossary
    # ===================================================================
    s.append(p("Part 8 - Glossary", H1))
    s.append(hr())
    glossary = [
        ("ACM", "AWS Certificate Manager. Issues free SSL/TLS certificates and renews them automatically."),
        ("ALB / Load Balancer", "Amazon Application Load Balancer. Spreads incoming HTTP requests across several backend servers and removes unhealthy ones."),
        ("ALIAS record", "Route-53-specific record type that behaves like a CNAME but is allowed at the apex of a domain. Used to point tefillah.in directly at CloudFront."),
        ("API", "Application Programming Interface. The set of URLs the backend exposes."),
        ("axios", "JavaScript library used by both frontends to make HTTP requests."),
        ("bcrypt", "Password-hashing algorithm. Slow on purpose, to make brute-force guessing impractical."),
        ("Cache-Control", "HTTP header that tells browsers and CDNs how long to keep a copy."),
        ("CDN", "Content Delivery Network. Geographically distributed servers that cache content close to users."),
        ("CloudFront", "AWS's CDN service, sitting in front of our S3 bucket."),
        ("CNAME", "DNS record that says 'this name is an alias for another name.'"),
        ("CORS", "Cross-Origin Resource Sharing. Browser security mechanism that decides whether code on one origin can call APIs on another."),
        ("CSP", "Content Security Policy. HTTP header that tells the browser what scripts/styles/connections it is allowed to load."),
        ("DKIM", "DomainKeys Identified Mail. Cryptographic signature on outbound email proving it came from your domain."),
        ("DMARC", "Domain-based Message Authentication, Reporting and Conformance. Tells receivers what to do with email that fails SPF/DKIM checks."),
        ("DNS", "Domain Name System. The phonebook that turns names like tefillah.in into IP addresses."),
        ("Elastic Beanstalk (EB)", "AWS's 'we'll run your web app' service. Hides the EC2 instances, ALB, auto-scaling, etc."),
        ("Expo", "Toolkit for building React Native apps with less ceremony. We use it for the mobile app."),
        ("FastAPI", "The Python web framework the backend is written in."),
        ("Firebase", "Google service. We use it for 'Sign in with Google' on the mobile app."),
        ("GoDaddy", "The domain registrar where tefillah.in was bought."),
        ("HSTS", "HTTP Strict Transport Security. Header that tells browsers 'always use HTTPS for this domain, never HTTP, ever, period.'"),
        ("IAM", "AWS Identity and Access Management. Where users, roles, and permissions live."),
        ("JWT", "JSON Web Token. A short signed string that proves who you are after you log in."),
        ("LLM", "Large Language Model. The AI service the backend uses to generate scripture verses and comfort messages."),
        ("MongoDB Atlas", "MongoDB Inc's hosted database service - not in your AWS account."),
        ("MX record", "DNS record that tells the world where to deliver email for a domain."),
        ("OAC", "Origin Access Control. Newer mechanism for letting CloudFront read from a private S3 bucket."),
        ("OAI", "Origin Access Identity. The older mechanism, deprecated in favour of OAC."),
        ("R53 / Route 53", "AWS's DNS service. Holds the authoritative records for tefillah.in."),
        ("Resend", "Third-party transactional email service."),
        ("S3", "Simple Storage Service. AWS's hard drive in the cloud."),
        ("SES", "Simple Email Service. AWS's outbound email service."),
        ("SPA", "Single Page Application. A site where one HTML page is loaded and JavaScript switches between 'pages' without a full reload."),
        ("SPF", "Sender Policy Framework. DNS TXT record listing which servers are allowed to send mail for the domain."),
        ("TLS", "Transport Layer Security. The encryption inside HTTPS that prevents eavesdropping."),
        ("TXT record", "Free-form DNS record. Used for SPF, DKIM, DMARC, and domain ownership proofs."),
        ("Uvicorn", "Async Python HTTP server. Runs the FastAPI app inside Elastic Beanstalk."),
        ("Vite", "JavaScript build tool. Used for tefillah-web."),
        ("WAF", "Web Application Firewall. Filters bad requests before they reach your backend."),
        ("zustand", "Small JavaScript state-management library used in both frontends."),
    ]
    for term, defn in glossary:
        line = f"<b>{term}</b> - {defn}"
        s.append(p(line, BODY_LEFT))
    s.append(Spacer(1, 12))
    s.append(hr())
    s.append(p("End of guide. Treat this file as living documentation - update the relevant chapter whenever the system changes.", CAPTION))

    return s


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = make_doc(OUT_PATH)
    story = build_story()
    doc.build(story)
    print(f"OK - wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
