import pytest
from pydantic import ValidationError

from app.schema import (
    Anchor,
    Blueprint,
    BlueprintRequest,
    BlueprintTransform,
    SkeletonNode,
)


def test_anchor_minimal_defaults():
    a = Anchor(tag="div")
    assert a.tag == "div"
    assert a.role is None
    assert a.classFingerprint == ""
    assert a.structuralPath == ""


def test_blueprint_transform_rejects_unknown_action():
    with pytest.raises(ValidationError):
        BlueprintTransform(
            id="t1",
            anchor=Anchor(tag="aside", structuralPath="body>aside:nth-child(1)"),
            action="explode",  # type: ignore[arg-type]
        )


def test_blueprint_round_trip_json():
    bp = Blueprint(
        structuralHash="abc",
        transforms=[
            BlueprintTransform(
                id="t1",
                anchor=Anchor(
                    tag="aside",
                    classFingerprint="x",
                    structuralPath="body>aside:nth-child(3)",
                ),
                action="hide",
            )
        ],
    )
    raw = bp.model_dump_json()
    bp2 = Blueprint.model_validate_json(raw)
    assert bp2.structuralHash == "abc"
    assert bp2.transforms[0].action == "hide"
    assert bp2.transforms[0].anchor.tag == "aside"


def test_skeleton_node_nested():
    skel = SkeletonNode(
        t="body",
        ch=[
            SkeletonNode(t="main", r="main", ch=[SkeletonNode(t="p", s="m")]),
            SkeletonNode(t="aside", r="complementary"),
        ],
    )
    assert skel.ch is not None
    assert skel.ch[0].t == "main"
    assert skel.ch[1].r == "complementary"


def test_blueprint_request_has_skeleton_and_hash():
    req = BlueprintRequest(
        skeleton=SkeletonNode(t="body"),
        structuralHash="hash123",
    )
    assert req.structuralHash == "hash123"
    assert req.skeleton.t == "body"


def test_blueprint_request_rejects_missing_hash():
    with pytest.raises(ValidationError):
        BlueprintRequest.model_validate({"skeleton": {"t": "body"}})
