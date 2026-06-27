"""
NexusLLM configuration models and loader.

This module defines the Pydantic v2 models that describe the full application
configuration, plus a `load_config` function that:

  1. Reads a YAML file from disk.
  2. Recursively expands ``$ENV_VAR`` / ``${ENV_VAR}`` references in every
     string value using the current process environment (and a ``.env`` file
     if ``python-dotenv`` is installed).
  3. Validates the result with Pydantic v2, surfacing readable error messages
     instead of cryptic stack traces.

The configuration is intentionally strict: invalid configs fail fast at load
time rather than at request time.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

try:  # Optional: load a sibling .env file if python-dotenv is available.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional at runtime.
    pass


# ---------------------------------------------------------------------------
# Environment variable expansion
# ---------------------------------------------------------------------------

# Matches ${VAR} or $VAR (VAR = letters, digits, underscores, not starting
# with a digit). ${VAR} form is preferred for clarity in YAML.
_ENV_PATTERN = re.compile(r"\$\{(?P<braced>[A-Za-z_][A-Za-z0-9_]*)\}|\$(?P<bare>[A-Za-z_][A-Za-z0-9_]*)")


class ConfigError(Exception):
    """Raised when configuration cannot be loaded or validated."""


def _expand_env_in_string(value: str) -> str:
    """Expand ``$VAR`` and ``${VAR}`` references inside a single string.

    Unset variables expand to an empty string. This mirrors typical shell
    behavior and keeps the loader from crashing when optional keys are absent;
    downstream validation decides whether an empty value is acceptable.
    """

    def _replace(match: re.Match[str]) -> str:
        name = match.group("braced") or match.group("bare")
        return os.environ.get(name, "")

    return _ENV_PATTERN.sub(_replace, value)


def _expand_env(obj: Any) -> Any:
    """Recursively expand env var references in strings within a structure."""
    match obj:
        case str():
            return _expand_env_in_string(obj)
        case dict():
            return {key: _expand_env(val) for key, val in obj.items()}
        case list():
            return [_expand_env(item) for item in obj]
        case _:
            return obj


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ProviderRateLimits(BaseModel):
    """Rate limits declared for a provider (used for display + weighting)."""

    requests_per_minute: int | None = Field(default=None, ge=0)
    requests_per_day: int | None = Field(default=None, ge=0)
    tokens_per_minute: int | None = Field(default=None, ge=0)
    tokens_per_day: int | None = Field(default=None, ge=0)
    tokens_per_month: int | None = Field(default=None, ge=0)


class ProviderConfig(BaseModel):
    """A single upstream LLM provider and its credentials."""

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_keys: list[str] = Field(default_factory=list)
    priority: int = Field(ge=0)
    enabled: bool = True
    category: Literal["free", "trial"] = "free"
    # When False, the provider works without an API key (e.g. OVH AI Endpoints
    # free tier). Discovery and routing then send no Authorization header, and
    # the UI hides the key input and shows a "No API Key Required" badge.
    requires_key: bool = True
    # When True (and requires_key is True), the key is free to obtain / a free
    # tier — the UI shows a "Free key" badge instead of "API Key Required".
    key_free: bool = False
    tags: list[str] = Field(default_factory=list)
    rate_limits: ProviderRateLimits = Field(default_factory=ProviderRateLimits)

    @field_validator("base_url")
    @classmethod
    def _validate_base_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError(f"base_url must start with http:// or https://, got: {value!r}")
        return value.rstrip("/")

    @field_validator("api_keys")
    @classmethod
    def _drop_empty_keys(cls, value: list[str]) -> list[str]:
        # After env expansion, unset keys become "". Strip them out so an
        # unconfigured provider simply has zero usable keys.
        return [key for key in value if key and key.strip()]

    @property
    def has_usable_keys(self) -> bool:
        return len(self.api_keys) > 0

    @property
    def is_usable(self) -> bool:
        """True if the provider can be called: it has a key, or needs none."""
        return self.has_usable_keys or not self.requires_key


def make_custom_provider_config(
    *,
    id: str,
    name: str,
    base_url: str,
    api_key: str,
    enabled: bool,
    priority: int,
) -> "ProviderConfig":
    """Build a ProviderConfig from a user-defined custom OpenAI-compatible
    endpoint so it participates in discovery, routing and /v1/models like any
    built-in provider. With no key it routes keyless (requires_key=False)."""
    return ProviderConfig(
        id=id,
        name=name or base_url,
        base_url=base_url,
        api_keys=[api_key] if api_key else [],
        priority=priority,
        enabled=enabled,
        category="free",
        requires_key=bool(api_key),
        tags=["custom"],
    )


class ModelAliasGroup(BaseModel):
    """A logical model alias that maps to an ordered list of real model IDs."""

    alias: str = Field(min_length=1)
    description: str = ""
    models: list[str] = Field(min_length=1)

    @field_validator("models")
    @classmethod
    def _non_empty_models(cls, value: list[str]) -> list[str]:
        cleaned = [model.strip() for model in value if model and model.strip()]
        if not cleaned:
            raise ValueError("alias group must contain at least one model id")
        return cleaned


class RoutingConfig(BaseModel):
    """Tunables for the routing engine, retries, and circuit breaker."""

    max_fallback_attempts: int = Field(default=6, ge=1)
    per_attempt_timeout_seconds: float = Field(default=30.0, gt=0)
    retry_base_delay_seconds: float = Field(default=0.5, ge=0)
    retry_max_delay_seconds: float = Field(default=20.0, ge=0)
    retry_jitter_percent: float = Field(default=25.0, ge=0, le=100)
    circuit_breaker_failure_threshold: int = Field(default=4, ge=1)
    circuit_breaker_open_duration_seconds: float = Field(default=90.0, gt=0)
    circuit_breaker_failure_window_seconds: float = Field(default=60.0, gt=0)
    circuit_breaker_success_threshold_half_open: int = Field(default=1, ge=1)
    circuit_breaker_max_open_duration_seconds: float = Field(default=900.0, gt=0)

    @model_validator(mode="after")
    def _check_delays(self) -> "RoutingConfig":
        if self.retry_max_delay_seconds < self.retry_base_delay_seconds:
            raise ValueError(
                "retry_max_delay_seconds must be >= retry_base_delay_seconds"
            )
        return self


class AppConfig(BaseModel):
    """Top-level server settings under the ``nexusllm`` YAML key."""

    host: str = "0.0.0.0"
    port: int = Field(default=8080, ge=1, le=65535)
    admin_api_key: str = ""
    proxy_api_key: str = ""
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    model_refresh_interval_minutes: int = Field(default=15, ge=1)
    enable_request_logging: bool = True
    max_request_log_entries: int = Field(default=1000, ge=1)
    cors_allowed_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    data_dir: str = "data"


class NexusLLMConfig(BaseModel):
    """The complete, validated NexusLLM configuration."""

    app: AppConfig = Field(default_factory=AppConfig)
    routing: RoutingConfig = Field(default_factory=RoutingConfig)
    model_aliases: list[ModelAliasGroup] = Field(default_factory=list)
    default_fallback_model: str | None = None
    providers: list[ProviderConfig] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_topology(self) -> "NexusLLMConfig":
        enabled = [p for p in self.providers if p.enabled]
        if not enabled:
            raise ValueError("configuration must define at least one enabled provider")

        # No duplicate provider IDs.
        ids = [p.id for p in self.providers]
        duplicates = {pid for pid in ids if ids.count(pid) > 1}
        if duplicates:
            raise ValueError(f"duplicate provider ids found: {sorted(duplicates)}")

        # Priorities must be unique among enabled providers so ordering is
        # deterministic.
        priorities = [p.priority for p in enabled]
        dup_priorities = {pr for pr in priorities if priorities.count(pr) > 1}
        if dup_priorities:
            raise ValueError(
                f"enabled providers must have unique priorities; "
                f"conflicting values: {sorted(dup_priorities)}"
            )

        # No duplicate alias names.
        alias_names = [a.alias for a in self.model_aliases]
        dup_aliases = {a for a in alias_names if alias_names.count(a) > 1}
        if dup_aliases:
            raise ValueError(f"duplicate alias names found: {sorted(dup_aliases)}")

        # default_fallback_model, if set, must reference a known alias or model.
        if self.default_fallback_model:
            known_aliases = set(alias_names)
            known_models = {
                model for group in self.model_aliases for model in group.models
            }
            if (
                self.default_fallback_model not in known_aliases
                and self.default_fallback_model not in known_models
            ):
                raise ValueError(
                    "default_fallback_model "
                    f"{self.default_fallback_model!r} does not match any alias "
                    "or model id declared in model_aliases"
                )

        return self

    def get_provider(self, provider_id: str) -> ProviderConfig | None:
        """Return a provider by id, or None if not present."""
        return next((p for p in self.providers if p.id == provider_id), None)

    def enabled_providers(self) -> list[ProviderConfig]:
        """Return enabled providers sorted by ascending priority."""
        return sorted(
            (p for p in self.providers if p.enabled),
            key=lambda p: p.priority,
        )

    def resolve_alias(self, alias: str) -> list[str]:
        """Resolve an alias to its ordered list of model ids.

        If ``alias`` is not a known alias group it is treated as a concrete
        model id and returned as a single-element list.
        """
        for group in self.model_aliases:
            if group.alias == alias:
                return list(group.models)
        return [alias]


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------


def _format_validation_error(exc: ValidationError) -> str:
    """Produce a compact, human-readable summary of a Pydantic error."""
    lines = ["Configuration validation failed:"]
    for err in exc.errors():
        location = ".".join(str(part) for part in err["loc"]) or "(root)"
        lines.append(f"  - {location}: {err['msg']}")
    return "\n".join(lines)


def load_config(path: str | Path = "config.yaml") -> NexusLLMConfig:
    """Load, expand, and validate the NexusLLM configuration.

    Args:
        path: Path to the YAML config file.

    Returns:
        A validated :class:`NexusLLMConfig` instance.

    Raises:
        ConfigError: If the file is missing, contains invalid YAML, or fails
            schema validation.
    """
    config_path = Path(path)
    if not config_path.is_file():
        raise ConfigError(f"config file not found: {config_path.resolve()}")

    try:
        raw_text = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"could not read config file {config_path}: {exc}") from exc

    try:
        parsed = yaml.safe_load(raw_text) or {}
    except yaml.YAMLError as exc:
        raise ConfigError(f"invalid YAML in {config_path}: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ConfigError(
            f"top-level YAML in {config_path} must be a mapping, "
            f"got {type(parsed).__name__}"
        )

    expanded = _expand_env(parsed)

    # The server settings live under the "nexusllm" key in the YAML; everything
    # else lives at the top level. Normalize into the flat AppConfig shape.
    app_section = expanded.get("nexusllm", {})
    if not isinstance(app_section, dict):
        raise ConfigError("'nexusllm' section must be a mapping")

    payload = {
        "app": app_section,
        "routing": expanded.get("routing", {}),
        "model_aliases": expanded.get("model_aliases", []),
        "default_fallback_model": expanded.get("default_fallback_model"),
        "providers": expanded.get("providers", []),
    }

    try:
        return NexusLLMConfig.model_validate(payload)
    except ValidationError as exc:
        raise ConfigError(_format_validation_error(exc)) from exc


if __name__ == "__main__":  # pragma: no cover - manual verification helper.
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
    try:
        cfg = load_config(target)
    except ConfigError as err:
        print(err)
        raise SystemExit(1)

    print(f"Loaded config: {len(cfg.providers)} providers "
          f"({len(cfg.enabled_providers())} enabled), "
          f"{len(cfg.model_aliases)} alias groups.")
    for provider in cfg.enabled_providers():
        print(
            f"  [{provider.priority}] {provider.id:<12} "
            f"{len(provider.api_keys)} key(s)  {provider.base_url}"
        )
