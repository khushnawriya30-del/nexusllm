"""Backoff and jitter helpers for the routing engine."""

from __future__ import annotations

import random


def calculate_backoff(
    attempt: int,
    base: float,
    max_delay: float,
    jitter_pct: float,
) -> float:
    """Exponential backoff with symmetric jitter.

    Args:
        attempt: Zero-based attempt index (0 for the first retry).
        base: Base delay in seconds.
        max_delay: Upper bound for the (pre-jitter) delay.
        jitter_pct: Jitter magnitude as a percentage (0-100) of the delay.

    Returns:
        A non-negative delay in seconds.
    """
    delay = min(base * (2 ** attempt), max_delay)
    jitter = delay * (random.uniform(-jitter_pct, jitter_pct) / 100.0)
    return max(0.0, delay + jitter)
