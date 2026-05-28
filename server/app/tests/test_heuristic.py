from app.heuristic import generate_heuristic_transforms, walk_skeleton
from app.schema import SkeletonNode


def test_finds_aside():
    skel = SkeletonNode(
        t="body",
        ch=[
            SkeletonNode(t="main", i=1, r="main"),
            SkeletonNode(t="aside", i=2, c="hash1"),
        ],
    )
    out = generate_heuristic_transforms(skel, "h1")
    assert len(out) == 1
    assert out[0].anchor.tag == "aside"
    assert out[0].action == "hide"
    assert out[0].anchor.structuralPath == "body>aside:nth-child(2)"


def test_finds_complementary_role_regardless_of_tag():
    skel = SkeletonNode(
        t="body",
        ch=[SkeletonNode(t="div", i=1, r="complementary")],
    )
    out = generate_heuristic_transforms(skel, "h1")
    assert len(out) == 1
    assert out[0].anchor.role == "complementary"
    assert out[0].anchor.tag == "div"


def test_skips_main_and_article():
    skel = SkeletonNode(
        t="body",
        ch=[SkeletonNode(t="main", i=1), SkeletonNode(t="article", i=2)],
    )
    assert generate_heuristic_transforms(skel, "h1") == []


def test_caps_at_five():
    skel = SkeletonNode(
        t="body",
        ch=[SkeletonNode(t="aside", i=i + 1) for i in range(10)],
    )
    out = generate_heuristic_transforms(skel, "h1")
    assert len(out) == 5


def test_walk_skeleton_uses_dom_child_index():
    skel = SkeletonNode(
        t="body",
        ch=[
            SkeletonNode(t="header", i=1),
            SkeletonNode(t="aside", i=3),  # i=3 means there was a SKIP_TAG sibling at i=2
        ],
    )
    paths = [path for _, path in walk_skeleton(skel)]
    assert "body>header:nth-child(1)" in paths
    assert "body>aside:nth-child(3)" in paths


def test_walk_skeleton_handles_deep_nesting():
    skel = SkeletonNode(
        t="body",
        ch=[
            SkeletonNode(
                t="div",
                i=1,
                ch=[SkeletonNode(t="aside", i=2)],
            )
        ],
    )
    out = generate_heuristic_transforms(skel, "h1")
    assert len(out) == 1
    assert (
        out[0].anchor.structuralPath
        == "body>div:nth-child(1)>aside:nth-child(2)"
    )
