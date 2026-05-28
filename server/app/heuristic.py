"""Deterministic fallback Blueprint generator.

Walks the (PII-stripped) skeleton and flags elements that look likely
decorative based on tag + ARIA role + structural signals. This is used
when no LLM is available, and as a sanity baseline against LLM output.
"""

from __future__ import annotations

from typing import Iterable, List, Tuple

from .schema import Anchor, BlueprintTransform, SkeletonNode

DECORATIVE_TAGS = {"aside"}
DECORATIVE_ROLES = {"complementary", "banner", "contentinfo"}
SKIP_TAGS = {"main", "article", "html", "body"}
MAX_TRANSFORMS = 5


def walk_skeleton(
    node: SkeletonNode, path: str = "body"
) -> Iterable[Tuple[SkeletonNode, str]]:
    """Yield (node, structural_path) pairs in document order.

    The path format matches the client's resilientSelector.structuralPath
    so that anchors generated here match the live DOM at runtime.
    """
    yield node, path
    if not node.ch:
        return
    for child in node.ch:
        idx = child.i if child.i is not None else 1
        child_path = f"{path}>{child.t}:nth-child({idx})"
        yield from walk_skeleton(child, child_path)


def generate_heuristic_transforms(
    skeleton: SkeletonNode, structural_hash: str
) -> List[BlueprintTransform]:
    out: List[BlueprintTransform] = []
    seen: set[str] = set()
    for node, path in walk_skeleton(skeleton):
        if node.t in SKIP_TAGS:
            continue
        decorative_tag = node.t in DECORATIVE_TAGS
        decorative_role = node.r in DECORATIVE_ROLES if node.r else False
        if not (decorative_tag or decorative_role):
            continue
        if path in seen:
            continue
        seen.add(path)
        anchor = Anchor(
            tag=node.t,
            role=node.r,
            ariaLabel="1" if node.a else None,
            accessibleName=None,
            classFingerprint=node.c or "",
            structuralPath=path,
        )
        reason = (
            "aside element (likely sidebar)"
            if decorative_tag
            else f"role={node.r} (likely decorative landmark)"
        )
        out.append(
            BlueprintTransform(
                id=f"h-{len(out) + 1}",
                anchor=anchor,
                action="hide",
                reason=reason,
            )
        )
        if len(out) >= MAX_TRANSFORMS:
            break
    return out
