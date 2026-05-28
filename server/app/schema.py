from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Anchor(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tag: str
    role: Optional[str] = None
    ariaLabel: Optional[str] = None
    accessibleName: Optional[str] = None
    classFingerprint: str = ""
    structuralPath: str = ""


class BlueprintTransform(BaseModel):
    id: str
    anchor: Anchor
    action: Literal["hide"]
    reason: Optional[str] = None


class BlueprintMetadata(BaseModel):
    createdAt: int = 0
    model: Optional[str] = None
    source: Optional[Literal["cache", "llm", "heuristic"]] = None


class Blueprint(BaseModel):
    version: Literal[1] = 1
    structuralHash: str
    transforms: List[BlueprintTransform]
    metadata: BlueprintMetadata = Field(default_factory=BlueprintMetadata)


class SkeletonNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    t: str
    i: Optional[int] = None
    r: Optional[str] = None
    a: Optional[str] = None
    c: Optional[str] = None
    s: Optional[Literal["s", "m", "l", "xl"]] = None
    k: Optional[int] = None
    ch: Optional[List["SkeletonNode"]] = None


SkeletonNode.model_rebuild()


class BlueprintRequest(BaseModel):
    skeleton: SkeletonNode
    structuralHash: str
    profile: Optional[Dict[str, Any]] = None


class BlueprintResponse(BaseModel):
    blueprint: Blueprint
    source: Literal["cache", "llm", "heuristic"]
