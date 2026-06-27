"""
Static catalog metadata for built-in providers.

Maps provider ids (as defined in config.yaml) to the public URL where a user
obtains an API key. Used by the Keys API to render the dynamic "Get API key"
link per provider.
"""

from __future__ import annotations

GET_KEY_URLS: dict[str, str | None] = {
    "groq": "https://console.groq.com/keys",
    "cerebras": "https://cloud.cerebras.ai/platform",
    "nvidia": "https://build.nvidia.com/",
    "google": "https://aistudio.google.com/apikey",
    "mistral": "https://console.mistral.ai/api-keys/",
    "cohere": "https://dashboard.cohere.com/api-keys",
    "github": "https://github.com/settings/tokens",
    "huggingface": "https://huggingface.co/settings/tokens",
    "openrouter": "https://openrouter.ai/keys",
    "cloudflare": "https://dash.cloudflare.com/profile/api-tokens",
    "zai": "https://z.ai/manage-apikey/apikey-list",
    "ollama": "https://ollama.com/settings/keys",
    # Free-key providers (key needed, but free to obtain).
    "opencode": "https://opencode.ai/auth",
    "kilo": "https://app.kilo.ai/profile",
    # No-key providers — no signup link needed.
    "ovh": None,
    "pollinations": None,
    "llm7": "https://token.llm7.io/",
}


def get_key_url(provider_id: str) -> str | None:
    """Return the provider's 'get an API key' URL, if known."""
    return GET_KEY_URLS.get(provider_id)
