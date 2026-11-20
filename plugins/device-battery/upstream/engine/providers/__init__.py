"""Battery query providers, adapted from the MIT-licensed HaloBattery project.

Only the explicitly selected providers are loaded by server.py. Importing this
package does not start scans, alter device modes, or install software.
"""
from .base import DeviceStatus, Provider


def __getattr__(name):
    if name.endswith("Provider"):
        from importlib import import_module
        from server import PROVIDERS
        for module, exported in PROVIDERS:
            if exported == name:
                value = getattr(import_module("providers." + module), name)
                globals()[name] = value
                return value
    raise AttributeError(name)
