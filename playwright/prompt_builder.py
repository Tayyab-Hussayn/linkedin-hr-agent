# ================================================================
# PostFlow Prompt Builder
# Builds dynamic AI prompts from client profiles
# ================================================================

from typing import Optional

# ================================================================
# NICHE TEMPLATES — Proven base prompts per niche
# ================================================================

NICHE_TEMPLATES = {
    "hr_professional": {
        "label": "HR Professional",
        "default_pillars": ["Talent Acquisition", "Company Culture", "HR Technology", "Leadership", "Employee Retention"],
        "default_tone": "Empathetic, data-informed, people-first",
        "default_style": "Story-driven with actionable insights, short paragraphs, strong hooks",
        "default_audience": "HR managers, CHROs, business owners, team leads",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of experience in HR and people management.

EXPERTISE: Human Resources, People Operations, Talent Strategy
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "digital_marketer": {
        "label": "Digital Marketer",
        "default_pillars": ["SEO & Content", "Paid Advertising", "Growth Strategy", "Analytics", "Social Media"],
        "default_tone": "Data-driven, direct, results-focused, slightly edgy",
        "default_style": "Lead with a surprising stat or contrarian take, explain simply, end with actionable takeaway",
        "default_audience": "Marketing managers, startup founders, growth teams, CMOs",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of experience in digital marketing and growth.

EXPERTISE: Digital Marketing, Growth Hacking, Performance Marketing
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "web_developer": {
        "label": "Web Developer",
        "default_pillars": ["Career Growth", "Tech Stack", "Open Source", "Freelancing", "AI & Tools"],
        "default_tone": "Technical but accessible, opinionated, occasionally humorous",
        "default_style": "Problem first, solution second, real-world examples, no jargon without explanation",
        "default_audience": "Developers, CTOs, tech recruiters, aspiring programmers",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of experience in software development.

EXPERTISE: Software Engineering, Web Development, Tech Career
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "ceo_founder": {
        "label": "CEO / Founder",
        "default_pillars": ["Leadership", "Startup Journey", "Team Building", "Vision & Strategy", "Lessons Learned"],
        "default_tone": "Visionary, vulnerable, direct, authentic",
        "default_style": "Personal story → business lesson → broader insight. Never preachy.",
        "default_audience": "Investors, fellow founders, executives, top talent",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of experience building and leading companies.

EXPERTISE: Entrepreneurship, Leadership, Business Strategy
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "consultant": {
        "label": "Consultant",
        "default_pillars": ["Industry Insights", "Client Results", "Frameworks & Models", "Common Mistakes", "Trends"],
        "default_tone": "Expert, authoritative, practical, no-nonsense",
        "default_style": "Contrarian take or proven framework, backed by client experience, specific not vague",
        "default_audience": "Business decision makers, potential clients, industry peers",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of consulting experience.

EXPERTISE: Business Consulting, Strategy, Problem Solving
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "sales_professional": {
        "label": "Sales Professional",
        "default_pillars": ["Prospecting", "Objection Handling", "Sales Mindset", "Tools & Tech", "Wins & Lessons"],
        "default_tone": "Energetic, real, no-fluff, motivating",
        "default_style": "Quick punchy hooks, story-based, specific numbers, ends with insight not pitch",
        "default_audience": "SDRs, Account Executives, sales managers, revenue leaders",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of sales experience.

EXPERTISE: B2B Sales, Revenue Generation, Client Relationships
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "finance_professional": {
        "label": "Finance Professional",
        "default_pillars": ["Personal Finance", "Investment Strategy", "Financial Planning", "Market Insights", "Money Mindset"],
        "default_tone": "Trustworthy, clear, educational, occasionally contrarian",
        "default_style": "Myth-busting or insight-first, backed by data, simplified for non-experts",
        "default_audience": "Professionals, entrepreneurs, investors, anyone building wealth",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of experience in finance.

EXPERTISE: Finance, Investment, Wealth Management
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    },

    "product_manager": {
        "label": "Product Manager",
        "default_pillars": ["Product Strategy", "User Research", "Roadmap Planning", "Stakeholder Management", "PM Career"],
        "default_tone": "Thoughtful, user-obsessed, cross-functional, clear",
        "default_style": "Framework or mental model based, real product examples, ends with question or insight",
        "default_audience": "PMs, designers, engineers, founders, product teams",
        "base_prompt": """You are a LinkedIn content writer for {name}, a {job_title} with {years_experience} years of product management experience.

EXPERTISE: Product Management, UX Strategy, Agile
COMPANY: {company_name}
TARGET AUDIENCE: {target_audience}

YOUR VOICE:
{tone}

YOUR UNIQUE ANGLE:
{unique_angle}

WRITING STYLE:
{writing_style}"""
    }
}

# ================================================================
# POST FORMAT INSTRUCTIONS
# ================================================================

FORMAT_INSTRUCTIONS = {
    "story": """FORMAT: Personal Story
- Start with a specific moment or situation (not 'I remember when...')
- Build tension or contrast
- Reveal the lesson naturally
- 150-250 words""",

    "insight": """FORMAT: Industry Insight
- Start with a bold observation or data point
- Explain why it matters
- Give a fresh perspective others miss
- 100-200 words""",

    "tips": """FORMAT: Practical Tips
- Start with the problem or promise
- Give 3-5 specific actionable tips
- Each tip on its own line
- End with the outcome if they follow the tips
- 150-250 words""",

    "controversial": """FORMAT: Contrarian Take
- Start with the unpopular opinion directly
- Acknowledge the common belief
- Explain your reasoning with evidence
- Invite discussion at the end
- 150-250 words""",

    "lessons": """FORMAT: Lessons Learned
- Start with the mistake or challenge
- Walk through what happened
- Extract 2-3 clear lessons
- End with what you'd do differently
- 150-250 words""",

    "list": """FORMAT: Value List
- Strong hook promising value
- 5-7 items, each specific and actionable
- Short explanation per item
- Punchy closing line
- 150-250 words"""
}

# ================================================================
# MAIN PROMPT BUILDER
# ================================================================

def build_system_prompt(client: dict) -> str:
    """
    Build a complete system prompt from client profile.
    Falls back to template defaults if client fields are empty.
    """
    niche = client.get('niche', 'hr_professional')
    template = NICHE_TEMPLATES.get(niche, NICHE_TEMPLATES['hr_professional'])

    # Use client values or fall back to template defaults
    name = client.get('name', 'the author')
    job_title = client.get('job_title') or 'Professional'
    company_name = client.get('company_name') or 'their company'
    years_experience = client.get('years_experience') or 5
    tone = client.get('tone') or template['default_tone']
    target_audience = client.get('target_audience') or template['default_audience']
    writing_style = client.get('writing_style') or template['default_style']
    unique_angle = client.get('unique_angle') or f"Brings {years_experience} years of real-world {niche.replace('_', ' ')} experience"
    avoid_topics = client.get('avoid_topics') or []
    content_language = client.get('content_language') or 'en'

    # Get topic pillars
    topic_pillars = client.get('topic_pillars') or template['default_pillars']
    if isinstance(topic_pillars, str):
        import json
        topic_pillars = json.loads(topic_pillars)

    # Build base prompt from template
    base = template['base_prompt'].format(
        name=name,
        job_title=job_title,
        company_name=company_name,
        years_experience=years_experience,
        tone=tone,
        target_audience=target_audience,
        writing_style=writing_style,
        unique_angle=unique_angle
    )

    # Build topic pillars section
    pillars_text = '\n'.join(f"  - {p}" for p in topic_pillars)

    # Build avoid section
    avoid_text = ''
    if avoid_topics:
        if isinstance(avoid_topics, str):
            import json
            avoid_topics = json.loads(avoid_topics)
        avoid_text = f"\n\nAVOID THESE TOPICS:\n" + '\n'.join(f"  - {t}" for t in avoid_topics)

    # Language instruction
    lang_instruction = ''
    if content_language and content_language != 'en':
        lang_instruction = f"\n\nLANGUAGE: Write in {content_language}. All content must be in this language."

    # Build complete prompt
    system_prompt = f"""{base}

TOPIC PILLARS (rotate between these):
{pillars_text}

STRICT WRITING RULES:
  - Write in first person as {name}
  - Hook in the very first line — no warm-up sentences
  - Short paragraphs, maximum 3 lines each
  - No hashtags unless specifically requested
  - No emojis unless specifically requested
  - End with a genuine insight or thought-provoking question
  - Never end with a call to action or "follow me"
  - Never start with "I" as the first word
  - Sound human, not AI-generated{avoid_text}{lang_instruction}"""

    return system_prompt


def build_user_prompt(topic_pillar: str, post_format: str, additional_context: str = '') -> str:
    """
    Build the user prompt for a specific post request.
    """
    format_instruction = FORMAT_INSTRUCTIONS.get(post_format, FORMAT_INSTRUCTIONS['insight'])

    context_section = ''
    if additional_context:
        context_section = f"\nADDITIONAL CONTEXT:\n{additional_context}\n"

    return f"""Write a LinkedIn post about: {topic_pillar}

{format_instruction}
{context_section}
Return only the post content. No title, no explanation, no hashtags."""


def get_client_profile_summary(client: dict) -> dict:
    """
    Return a clean summary of client profile for API responses.
    """
    niche = client.get('niche', 'hr_professional')
    template = NICHE_TEMPLATES.get(niche, NICHE_TEMPLATES['hr_professional'])

    return {
        "niche": niche,
        "niche_label": template['label'],
        "job_title": client.get('job_title'),
        "company_name": client.get('company_name'),
        "years_experience": client.get('years_experience'),
        "topic_pillars": client.get('topic_pillars') or template['default_pillars'],
        "post_formats": client.get('post_formats') or ['story', 'insight', 'tips'],
        "content_language": client.get('content_language', 'en'),
        "available_niches": {k: v['label'] for k, v in NICHE_TEMPLATES.items()}
    }


def get_available_niches() -> dict:
    """Return all available niches with their labels and default pillars."""
    return {
        k: {
            "label": v['label'],
            "default_pillars": v['default_pillars'],
            "default_tone": v['default_tone']
        }
        for k, v in NICHE_TEMPLATES.items()
    }


if __name__ == '__main__':
    # Test with sample client
    test_client = {
        "name": "Moeez Ahmad",
        "niche": "hr_professional",
        "job_title": "HR Director",
        "company_name": "Independent",
        "years_experience": 10,
        "tone": "Empathetic, data-informed, people-first",
        "target_audience": "HR managers, CHROs, business owners",
        "writing_style": "Story-driven with actionable insights",
        "unique_angle": "Bridges people strategy with business results",
        "topic_pillars": ["Talent Acquisition", "Culture", "HR Tech"],
        "avoid_topics": ["politics", "religion"],
        "content_language": "en"
    }

    print("=== SYSTEM PROMPT ===")
    print(build_system_prompt(test_client))
    print("\n=== USER PROMPT ===")
    print(build_user_prompt("Talent Acquisition", "story"))
    print("\n=== PROFILE SUMMARY ===")
    import json
    print(json.dumps(get_client_profile_summary(test_client), indent=2))
