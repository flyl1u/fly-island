"""Offline protocol registry. Importing it never imports hidapi or probes USB.

Only migrated providers appear in registered_ids(); legacy providers keep their
own tables until migrated. Profile parameters are code, never pack input.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    provider: str
    name: str
    revision: int
    kind: str
    vendor_ids: tuple[int, ...]
    match_fields: frozenset[str]
    parameters: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True)
class Builtin:
    provider: str
    vendor_id: int
    product_id: int
    name: str
    kind: str
    profile: str
    profile_rev: int = 1


_profiles = {}
_builtins = {}
_reserved = set()


def register_profile(profile):
    key = (profile.provider, profile.name, profile.revision)
    if key in _profiles and _profiles[key] != profile:
        raise ValueError("conflicting protocol registration")
    _profiles[key] = profile


def register_builtin(device):
    key = (device.provider, device.vendor_id, device.product_id)
    if key in _builtins and _builtins[key] != device:
        raise ValueError("conflicting builtin registration")
    _builtins[key] = device


def reserve_ids(pairs):
    """Also protect IDs deliberately excluded or owned by another protocol."""
    _reserved.update(pairs)


def _load():
    from . import razer_profiles  # noqa: F401; data and registrations only


def profiles():
    _load()
    return tuple(_profiles.values())


def builtin_ids():
    _load()
    return frozenset((d.vendor_id, d.product_id) for d in _builtins.values()) | frozenset(_reserved)


def builtins():
    _load()
    return tuple(_builtins.values())


def registered_ids(pack=None):
    """Return (provider, integer VID, integer PID, name, kind, source) rows.

    Source is 'builtin' or 'pack'. Disabled targets are exact provider/VID/PID
    matches. No hardware dependencies, global pack state or filesystem writes.
    """
    _load()
    rows = [(d.provider, d.vendor_id, d.product_id, d.name, d.kind, "builtin")
            for d in _builtins.values()]
    if pack is not None and pack.loaded:
        rows += [(d.provider, d.match.vendor_id, d.match.product_id, d.name, d.kind, "pack")
                 for d in pack.entries]
        rows = [d for d in rows if not pack.is_disabled(*d[:3])]
    return sorted(rows)
