from dataclasses import dataclass, field


@dataclass
class CredibilitySignals:
    hype_pattern: bool
    unverified_claims: bool
    hype_phrases: list[str]        # up to 3 example phrases


@dataclass
class AnalysisResult:
    video_id: str
    video_title: str
    insights: list[str]
    relevance_score: float
    suggested_action: str          # "update_concept" | "new_concept" | "new_recent"
    suggested_target: str          # filename hint (without extension)
    raw_summary: str
    credibility_signals: "CredibilitySignals | None" = None


@dataclass
class ConsolidationDecision:
    inbox_index: int
    action: str   # "update_concept" | "new_concept" | "new_recent"
    target: str   # filename hint (no extension)
    relevance_score: float = 1.0


@dataclass
class ConsolidationResult:
    updated_files: list[str]
    created_files: list[str]
    decisions: list = field(default_factory=list)   # list[ConsolidationDecision]
    errors: list[str] = field(default_factory=list)


@dataclass
class ResearchFinding:
    title: str
    insights: list[str]
    relevance_score: float
    suggested_action: str        # "update_concept" | "new_concept" | "new_recent"
    suggested_target: str        # kebab-case filename hint
    raw_summary: str
    sources_consulted: list[str]


@dataclass
class DiscoveredSource:
    url: str
    source_type: str             # "youtube_channel" | "blog" | "website" | "podcast"
    handle: str | None
    rationale: str
    discovered_at: str           # ISO timestamp
    is_recurring: bool = False   # conservative default — must be explicit yes from AI


@dataclass
class ThesisValidationResult:
    flagged_files: list[dict]    # Each: {"path": str, "concern": str, "severity": str}
    validation_summary: str
    searched_at: str


@dataclass
class SkillEvalConfig:
    prompts: list[str] = field(default_factory=list)
    min_quality_threshold: float = 0.6
    enabled: bool = True


@dataclass
class PromptEvalResult:
    prompt: str
    with_skill_score: float
    without_skill_score: float
    delta: float
    grader_reasoning: str


@dataclass
class SkillEvalResult:
    score: float
    eval_results: list[PromptEvalResult]
    skill_version: str   # md5 hash of skill content (8 chars)
    timestamp: str       # ISO UTC


@dataclass
class AgentConfig:
    agent_id: str
    model: str                     # "gemini" | "openai" | "claude"
    analysis_mode: str             # "full_video" | "transcript_only"
    sources: list
    consolidation_schedule: str
    decay: dict
    collection_model: str = "gemini-3-flash-preview"
    consolidation_model: str = "gemini-3.1-pro-preview"
    self_improving: bool = True
    skill_eval: SkillEvalConfig = field(default_factory=SkillEvalConfig)
    paused: bool = False
    plugin_version: str | None = None  # pin version e.g. "1.0"; None = auto-increment


@dataclass
class SkillSpec:
    name: str               # kebab-case slug, e.g. "risk-management"
    description: str        # "Use when..." ≤500 chars
    file_pattern: str | None  # glob for PreToolUse injection, e.g. "**/*.py"
    bash_pattern: str | None  # regex for bash injection, e.g. "pytest|coverage"
    content: str            # full SKILL.md text including frontmatter


@dataclass
class PluginOutput:
    agent_id: str
    skills: list[SkillSpec]   # 2-5 topic skills + optional recent-news skill
    session_hook_digest: str  # first ~2000 chars of digest for SessionStart hook
