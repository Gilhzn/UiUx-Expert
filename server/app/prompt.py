PROMPT_TEMPLATE = """You are analysing a structural skeleton of a web page. Text and PII have been removed; only tag, role, class fingerprint hash, structural path, and text-length bucket remain.

The user wants help reducing visual clutter. Identify up to 5 elements likely to be:
- Banner ads
- Newsletter / promo overlays
- Cookie banners
- Decorative sidebars
- Sticky promotional bars

Output ONLY a single JSON object that exactly matches this schema (no prose, no markdown, no backticks):

{{
  "transforms": [
    {{
      "id": "h-1",
      "action": "hide",
      "anchor": {{
        "tag": "aside",
        "role": null,
        "ariaLabel": null,
        "accessibleName": null,
        "classFingerprint": "",
        "structuralPath": "body>aside:nth-child(3)"
      }},
      "reason": "Likely sidebar promo"
    }}
  ]
}}

Hard constraints:
- "action" MUST be "hide" (only supported action).
- "structuralPath" MUST reference a node present in the input skeleton.
- Do NOT invent text content for accessibleName or ariaLabel; if absent in the input, set to null.
- Do NOT touch main content (skip elements with tag in {{"main","article"}} or role "main").
- Return AT MOST 5 transforms.

Skeleton:
{skeleton}
"""


def build_prompt(skeleton_json: str) -> str:
    return PROMPT_TEMPLATE.format(skeleton=skeleton_json)
